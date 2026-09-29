// Procedural sound effects on the Web Audio API: gun shots (distinct per weapon), reloads, footsteps, scope, hit /
// kill feedback and every C4 sound are synthesised from noise bursts and oscillators. No audio files are used.
import type { GameEvent } from '../game/events';
import { getWeapon } from '../game/weapons';
import type { SoundProfile } from '../game/weapons';
import type { World } from '../game/world';
import { materialAt } from '../game/map/build';

type Vec = { x: number; y: number; z: number };

interface Listener {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const HEARING_RANGE = 90;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbSend: GainNode | null = null;
  private volume = 0.7;
  private listener: Listener = { x: 0, y: 0, z: 0, yaw: 0 };
  private lastBeepAt = 0;

  /** Must be called from a user gesture (click / key) so the browser lets audio start. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(comp);
      comp.connect(this.master);
      this.master.connect(ctx.destination);

      // One second of white noise, reused by every noise-based sound.
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;

      // Cheap synthetic room reverb (decaying noise impulse) shared by the loud sounds.
      const irLen = Math.floor(ctx.sampleRate * 1.4);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
      }
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = ir;
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 0.22;
      this.reverbSend.connect(this.reverb);
      this.reverb.connect(this.sfxBus);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setListener(x: number, y: number, z: number, yaw: number): void {
    this.listener.x = x;
    this.listener.y = y;
    this.listener.z = z;
    this.listener.yaw = yaw;
  }

  dispose(): void {
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Building blocks
  // ------------------------------------------------------------------------------------------------------------------

  /** Output node for a sound at `pos`: distance attenuation, low-pass with distance, stereo pan. Null when out of range. */
  private spatial(pos: Vec | null, baseGain: number, reverb = 0): AudioNode | null {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return null;
    const out = ctx.createGain();
    if (!pos) {
      out.gain.value = baseGain;
      out.connect(bus);
      if (reverb > 0 && this.reverbSend) {
        const s = ctx.createGain();
        s.gain.value = reverb;
        out.connect(s);
        s.connect(this.reverbSend);
      }
      return out;
    }
    const dx = pos.x - this.listener.x;
    const dz = pos.z - this.listener.z;
    const dy = pos.y - this.listener.y;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > HEARING_RANGE) return null;
    const gain = baseGain / (1 + d * 0.16);
    out.gain.value = gain;
    let node: AudioNode = out;
    // Far sounds lose their high end.
    if (d > 6) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(700, 12000 / (1 + d * 0.12));
      out.connect(lp);
      node = lp;
    }
    // Pan by the angle relative to where the listener is looking (forward = -Z at yaw 0).
    const rx = Math.cos(this.listener.yaw);
    const rz = -Math.sin(this.listener.yaw);
    const pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0;
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan * 0.85;
      node.connect(p);
      node = p;
    }
    node.connect(bus);
    if (reverb > 0 && this.reverbSend) {
      const s = ctx.createGain();
      s.gain.value = reverb * Math.min(1, 0.4 + d / 40);
      node.connect(s);
      s.connect(this.reverbSend);
    }
    return out;
  }

  private noiseBurst(dest: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, curve = 3, freqEnd?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    // Exponential-ish decay.
    g.gain.setTargetAtTime(0.0001, t + 0.002, dur / curve);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.1);
  }

  private tone(dest: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, gain: number, attack = 0.003): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private click(dest: AudioNode, t: number, gain = 0.5, freq = 2400): void {
    this.noiseBurst(dest, t, 0.03, 'highpass', freq, 0.8, gain, 6);
    this.tone(dest, t, 'square', freq * 0.45, freq * 0.3, 0.02, gain * 0.25, 0.001);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Gun shots (each profile has its own crack / body / thump / tail)
  // ------------------------------------------------------------------------------------------------------------------

  private gunshot(profile: SoundProfile, pos: Vec | null, local: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const loud: Record<SoundProfile, number> = { ak: 1.0, m4: 0.8, awp: 1.5, glock: 0.6, usp: 0.35, deagle: 1.05, knife: 0.3, c4: 0 };
    const out = this.spatial(pos, loud[profile] * (local ? 1 : 0.9), profile === 'awp' || profile === 'deagle' ? 0.9 : 0.5);
    if (!out) return;
    const t = ctx.currentTime;
    switch (profile) {
      case 'ak':
        this.noiseBurst(out, t, 0.06, 'bandpass', 2100, 0.9, 1.0, 5);
        this.noiseBurst(out, t, 0.16, 'lowpass', 1100, 0.7, 0.8, 4, 300);
        this.tone(out, t, 'sine', 140, 48, 0.16, 0.9);
        this.noiseBurst(out, t + 0.02, 0.35, 'lowpass', 500, 0.5, 0.25, 3);
        break;
      case 'm4':
        this.noiseBurst(out, t, 0.045, 'highpass', 3200, 0.7, 0.85, 6);
        this.noiseBurst(out, t, 0.1, 'bandpass', 1500, 0.9, 0.7, 4);
        this.tone(out, t, 'sine', 170, 70, 0.1, 0.65);
        this.noiseBurst(out, t + 0.02, 0.22, 'lowpass', 700, 0.5, 0.18, 3);
        break;
      case 'awp':
        this.noiseBurst(out, t, 0.07, 'highpass', 3800, 0.7, 1.0, 6);
        this.noiseBurst(out, t, 0.5, 'lowpass', 900, 0.6, 1.0, 3.2, 120);
        this.tone(out, t, 'sine', 90, 28, 0.6, 1.1);
        this.tone(out, t, 'triangle', 220, 60, 0.25, 0.4);
        this.noiseBurst(out, t + 0.05, 0.9, 'lowpass', 400, 0.4, 0.3, 2.4);
        // Bolt cycling clack shortly after the shot.
        this.click(out, t + 0.55, 0.35, 1800);
        this.click(out, t + 0.75, 0.3, 1400);
        break;
      case 'glock':
        this.noiseBurst(out, t, 0.04, 'bandpass', 2600, 1.1, 0.95, 6);
        this.noiseBurst(out, t, 0.09, 'bandpass', 1300, 0.9, 0.5, 5);
        this.tone(out, t, 'triangle', 260, 110, 0.07, 0.4);
        break;
      case 'usp':
        // Suppressed: a soft "thup" instead of a crack.
        this.noiseBurst(out, t, 0.05, 'lowpass', 1500, 0.8, 0.55, 5);
        this.tone(out, t, 'sine', 200, 90, 0.08, 0.35);
        this.click(out, t + 0.035, 0.2, 2200);
        break;
      case 'deagle':
        this.noiseBurst(out, t, 0.06, 'highpass', 2800, 0.8, 1.0, 6);
        this.noiseBurst(out, t, 0.22, 'lowpass', 1200, 0.7, 0.95, 3.5, 250);
        this.tone(out, t, 'sine', 120, 38, 0.32, 1.0);
        this.noiseBurst(out, t + 0.03, 0.5, 'lowpass', 500, 0.5, 0.3, 2.6);
        break;
      case 'knife':
        this.noiseBurst(out, t, 0.16, 'bandpass', 700, 1.4, 0.5, 2.5, 3200);
        break;
      default:
        break;
    }
  }

  private reload(profile: SoundProfile, pos: Vec | null, reloadTime: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.spatial(pos, 0.45);
    if (!out) return;
    const t = ctx.currentTime;
    const pistol = profile === 'glock' || profile === 'usp' || profile === 'deagle';
    // Magazine out
    this.click(out, t + 0.25, 0.5, 1500);
    this.noiseBurst(out, t + 0.28, 0.1, 'bandpass', 900, 1, 0.3, 4);
    // Magazine in
    const tin = t + reloadTime * (pistol ? 0.55 : 0.6);
    this.click(out, tin, 0.6, 1100);
    this.tone(out, tin, 'square', 300, 220, 0.04, 0.12);
    // Charging handle / slide
    const tend = t + reloadTime - 0.25;
    this.click(out, tend, 0.55, 1900);
    this.click(out, tend + 0.09, 0.5, 1300);
    if (profile === 'awp') this.click(out, t + reloadTime * 0.8, 0.4, 1000);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Movement
  // ------------------------------------------------------------------------------------------------------------------

  private footstep(pos: Vec, world: World, self: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const mat = materialAt(world.level.map, pos.x, pos.z);
    const out = this.spatial(pos, self ? 0.38 : 0.55);
    if (!out) return;
    const t = ctx.currentTime;
    const jitter = 0.85 + Math.random() * 0.3;
    switch (mat) {
      case 'wood':
        this.noiseBurst(out, t, 0.09, 'bandpass', 380 * jitter, 1.4, 0.7, 4);
        this.tone(out, t, 'sine', 150 * jitter, 90, 0.08, 0.35);
        break;
      case 'metal':
        this.noiseBurst(out, t, 0.12, 'bandpass', 1300 * jitter, 3, 0.55, 4);
        this.tone(out, t, 'triangle', 620 * jitter, 500, 0.1, 0.12);
        break;
      case 'stone':
        this.noiseBurst(out, t, 0.06, 'bandpass', 900 * jitter, 1, 0.6, 5);
        this.tone(out, t, 'sine', 110 * jitter, 70, 0.07, 0.3);
        break;
      default:
        // Sand: dull scuff.
        this.noiseBurst(out, t, 0.1, 'lowpass', 520 * jitter, 0.7, 0.55, 3.5);
        this.tone(out, t, 'sine', 90 * jitter, 55, 0.07, 0.25);
        break;
    }
  }

  private land(pos: Vec, speed: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.spatial(pos, Math.min(1, 0.3 + speed * 0.04));
    if (!out) return;
    const t = ctx.currentTime;
    this.noiseBurst(out, t, 0.14, 'lowpass', 400, 0.8, 0.8, 3.5);
    this.tone(out, t, 'sine', 100, 45, 0.14, 0.6);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // UI / feedback sounds (non-positional)
  // ------------------------------------------------------------------------------------------------------------------

  scopeSound(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.spatial(null, 0.5);
    if (!out) return;
    const t = ctx.currentTime;
    this.click(out, t, 0.5, 2600);
    this.noiseBurst(out, t + 0.02, 0.22, 'bandpass', level === 0 ? 3200 : 900, 1.2, 0.3, 2.5, level === 0 ? 900 : 3200);
    this.tone(out, t + 0.03, 'sine', level === 0 ? 1200 : 700, level === 0 ? 700 : 1300, 0.12, 0.08);
  }

  /** Feedback when you hit someone: short tick for body, brighter double ping for headshots. */
  hitMarker(headshot: boolean, killed: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.spatial(null, 0.5);
    if (!out) return;
    const t = ctx.currentTime;
    if (headshot) {
      this.tone(out, t, 'sine', 2400, 2400, 0.09, 0.35);
      this.tone(out, t + 0.045, 'sine', 3600, 3600, 0.1, 0.28);
      this.noiseBurst(out, t, 0.04, 'highpass', 5000, 0.7, 0.3, 5);
    } else {
      this.tone(out, t, 'sine', 1500, 1300, 0.06, 0.3);
      this.noiseBurst(out, t, 0.025, 'highpass', 4000, 0.7, 0.25, 6);
    }
    if (killed) this.killConfirm();
  }

  killConfirm(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.spatial(null, 0.5);
    if (!out) return;
    const t = ctx.currentTime + 0.05;
    this.tone(out, t, 'triangle', 660, 660, 0.14, 0.3);
    this.tone(out, t + 0.09, 'triangle', 880, 880, 0.22, 0.32);
    this.tone(out, t + 0.09, 'sine', 1760, 1760, 0.22, 0.08);
  }

  /** You were hit: dull thud + pain grunt-ish noise. */
  damageTaken(amount: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.spatial(null, Math.min(1, 0.4 + amount / 60));
    if (!out) return;
    const t = ctx.currentTime;
    this.tone(out, t, 'sine', 130, 55, 0.18, 0.7);
    this.noiseBurst(out, t, 0.12, 'bandpass', 600, 0.9, 0.5, 3.5);
  }

  roundStinger(win: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.spatial(null, 0.5);
    if (!out) return;
    const t = ctx.currentTime;
    const notes = win ? [523.25, 659.25, 783.99, 1046.5] : [392, 349.23, 293.66, 261.63];
    notes.forEach((f, i) => this.tone(out, t + i * 0.13, win ? 'triangle' : 'sawtooth', f, f, 0.4, win ? 0.28 : 0.14));
  }

  freezeEnd(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.spatial(null, 0.4);
    if (!out) return;
    const t = ctx.currentTime;
    this.tone(out, t, 'square', 880, 880, 0.08, 0.15);
    this.tone(out, t + 0.12, 'square', 1320, 1320, 0.16, 0.15);
  }

  buySound(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.spatial(null, 0.5);
    if (!out) return;
    const t = ctx.currentTime;
    this.click(out, t, 0.5, 1800);
    this.tone(out, t + 0.03, 'sine', 1500, 2200, 0.1, 0.18);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // C4
  // ------------------------------------------------------------------------------------------------------------------

  private bombBeep(pos: Vec, urgency: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.currentTime - this.lastBeepAt < 0.05) return;
    this.lastBeepAt = ctx.currentTime;
    const out = this.spatial(pos, 0.9 + urgency * 0.5, 0.3);
    if (!out) return;
    const t = ctx.currentTime;
    this.tone(out, t, 'sine', 1900 + urgency * 400, 1900 + urgency * 400, 0.1, 0.55, 0.001);
    this.tone(out, t, 'square', 950, 950, 0.06, 0.08, 0.001);
  }

  private plantSound(pos: Vec, start: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.spatial(pos, 0.9, 0.3);
    if (!out) return;
    const t = ctx.currentTime;
    if (start) {
      // Three keypad beeps.
      for (let i = 0; i < 3; i++) this.tone(out, t + i * 0.22, 'square', 1200 + i * 250, 1200 + i * 250, 0.09, 0.2, 0.001);
    } else {
      // Armed: rising confirmation + heavy latch.
      this.tone(out, t, 'sine', 700, 1500, 0.35, 0.5);
      this.click(out, t + 0.35, 0.7, 900);
      this.tone(out, t + 0.4, 'sine', 90, 50, 0.3, 0.6);
    }
  }

  private defuseSound(pos: Vec, start: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.spatial(pos, 0.9, 0.3);
    if (!out) return;
    const t = ctx.currentTime;
    if (start) {
      // Ratcheting wire-cutter clicks.
      for (let i = 0; i < 8; i++) this.click(out, t + i * 0.16, 0.4, 1600 + (i % 2) * 400);
    } else {
      this.click(out, t, 0.8, 1200);
      this.tone(out, t + 0.05, 'triangle', 880, 1760, 0.3, 0.4);
      this.tone(out, t + 0.25, 'triangle', 1320, 1320, 0.4, 0.3);
    }
  }

  private explosion(pos: Vec): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.spatial(pos, 3.2, 1.2);
    if (!out) return;
    const t = ctx.currentTime;
    this.noiseBurst(out, t, 0.12, 'highpass', 2000, 0.6, 1.2, 6);
    this.noiseBurst(out, t, 2.4, 'lowpass', 1800, 0.7, 1.4, 2.2, 60);
    this.tone(out, t, 'sine', 70, 20, 2.0, 1.6);
    this.tone(out, t, 'sawtooth', 55, 25, 1.2, 0.5);
    this.noiseBurst(out, t + 0.3, 1.8, 'bandpass', 300, 0.5, 0.6, 2, 80);
  }

  private doorSound(pos: Vec, opening: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = this.spatial(pos, 0.5);
    if (!out) return;
    const t = ctx.currentTime;
    this.noiseBurst(out, t, 0.5, 'bandpass', opening ? 300 : 500, 2, 0.35, 1.8, opening ? 600 : 250);
    this.tone(out, t, 'sawtooth', opening ? 70 : 90, opening ? 110 : 60, 0.45, 0.14);
    this.click(out, t + (opening ? 0.02 : 0.42), 0.35, 900);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Event router
  // ------------------------------------------------------------------------------------------------------------------

  /**
   * Play the sound for a simulation event. `viewId` is the actor whose ears we use; sounds made by that actor are
   * "local" (centred, slightly louder).
   */
  handle(e: GameEvent, world: World, viewId: number): void {
    if (!this.ctx) return;
    switch (e.type) {
      case 'shot': {
        const def = getWeapon(e.weapon);
        const local = e.actorId === viewId;
        const shooter = world.actors[e.actorId];
        const pos = local ? null : { x: shooter.pos.x, y: shooter.pos.y + 1.5, z: shooter.pos.z };
        this.gunshot(def.sound, pos, local);
        break;
      }
      case 'dryFire': {
        const a = world.actors[e.actorId];
        const out = this.spatial(e.actorId === viewId ? null : { x: a.pos.x, y: a.pos.y + 1.4, z: a.pos.z }, 0.35);
        if (out) this.click(out, this.ctx.currentTime, 0.5, 1300);
        break;
      }
      case 'reloadStart': {
        const a = world.actors[e.actorId];
        const def = getWeapon(e.weapon);
        this.reload(def.sound, e.actorId === viewId ? null : { x: a.pos.x, y: a.pos.y + 1.2, z: a.pos.z }, def.reloadTime);
        break;
      }
      case 'weaponSwitch': {
        const a = world.actors[e.actorId];
        const out = this.spatial(e.actorId === viewId ? null : { x: a.pos.x, y: a.pos.y + 1.2, z: a.pos.z }, 0.3);
        if (out) {
          this.click(out, this.ctx.currentTime, 0.4, 1700);
          this.noiseBurst(out, this.ctx.currentTime + 0.03, 0.08, 'bandpass', 1200, 1, 0.15, 4);
        }
        break;
      }
      case 'scope':
        if (e.actorId === viewId) this.scopeSound(e.level);
        break;
      case 'footstep':
        this.footstep(e.pos, world, e.actorId === viewId);
        break;
      case 'jump': {
        const out = this.spatial(e.actorId === viewId ? null : e.pos, 0.25);
        if (out) this.noiseBurst(out, this.ctx.currentTime, 0.07, 'lowpass', 500, 0.8, 0.4, 3);
        break;
      }
      case 'land':
        this.land(e.pos, e.speed);
        break;
      case 'hit':
        if (e.attackerId === viewId) this.hitMarker(e.zone === 'head', e.killed);
        if (e.victimId === viewId) this.damageTaken(e.damage);
        else {
          // Bullet impact on flesh, heard by nearby players.
          const out = this.spatial(e.point, 0.5);
          if (out) {
            this.noiseBurst(out, this.ctx.currentTime, 0.07, 'lowpass', 700, 0.8, 0.5, 3.5);
            this.tone(out, this.ctx.currentTime, 'sine', 160, 70, 0.08, 0.3);
          }
        }
        break;
      case 'kill':
        break;
      case 'plantStart':
        this.plantSound(e.pos, true);
        break;
      case 'bombPlanted':
        this.plantSound(e.pos, false);
        break;
      case 'bombBeep':
        this.bombBeep(e.pos, e.urgency);
        break;
      case 'defuseStart':
        this.defuseSound(e.pos, true);
        break;
      case 'bombDefused':
        this.defuseSound(e.pos, false);
        break;
      case 'bombExploded':
        this.explosion(e.pos);
        break;
      case 'bombPickup':
      case 'weaponPickup': {
        const out = this.spatial(null, 0.4);
        if (out) this.click(out, this.ctx.currentTime, 0.6, 1400);
        break;
      }
      case 'doorMove':
        this.doorSound(e.pos, e.opening);
        break;
      case 'freezeEnd':
        this.freezeEnd();
        break;
      case 'roundEnd': {
        const me = world.actors[viewId];
        if (me) this.roundStinger(me.team === e.winner);
        break;
      }
      case 'buy':
        if (e.actorId === viewId) this.buySound();
        break;
      default:
        break;
    }
  }
}
