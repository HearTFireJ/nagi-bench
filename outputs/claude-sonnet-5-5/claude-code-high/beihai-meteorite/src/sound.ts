import type { SampleSoundOptions, SoundFactoryContext, WebAudioCueBus } from "@agentbench/cinematic-player";
import { rng } from "./blocks";
export { soundCues } from "./soundcues";

/* ------------------------------------------------------------------ samples */

let files: Record<string, string> = {};
const url = (name: string): string => {
  const u = files[`./assets/audio/${name}.ogg`];
  if (!u) throw new Error(`missing sample ${name}`);
  return u;
};

/** alias → [file, options]. Every recognisable effect comes from a recorded sample. */
const SAMPLES: Record<string, [string, SampleSoundOptions?]> = {
  "step-c0": ["footstep_concrete_000"],
  "step-c1": ["footstep_concrete_001"],
  "step-c2": ["footstep_concrete_002"],
  "step-c3": ["footstep_concrete_003"],
  "step-c4": ["footstep_concrete_004"],
  "step-w0": ["footstep_wood_000"],
  "step-w1": ["footstep_wood_001"],
  "step-w2": ["footstep_wood_002"],
  "step-w3": ["footstep_wood_003"],
  "step-w4": ["footstep_wood_004"],
  "wood-m": ["impactWood_medium_000"],
  "wood-h": ["impactWood_heavy_000"],
  "wood-l": ["impactWood_light_001"],
  "glass-l": ["impactGlass_light_000"],
  "glass-l2": ["impactGlass_light_002", { playbackRate: 1.2 }],
  "glass-m": ["impactGlass_medium_000", { playbackRate: 0.9 }],
  "metal-l0": ["impactMetal_light_000"],
  "metal-l1": ["impactMetal_light_001"],
  "metal-l2": ["impactMetal_light_002"],
  "metal-l3": ["impactMetal_light_004"],
  "metal-m0": ["impactMetal_medium_000"],
  "metal-m1": ["impactMetal_medium_003"],
  "metal-h0": ["impactMetal_heavy_001"],
  "metal-h1": ["impactMetal_heavy_002", { playbackRate: 0.85 }],
  "plate-l": ["impactPlate_light_000"],
  "plate-h": ["impactPlate_heavy_000"],
  "soft-m0": ["impactSoft_medium_000"],
  "soft-m1": ["impactSoft_medium_001"],
  "soft-h": ["impactSoft_heavy_000"],
  tin: ["impactTin_medium_000"],
  mining: ["impactMining_001"],
  "door-o": ["doorOpen_000"],
  "door-o2": ["doorOpen_002", { playbackRate: 0.85 }],
  "door-slow": ["doorOpen_001", { playbackRate: 0.7 }],
  "door-c": ["doorClose_001"],
  "cnc-spin": ["engineCircular_001", { loop: true, playbackRate: 1.5 }],
  "cnc-saw": ["spaceEngineSmall_001", { loop: true, playbackRate: 2.0 }],
  "comp-loop": ["computerNoise_000", { loop: true }],
  slime: ["slime_000"],
  field: ["forceField_000", { playbackRate: 0.8 }],
  "click-a": ["click2"],
  "click-b": ["click3"],
  "click-c": ["click5"],
  "switch-a": ["switch1"],
  "switch-b": ["switch12"],
  "switch-c": ["switch10"],
  "switch-d": ["switch13"],
  roll: ["rollover4"],
  roll6: ["rollover6"],
  "bell-low": ["impactBell_heavy_001", { playbackRate: 0.5 }],
  "bell-mid": ["impactBell_heavy_001", { playbackRate: 0.75 }],
  shard: ["impactMetal_light_004", { playbackRate: 1.9 }],
  "sub-thud": ["lowFrequency_explosion_001", { playbackRate: 0.7 }],
};

