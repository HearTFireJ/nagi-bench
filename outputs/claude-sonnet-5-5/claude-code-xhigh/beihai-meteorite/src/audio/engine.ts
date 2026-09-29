import {
  WebAudioCueBus,
  type CinematicPlayer,
  type SoundFactoryContext,
  type SoundHandle,
} from "@agentbench/cinematic-player";
import { SAMPLES } from "./samples";
import { clamp, mulberry32, seg, smooth } from "../util/math";

/**
 * Sound design. Recognisable real-world sounds (steps, doors, knocks, tools,
 * switches) are the supplied CC0 recordings. Web Audio synthesis supplies what a
 * sample library cannot: room tone, the concrete reverb of a basement, radio
 * static, a spacesuit's fan and breathing, and the suit-conducted (never airborne)
 * feel of everything that happens in vacuum.
 */

interface Kit {
  ac: AudioContext | null;
  bufs: Map<string, AudioBuffer>;
  white: AudioBuffer | null;
  pink: AudioBuffer | null;
  brown: AudioBuffer | null;
  irBasement: AudioBuffer | null;
  irShop: AudioBuffer | null;
  ready: boolean;
}

function dataUrlToBuffer(url: string): ArrayBuffer {
  const bin = atob(url.slice(url.indexOf(",") + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function makeNoise(ac: AudioContext, kind: "white" | "pink" | "brown", seconds = 6): AudioBuffer {
  const n = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  const rand = mulberry32(kind === "white" ? 11 : kind === "pink" ? 22 : 33);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    if (kind === "white") d[i] = w;
    else if (kind === "pink") {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  return buf;
}

/** Synthetic room response: dense early reflections, then an exponentially fading, darkening tail. */
function makeIR(ac: AudioContext, rt60: number, bright: number, early: number[]): AudioBuffer {
  const sr = ac.sampleRate;
  const n = Math.floor(sr * (rt60 + 0.3));
  const buf = ac.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const rand = mulberry32(90 + ch * 7);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const amp = Math.exp((-6.91 * t) / rt60);
      const a = Math.max(0.06, bright * Math.exp(-t * 1.6));
      y += a * ((rand() * 2 - 1) - y);
      d[i] = y * amp * 1.6;
    }
    for (const e of early) {
      const i = Math.floor((e + ch * 0.0031) * sr);
      if (i < n) d[i] += (ch ? -0.9 : 0.9) * (0.6 + rand() * 0.4);
    }
  }
  return buf;
}

class Rack {
  nodes: AudioScheduledSourceNode[] = [];
  add<T extends AudioScheduledSourceNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }
  handle(): SoundHandle {
    return {
      stop: () => {
        for (const n of this.nodes) {
          try { n.stop(); } catch { /* already stopped */ }
        }
      },
    };
  }
}

/** Names of every procedural sound registered on the bus (used by the offline checks). */
export const FACTORY_NAMES: string[] = [];

const total = (c: SoundFactoryContext): number => c.cue.end - c.cue.start;

/** Fade in / hold / fade out over the cue's own interval, honouring a resume offset. */
function fades(c: SoundFactoryContext, g: GainNode, peak: number, fin: number, fout: number): void {
  const ac = c.audioContext;
  const t0 = ac.currentTime;
  const remain = Math.max(0.05, total(c) - c.offset);
  const first = c.offset < fin ? peak * (c.offset / fin) : peak;
  g.gain.setValueAtTime(Math.max(0.0001, first), t0);
  if (c.offset < fin) g.gain.linearRampToValueAtTime(peak, t0 + (fin - c.offset));
  if (remain > fout) {
    g.gain.setValueAtTime(peak, t0 + remain - fout);
    g.gain.linearRampToValueAtTime(0.0001, t0 + remain);
  } else {
    g.gain.linearRampToValueAtTime(0.0001, t0 + remain);
  }
}

export function createSoundDesign<Ctx>(player: CinematicPlayer<Ctx>): WebAudioCueBus<Ctx> {
  const bus = new WebAudioCueBus(player);
  for (const [name, s] of Object.entries(SAMPLES)) bus.defineSample(name, s.url, s.opts);

  const kit: Kit = { ac: null, bufs: new Map(), white: null, pink: null, brown: null, irBasement: null, irShop: null, ready: false };

  // Decode our own copies of the samples (for processed variants) and build noise / room responses.
  const prime = async (ac: AudioContext): Promise<void> => {
    if (kit.ready && kit.ac === ac) return;
    kit.ac = ac;
    kit.white = makeNoise(ac, "white");
    kit.pink = makeNoise(ac, "pink");
    kit.brown = makeNoise(ac, "brown");
    kit.irBasement = makeIR(ac, 2.6, 0.7, [0.006, 0.011, 0.017, 0.023, 0.031, 0.044, 0.058, 0.071]);
    kit.irShop = makeIR(ac, 1.1, 0.6, [0.008, 0.019, 0.034, 0.05]);
    const wanted = ["crunch-a", "crunch-b", "safe-a", "safe-b", "metal-a", "thump-heavy", "step-concrete-0", "step-concrete-1", "step-concrete-2", "step-concrete-3", "boom-a", "boom-b", "click-b", "tool-click", "tool-a", "switch-b"];
    await Promise.all(wanted.map(async (name) => {
      const def = SAMPLES[name];
      if (!def || kit.bufs.has(name)) return;
      kit.bufs.set(name, await ac.decodeAudioData(dataUrlToBuffer(def.url)));
    }));
    kit.ready = true;
  };
  const originalUnlock = bus.unlock.bind(bus);
  bus.unlock = async () => {
    const ac = await originalUnlock();
    if (ac) {
      await prime(ac);
      bus.setGroupGain("music", 0.75);
      bus.setGroupGain("amb", 0.85);
    }
    return ac;
  };

  // ---- helpers bound to the kit ---------------------------------------------------
  const noise = (c: SoundFactoryContext, rack: Rack, kind: "white" | "pink" | "brown", dest: AudioNode): void => {
    const ac = c.audioContext;
    const s = rack.add(ac.createBufferSource());
    s.buffer = kit[kind];
    s.loop = true;
    s.connect(dest);
    s.start(0, (c.offset * 1.7) % 5);
  };
  const filt = (ac: AudioContext, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode => {
    const b = ac.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  };
  const gainNode = (ac: AudioContext, v: number): GainNode => {
    const g = ac.createGain();
    g.gain.value = v;
    return g;
  };
  const osc = (rack: Rack, ac: AudioContext, type: OscillatorType, f: number): OscillatorNode => {
    const o = rack.add(ac.createOscillator());
    o.type = type;
    o.frequency.value = f;
    return o;
  };
  const lfo = (rack: Rack, ac: AudioContext, rate: number, depth: number, target: AudioParam): void => {
    const o = osc(rack, ac, "sine", rate);
    const g = gainNode(ac, depth);
    o.connect(g).connect(target);
    o.start();
  };
  const burst = (c: SoundFactoryContext, rack: Rack, dest: AudioNode, at: number, dur: number, f: number, q: number, peak: number, type: BiquadFilterType = "bandpass", src: "white" | "pink" | "brown" = "white"): void => {
    const ac = c.audioContext;
    const s = rack.add(ac.createBufferSource());
    s.buffer = kit[src];
    s.loop = true;
    const b = filt(ac, type, f, q);
    const g = gainNode(ac, 0.0001);
    s.connect(b).connect(g).connect(dest);
    const t = ac.currentTime + at;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.start(t, Math.random() * 4);
    s.stop(t + dur + 0.05);
  };
  const tone = (c: SoundFactoryContext, rack: Rack, dest: AudioNode, at: number, dur: number, f0: number, f1: number, peak: number, type: OscillatorType = "sine"): void => {
    const ac = c.audioContext;
    const o = osc(rack, ac, type, f0);
    const g = gainNode(ac, 0.0001);
    o.connect(g).connect(dest);
    const t = ac.currentTime + at;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.008, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  const play = (c: SoundFactoryContext, rack: Rack, name: string, dest: AudioNode, at: number, rate: number, peak: number, hp = 0): void => {
    const buf = kit.bufs.get(name);
    if (!buf) return;
    const ac = c.audioContext;
    const s = rack.add(ac.createBufferSource());
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = gainNode(ac, peak);
    if (hp > 0) s.connect(filt(ac, "highpass", hp)).connect(g).connect(dest);
    else s.connect(g).connect(dest);
    s.start(ac.currentTime + at);
  };
  const reverb = (ac: AudioContext, ir: AudioBuffer | null, dest: AudioNode, wet: number): AudioNode => {
    const send = gainNode(ac, 1);
    if (!ir) { send.connect(dest); return send; }
    const conv = ac.createConvolver();
    conv.buffer = ir;
    const w = gainNode(ac, wet);
    send.connect(conv).connect(w).connect(dest);
    return send;
  };
  /** Schedule `fn(relativeTime)` for regularly spaced events inside the cue (skipping the past). */
  const repeat = (c: SoundFactoryContext, period: number, fn: (at: number, k: number) => void, first = 0): void => {
    const span = total(c);
    for (let k = 0, rel = first; rel < span - 0.01; k++, rel += period) {
      if (rel >= c.offset) fn(rel - c.offset, k);
    }
  };

  const F = (name: string, factory: (c: SoundFactoryContext) => SoundHandle | void): void => {
    if (!FACTORY_NAMES.includes(name)) FACTORY_NAMES.push(name);
    bus.define(name, (c) => {
      if (!kit.ready) return undefined;
      return factory(c);
    });
  };

  // ═════════════════════ ambience ═════════════════════════════════════════════
  F("amb-alley", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    fades(c, out, 0.5, 1.4, 1.4);
    const wind = gainNode(ac, 0.11);
    const bp = filt(ac, "bandpass", 500, 0.5);
    noise(c, rack, "pink", bp);
    bp.connect(wind).connect(out);
    lfo(rack, ac, 0.13, 220, bp.frequency);
    const city = gainNode(ac, 0.16);
    const lp = filt(ac, "lowpass", 240);
    noise(c, rack, "brown", lp);
    lp.connect(city).connect(out);
    repeat(c, 2.7, (at, k) => burst(c, rack, out, at, 0.7, 5200 + (k % 3) * 600, 1.2, 0.03, "bandpass"), 0.8);
    return rack.handle();
  });

  F("amb-room", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    fades(c, out, 0.55, 1.6, 1.6);
    const lp = filt(ac, "lowpass", 190);
    noise(c, rack, "brown", lp);
    lp.connect(gainNode(ac, 0.22)).connect(out);
    const hum = osc(rack, ac, "sine", 50);
    hum.connect(gainNode(ac, 0.018)).connect(out);
    hum.start();
    // a wall clock somewhere behind the cabinets
    repeat(c, 1.0, (at, k) => play(c, rack, "click-b", out, at, k % 2 ? 0.75 : 0.65, 0.05), 0.3);
    return rack.handle();
  });

  F("amb-room-night", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    fades(c, out, 0.5, 1.6, 2.4);
    const lp = filt(ac, "lowpass", 150);
    noise(c, rack, "brown", lp);
    lp.connect(gainNode(ac, 0.2)).connect(out);
    const hum = osc(rack, ac, "sine", 50);
    hum.connect(gainNode(ac, 0.02)).connect(out);
    hum.start();
    repeat(c, 1.0, (at, k) => play(c, rack, "click-b", out, at, k % 2 ? 0.75 : 0.65, 0.045), 0.6);
    return rack.handle();
  });

  F("radio-static", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    fades(c, out, 0.5, 0.35, 0.9);
    const bp = filt(ac, "bandpass", 1500, 0.6);
    const gate = gainNode(ac, 0.5);
    noise(c, rack, "white", bp);
    bp.connect(filt(ac, "highpass", 380)).connect(gate).connect(out);
    lfo(rack, ac, 7.3, 0.22, gate.gain);
    lfo(rack, ac, 0.9, 500, bp.frequency);
    // tuning whistle as the dial settles
    if (c.offset < 0.6) tone(c, rack, out, 0.0, 0.5, 2400, 1150, 0.05);
    repeat(c, 0.83, (at, k) => burst(c, rack, out, at, 0.05, 3000 + (k % 4) * 500, 2, 0.09, "highpass"), 0.4);
    return rack.handle();
  });

  F("amb-snow", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    fades(c, out, 0.55, 0.6, 0.7);
    const bp = filt(ac, "bandpass", 1300, 0.4);
    const gust = gainNode(ac, 0.25);
    noise(c, rack, "white", bp);
    bp.connect(filt(ac, "highpass", 500)).connect(gust).connect(out);
    lfo(rack, ac, 0.31, 0.15, gust.gain);
    lfo(rack, ac, 0.17, 500, bp.frequency);
    return rack.handle();
  });

  F("amb-shop", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    fades(c, out, 0.6, 0.6, 0.6);
    // mains hum of the fluorescent tubes, a ventilation wash, the coolant pump's murmur
    for (const [f, g] of [[100, 0.05], [200, 0.028], [300, 0.014]] as const) {
      const o = osc(rack, ac, "sawtooth", f);
      o.connect(filt(ac, "lowpass", 900)).connect(gainNode(ac, g)).connect(out);
      o.start();
    }
    const lp = filt(ac, "lowpass", 380);
    noise(c, rack, "pink", lp);
    lp.connect(gainNode(ac, 0.13)).connect(out);
    return rack.handle();
  });

  F("amb-basement", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    fades(c, out, 0.55, 1.0, 0.25);
    const lp = filt(ac, "lowpass", 130);
    noise(c, rack, "brown", lp);
    lp.connect(gainNode(ac, 0.3)).connect(out);
    const send = reverb(ac, kit.irBasement, out, 0.9);
    repeat(c, 3.4, (at) => tone(c, rack, send, at, 0.14, 1900, 900, 0.05), 1.1);
    // the bulb's buzz, once it is lit
    const bz = osc(rack, ac, "sawtooth", 100);
    bz.connect(filt(ac, "bandpass", 420, 4)).connect(gainNode(ac, 0.025)).connect(out);
    bz.start();
    return rack.handle();
  });

  F("amb-basement-muffled", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    fades(c, out, 0.4, 0.4, 3.0);
    const lp = filt(ac, "lowpass", 80);
    noise(c, rack, "brown", lp);
    lp.connect(gainNode(ac, 0.25)).connect(out);
    const ring = osc(rack, ac, "sine", 6400);
    const rg = gainNode(ac, 0.0001);
    ring.connect(rg).connect(c.output);
    const t0 = ac.currentTime;
    const rem = Math.max(0.5, total(c) - c.offset);
    rg.gain.setValueAtTime(0.05, t0);
    rg.gain.exponentialRampToValueAtTime(0.0002, t0 + rem);
    ring.start();
    return rack.handle();
  });

  F("amb-cabin", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    fades(c, out, 0.5, 0.8, 1.6);
    const bp = filt(ac, "bandpass", 340, 0.5);
    noise(c, rack, "pink", bp);
    bp.connect(gainNode(ac, 0.2)).connect(out);
    const hum = osc(rack, ac, "sine", 62);
    hum.connect(gainNode(ac, 0.03)).connect(out);
    hum.start();
    return rack.handle();
  });

  // ═════════════════════ the suit: what vacuum sounds like from inside ═══════════
  const breathPeriod = (t: number): number => {
    if (t < 262) return 4.6;
    if (t < 278) return 4.0 - 0.6 * seg(t, 262, 278);
    if (t < 285.6) return 3.2 - 0.4 * seg(t, 271, 285);
    if (t < 288.6) return 9;
    if (t < 302) return 1.9;
    return 3.2 + 1.6 * seg(t, 302, 316);
  };
  F("suit-loop", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    fades(c, out, 0.6, 2.6, 2.4);
    // ventilation fan
    for (const [f, g] of [[118, 0.05], [236, 0.02], [354, 0.008]] as const) {
      const o = osc(rack, ac, "sawtooth", f);
      o.connect(filt(ac, "lowpass", 600)).connect(gainNode(ac, g)).connect(out);
      o.start();
    }
    const air = filt(ac, "bandpass", 260, 0.5);
    noise(c, rack, "pink", air);
    air.connect(gainNode(ac, 0.05)).connect(out);
    // breathing: schedule every breath for the length of the cue
    let rel = 0;
    const abs0 = c.cue.start;
    for (let guard = 0; guard < 120 && rel < total(c); guard++) {
      const period = breathPeriod(abs0 + rel);
      if (rel >= c.offset - 2) {
        const at = rel - c.offset;
        if (at >= -0.1) {
          const held = abs0 + rel > 285.6 && abs0 + rel < 288.6;
          if (!held) {
            const p = clamp((period - 1.6) / 3.2, 0, 1);
            burst(c, rack, out, at, 0.35 + period * 0.16, 900 + 500 * (1 - p), 0.6, 0.22 + 0.05 * (1 - p), "bandpass", "pink");
            burst(c, rack, out, at + period * 0.42, 0.4 + period * 0.2, 620 + 360 * (1 - p), 0.6, 0.17, "bandpass", "pink");
          }
        }
      }
      rel += period;
    }
    return rack.handle();
  });

  F("heart-slow", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    fades(c, out, 0.55, 0.5, 0.6);
    const beat = (at: number, amp: number): void => {
      tone(c, rack, out, at, 0.16, 64, 34, 0.42 * amp);
      tone(c, rack, out, at + 0.19, 0.14, 58, 32, 0.3 * amp);
    };
    repeat(c, 1.05, (at) => beat(at, 1), 0.2);
    return rack.handle();
  });
  F("heart-fast", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    fades(c, out, 0.7, 0.4, 1.4);
    repeat(c, 0.66, (at, k) => {
      const amp = 1 - 0.25 * (k % 2);
      tone(c, rack, out, at, 0.15, 68, 34, 0.48 * amp);
      tone(c, rack, out, at + 0.15, 0.13, 60, 32, 0.34 * amp);
    }, 0.1);
    return rack.handle();
  });

  F("depress-hiss", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    const t0 = ac.currentTime;
    const rem = Math.max(0.3, total(c) - c.offset);
    out.gain.setValueAtTime(0.33, t0);
    out.gain.exponentialRampToValueAtTime(0.0008, t0 + rem);
    const hp = filt(ac, "highpass", 1200);
    noise(c, rack, "white", hp);
    const lp = filt(ac, "lowpass", 4000);
    hp.connect(lp).connect(out);
    lp.frequency.setValueAtTime(5200, t0);
    lp.frequency.exponentialRampToValueAtTime(400, t0 + rem);
    return rack.handle();
  });

  F("alarm-beeps", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.5);
    out.connect(filt(ac, "lowpass", 2600)).connect(c.output);
    repeat(c, 0.34, (at, k) => tone(c, rack, out, at, 0.16, k % 2 ? 760 : 980, k % 2 ? 760 : 980, 0.16, "square"));
    return rack.handle();
  });

  F("locator-tick", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.5);
    out.connect(c.output);
    repeat(c, 1.7, (at) => tone(c, rack, out, at, 0.07, 1250, 1250, 0.07), 0.2);
    return rack.handle();
  });

  // ═════════════════════ music (sparse, procedural) ════════════════════════════
  const pluck = (c: SoundFactoryContext, rack: Rack, dest: AudioNode, at: number, f: number, peak: number): void => {
    const ac = c.audioContext;
    for (const [mul, amp] of [[1, 1], [2.005, 0.35], [3.01, 0.12]] as const) {
      const o = osc(rack, ac, "triangle", f * mul);
      const g = gainNode(ac, 0.0001);
      o.connect(g).connect(dest);
      const t = ac.currentTime + at;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak * amp, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.start(t);
      o.stop(t + 1.9);
    }
  };
  const motif = (notes: Array<[number, number]>): ((c: SoundFactoryContext) => SoundHandle) => (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(filt(ac, "lowpass", 2400)).connect(c.output);
    fades(c, out, 1.0, 0.1, 1.2);
    for (const [rel, f] of notes) if (rel >= c.offset) pluck(c, rack, out, rel - c.offset, f, 0.11);
    return rack.handle();
  };
  const D4 = 293.66, E4 = 329.63, G4 = 392, A4 = 440, B4 = 493.88, D5 = 587.33, F4 = 349.23, C5 = 523.25;
  F("motif-warm-a", motif([[0.3, D4], [1.7, A4], [3.0, G4], [4.6, E4], [6.1, D4]]));
  F("motif-warm-b", motif([[0.2, G4], [1.5, D5], [2.9, B4], [4.4, A4]]));
  F("motif-minor", motif([[0.2, D4], [1.9, F4], [3.4, A4], [5.4, C5], [7.5, A4]]));

  const padVoices = (freqs: number[], peak: number, cutoff: number, fin = 5, fout = 4) => (c: SoundFactoryContext): SoundHandle => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    const lp = filt(ac, "lowpass", cutoff, 0.5);
    lp.connect(out).connect(c.output);
    fades(c, out, peak, fin, fout);
    lfo(rack, ac, 0.06, cutoff * 0.35, lp.frequency);
    for (const f of freqs) {
      for (const det of [-3, 2.5]) {
        const o = osc(rack, ac, "sawtooth", f);
        o.detune.value = det * 3;
        const g = gainNode(ac, 0.05);
        o.connect(g).connect(lp);
        o.start();
      }
    }
    return rack.handle();
  };
  F("pad-cold", padVoices([55, 82.4, 110, 164.8], 0.22, 500));
  F("pad-warm", padVoices([73.4, 110, 146.8, 220], 0.2, 700));
  F("drone-swell", padVoices([41.2, 61.7, 82.4], 0.26, 320, 7, 0.12));

  F("title-sting", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.9);
    out.connect(c.output);
    tone(c, rack, out, 0.55, 3.2, 62, 27, 0.6);
    burst(c, rack, out, 0.55, 1.4, 320, 0.5, 0.35, "lowpass", "brown");
    tone(c, rack, out, 0.8, 3.0, 880, 866, 0.03);
    return rack.handle();
  });

  // ═════════════════════ machines and hands ═════════════════════════════════
  F("cnc-spinup", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.5);
    out.connect(reverb(ac, kit.irShop, c.output, 0.25));
    out.connect(c.output);
    tone(c, rack, out, 0, total(c), 110, 1150, 0.1, "sawtooth");
    tone(c, rack, out, 0, total(c), 220, 2300, 0.05, "sawtooth");
    burst(c, rack, out, 0, total(c), 900, 0.5, 0.06, "highpass");
    return rack.handle();
  });
  F("cnc-grind", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    out.connect(reverb(ac, kit.irShop, c.output, 0.25));
    fades(c, out, 0.6, 0.25, 0.9);
    const o = osc(rack, ac, "sawtooth", 1150);
    const og = gainNode(ac, 0.05);
    o.connect(filt(ac, "lowpass", 3400)).connect(og).connect(out);
    o.start();
    lfo(rack, ac, 5.5, 60, o.frequency);
    const bp = filt(ac, "bandpass", 1900, 0.9);
    const grit = gainNode(ac, 0.3);
    noise(c, rack, "white", bp);
    bp.connect(grit).connect(out);
    lfo(rack, ac, 11, 0.12, grit.gain);
    lfo(rack, ac, 0.7, 600, bp.frequency);
    return rack.handle();
  });
  F("sparks", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.5);
    out.connect(c.output);
    repeat(c, 0.055, (at, k) => {
      if (((k * 7919) % 13) < 6) burst(c, rack, out, at, 0.03, 4500 + ((k * 331) % 2500), 2.5, 0.05 + ((k * 17) % 5) * 0.012, "highpass");
    });
    return rack.handle();
  });
  F("coolant", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    fades(c, out, 0.16, 0.4, 0.6);
    const hp = filt(ac, "highpass", 3200);
    noise(c, rack, "white", hp);
    hp.connect(out);
    return rack.handle();
  });
  F("seg-ticks", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.5);
    out.connect(c.output);
    const span = total(c);
    for (let k = 1; k <= 36; k++) {
      // invert smoothstep so each tick lands exactly as the on-screen counter advances
      let lo = 0, hi = 1;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (smooth(mid) * 36 < k - 0.02) lo = mid; else hi = mid;
      }
      const rel = lo * span;
      if (rel >= c.offset) tone(c, rack, out, rel - c.offset, 0.03, 2600, 2100, 0.07, "square");
    }
    return rack.handle();
  });
  F("brush", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.5);
    out.connect(c.output);
    repeat(c, 0.45, (at, k) => burst(c, rack, out, at, 0.34, 2400 + (k % 2) * 900, 0.8, 0.09, "bandpass"));
    return rack.handle();
  });
  F("pliers-run", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.6);
    out.connect(reverb(ac, kit.irBasement, c.output, 0.35));
    out.connect(c.output);
    repeat(c, 0.128, (at, k) => {
      play(c, rack, "tool-click", out, at, 1.5 + (k % 5) * 0.06, 0.34);
      burst(c, rack, out, at + 0.045, 0.03, 3200, 1.5, 0.03, "highpass");
    });
    return rack.handle();
  });
  F("case-run", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.6);
    out.connect(reverb(ac, kit.irBasement, c.output, 0.3));
    out.connect(c.output);
    repeat(c, 0.05, (at, k) => tone(c, rack, out, at, 0.03, 2500 + (k % 4) * 180, 2000, 0.06, "square"));
    return rack.handle();
  });
  F("glue-run", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.6);
    out.connect(reverb(ac, kit.irBasement, c.output, 0.3));
    out.connect(c.output);
    repeat(c, 0.13, (at, k) => {
      burst(c, rack, out, at, 0.06, 700, 1.2, 0.06, "lowpass");
      play(c, rack, "click-b", out, at + 0.07, 0.9 + (k % 3) * 0.05, 0.16);
    });
    return rack.handle();
  });

  // ═════════════════════ the gun ═══════════════════════════════════════════════
  F("gun-room", (c) => {
    // A pistol in a concrete cellar: crack, body, and a long dense tail.
    const ac = c.audioContext, rack = new Rack();
    const dry = gainNode(ac, 0.9);
    dry.connect(c.output);
    const wet = reverb(ac, kit.irBasement, c.output, 1.5);
    const bus2 = gainNode(ac, 1);
    bus2.connect(dry);
    bus2.connect(wet);
    burst(c, rack, bus2, 0, 0.05, 2400, 0.4, 0.95, "highpass");
    burst(c, rack, bus2, 0.0, 0.18, 900, 0.5, 0.55, "lowpass");
    play(c, rack, "crunch-b", bus2, 0, 1.7, 0.7, 120);
    play(c, rack, "safe-b", bus2, 0.004, 0.8, 0.8);
    play(c, rack, "thump-heavy", bus2, 0.0, 1.0, 0.5);
    tone(c, rack, bus2, 0, 0.32, 92, 30, 0.75);
    return rack.handle();
  });
  F("tinnitus", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    const t0 = ac.currentTime;
    const rem = Math.max(0.5, total(c) - c.offset);
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.linearRampToValueAtTime(0.09, t0 + Math.min(0.4, rem * 0.2));
    out.gain.exponentialRampToValueAtTime(0.0003, t0 + rem);
    for (const f of [6300, 4100, 8200]) {
      const o = osc(rack, ac, "sine", f);
      o.connect(gainNode(ac, f === 6300 ? 1 : 0.4)).connect(out);
      o.start();
    }
    return rack.handle();
  });
  F("gun-thump", (c) => {
    // Vacuum: no bang travels through space. What Zhang feels is the recoil through glove, arm and suit.
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.7);
    out.connect(c.output);
    tone(c, rack, out, 0, 0.22, 74, 36, 0.55);
    burst(c, rack, out, 0, 0.12, 190, 0.7, 0.3, "lowpass", "brown");
    play(c, rack, "click-b", out, 0, 0.55, 0.12);
    return rack.handle();
  });
  F("sub-boom", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.8);
    out.connect(c.output);
    tone(c, rack, out, 0, 1.6, 52, 24, 0.55);
    return rack.handle();
  });
  F("suit-burn", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    fades(c, out, 0.55, 0.5, 1.4);
    const lp = filt(ac, "lowpass", 260);
    noise(c, rack, "brown", lp);
    lp.connect(gainNode(ac, 0.5)).connect(out);
    const o = osc(rack, ac, "sine", 88);
    o.connect(gainNode(ac, 0.14)).connect(out);
    o.start();
    lfo(rack, ac, 7, 12, o.frequency);
    return rack.handle();
  });
  F("squelch-open", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.5);
    out.connect(filt(ac, "bandpass", 1900, 0.7)).connect(c.output);
    burst(c, rack, out, 0, 0.07, 2600, 0.8, 0.5, "highpass");
    tone(c, rack, out, 0.01, 0.05, 2200, 2200, 0.16);
    return rack.handle();
  });
  F("squelch-close", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.5);
    out.connect(filt(ac, "bandpass", 1700, 0.7)).connect(c.output);
    burst(c, rack, out, 0, 0.09, 2000, 0.8, 0.4, "highpass");
    tone(c, rack, out, 0.02, 0.04, 1700, 1700, 0.12);
    return rack.handle();
  });
  F("chime-pay", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.5);
    out.connect(c.output);
    tone(c, rack, out, 0, 0.9, 1318.5, 1318.5, 0.16);
    tone(c, rack, out, 0.14, 1.0, 1760, 1760, 0.14);
    tone(c, rack, out, 0.14, 1.0, 3520, 3520, 0.03);
    return rack.handle();
  });
  F("pour", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.0001);
    out.connect(c.output);
    fades(c, out, 0.16, 0.25, 0.5);
    const bp = filt(ac, "bandpass", 1300, 3);
    noise(c, rack, "white", bp);
    bp.connect(out);
    lfo(rack, ac, 5.2, 260, bp.frequency);
    lfo(rack, ac, 1.3, 400, bp.frequency);
    return rack.handle();
  });
  F("cloth", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.5);
    out.connect(c.output);
    burst(c, rack, out, 0, 0.32, 1500, 0.5, 0.11, "bandpass", "pink");
    burst(c, rack, out, 0.12, 0.25, 900, 0.5, 0.07, "bandpass", "pink");
    return rack.handle();
  });
  F("zap", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.5);
    out.connect(reverb(ac, kit.irShop, c.output, 0.4));
    out.connect(c.output);
    repeat(c, 0.11, (at, k) => {
      if ((k * 7) % 5 < 3) burst(c, rack, out, at, 0.04, 6000, 1, 0.16, "highpass");
      if (k % 3 === 0) tone(c, rack, out, at, 0.06, 100, 100, 0.06, "sawtooth");
    });
    return rack.handle();
  });
  F("step-basement", (c) => {
    // a boot on concrete stairs, thrown into a reverberant cellar
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.9);
    out.connect(c.output);
    const wet = reverb(ac, kit.irBasement, c.output, 0.9);
    const g = gainNode(ac, 1);
    g.connect(out);
    g.connect(wet);
    play(c, rack, `step-concrete-${(Math.floor(c.cue.start * 10) % 4)}`, g, 0, 0.9, 0.9);
    return rack.handle();
  });
  F("bulb-click", (c) => {
    const ac = c.audioContext, rack = new Rack();
    const out = gainNode(ac, 0.5);
    out.connect(reverb(ac, kit.irBasement, c.output, 0.4));
    out.connect(c.output);
    play(c, rack, "switch-b", out, 0, 0.8, 0.8);
    tone(c, rack, out, 0.02, 0.12, 180, 60, 0.1);
    return rack.handle();
  });

  return bus;
}
