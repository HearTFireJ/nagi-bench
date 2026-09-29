// Procedural sound: every effect is synthesised with the Web Audio API (noise bursts, filtered
// sweeps, oscillators). No audio files are used. Sounds can be positional (distance gain +
// stereo pan relative to the listener).

import type { SoundId, WeaponId } from '../sim/weapons.ts';

export interface Listener {
  x: number;
  z: number;
  yaw: number;
}

interface NoiseOpts {
  dur: number;
  gain: number;
  type?: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  attack?: number;
  delay?: number;
  curve?: number;
}

interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  dur: number;
  gain: number;
  attack?: number;
  delay?: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private listener: Listener = { x: 0, z: 0, yaw: 0 };
  volume = 0.7;

  /** Must be called from a user gesture (click) at least once. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 6;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setListener(l: Listener): void {
    this.listener = l;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  // ---- primitives ----------------------------------------------------------------------------
  /** Returns the node to connect a voice into: a panner+gain chain for positional sounds. */
  private out(pos?: { x: number; z: number }, gainMul = 1): AudioNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.master) return null;
    const g = ctx.createGain();
    let vol = gainMul;
    let pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.x;
      const dz = pos.z - this.listener.z;
      const d = Math.hypot(dx, dz);
      vol *= 1 / (1 + (d / 14) * (d / 14));
      if (d > 0.5) {
        const rx = Math.cos(this.listener.yaw);
        const rz = -Math.sin(this.listener.yaw);
        pan = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.85;
      }
    }
    g.gain.value = vol;
    if (vol < 0.004) return null;
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  private noiseBurst(dest: AudioNode, o: NoiseOpts): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.Q.value = o.q ?? 0.9;
    f.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
    const g = ctx.createGain();
    const atk = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.gain, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + o.dur + 0.05);
  }

  private tone(dest: AudioNode, o: ToneOpts): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t0 + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.gain, t0 + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  // ---- weapons ------------------------------------------------------------------------------------
  shot(sound: SoundId, pos?: { x: number; z: number }, own = false): void {
    const d = this.out(own ? undefined : pos, own ? 1 : 1.15);
    if (!d) return;
    switch (sound) {
      case 'ak':
        this.noiseBurst(d, { dur: 0.18, gain: 1.0, f0: 1700, f1: 380, q: 0.7 });
        this.noiseBurst(d, { dur: 0.03, gain: 0.7, type: 'highpass', f0: 4200, q: 0.5 });
        this.tone(d, { type: 'triangle', f0: 170, f1: 45, dur: 0.16, gain: 0.9 });
        this.tone(d, { type: 'square', f0: 620, f1: 180, dur: 0.05, gain: 0.18 });
        break;
      case 'm4':
        this.noiseBurst(d, { dur: 0.12, gain: 0.7, f0: 2600, f1: 800, q: 0.9 });
        this.noiseBurst(d, { dur: 0.025, gain: 0.55, type: 'highpass', f0: 5200, q: 0.5 });
        this.tone(d, { type: 'triangle', f0: 240, f1: 80, dur: 0.09, gain: 0.55 });
        break;
      case 'awp':
        this.noiseBurst(d, { dur: 0.75, gain: 1.2, type: 'lowpass', f0: 1400, f1: 90, q: 0.6 });
        this.noiseBurst(d, { dur: 0.06, gain: 1.0, type: 'highpass', f0: 3000, q: 0.5 });
        this.tone(d, { type: 'sine', f0: 100, f1: 26, dur: 0.6, gain: 1.2 });
        this.noiseBurst(d, { dur: 0.5, gain: 0.35, type: 'lowpass', f0: 700, f1: 120, delay: 0.12 });
        break;
      case 'glock':
        this.noiseBurst(d, { dur: 0.08, gain: 0.55, f0: 3000, f1: 1300, q: 1.1 });
        this.tone(d, { type: 'triangle', f0: 380, f1: 130, dur: 0.06, gain: 0.5 });
        break;
      case 'usp':
        this.noiseBurst(d, { dur: 0.1, gain: 0.3, type: 'lowpass', f0: 2200, f1: 600, q: 0.7 });
        this.tone(d, { type: 'sine', f0: 260, f1: 110, dur: 0.08, gain: 0.3 });
        this.noiseBurst(d, { dur: 0.02, gain: 0.3, type: 'highpass', f0: 5000 });
        break;
      case 'deagle':
        this.noiseBurst(d, { dur: 0.32, gain: 1.0, type: 'lowpass', f0: 2000, f1: 170, q: 0.7 });
        this.noiseBurst(d, { dur: 0.04, gain: 0.8, type: 'highpass', f0: 3500 });
        this.tone(d, { type: 'triangle', f0: 150, f1: 38, dur: 0.24, gain: 1.0 });
        break;
      case 'knife':
        this.noiseBurst(d, { dur: 0.16, gain: 0.35, type: 'bandpass', f0: 1200, f1: 5200, q: 1.5, attack: 0.05 });
        break;
    }
  }

  knifeHit(pos?: { x: number; z: number }): void {
    const d = this.out(pos, 1);
    if (!d) return;
    this.noiseBurst(d, { dur: 0.1, gain: 0.7, type: 'lowpass', f0: 1400, f1: 300 });
    this.tone(d, { type: 'triangle', f0: 200, f1: 70, dur: 0.1, gain: 0.5 });
  }

  reload(weapon: WeaponId, dur: number, pos?: { x: number; z: number }, own = false): void {
    const d = this.out(own ? undefined : pos, own ? 0.9 : 1);
    if (!d) return;
    const click = (delay: number, f: number, gain = 0.5): void => {
      this.noiseBurst(d, { dur: 0.035, gain, f0: f, f1: f * 0.6, q: 4, delay });
      this.tone(d, { type: 'square', f0: f * 0.3, f1: f * 0.15, dur: 0.03, gain: gain * 0.25, delay });
    };
    const heavy = weapon === 'awp' || weapon === 'ak47' || weapon === 'm4a4';
    click(0.05, 1900, 0.55); // mag out
    this.noiseBurst(d, { dur: 0.12, gain: 0.2, type: 'bandpass', f0: 900, f1: 500, delay: 0.16 }); // slide
    click(dur * 0.55, 1300, 0.7); // mag in
    this.tone(d, { type: 'triangle', f0: 240, f1: 110, dur: 0.07, gain: 0.35, delay: dur * 0.55 });
    if (heavy) {
      click(dur * 0.85, 2300, 0.6); // charging handle
      click(dur * 0.85 + 0.09, 1500, 0.65);
    } else {
      click(dur * 0.85, 2100, 0.6); // slide release
    }
  }

  dryClick(pos?: { x: number; z: number }): void {
    const d = this.out(pos, 0.7);
    if (!d) return;
    this.noiseBurst(d, { dur: 0.03, gain: 0.4, f0: 2600, f1: 1800, q: 5 });
  }

  draw(pos?: { x: number; z: number }, own = false): void {
    const d = this.out(own ? undefined : pos, 0.6);
    if (!d) return;
    this.noiseBurst(d, { dur: 0.09, gain: 0.35, type: 'bandpass', f0: 1000, f1: 2500, q: 2 });
    this.noiseBurst(d, { dur: 0.03, gain: 0.35, f0: 2000, delay: 0.1, q: 4 });
  }

  scope(level: number): void {
    const d = this.out(undefined, 0.7);
    if (!d) return;
    if (level > 0) {
      this.tone(d, { type: 'sine', f0: 700, f1: 1500, dur: 0.09, gain: 0.25 });
      this.noiseBurst(d, { dur: 0.03, gain: 0.3, f0: 3000, q: 4 });
    } else {
      this.tone(d, { type: 'sine', f0: 1200, f1: 500, dur: 0.07, gain: 0.2 });
    }
  }

  // ---- feedback -----------------------------------------------------------------------------------------
  hit(head: boolean): void {
    const d = this.out(undefined, 0.9);
    if (!d) return;
    this.tone(d, { type: 'sine', f0: 1700, f1: 1200, dur: 0.05, gain: 0.5 });
    if (head) {
      this.tone(d, { type: 'sine', f0: 2600, f1: 3200, dur: 0.14, gain: 0.5, delay: 0.02 });
      this.tone(d, { type: 'triangle', f0: 5200, dur: 0.1, gain: 0.15, delay: 0.02 });
    }
  }

  bodyImpact(pos: { x: number; z: number }, head: boolean): void {
    const d = this.out(pos, 0.8);
    if (!d) return;
    this.noiseBurst(d, { dur: 0.08, gain: 0.5, type: 'lowpass', f0: 900, f1: 200 });
    if (head) this.tone(d, { type: 'square', f0: 900, f1: 500, dur: 0.05, gain: 0.15 });
  }

  wallImpact(pos: { x: number; z: number }): void {
    const d = this.out(pos, 0.45);
    if (!d) return;
    this.noiseBurst(d, { dur: 0.07, gain: 0.45, f0: 2400, f1: 900, q: 1.2 });
  }

  hurt(): void {
    const d = this.out(undefined, 1);
    if (!d) return;
    this.tone(d, { type: 'triangle', f0: 110, f1: 55, dur: 0.18, gain: 0.7 });
    this.noiseBurst(d, { dur: 0.12, gain: 0.3, type: 'lowpass', f0: 600, f1: 200 });
  }

  kill(): void {
    const d = this.out(undefined, 0.8);
    if (!d) return;
    this.tone(d, { type: 'sine', f0: 660, dur: 0.12, gain: 0.4 });
    this.tone(d, { type: 'sine', f0: 990, dur: 0.22, gain: 0.4, delay: 0.1 });
    this.tone(d, { type: 'triangle', f0: 1980, dur: 0.18, gain: 0.1, delay: 0.1 });
  }

  death(): void {
    const d = this.out(undefined, 1);
    if (!d) return;
    this.tone(d, { type: 'sawtooth', f0: 220, f1: 40, dur: 0.6, gain: 0.35 });
  }

  bodyFall(pos: { x: number; z: number }): void {
    const d = this.out(pos, 0.9);
    if (!d) return;
    this.noiseBurst(d, { dur: 0.22, gain: 0.7, type: 'lowpass', f0: 500, f1: 90 });
    this.tone(d, { type: 'sine', f0: 90, f1: 40, dur: 0.2, gain: 0.6 });
  }

  step(pos: { x: number; z: number }, own = false): void {
    const d = this.out(own ? undefined : pos, own ? 0.35 : 0.9);
    if (!d) return;
    const r = 0.85 + Math.random() * 0.3;
    this.noiseBurst(d, { dur: 0.09, gain: 0.5, type: 'lowpass', f0: 650 * r, f1: 220 * r, q: 0.8 });
    this.tone(d, { type: 'sine', f0: 95 * r, f1: 60, dur: 0.06, gain: 0.35 });
    this.noiseBurst(d, { dur: 0.03, gain: 0.12, type: 'highpass', f0: 3200, delay: 0.005 });
  }

  jump(pos: { x: number; z: number }, own = false): void {
    const d = this.out(own ? undefined : pos, own ? 0.4 : 0.7);
    if (!d) return;
    this.noiseBurst(d, { dur: 0.08, gain: 0.3, type: 'lowpass', f0: 500, f1: 250 });
  }

  door(pos: { x: number; z: number }, opening: boolean): void {
    const d = this.out(pos, 0.8);
    if (!d) return;
    this.noiseBurst(d, {
      dur: 0.5,
      gain: 0.3,
      type: 'bandpass',
      f0: opening ? 250 : 500,
      f1: opening ? 520 : 200,
      q: 3,
      attack: 0.08,
    });
    this.tone(d, { type: 'sawtooth', f0: opening ? 90 : 130, f1: opening ? 130 : 80, dur: 0.4, gain: 0.05 });
  }

  // ---- bomb -----------------------------------------------------------------------------------------------------
  plantStart(pos: { x: number; z: number }): void {
    const d = this.out(pos, 1);
    if (!d) return;
    for (let i = 0; i < 3; i++) this.tone(d, { type: 'square', f0: 880 + i * 220, dur: 0.09, gain: 0.25, delay: i * 0.55 });
  }

  planted(): void {
    const d = this.out(undefined, 1);
    if (!d) return;
    this.tone(d, { type: 'square', f0: 1320, dur: 0.12, gain: 0.3 });
    this.tone(d, { type: 'square', f0: 990, dur: 0.12, gain: 0.3, delay: 0.16 });
    this.tone(d, { type: 'sawtooth', f0: 220, f1: 110, dur: 0.6, gain: 0.25, delay: 0.3 });
  }

  beep(pos: { x: number; z: number }, urgent: boolean): void {
    const d = this.out(pos, 1.25);
    if (!d) return;
    this.tone(d, { type: 'square', f0: urgent ? 2000 : 1500, dur: 0.09, gain: 0.3 });
    this.tone(d, { type: 'sine', f0: urgent ? 4000 : 3000, dur: 0.05, gain: 0.1 });
  }

  defuseStart(pos: { x: number; z: number }): void {
    const d = this.out(pos, 1);
    if (!d) return;
    for (let i = 0; i < 6; i++) {
      this.noiseBurst(d, { dur: 0.03, gain: 0.4, f0: 2200 + i * 200, q: 5, delay: i * 0.22 });
      this.tone(d, { type: 'square', f0: 500 + i * 60, dur: 0.03, gain: 0.08, delay: i * 0.22 });
    }
  }

  defused(): void {
    const d = this.out(undefined, 1);
    if (!d) return;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(d, { type: 'sine', f0: f, dur: 0.35, gain: 0.3, delay: i * 0.09 }));
  }

  explosion(pos: { x: number; z: number }): void {
    const d = this.out(pos, 1.6);
    if (!d) return;
    this.noiseBurst(d, { dur: 2.2, gain: 1.4, type: 'lowpass', f0: 2200, f1: 50, q: 0.5 });
    this.tone(d, { type: 'sine', f0: 75, f1: 18, dur: 1.8, gain: 1.6 });
    this.noiseBurst(d, { dur: 0.15, gain: 1.0, type: 'highpass', f0: 2500 });
    this.noiseBurst(d, { dur: 1.2, gain: 0.5, type: 'bandpass', f0: 400, f1: 100, delay: 0.2 });
  }

  pickup(): void {
    const d = this.out(undefined, 0.6);
    if (!d) return;
    this.tone(d, { type: 'sine', f0: 700, f1: 1100, dur: 0.1, gain: 0.3 });
  }

  // ---- round / ui -------------------------------------------------------------------------------------------------
  roundStart(): void {
    const d = this.out(undefined, 0.8);
    if (!d) return;
    this.tone(d, { type: 'square', f0: 900, dur: 0.1, gain: 0.2 });
    this.tone(d, { type: 'square', f0: 1200, dur: 0.16, gain: 0.2, delay: 0.14 });
  }

  roundEnd(win: boolean): void {
    const d = this.out(undefined, 0.9);
    if (!d) return;
    const notes = win ? [523, 659, 784, 1046] : [392, 330, 262, 196];
    notes.forEach((f, i) => this.tone(d, { type: 'triangle', f0: f, dur: 0.3, gain: 0.3, delay: i * 0.14 }));
  }

  buy(): void {
    const d = this.out(undefined, 0.7);
    if (!d) return;
    this.tone(d, { type: 'sine', f0: 2400, dur: 0.08, gain: 0.25 });
    this.tone(d, { type: 'sine', f0: 3200, dur: 0.18, gain: 0.25, delay: 0.07 });
  }

  uiClick(): void {
    const d = this.out(undefined, 0.5);
    if (!d) return;
    this.tone(d, { type: 'sine', f0: 1000, f1: 700, dur: 0.05, gain: 0.25 });
  }
}