/** Raw buffers for the effects that are shaped further (reverb, conduction through a suit). */
const RAW: Record<string, string> = {
  punch: "impactPunch_heavy_000",
  lowboom: "lowFrequency_explosion_001",
  crunch: "explosionCrunch_001",
  ml: "impactMetal_light_000",
  mm: "impactMetal_medium_000",
  mh: "impactMetal_heavy_001",
  sw: "switch10",
  clk: "click2",
  thr: "thrusterFire_002",
};
const buffers = new Map<string, AudioBuffer>();

/* ----------------------------------------------------------------- audio graph */

const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();
function noise(ac: AudioContext): AudioBuffer {
  let b = noiseBuffers.get(ac);
  if (!b) {
    b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = b.getChannelData(0);
    const r = rng(99);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    noiseBuffers.set(ac, b);
  }
  return b;
}

const irCache = new WeakMap<AudioContext, AudioBuffer>();
/** A hard-walled little cellar: dense early reflections and a long, dark tail. */
function cellarIR(ac: AudioContext): AudioBuffer {
  let b = irCache.get(ac);
  if (!b) {
    const len = Math.floor(ac.sampleRate * 2.6);
    b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      const r = rng(31 + c * 17);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / ac.sampleRate;
        const env = Math.exp(-t / 0.62);
        const x = (r() * 2 - 1) * env;
        lp += (x - lp) * (t < 0.08 ? 0.9 : 0.35);
        d[i] = lp * (t < 0.02 ? 0.5 : 1);
      }
      for (const [tt, g] of [[0.011, 0.9], [0.019, 0.7], [0.031, 0.6], [0.047, 0.45]] as const) d[Math.floor(tt * ac.sampleRate + c * 13)] += g;
    }
    irCache.set(ac, b);
  }
  return b;
}

type Handle = { stop: () => void } | void;

function envelope(ac: AudioContext, g: GainNode, ctx: SoundFactoryContext, fi: number, fo: number, level = 1): void {
  const total = ctx.cue.end - ctx.cue.start;
  const offset = ctx.offset;
  const now = ac.currentTime;
  const remain = Math.max(0.05, total - offset);
  const fiEnd = Math.max(0, Math.min(remain, fi - offset));
  const start = fi > 0 ? Math.min(1, offset / fi) * level : level;
  g.gain.setValueAtTime(Math.max(0.0001, start), now);
  if (fiEnd > 0) g.gain.linearRampToValueAtTime(level, now + fiEnd);
  const foStart = Math.max(fiEnd, remain - fo);
  g.gain.setValueAtTime(level, now + foStart);
  g.gain.linearRampToValueAtTime(0.0001, now + remain);
}

function stopper(nodes: AudioScheduledSourceNode[]): { stop: () => void } {
  return {
    stop: () => {
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      }
    },
  };
}

function loopNoise(ac: AudioContext): AudioBufferSourceNode {
  const s = ac.createBufferSource();
  s.buffer = noise(ac);
  s.loop = true;
  return s;
}

function playBuffer(ac: AudioContext, name: string, dest: AudioNode, opts: { rate?: number; gain?: number; when?: number; lp?: number; hp?: number; offset?: number; loop?: boolean } = {}): AudioBufferSourceNode | undefined {
  const buf = buffers.get(name);
  if (!buf) return undefined;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = opts.rate ?? 1;
  src.loop = opts.loop ?? false;
  const g = ac.createGain();
  g.gain.value = opts.gain ?? 1;
  let node: AudioNode = src;
  if (opts.lp) {
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = opts.lp;
    f.Q.value = 0.7;
    node.connect(f);
    node = f;
  }
  if (opts.hp) {
    const f = ac.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = opts.hp;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(dest);
  const off = opts.offset ?? 0;
  src.start(ac.currentTime + (opts.when ?? 0), buf.duration > 0 ? off % buf.duration : 0);
  return src;
}

function tone(ac: AudioContext, dest: AudioNode, type: OscillatorType, f0: number, f1: number, when: number, dur: number, gain: number): OscillatorNode {
  const o = ac.createOscillator();
  o.type = type;
  const g = ac.createGain();
  const t0 = ac.currentTime + when;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.012, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
  return o;
}

function noiseBurst(ac: AudioContext, dest: AudioNode, when: number, dur: number, gain: number, type: BiquadFilterType, freq: number, q = 0.8): void {
  const s = ac.createBufferSource();
  s.buffer = noise(ac);
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  const t0 = ac.currentTime + when;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t0, Math.random() * 1.5);
  s.stop(t0 + dur + 0.05);
}

