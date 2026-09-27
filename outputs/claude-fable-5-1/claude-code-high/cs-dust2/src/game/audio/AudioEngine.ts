import { clamp, type Vec3 } from '../core/vec';
import type { WeaponSound } from '../weapons/WeaponDefs';

export type SfxName =
  | 'reload_start'
  | 'reload_end'
  | 'footstep'
  | 'scope'
  | 'hit'
  | 'headshot'
  | 'hurt'
  | 'kill'
  | 'c4_plant_start'
  | 'c4_planted'
  | 'c4_beep'
  | 'c4_defuse'
  | 'c4_defused'
  | 'c4_explode'
  | 'round_start'
  | 'round_win'
  | 'round_lose'
  | 'whiz'
  | 'switch'
  | 'pickup'
  | 'knife_hit'
  | 'buy'
  | 'jump'
  | 'land';

/**
 * All sound is synthesized with the Web Audio API — no audio files.
 * Positional sounds are attenuated by distance and panned relative to the listener.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private listenerPos: Vec3 = { x: 0, y: 0, z: 0 };
  private listenerYaw = 0;
  private lastFootstep = 0;
  volume = 0.8;

  /** Must be called from a user gesture. */
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 6;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      // 2s of white noise
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(pos: Vec3, yaw: number) {
    this.listenerPos = pos;
    this.listenerYaw = yaw;
  }

  private get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Spatial gain/pan for a world position. */
  private spatial(pos: Vec3 | undefined, maxDist: number): { gain: number; pan: number } {
    if (!pos) return { gain: 1, pan: 0 };
    const dx = pos.x - this.listenerPos.x;
    const dy = pos.y - this.listenerPos.y;
    const dz = pos.z - this.listenerPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > maxDist) return { gain: 0, pan: 0 };
    const gain = 1 / (1 + (dist / 6) * (dist / 6)) * (1 - dist / maxDist) + 0.02;
    // right vector for yaw: (cos, 0, -sin)
    const rx = Math.cos(this.listenerYaw);
    const rz = -Math.sin(this.listenerYaw);
    const horiz = Math.sqrt(dx * dx + dz * dz);
    const pan = horiz > 0.5 ? clamp((dx * rx + dz * rz) / horiz, -1, 1) * 0.8 : 0;
    return { gain: clamp(gain, 0, 1), pan };
  }

  /** Create an output chain (gain -> panner -> master) and return the input node. */
  private out(gainValue: number, pan: number, t0: number, duration: number): GainNode | null {
    if (!this.ctx || !this.master) return null;
    const g = this.ctx.createGain();
    g.gain.value = gainValue;
    let last: AudioNode = g;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      last = p;
    }
    last.connect(this.master);
    // auto cleanup
    setTimeout(() => {
      try {
        last.disconnect();
        g.disconnect();
      } catch {
        /* ignore */
      }
    }, (t0 - this.now + duration) * 1000 + 200);
    return g;
  }

  private noise(dest: AudioNode, t0: number, dur: number, env: (g: GainNode) => void, filter?: (f: BiquadFilterNode) => void, playbackRate = 1) {
    if (!this.ctx || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = playbackRate;
    src.loop = true;
    const g = this.ctx.createGain();
    env(g);
    if (filter) {
      const f = this.ctx.createBiquadFilter();
      filter(f);
      src.connect(f);
      f.connect(g);
    } else src.connect(g);
    g.connect(dest);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  private tone(
    dest: AudioNode,
    t0: number,
    dur: number,
    type: OscillatorType,
    freq: (o: OscillatorNode) => void,
    env: (g: GainNode) => void,
  ) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    freq(o);
    const g = this.ctx.createGain();
    env(g);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private decay(g: GainNode, t0: number, peak: number, dur: number, attack = 0.002) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  // ---------------------------------------------------------------------------

  playGunshot(kind: WeaponSound, pos?: Vec3, isLocal = false) {
    if (!this.ctx) return;
    const t0 = this.now;
    const sp = this.spatial(isLocal ? undefined : pos, 120);
    if (sp.gain <= 0.001) return;
    const local = isLocal ? 1 : 0.9;
    switch (kind) {
      case 'ak': {
        const o = this.out(0.9 * sp.gain * local, sp.pan, t0, 0.4);
        if (!o) return;
        this.noise(o, t0, 0.3, (g) => this.decay(g, t0, 1, 0.3), (f) => {
          f.type = 'bandpass';
          f.frequency.value = 700;
          f.Q.value = 0.6;
        });
        this.noise(o, t0, 0.08, (g) => this.decay(g, t0, 0.7, 0.08), (f) => {
          f.type = 'highpass';
          f.frequency.value = 2500;
        });
        this.tone(o, t0, 0.18, 'sine', (osc) => {
          osc.frequency.setValueAtTime(140, t0);
          osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.18);
        }, (g) => this.decay(g, t0, 0.9, 0.18));
        break;
      }
      case 'm4': {
        const o = this.out(0.75 * sp.gain * local, sp.pan, t0, 0.3);
        if (!o) return;
        this.noise(o, t0, 0.16, (g) => this.decay(g, t0, 1, 0.16), (f) => {
          f.type = 'bandpass';
          f.frequency.value = 1400;
          f.Q.value = 0.8;
        });
        this.noise(o, t0, 0.05, (g) => this.decay(g, t0, 0.8, 0.05), (f) => {
          f.type = 'highpass';
          f.frequency.value = 4000;
        });
        this.tone(o, t0, 0.1, 'triangle', (osc) => {
          osc.frequency.setValueAtTime(220, t0);
          osc.frequency.exponentialRampToValueAtTime(70, t0 + 0.1);
        }, (g) => this.decay(g, t0, 0.6, 0.1));
        break;
      }
      case 'awp': {
        const o = this.out(1.0 * sp.gain * local, sp.pan, t0, 1.0);
        if (!o) return;
        this.noise(o, t0, 0.7, (g) => this.decay(g, t0, 1, 0.7), (f) => {
          f.type = 'lowpass';
          f.frequency.setValueAtTime(4000, t0);
          f.frequency.exponentialRampToValueAtTime(250, t0 + 0.6);
        });
        this.noise(o, t0, 0.12, (g) => this.decay(g, t0, 0.9, 0.12), (f) => {
          f.type = 'highpass';
          f.frequency.value = 1800;
        });
        this.tone(o, t0, 0.45, 'sine', (osc) => {
          osc.frequency.setValueAtTime(90, t0);
          osc.frequency.exponentialRampToValueAtTime(30, t0 + 0.45);
        }, (g) => this.decay(g, t0, 1.0, 0.45));
        // mechanical bolt click after the shot
        this.noise(o, t0 + 0.55, 0.04, (g) => this.decay(g, t0 + 0.55, 0.35, 0.04), (f) => {
          f.type = 'highpass';
          f.frequency.value = 3000;
        });
        break;
      }
      case 'glock': {
        const o = this.out(0.6 * sp.gain * local, sp.pan, t0, 0.2);
        if (!o) return;
        this.noise(o, t0, 0.1, (g) => this.decay(g, t0, 1, 0.1), (f) => {
          f.type = 'bandpass';
          f.frequency.value = 2200;
          f.Q.value = 1.0;
        });
        this.tone(o, t0, 0.07, 'square', (osc) => {
          osc.frequency.setValueAtTime(300, t0);
          osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.07);
        }, (g) => this.decay(g, t0, 0.35, 0.07));
        break;
      }
      case 'usp': {
        // suppressed: quieter, muffled
        const o = this.out(0.4 * sp.gain * local, sp.pan, t0, 0.2);
        if (!o) return;
        this.noise(o, t0, 0.12, (g) => this.decay(g, t0, 1, 0.12), (f) => {
          f.type = 'lowpass';
          f.frequency.value = 900;
        });
        this.tone(o, t0, 0.06, 'sine', (osc) => {
          osc.frequency.setValueAtTime(200, t0);
          osc.frequency.exponentialRampToValueAtTime(80, t0 + 0.06);
        }, (g) => this.decay(g, t0, 0.5, 0.06));
        break;
      }
      case 'deagle': {
        const o = this.out(0.9 * sp.gain * local, sp.pan, t0, 0.4);
        if (!o) return;
        this.noise(o, t0, 0.28, (g) => this.decay(g, t0, 1, 0.28), (f) => {
          f.type = 'bandpass';
          f.frequency.value = 900;
          f.Q.value = 0.5;
        });
        this.tone(o, t0, 0.2, 'sine', (osc) => {
          osc.frequency.setValueAtTime(160, t0);
          osc.frequency.exponentialRampToValueAtTime(40, t0 + 0.2);
        }, (g) => this.decay(g, t0, 0.9, 0.2));
        break;
      }
      case 'knife': {
        const o = this.out(0.35 * sp.gain, sp.pan, t0, 0.2);
        if (!o) return;
        this.noise(o, t0, 0.15, (g) => this.decay(g, t0, 1, 0.15, 0.03), (f) => {
          f.type = 'bandpass';
          f.frequency.setValueAtTime(500, t0);
          f.frequency.exponentialRampToValueAtTime(2500, t0 + 0.12);
          f.Q.value = 2;
        });
        break;
      }
    }
  }

  play(name: SfxName, pos?: Vec3) {
    if (!this.ctx) return;
    const t0 = this.now;
    const sp = this.spatial(pos, 60);
    if (sp.gain <= 0.001) return;
    switch (name) {
      case 'reload_start':
      case 'reload_end': {
        const o = this.out(0.35 * sp.gain, sp.pan, t0, 0.15);
        if (!o) return;
        this.noise(o, t0, 0.03, (g) => this.decay(g, t0, 1, 0.03), (f) => {
          f.type = 'highpass';
          f.frequency.value = 3000;
        });
        const f = name === 'reload_start' ? 900 : 1500;
        this.tone(o, t0 + 0.01, 0.06, 'square', (osc) => (osc.frequency.value = f), (g) => this.decay(g, t0 + 0.01, 0.15, 0.06));
        break;
      }
      case 'switch': {
        const o = this.out(0.25 * sp.gain, sp.pan, t0, 0.1);
        if (!o) return;
        this.noise(o, t0, 0.04, (g) => this.decay(g, t0, 1, 0.04), (f) => {
          f.type = 'highpass';
          f.frequency.value = 2000;
        });
        break;
      }
      case 'footstep': {
        if (t0 - this.lastFootstep < 0.05) return;
        this.lastFootstep = t0;
        const o = this.out(0.22 * sp.gain, sp.pan, t0, 0.1);
        if (!o) return;
        this.noise(o, t0, 0.07, (g) => this.decay(g, t0, 1, 0.07, 0.005), (f) => {
          f.type = 'lowpass';
          f.frequency.value = 400 + Math.random() * 200;
        }, 0.7 + Math.random() * 0.4);
        break;
      }
      case 'jump':
      case 'land': {
        const o = this.out((name === 'land' ? 0.3 : 0.15) * sp.gain, sp.pan, t0, 0.15);
        if (!o) return;
        this.noise(o, t0, 0.1, (g) => this.decay(g, t0, 1, 0.1, 0.005), (f) => {
          f.type = 'lowpass';
          f.frequency.value = 350;
        });
        break;
      }
      case 'scope': {
        const o = this.out(0.2, 0, t0, 0.15);
        if (!o) return;
        this.tone(o, t0, 0.12, 'sine', (osc) => {
          osc.frequency.setValueAtTime(700, t0);
          osc.frequency.exponentialRampToValueAtTime(1400, t0 + 0.1);
        }, (g) => this.decay(g, t0, 0.5, 0.12, 0.01));
        break;
      }
      case 'hit': {
        const o = this.out(0.3, 0, t0, 0.08);
        if (!o) return;
        this.tone(o, t0, 0.05, 'square', (osc) => (osc.frequency.value = 900), (g) => this.decay(g, t0, 0.6, 0.05));
        break;
      }
      case 'headshot': {
        const o = this.out(0.4, 0, t0, 0.2);
        if (!o) return;
        this.tone(o, t0, 0.12, 'triangle', (osc) => {
          osc.frequency.setValueAtTime(1900, t0);
          osc.frequency.exponentialRampToValueAtTime(1200, t0 + 0.1);
        }, (g) => this.decay(g, t0, 0.8, 0.12));
        this.noise(o, t0, 0.03, (g) => this.decay(g, t0, 0.6, 0.03), (f) => {
          f.type = 'highpass';
          f.frequency.value = 5000;
        });
        break;
      }
      case 'hurt': {
        const o = this.out(0.35, 0, t0, 0.2);
        if (!o) return;
        this.noise(o, t0, 0.12, (g) => this.decay(g, t0, 1, 0.12, 0.005), (f) => {
          f.type = 'lowpass';
          f.frequency.value = 600;
        });
        this.tone(o, t0, 0.15, 'sawtooth', (osc) => {
          osc.frequency.setValueAtTime(180, t0);
          osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.15);
        }, (g) => this.decay(g, t0, 0.25, 0.15));
        break;
      }
      case 'whiz': {
        const o = this.out(0.25, sp.pan, t0, 0.1);
        if (!o) return;
        this.tone(o, t0, 0.08, 'sine', (osc) => {
          osc.frequency.setValueAtTime(3200, t0);
          osc.frequency.exponentialRampToValueAtTime(600, t0 + 0.08);
        }, (g) => this.decay(g, t0, 0.5, 0.08));
        break;
      }
      case 'kill': {
        const o = this.out(0.35, 0, t0, 0.4);
        if (!o) return;
        this.tone(o, t0, 0.12, 'sine', (osc) => (osc.frequency.value = 880), (g) => this.decay(g, t0, 0.6, 0.12, 0.01));
        this.tone(o, t0 + 0.1, 0.25, 'sine', (osc) => (osc.frequency.value = 1320), (g) => this.decay(g, t0 + 0.1, 0.6, 0.25, 0.01));
        break;
      }
      case 'pickup':
      case 'buy': {
        const o = this.out(0.3, 0, t0, 0.2);
        if (!o) return;
        this.tone(o, t0, 0.08, 'square', (osc) => (osc.frequency.value = 600), (g) => this.decay(g, t0, 0.3, 0.08));
        this.tone(o, t0 + 0.07, 0.1, 'square', (osc) => (osc.frequency.value = 900), (g) => this.decay(g, t0 + 0.07, 0.3, 0.1));
        break;
      }
      case 'knife_hit': {
        const o = this.out(0.5 * sp.gain, sp.pan, t0, 0.2);
        if (!o) return;
        this.noise(o, t0, 0.12, (g) => this.decay(g, t0, 1, 0.12), (f) => {
          f.type = 'lowpass';
          f.frequency.value = 700;
        });
        break;
      }
      case 'c4_plant_start': {
        const o = this.out(0.45 * sp.gain, sp.pan, t0, 0.3);
        if (!o) return;
        for (let i = 0; i < 3; i++) {
          const t = t0 + i * 0.09;
          this.tone(o, t, 0.06, 'square', (osc) => (osc.frequency.value = 1400), (g) => this.decay(g, t, 0.35, 0.06));
        }
        break;
      }
      case 'c4_planted': {
        const o = this.out(0.5 * sp.gain, sp.pan, t0, 0.8);
        if (!o) return;
        this.tone(o, t0, 0.3, 'square', (osc) => (osc.frequency.value = 1000), (g) => this.decay(g, t0, 0.5, 0.3));
        this.tone(o, t0 + 0.35, 0.4, 'square', (osc) => (osc.frequency.value = 1500), (g) => this.decay(g, t0 + 0.35, 0.5, 0.4));
        break;
      }
      case 'c4_beep': {
        const o = this.out(0.4 * this.spatial(pos, 200).gain + 0.05, sp.pan, t0, 0.12);
        if (!o) return;
        this.tone(o, t0, 0.08, 'square', (osc) => (osc.frequency.value = 1700), (g) => this.decay(g, t0, 0.4, 0.08));
        break;
      }
      case 'c4_defuse': {
        const o = this.out(0.35 * sp.gain, sp.pan, t0, 0.25);
        if (!o) return;
        this.noise(o, t0, 0.2, (g) => this.decay(g, t0, 0.7, 0.2, 0.02), (f) => {
          f.type = 'bandpass';
          f.frequency.value = 3000;
          f.Q.value = 6;
        });
        this.tone(o, t0, 0.2, 'sawtooth', (osc) => (osc.frequency.value = 65), (g) => this.decay(g, t0, 0.15, 0.2, 0.02));
        break;
      }
      case 'c4_defused': {
        const o = this.out(0.5, 0, t0, 0.8);
        if (!o) return;
        const notes = [1200, 900, 700];
        notes.forEach((f, i) => {
          const t = t0 + i * 0.15;
          this.tone(o, t, 0.2, 'triangle', (osc) => (osc.frequency.value = f), (g) => this.decay(g, t, 0.5, 0.2, 0.01));
        });
        break;
      }
      case 'c4_explode': {
        const o = this.out(1.0 * (0.4 + this.spatial(pos, 300).gain), sp.pan, t0, 2.5);
        if (!o) return;
        this.noise(o, t0, 2.0, (g) => this.decay(g, t0, 1, 2.0, 0.01), (f) => {
          f.type = 'lowpass';
          f.frequency.setValueAtTime(3000, t0);
          f.frequency.exponentialRampToValueAtTime(80, t0 + 1.8);
        });
        this.tone(o, t0, 1.2, 'sine', (osc) => {
          osc.frequency.setValueAtTime(70, t0);
          osc.frequency.exponentialRampToValueAtTime(20, t0 + 1.2);
        }, (g) => this.decay(g, t0, 1.0, 1.2, 0.01));
        break;
      }
      case 'round_start': {
        const o = this.out(0.3, 0, t0, 0.6);
        if (!o) return;
        [523, 659, 784].forEach((f, i) => {
          const t = t0 + i * 0.12;
          this.tone(o, t, 0.25, 'triangle', (osc) => (osc.frequency.value = f), (g) => this.decay(g, t, 0.5, 0.25, 0.01));
        });
        break;
      }
      case 'round_win': {
        const o = this.out(0.35, 0, t0, 1.2);
        if (!o) return;
        [523, 659, 784, 1046].forEach((f, i) => {
          const t = t0 + i * 0.16;
          this.tone(o, t, 0.5, 'triangle', (osc) => (osc.frequency.value = f), (g) => this.decay(g, t, 0.5, 0.5, 0.01));
        });
        break;
      }
      case 'round_lose': {
        const o = this.out(0.35, 0, t0, 1.2);
        if (!o) return;
        [523, 466, 392].forEach((f, i) => {
          const t = t0 + i * 0.22;
          this.tone(o, t, 0.6, 'sawtooth', (osc) => (osc.frequency.value = f), (g) => this.decay(g, t, 0.25, 0.6, 0.02));
        });
        break;
      }
    }
  }
}
