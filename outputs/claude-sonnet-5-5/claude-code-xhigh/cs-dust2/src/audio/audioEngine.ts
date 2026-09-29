import type { Game } from '../core/game/game.ts';
import type { GameEvent } from '../core/game/events.ts';
import { clamp } from '../core/math.ts';

interface NoiseOpts {
  /** start delay (s) */
  t?: number;
  dur: number;
  type: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  gain: number;
  attack?: number;
}

interface ToneOpts {
  t?: number;
  dur: number;
  type: OscillatorType;
  freq: number;
  freqEnd?: number;
  gain: number;
  attack?: number;
}

interface Pos {
  x: number;
  y: number;
  z: number;
}

type Build = (dest: AudioNode) => void;

const MIN_GAIN = 0.0001;

/**
 * Procedural sound: every effect is synthesised from filtered noise bursts and oscillators
 * with Web Audio (no audio files). Enemy sounds are positioned in 3D with a PannerNode plus a
 * distance-dependent low-pass, the local player's own sounds play centred.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private volume = 0.75;
  muted = false;
  private lastFootstep = new Map<number, number>();

  /** Must be called from a user gesture (click / key) to satisfy autoplay policies. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;
    // 2 s of white noise, sliced with random offsets for every burst
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.03);
  }

  setListener(x: number, y: number, z: number, yaw: number, pitch: number): void {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const fx = -Math.sin(yaw) * Math.cos(pitch);
    const fy = Math.sin(pitch);
    const fz = -Math.cos(yaw) * Math.cos(pitch);
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(x, t);
      l.positionY.setValueAtTime(y, t);
      l.positionZ.setValueAtTime(z, t);
      l.forwardX.setValueAtTime(fx, t);
      l.forwardY.setValueAtTime(fy, t);
      l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  // ------------------------------------------------------------------ primitives

  private noise(dest: AudioNode, o: NoiseOpts): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    const t0 = ctx.currentTime + (o.t ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.frequency.setValueAtTime(o.freq, t0);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t0 + o.dur);
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(MIN_GAIN, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, o.gain), t0 + (o.attack ?? 0.003));
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t0 + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t0, Math.random() * 1.6);
    src.stop(t0 + o.dur + 0.05);
  }

  private tone(dest: AudioNode, o: ToneOpts): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.t ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(15, o.freqEnd), t0 + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(MIN_GAIN, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, o.gain), t0 + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t0 + o.dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  /** Play something centred (own weapon, UI, hit markers). */
  private flat(gain: number, dur: number, build: Build): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const g = ctx.createGain();
    g.gain.value = gain;
    g.connect(this.master);
    build(g);
    window.setTimeout(() => g.disconnect(), (dur + 0.4) * 1000);
  }

  /** Play something at a world position with distance attenuation and a distance low-pass. */
  private at(p: Pos, listener: Pos, gain: number, dur: number, ref: number, build: Build): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const dist = Math.hypot(p.x - listener.x, p.y - listener.y, p.z - listener.z);
    if (dist < 1.5) {
      this.flat(gain, dur, build);
      return;
    }
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = ref;
    panner.rolloffFactor = 1.15;
    panner.maxDistance = 400;
    if (panner.positionX) {
      panner.positionX.value = p.x;
      panner.positionY.value = p.y;
      panner.positionZ.value = p.z;
    } else panner.setPosition(p.x, p.y, p.z);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = clamp(14000 / (1 + dist / 22), 1200, 14000);
    const g = ctx.createGain();
    g.gain.value = gain;
    g.connect(lp);
    lp.connect(panner);
    panner.connect(this.master);
    build(g);
    window.setTimeout(() => {
      g.disconnect();
      lp.disconnect();
      panner.disconnect();
    }, (dur + 0.5) * 1000);
  }

  // ------------------------------------------------------------------ the sound library

  private gunshot(id: string, d: AudioNode): number {
    switch (id) {
      case 'ak47':
        this.noise(d, { dur: 0.17, type: 'bandpass', freq: 1500, freqEnd: 550, q: 0.7, gain: 0.95 });
        this.noise(d, { dur: 0.05, type: 'highpass', freq: 3200, gain: 0.55 });
        this.tone(d, { dur: 0.14, type: 'sine', freq: 155, freqEnd: 46, gain: 0.95 });
        this.noise(d, { t: 0.02, dur: 0.4, type: 'lowpass', freq: 900, freqEnd: 180, gain: 0.22 });
        return 0.5;
      case 'm4a4':
        this.noise(d, { dur: 0.11, type: 'bandpass', freq: 2300, freqEnd: 1100, q: 1.0, gain: 0.7 });
        this.noise(d, { dur: 0.035, type: 'highpass', freq: 4200, gain: 0.5 });
        this.tone(d, { dur: 0.09, type: 'sine', freq: 200, freqEnd: 80, gain: 0.6 });
        this.noise(d, { t: 0.015, dur: 0.26, type: 'lowpass', freq: 1500, freqEnd: 300, gain: 0.16 });
        return 0.4;
      case 'awp':
        this.noise(d, { dur: 0.75, type: 'lowpass', freq: 2600, freqEnd: 160, q: 0.6, gain: 1.1 });
        this.noise(d, { dur: 0.08, type: 'highpass', freq: 2400, gain: 0.8 });
        this.tone(d, { dur: 0.5, type: 'sine', freq: 92, freqEnd: 30, gain: 1.25 });
        this.noise(d, { t: 0.04, dur: 1.5, type: 'lowpass', freq: 650, freqEnd: 120, gain: 0.3 });
        // bolt cycle
        this.noise(d, { t: 0.55, dur: 0.04, type: 'highpass', freq: 1800, gain: 0.35 });
        this.tone(d, { t: 0.55, dur: 0.05, type: 'square', freq: 700, freqEnd: 300, gain: 0.08 });
        this.noise(d, { t: 0.85, dur: 0.05, type: 'bandpass', freq: 1400, gain: 0.4 });
        return 1.6;
      case 'glock':
        this.noise(d, { dur: 0.07, type: 'bandpass', freq: 1900, freqEnd: 1000, q: 0.9, gain: 0.6 });
        this.noise(d, { dur: 0.03, type: 'highpass', freq: 3600, gain: 0.35 });
        this.tone(d, { dur: 0.05, type: 'sine', freq: 250, freqEnd: 110, gain: 0.42 });
        return 0.25;
      case 'usp':
        // suppressed: muffled thump + mechanical tick
        this.noise(d, { dur: 0.09, type: 'lowpass', freq: 1300, freqEnd: 400, gain: 0.38 });
        this.tone(d, { dur: 0.06, type: 'sine', freq: 135, freqEnd: 70, gain: 0.32 });
        this.noise(d, { t: 0.012, dur: 0.02, type: 'highpass', freq: 2600, gain: 0.25 });
        return 0.2;
      case 'deagle':
        this.noise(d, { dur: 0.32, type: 'bandpass', freq: 1000, freqEnd: 320, q: 0.6, gain: 1.0 });
        this.noise(d, { dur: 0.05, type: 'highpass', freq: 3000, gain: 0.6 });
        this.tone(d, { dur: 0.24, type: 'sine', freq: 125, freqEnd: 38, gain: 1.05 });
        this.noise(d, { t: 0.03, dur: 0.6, type: 'lowpass', freq: 720, freqEnd: 150, gain: 0.22 });
        return 0.7;
      default:
        this.noise(d, { dur: 0.1, type: 'bandpass', freq: 1500, gain: 0.5 });
        return 0.3;
    }
  }

  private reloadSound(id: string, dur: number, d: AudioNode): void {
    const click = (t: number, gain = 0.35): void => {
      this.noise(d, { t, dur: 0.04, type: 'bandpass', freq: 1500, q: 1.5, gain });
      this.tone(d, { t, dur: 0.035, type: 'square', freq: 800, freqEnd: 350, gain: gain * 0.15 });
    };
    const thud = (t: number): void => {
      this.noise(d, { t, dur: 0.09, type: 'lowpass', freq: 800, freqEnd: 300, gain: 0.55 });
      this.tone(d, { t, dur: 0.07, type: 'sine', freq: 230, freqEnd: 110, gain: 0.4 });
    };
    if (id === 'awp') {
      click(dur * 0.12);
      click(dur * 0.32, 0.25);
      thud(dur * 0.55);
      this.noise(d, { t: dur * 0.82, dur: 0.05, type: 'bandpass', freq: 1300, gain: 0.45 });
      this.noise(d, { t: dur * 0.9, dur: 0.05, type: 'highpass', freq: 2000, gain: 0.4 });
      return;
    }
    click(dur * 0.14); // magazine out
    thud(dur * 0.5); // magazine in
    click(dur * 0.52, 0.25);
    click(dur * 0.84, 0.45); // charging handle
    click(dur * 0.84 + 0.07, 0.35);
  }

  private footstep(d: AudioNode): void {
    const v = 0.85 + Math.random() * 0.3;
    this.noise(d, { dur: 0.09, type: 'lowpass', freq: 520 * v, freqEnd: 240, gain: 0.55 });
    this.noise(d, { dur: 0.025, type: 'bandpass', freq: 1900 * v, gain: 0.12 });
    this.tone(d, { dur: 0.06, type: 'sine', freq: 85 * v, freqEnd: 50, gain: 0.32 });
  }

  // ------------------------------------------------------------------ event mapping

  /** Turn a batch of sim events into sound. Call once per frame after the listener was set. */
  handle(events: GameEvent[], game: Game, listener: Pos): void {
    if (!this.ctx || this.muted) return;
    const vc = game.viewChar;
    const vcId = vc ? vc.id : -1;
    const human = game.human;
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          const sh = game.chars[e.shooter];
          const mine = e.shooter === vcId;
          const pos: Pos = { x: sh.pos.x, y: sh.eyeY, z: sh.pos.z };
          const build: Build = (d) => {
            this.gunshot(e.weapon, d);
          };
          if (mine) this.flat(0.85, 1.7, build);
          else this.at(pos, listener, 1.0, 1.7, e.weapon === 'awp' ? 14 : 8, build);
          break;
        }
        case 'dryfire': {
          const pos = game.chars[e.id];
          const b: Build = (d) => {
            this.noise(d, { dur: 0.025, type: 'highpass', freq: 3000, gain: 0.4 });
            this.tone(d, { dur: 0.02, type: 'square', freq: 900, freqEnd: 500, gain: 0.05 });
          };
          if (e.id === vcId) this.flat(0.7, 0.1, b);
          else this.at({ x: pos.pos.x, y: pos.eyeY, z: pos.pos.z }, listener, 0.5, 0.1, 4, b);
          break;
        }
        case 'reload': {
          const c = game.chars[e.id];
          const b: Build = (d) => this.reloadSound(e.weapon, e.duration, d);
          if (e.id === vcId) this.flat(0.65, e.duration + 0.2, b);
          else this.at({ x: c.pos.x, y: c.eyeY, z: c.pos.z }, listener, 0.5, e.duration + 0.2, 4, b);
          break;
        }
        case 'switch': {
          if (e.id !== vcId) break;
          this.flat(0.5, 0.15, (d) => {
            this.noise(d, { dur: 0.05, type: 'bandpass', freq: 1700, q: 1.2, gain: 0.35 });
            this.noise(d, { t: 0.07, dur: 0.04, type: 'highpass', freq: 2200, gain: 0.25 });
          });
          break;
        }
        case 'scope': {
          if (e.id !== vcId) break;
          const up = e.level > 0;
          this.flat(0.6, 0.3, (d) => {
            this.noise(d, { dur: 0.14, type: 'bandpass', freq: up ? 900 : 3200, freqEnd: up ? 3200 : 900, q: 1.4, gain: 0.3 });
            this.noise(d, { t: 0.11, dur: 0.03, type: 'highpass', freq: 2500, gain: 0.35 });
            this.tone(d, { dur: 0.1, type: 'sine', freq: up ? 420 : 900, freqEnd: up ? 900 : 420, gain: 0.08 });
          });
          break;
        }
        case 'melee': {
          const c = game.chars[e.id];
          const b: Build = (d) => {
            this.noise(d, { dur: 0.17, type: 'bandpass', freq: 500, freqEnd: 2300, q: 1.0, gain: 0.3, attack: 0.05 });
            if (e.hit) {
              this.noise(d, { t: 0.09, dur: 0.09, type: 'lowpass', freq: 1000, gain: 0.55 });
              this.tone(d, { t: 0.09, dur: 0.08, type: 'sine', freq: 210, freqEnd: 90, gain: 0.4 });
            }
          };
          if (e.id === vcId) this.flat(0.7, 0.3, b);
          else this.at({ x: c.pos.x, y: c.eyeY, z: c.pos.z }, listener, 0.6, 0.3, 4, b);
          break;
        }
        case 'footstep': {
          const now = this.ctx.currentTime;
          const last = this.lastFootstep.get(e.id) ?? 0;
          if (now - last < 0.12) break;
          this.lastFootstep.set(e.id, now);
          if (e.id === vcId) this.flat(0.28, 0.2, (d) => this.footstep(d));
          else this.at({ x: e.x, y: e.y + 0.1, z: e.z }, listener, 0.85, 0.2, 3.5, (d) => this.footstep(d));
          break;
        }
        case 'land': {
          const b: Build = (d) => {
            this.noise(d, { dur: 0.14, type: 'lowpass', freq: 420, freqEnd: 150, gain: 0.7 });
            this.tone(d, { dur: 0.1, type: 'sine', freq: 90, freqEnd: 45, gain: 0.4 });
          };
          if (e.id === vcId) this.flat(0.45, 0.25, b);
          else this.at({ x: e.x, y: e.y, z: e.z }, listener, 0.6, 0.25, 4, b);
          break;
        }
        case 'hit': {
          const victimIsMe = human !== null && e.victim === human.id;
          if (vc && e.attacker === vc.id) {
            // hit feedback for the shooter
            this.flat(0.8, 0.25, (d) => {
              if (e.headshot) {
                this.tone(d, { dur: 0.09, type: 'sine', freq: 2600, freqEnd: 2200, gain: 0.5 });
                this.tone(d, { t: 0.03, dur: 0.12, type: 'sine', freq: 3400, gain: 0.35 });
                this.noise(d, { dur: 0.05, type: 'bandpass', freq: 4200, q: 3, gain: 0.35 });
              } else {
                this.tone(d, { dur: 0.04, type: 'sine', freq: 1900, gain: 0.4 });
                this.tone(d, { t: 0.04, dur: 0.05, type: 'sine', freq: 1300, gain: 0.3 });
              }
            });
          }
          if (victimIsMe) {
            this.flat(0.8, 0.3, (d) => {
              this.tone(d, { dur: 0.2, type: 'sine', freq: 115, freqEnd: 55, gain: 0.65 });
              this.noise(d, { dur: 0.14, type: 'lowpass', freq: 800, freqEnd: 250, gain: 0.55 });
            });
          } else {
            const v = game.chars[e.victim];
            this.at({ x: v.pos.x, y: v.pos.y + 1.2, z: v.pos.z }, listener, 0.55, 0.25, 4, (d) => {
              this.noise(d, { dur: 0.08, type: 'lowpass', freq: 900, freqEnd: 300, gain: 0.6 });
              this.tone(d, { dur: 0.07, type: 'sine', freq: 150, freqEnd: 70, gain: 0.4 });
            });
          }
          break;
        }
        case 'kill': {
          if (vc && e.killer === vc.id && e.killer !== e.victim) {
            this.flat(0.6, 0.5, (d) => {
              this.tone(d, { dur: 0.16, type: 'triangle', freq: 880, gain: 0.35 });
              this.tone(d, { t: 0.09, dur: 0.22, type: 'triangle', freq: 1320, gain: 0.35 });
              if (e.headshot) this.tone(d, { t: 0.05, dur: 0.14, type: 'sine', freq: 2600, gain: 0.25 });
            });
          }
          if (human && e.victim === human.id) {
            this.flat(0.7, 0.9, (d) => {
              this.tone(d, { dur: 0.7, type: 'sawtooth', freq: 220, freqEnd: 45, gain: 0.22 });
              this.noise(d, { dur: 0.5, type: 'lowpass', freq: 600, freqEnd: 100, gain: 0.5 });
            });
          }
          break;
        }
        case 'bombPickup':
          if (vc && e.id === vc.id) this.flat(0.6, 0.2, (d) => this.tone(d, { dur: 0.08, type: 'square', freq: 1200, gain: 0.12 }));
          break;
        case 'bombDrop':
          this.at({ x: e.x, y: e.y, z: e.z }, listener, 0.6, 0.3, 4, (d) => this.noise(d, { dur: 0.12, type: 'lowpass', freq: 500, gain: 0.5 }));
          break;
        case 'plantStart':
          this.at({ x: e.x, y: e.y, z: e.z }, listener, 0.8, 1.2, 6, (d) => {
            for (let i = 0; i < 4; i++) this.tone(d, { t: i * 0.8, dur: 0.06, type: 'square', freq: 1500, gain: 0.16 });
          });
          break;
        case 'planted':
          this.at({ x: e.x, y: e.y, z: e.z }, listener, 1.0, 1.2, 25, (d) => {
            this.tone(d, { dur: 0.55, type: 'sine', freq: 950, gain: 0.5 });
            this.tone(d, { t: 0.6, dur: 0.1, type: 'square', freq: 1300, gain: 0.15 });
            this.tone(d, { t: 0.72, dur: 0.1, type: 'square', freq: 1700, gain: 0.15 });
          });
          break;
        case 'defuseStart':
          this.at({ x: e.x, y: e.y, z: e.z }, listener, 0.8, 0.5, 6, (d) => {
            this.tone(d, { dur: 0.25, type: 'square', freq: 400, freqEnd: 1500, gain: 0.12 });
            this.noise(d, { t: 0.05, dur: 0.2, type: 'bandpass', freq: 2500, gain: 0.15 });
          });
          break;
        case 'defused':
          this.flat(0.7, 0.8, (d) => {
            for (const [i, f] of [880, 1108, 1320].entries()) this.tone(d, { t: i * 0.11, dur: 0.25, type: 'triangle', freq: f, gain: 0.3 });
          });
          break;
        case 'bombBeep': {
          const f = 1850 + e.urgency * 800;
          this.at({ x: e.x, y: e.y + 0.2, z: e.z }, listener, 0.85, 0.15, 14, (d) => this.tone(d, { dur: 0.09, type: 'sine', freq: f, gain: 0.5 }));
          break;
        }
        case 'exploded':
          this.at({ x: e.x, y: e.y, z: e.z }, listener, 1.5, 3.4, 40, (d) => {
            this.noise(d, { dur: 3.0, type: 'lowpass', freq: 3200, freqEnd: 55, q: 0.5, gain: 1.4, attack: 0.008 });
            this.tone(d, { dur: 2.3, type: 'sine', freq: 72, freqEnd: 22, gain: 1.5 });
            this.noise(d, { t: 0.1, dur: 0.9, type: 'highpass', freq: 1400, gain: 0.45 });
            this.noise(d, { t: 0.6, dur: 1.6, type: 'bandpass', freq: 400, freqEnd: 120, gain: 0.5 });
          });
          break;
        case 'doorMove':
          this.at({ x: e.x, y: 1.5, z: e.z }, listener, 0.5, 0.7, 5, (d) => {
            this.noise(d, { dur: 0.55, type: 'lowpass', freq: 750, freqEnd: 280, gain: 0.22, attack: 0.08 });
            this.noise(d, { t: 0.02, dur: 0.4, type: 'bandpass', freq: 1100, freqEnd: 500, q: 2, gain: 0.05, attack: 0.1 });
          });
          break;
        case 'freezeEnd':
          this.flat(0.6, 0.5, (d) => {
            this.tone(d, { dur: 0.12, type: 'sine', freq: 780, gain: 0.25 });
            this.tone(d, { t: 0.14, dur: 0.2, type: 'sine', freq: 1170, gain: 0.25 });
          });
          break;
        case 'roundStart':
          this.flat(0.5, 0.6, (d) => {
            for (let i = 0; i < 3; i++) this.tone(d, { t: i * 0.12, dur: 0.07, type: 'square', freq: 1000, gain: 0.08 });
          });
          break;
        case 'roundEnd': {
          const win = human !== null && human.team === e.winner;
          const notes = win ? [523, 659, 784, 1046] : [392, 349, 311, 262];
          this.flat(0.7, 1.4, (d) => {
            notes.forEach((f, i) => this.tone(d, { t: i * 0.16, dur: 0.3, type: 'triangle', freq: f, gain: 0.28 }));
          });
          break;
        }
        case 'buy':
          if (human && e.id === human.id) {
            this.flat(0.6, 0.4, (d) => {
              this.noise(d, { dur: 0.04, type: 'bandpass', freq: 2200, q: 2, gain: 0.3 });
              this.tone(d, { t: 0.05, dur: 0.09, type: 'sine', freq: 2000, gain: 0.2 });
              this.tone(d, { t: 0.11, dur: 0.14, type: 'sine', freq: 2700, gain: 0.2 });
            });
          }
          break;
        default:
          break;
      }
    }
  }

  dispose(): void {
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.master = null;
  }
}