const PADS: Record<string, { notes: number[]; cutoff: number; wave: OscillatorType; fi: number; fo: number; level: number }> = {
  "pad:void": { notes: [73.4, 110, 146.8, 220, 293.7], cutoff: 900, wave: "sawtooth", fi: 3.5, fo: 3, level: 0.05 },
  "pad:low": { notes: [55, 82.4, 110], cutoff: 500, wave: "sawtooth", fi: 3, fo: 1.5, level: 0.054 },
  "pad:sunset": { notes: [98, 146.8, 196, 293.7, 392, 493.9], cutoff: 1800, wave: "sawtooth", fi: 3.5, fo: 3, level: 0.047 },
  "pad:tense": { notes: [55, 58.3, 110, 116.5, 164.8, 233], cutoff: 760, wave: "sawtooth", fi: 4, fo: 0.5, level: 0.054 },
  "pad:resolve": { notes: [73.4, 110, 146.8, 185, 220, 293.7], cutoff: 1300, wave: "triangle", fi: 5, fo: 3, level: 0.09 },
  "pad:cabin": { notes: [65.4, 523.3, 784, 1046.5], cutoff: 3000, wave: "sine", fi: 2, fo: 2, level: 0.054 },
  "drone:dark": { notes: [41.2, 61.7, 82.4, 123.5], cutoff: 420, wave: "sawtooth", fi: 4, fo: 1.5, level: 0.09 },
  "drone:mech": { notes: [49, 73.4, 98], cutoff: 520, wave: "sawtooth", fi: 3, fo: 1.5, level: 0.072 },
};

function pluckNote(ac: AudioContext, dest: AudioNode, f: number, when: number, gain: number, decay = 3): void {
  const t0 = ac.currentTime + when;
  const g = ac.createGain();
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(3400, t0);
  lp.frequency.exponentialRampToValueAtTime(700, t0 + decay * 0.6);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
  lp.connect(g).connect(dest);
  for (const [mult, type, a] of [[1, "triangle", 1], [2, "sine", 0.35], [3.01, "sine", 0.12]] as const) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = f * mult;
    const og = ac.createGain();
    og.gain.value = a;
    o.connect(og).connect(lp);
    o.start(t0);
    o.stop(t0 + decay + 0.1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function installAudio(audio: WebAudioCueBus<any>, audioFiles: Record<string, string>): void {
  files = audioFiles;
  for (const [alias, [file, opts]] of Object.entries(SAMPLES)) audio.defineSample(alias, url(file), opts);
  audio.setGroupGain("amb", 0.9);

  // decode the raw buffers once the audio context exists (the first Play click)
  const unlock = audio.unlock.bind(audio);
  audio.unlock = async () => {
    const ac = await unlock();
    if (ac && buffers.size === 0) {
      await Promise.all(
        Object.entries(RAW).map(async ([name, file]) => {
          const bin = atob(url(file).split(",")[1]!);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          buffers.set(name, await ac.decodeAudioData(bytes.buffer));
        }),
      );
    }
    return ac;
  };

  /* ---- beds */
  audio.define("suit-air", (c): Handle => {
    const ac = c.audioContext;
    const g = ac.createGain();
    envelope(ac, g, c, 1.5, 1.2);
    g.connect(c.output);
    const src = loopNoise(ac);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1300;
    bp.Q.value = 0.55;
    const breath = ac.createGain();
    breath.gain.value = 0.02;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 1 / 4.4;
    const depth = ac.createGain();
    depth.gain.value = 0.022;
    lfo.connect(depth).connect(breath.gain);
    src.connect(bp).connect(breath).connect(g);
    const fan = ac.createOscillator();
    fan.frequency.value = 122;
    const fan2 = ac.createOscillator();
    fan2.frequency.value = 244.7;
    const fg = ac.createGain();
    fg.gain.value = 0.006;
    fan.connect(fg);
    fan2.connect(fg);
    fg.connect(g);
    src.start(0, (c.offset * 0.37) % 1.5);
    lfo.start();
    fan.start();
    fan2.start();
    return stopper([src, lfo, fan, fan2]);
  });

  audio.define("radio-hiss", (c): Handle => {
    const ac = c.audioContext;
    const g = ac.createGain();
    envelope(ac, g, c, 1.5, 1.0, 0.014);
    g.connect(c.output);
    const src = loopNoise(ac);
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3800;
    const mod = ac.createGain();
    mod.gain.value = 0.5;
    const lfo = ac.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 0.7;
    const ld = ac.createGain();
    ld.gain.value = 0.4;
    lfo.connect(ld).connect(mod.gain);
    src.connect(hp).connect(mod).connect(g);
    src.start();
    lfo.start();
    return stopper([src, lfo]);
  });

  for (const [name, p] of Object.entries(PADS)) {
    audio.define(name, (c): Handle => {
      const ac = c.audioContext;
      const g = ac.createGain();
      envelope(ac, g, c, p.fi, p.fo, p.level);
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = p.cutoff;
      lp.Q.value = 0.9;
      const sweep = ac.createOscillator();
      sweep.frequency.value = 0.07;
      const sd = ac.createGain();
      sd.gain.value = p.cutoff * 0.35;
      sweep.connect(sd).connect(lp.frequency);
      lp.connect(g).connect(c.output);
      const nodes: AudioScheduledSourceNode[] = [sweep];
      p.notes.forEach((f, i) => {
        for (const det of [-6, 5]) {
          const o = ac.createOscillator();
          o.type = p.wave;
          o.frequency.value = f;
          o.detune.value = det + i * 1.3;
          const og = ac.createGain();
          og.gain.value = 1 / p.notes.length;
          o.connect(og).connect(lp);
          o.start();
          nodes.push(o);
        }
      });
      sweep.start();
      return stopper(nodes);
    });
  }

  audio.define("pluck:warm", (c): Handle => {
    const ac = c.audioContext;
    const total = c.cue.end - c.cue.start;
    const out = ac.createGain();
    out.gain.value = 1;
    envelope(ac, out, c, 3, 5, 1);
    out.connect(c.output);
    const scale = [293.66, 329.63, 369.99, 440, 493.88, 587.33];
    const r = rng(2718);
    let t = 0.6;
    let n = 0;
    while (t < total) {
      const idx = Math.floor(r() * scale.length);
      if (t >= c.offset) {
        const when = t - c.offset;
        if (n % 4 === 0) pluckNote(ac, out, 146.83, when, 0.1, 5);
        pluckNote(ac, out, scale[idx]!, when + 0.02, 0.06 + r() * 0.02, 3.4);
      }
      n++;
      t += 1.7 + (n % 3 === 0 ? 0.8 : 0) + r() * 0.5;
    }
    return { stop: () => out.disconnect() };
  });

  audio.define("arp:cold", (c): Handle => {
    const ac = c.audioContext;
    const total = c.cue.end - c.cue.start;
    const out = ac.createGain();
    envelope(ac, out, c, 2, 3, 1);
    out.connect(c.output);
    const notes = [293.66, 440, 587.33, 659.25, 880];
    const r = rng(77);
    for (let t = 0.5; t < total; t += 2.2 + r() * 0.9) {
      if (t < c.offset) continue;
      pluckNote(ac, out, notes[Math.floor(r() * notes.length)]!, t - c.offset, 0.045, 4.2);
    }
    return { stop: () => out.disconnect() };
  });

  for (const [name, [b0, b1, lvl]] of Object.entries({ "heart:build": [62, 98, 1], "heart:calm": [60, 52, 0.9], "heart:slow": [56, 58, 0.8] })) {
    audio.define(name, (c): Handle => {
      const ac = c.audioContext;
      const total = c.cue.end - c.cue.start;
      const out = ac.createGain();
      envelope(ac, out, c, 1.5, 1.5, lvl * 0.5);
      out.connect(c.output);
      let t = 0.2;
      while (t < total) {
        const bpm = b0 + (b1 - b0) * (t / total);
        if (t >= c.offset) {
          const w = t - c.offset;
          tone(ac, out, "sine", 68, 38, w, 0.13, 1);
          tone(ac, out, "sine", 60, 36, w + 0.27, 0.12, 0.7);
        }
        t += 60 / bpm;
      }
      return { stop: () => out.disconnect() };
    });
  }

  audio.define("pulse:mech", (c): Handle => {
    const ac = c.audioContext;
    const total = c.cue.end - c.cue.start;
    const out = ac.createGain();
    envelope(ac, out, c, 2, 1.5, 0.5);
    out.connect(c.output);
    for (let t = 0; t < total; t += 0.5) {
      if (t < c.offset) continue;
      const accent = Math.round(t / 0.5) % 4 === 0;
      tone(ac, out, "sine", accent ? 62 : 52, 34, t - c.offset, 0.12, accent ? 0.9 : 0.5);
    }
    return { stop: () => out.disconnect() };
  });

  audio.define("tick:train", (c): Handle => {
    const ac = c.audioContext;
    const total = c.cue.end - c.cue.start;
    const out = ac.createGain();
    out.gain.value = 0.7;
    out.connect(c.output);
    for (let t = 0; t < total; t += 0.5) {
      if (t < c.offset) continue;
      noiseBurst(ac, out, t - c.offset, 0.02, 0.2, "bandpass", 2600, 4);
    }
    return { stop: () => out.disconnect() };
  });

  audio.define("drip", (c): Handle => {
    const ac = c.audioContext;
    const total = c.cue.end - c.cue.start;
    const out = ac.createGain();
    out.gain.value = 0.06;
    envelope(ac, out, c, 1, 1, 0.06);
    out.connect(c.output);
    const r = rng(404);
    let t = 1.3;
    while (t < total) {
      if (t >= c.offset) {
        tone(ac, out, "sine", 2100, 1300, t - c.offset, 0.07, 1);
        tone(ac, out, "sine", 2100, 1300, t - c.offset + 0.13, 0.07, 0.3);
      }
      t += 2 + r() * 4.5;
    }
    return { stop: () => out.disconnect() };
  });

  const humKinds: Record<string, (ac: AudioContext, out: GainNode) => AudioScheduledSourceNode[]> = {
    "hum:room": (ac, out) => {
      const s = loopNoise(ac);
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 220;
      const g = ac.createGain();
      g.gain.value = 0.22;
      s.connect(lp).connect(g).connect(out);
      s.start();
      return [s];
    },
    "hum:room-b": (ac, out) => {
      const s = loopNoise(ac);
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 160;
      const g = ac.createGain();
      g.gain.value = 0.28;
      s.connect(lp).connect(g).connect(out);
      const o = ac.createOscillator();
      o.frequency.value = 50;
      const og = ac.createGain();
      og.gain.value = 0.012;
      o.connect(og).connect(out);
      s.start();
      o.start();
      return [s, o];
    },
    "hum:cabin": (ac, out) => {
      const s = loopNoise(ac);
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 420;
      const g = ac.createGain();
      g.gain.value = 0.16;
      s.connect(lp).connect(g).connect(out);
      const o = ac.createOscillator();
      o.frequency.value = 118;
      const og = ac.createGain();
      og.gain.value = 0.01;
      o.connect(og).connect(out);
      s.start();
      o.start();
      return [s, o];
    },
    "hum:city": (ac, out) => {
      const s = loopNoise(ac);
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 260;
      const g = ac.createGain();
      g.gain.value = 0.16;
      const lfo = ac.createOscillator();
      lfo.frequency.value = 0.08;
      const ld = ac.createGain();
      ld.gain.value = 0.06;
      lfo.connect(ld).connect(g.gain);
      s.connect(lp).connect(g).connect(out);
      s.start();
      lfo.start();
      return [s, lfo];
    },
    "hum:fluor": (ac, out) => {
      const a = ac.createOscillator();
      a.type = "sawtooth";
      a.frequency.value = 100.1;
      const b = ac.createOscillator();
      b.type = "sawtooth";
      b.frequency.value = 200.4;
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 260;
      bp.Q.value = 2.5;
      const g = ac.createGain();
      g.gain.value = 0.06;
      a.connect(bp);
      b.connect(bp);
      bp.connect(g).connect(out);
      const s = loopNoise(ac);
      const hp = ac.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 5200;
      const ng = ac.createGain();
      ng.gain.value = 0.006;
      s.connect(hp).connect(ng).connect(out);
      a.start();
      b.start();
      s.start();
      return [a, b, s];
    },
    wind: (ac, out) => {
      const s = loopNoise(ac);
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 460;
      bp.Q.value = 0.9;
      const fl = ac.createOscillator();
      fl.frequency.value = 0.11;
      const fd = ac.createGain();
      fd.gain.value = 170;
      fl.connect(fd).connect(bp.frequency);
      const g = ac.createGain();
      g.gain.value = 0.2;
      const gl = ac.createOscillator();
      gl.frequency.value = 0.17;
      const gd = ac.createGain();
      gd.gain.value = 0.09;
      gl.connect(gd).connect(g.gain);
      s.connect(bp).connect(g).connect(out);
      s.start();
      fl.start();
      gl.start();
      return [s, fl, gl];
    },
  };
  for (const [name, build] of Object.entries(humKinds)) {
    audio.define(name, (c): Handle => {
      const ac = c.audioContext;
      const g = ac.createGain();
      envelope(ac, g, c, 1.5, 1.2, 1);
      g.connect(c.output);
      return stopper(build(ac, g));
    });
  }

  audio.define("clock", (c): Handle => {
    const ac = c.audioContext;
    const total = c.cue.end - c.cue.start;
    const out = ac.createGain();
    out.gain.value = 0.9;
    out.connect(c.output);
    for (let k = 0; k < total; k++) {
      if (k < c.offset) continue;
      noiseBurst(ac, out, k - c.offset, 0.03, k % 2 ? 0.05 : 0.07, "bandpass", k % 2 ? 1800 : 2500, 5);
    }
    return { stop: () => out.disconnect() };
  });

  audio.define("cutting-noise", (c): Handle => {
    const ac = c.audioContext;
    const g = ac.createGain();
    envelope(ac, g, c, 0.4, 0.4, 0.09);
    g.connect(c.output);
    const s = loopNoise(ac);
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2300;
    const am = ac.createGain();
    am.gain.value = 0.7;
    const lfo = ac.createOscillator();
    lfo.type = "sawtooth";
    lfo.frequency.value = 31;
    const ld = ac.createGain();
    ld.gain.value = 0.3;
    lfo.connect(ld).connect(am.gain);
    s.connect(hp).connect(am).connect(g);
    s.start();
    lfo.start();
    return stopper([s, lfo]);
  });

  audio.define("swell:tense", (c): Handle => {
    const ac = c.audioContext;
    const total = c.cue.end - c.cue.start;
    const g = ac.createGain();
    envelope(ac, g, c, 2, 2.4, 0.035);
    g.connect(c.output);
    const nodes: AudioScheduledSourceNode[] = [];
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    lp.connect(g);
    for (const f of [55, 58.3, 82.4, 87.3, 130.8, 138.6, 233, 246.9]) {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, ac.currentTime);
      o.frequency.linearRampToValueAtTime(f * 1.06, ac.currentTime + Math.max(0.1, total - c.offset));
      const og = ac.createGain();
      og.gain.value = 0.12;
      const trem = ac.createOscillator();
      trem.frequency.value = 5.3 + f * 0.003;
      const td = ac.createGain();
      td.gain.value = 0.08;
      trem.connect(td).connect(og.gain);
      o.connect(og).connect(lp);
      o.start();
      trem.start();
      nodes.push(o, trem);
    }
    return stopper(nodes);
  });

  audio.define("tone:void", (c): Handle => {
    const ac = c.audioContext;
    const g = ac.createGain();
    envelope(ac, g, c, 0.35, 0.5, 0.05);
    g.connect(c.output);
    const o = ac.createOscillator();
    o.frequency.value = 2240;
    const o2 = ac.createOscillator();
    o2.frequency.value = 44;
    const og = ac.createGain();
    og.gain.value = 0.7;
    o2.connect(og).connect(g);
    const trem = ac.createOscillator();
    trem.frequency.value = 3.2;
    const td = ac.createGain();
    td.gain.value = 0.25;
    const m = ac.createGain();
    m.gain.value = 0.6;
    trem.connect(td).connect(m.gain);
    o.connect(m).connect(g);
    o.start();
    o2.start();
    trem.start();
    return stopper([o, o2, trem]);
  });

  /* ---- one-shots */
  audio.define("creak", (c): Handle => {
    const ac = c.audioContext;
    const g = ac.createGain();
    g.gain.value = 0.12;
    g.connect(c.output);
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(82, ac.currentTime);
    o.frequency.linearRampToValueAtTime(148, ac.currentTime + 0.9);
    o.frequency.linearRampToValueAtTime(96, ac.currentTime + 1.5);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 420;
    bp.Q.value = 7;
    const vib = ac.createOscillator();
    vib.frequency.value = 23;
    const vd = ac.createGain();
    vd.gain.value = 9;
    vib.connect(vd).connect(o.frequency);
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, ac.currentTime);
    env.gain.linearRampToValueAtTime(1, ac.currentTime + 0.25);
    env.gain.linearRampToValueAtTime(0.0001, ac.currentTime + 1.5);
    o.connect(bp).connect(env).connect(g);
    o.start();
    vib.start();
    o.stop(ac.currentTime + 1.6);
    vib.stop(ac.currentTime + 1.6);
    return stopper([o, vib]);
  });

  audio.define("ding", (c): Handle => {
    const ac = c.audioContext;
    tone(ac, c.output, "sine", 1318.5, 1318.5, 0, 1.4, 0.22);
    tone(ac, c.output, "sine", 2637, 2637, 0, 0.9, 0.07);
    tone(ac, c.output, "sine", 1760, 1760, 0.16, 1.2, 0.12);
  });
  audio.define("beep", (c): Handle => {
    tone(c.audioContext, c.output, "square", 880, 880, 0, 0.07, 0.05);
    tone(c.audioContext, c.output, "square", 1320, 1320, 0.09, 0.07, 0.04);
  });
  audio.define("blip", (c): Handle => {
    tone(c.audioContext, c.output, "sine", 1800, 1300, 0, 0.05, 0.12);
    noiseBurst(c.audioContext, c.output, 0, 0.03, 0.03, "highpass", 3000);
  });
  audio.define("hiss", (c): Handle => {
    noiseBurst(c.audioContext, c.output, 0, Math.min(1.2, c.cue.end - c.cue.start), 0.16, "highpass", 2600, 0.6);
  });
  audio.define("cloth-rip", (c): Handle => {
    const ac = c.audioContext;
    noiseBurst(ac, c.output, 0, 0.5, 0.12, "bandpass", 2400, 0.9);
    noiseBurst(ac, c.output, 0.12, 0.3, 0.08, "highpass", 4200, 0.7);
  });
  audio.define("sweep", (c): Handle => {
    const ac = c.audioContext;
    const total = c.cue.end - c.cue.start;
    for (let t = 0; t < total; t += 0.22) noiseBurst(ac, c.output, t, 0.16, 0.06, "bandpass", 3100 + (t % 0.44) * 900, 1.2);
  });
  audio.define("sub-drop", (c): Handle => {
    const ac = c.audioContext;
    const o = tone(ac, c.output, "sine", 72, 26, 0, 2.2, 0.7);
    noiseBurst(ac, c.output, 0, 1.6, 0.12, "lowpass", 280, 0.7);
    return stopper([o]);
  });
  audio.define("tinnitus", (c): Handle => {
    const ac = c.audioContext;
    const total = c.cue.end - c.cue.start;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.linearRampToValueAtTime(0.05, ac.currentTime + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + Math.max(0.5, total - c.offset));
    g.connect(c.output);
    const a = ac.createOscillator();
    a.frequency.value = 3610;
    const b = ac.createOscillator();
    b.frequency.value = 4230;
    const bg = ac.createGain();
    bg.gain.value = 0.55;
    a.connect(g);
    b.connect(bg).connect(g);
    a.start();
    b.start();
    return stopper([a, b]);
  });

  /* ---- the cellar gunshot: real report layers, a hard-walled room around them */
  audio.define("gun-base", (c): Handle => {
    const ac = c.audioContext;
    const out = c.output;
    const conv = ac.createConvolver();
    conv.buffer = cellarIR(ac);
    const wet = ac.createGain();
    wet.gain.value = 0.85;
    const send = ac.createGain();
    send.gain.value = 0.9;
    send.connect(conv);
    conv.connect(wet).connect(out);
    const dry = ac.createGain();
    dry.gain.value = 0.95;
    dry.connect(out);
    dry.connect(send);
    const crunch = playBuffer(ac, "crunch", dry, { rate: 1.45, gain: 0.85, lp: 9000 });
    playBuffer(ac, "mh", dry, { rate: 0.85, gain: 0.8 });
    playBuffer(ac, "lowboom", dry, { rate: 1.25, gain: 0.7 });
    noiseBurst(ac, dry, 0, 0.05, 0.55, "highpass", 1400, 0.6);
    // slap-back off the concrete
    for (const [d, g] of [[0.052, 0.5], [0.097, 0.32], [0.151, 0.2]] as const) {
      const dl = ac.createDelay(0.5);
      dl.delayTime.value = d;
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3200;
      const gg = ac.createGain();
      gg.gain.value = g;
      dry.connect(dl).connect(lp).connect(gg).connect(out);
    }
    return { stop: () => { try { crunch?.stop(); } catch { /* done */ } } };
  });

  /* ---- vibrations carried through the suit; nothing travels through vacuum */
  const conduct = (name: string, buf: string, cutoff: number, rate: number, gain: number) =>
    audio.define(name, (c): Handle => {
      const src = playBuffer(c.audioContext, buf, c.output, { rate, gain, lp: cutoff });
      return { stop: () => { try { src?.stop(); } catch { /* done */ } } };
    });
  conduct("cond:thump", "punch", 240, 0.85, 0.9);
  conduct("cond:sub", "lowboom", 120, 1.0, 0.9);
  conduct("cond:clack", "ml", 1800, 0.9, 0.8);
  conduct("cond:metal-l", "ml", 2400, 1.0, 0.9);
  conduct("cond:metal-m", "mm", 1700, 0.95, 0.9);
  conduct("cond:switch", "sw", 2000, 1.0, 0.9);

  const thruster = (name: string, level: number, lp: number) =>
    audio.define(name, (c): Handle => {
      const ac = c.audioContext;
      const g = ac.createGain();
      envelope(ac, g, c, 0.8, 1.8, level);
      g.connect(c.output);
      const src = playBuffer(ac, "thr", g, { rate: 0.8, lp, loop: true, offset: c.offset });
      return { stop: () => { try { src?.stop(); } catch { /* done */ } } };
    });
  thruster("thr:flight", 0.7, 420);
  thruster("thr:brake", 0.6, 380);
  thruster("thr:return", 0.55, 330);
}
