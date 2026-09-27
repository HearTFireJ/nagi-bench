import type { SoundCue, WebAudioCueBus } from "@agentbench/cinematic-player";

// Recorded CC0 samples, inlined so the build stays self-contained.
import footWood0 from "./assets/audio/footstep_wood_000.ogg?inline";
import footWood1 from "./assets/audio/footstep_wood_001.ogg?inline";
import footWood2 from "./assets/audio/footstep_wood_002.ogg?inline";
import footConcrete0 from "./assets/audio/footstep_concrete_000.ogg?inline";
import footConcrete1 from "./assets/audio/footstep_concrete_001.ogg?inline";
import glassLight0 from "./assets/audio/impactGlass_light_000.ogg?inline";
import glassLight2 from "./assets/audio/impactGlass_light_002.ogg?inline";
import glassMedium1 from "./assets/audio/impactGlass_medium_001.ogg?inline";
import woodLight0 from "./assets/audio/impactWood_light_000.ogg?inline";
import woodMedium1 from "./assets/audio/impactWood_medium_001.ogg?inline";
import genericLight0 from "./assets/audio/impactGeneric_light_000.ogg?inline";
import metalLight0 from "./assets/audio/impactMetal_light_000.ogg?inline";
import metalLight1 from "./assets/audio/impactMetal_light_001.ogg?inline";
import metalMedium0 from "./assets/audio/impactMetal_medium_000.ogg?inline";
import metalMedium2 from "./assets/audio/impactMetal_medium_002.ogg?inline";
import tinMedium0 from "./assets/audio/impactTin_medium_000.ogg?inline";
import softHeavy0 from "./assets/audio/impactSoft_heavy_000.ogg?inline";
import softMedium0 from "./assets/audio/impactSoft_medium_000.ogg?inline";
import plateLight1 from "./assets/audio/impactPlate_light_001.ogg?inline";
import engineCircular from "./assets/audio/engineCircular_000.ogg?inline";
import computerNoise0 from "./assets/audio/computerNoise_000.ogg?inline";
import computerNoise2 from "./assets/audio/computerNoise_002.ogg?inline";
import explosionCrunch from "./assets/audio/explosionCrunch_000.ogg?inline";
import lowExplosion from "./assets/audio/lowFrequency_explosion_000.ogg?inline";
import thruster0 from "./assets/audio/thrusterFire_000.ogg?inline";
import thruster2 from "./assets/audio/thrusterFire_002.ogg?inline";
import engineLow from "./assets/audio/spaceEngineLow_000.ogg?inline";
import doorClose from "./assets/audio/doorClose_000.ogg?inline";
import doorOpen from "./assets/audio/doorOpen_000.ogg?inline";
import forceField from "./assets/audio/forceField_003.ogg?inline";
import switch1 from "./assets/audio/switch1.ogg?inline";
import switch5 from "./assets/audio/switch5.ogg?inline";
import switch10 from "./assets/audio/switch10.ogg?inline";
import switch21 from "./assets/audio/switch21.ogg?inline";
import click2 from "./assets/audio/click2.ogg?inline";
import rollover3 from "./assets/audio/rollover3.ogg?inline";

/**
 * Register every sample and procedural layer. Samples carry the recognisable
 * real-world events; procedural Web Audio supplies room tone, reverb tails,
 * suit breathing, radio squelch and the subjective layers in vacuum.
 */
export function defineSounds<C>(audio: WebAudioCueBus<C>): void {
  audio
    .defineSample("step-wood-a", footWood0, { playbackRate: 0.95 })
    .defineSample("step-wood-b", footWood1, { playbackRate: 0.9 })
    .defineSample("step-wood-c", footWood2, { playbackRate: 0.97 })
    .defineSample("step-concrete-a", footConcrete0, { playbackRate: 0.9 })
    .defineSample("step-concrete-b", footConcrete1, { playbackRate: 0.86 })
    .defineSample("cup-set", glassLight0, { playbackRate: 1.1 })
    .defineSample("cabinet-glass", glassLight2, { playbackRate: 0.8 })
    .defineSample("visor-crack", glassMedium1, { playbackRate: 0.55 })
    .defineSample("door-wood", woodMedium1, { playbackRate: 0.7 })
    .defineSample("stone-on-wood", woodLight0, { playbackRate: 0.8 })
    .defineSample("stone-generic", genericLight0, { playbackRate: 0.75 })
    .defineSample("metal-tick", metalLight0, { playbackRate: 1.2 })
    .defineSample("metal-tick-b", metalLight1, { playbackRate: 1.05 })
    .defineSample("mag-insert", metalMedium0, { playbackRate: 1.0 })
    .defineSample("slide-rack", metalMedium2, { playbackRate: 0.9 })
    .defineSample("shavings", tinMedium0, { playbackRate: 0.9 })
    .defineSample("bundle-hit", softHeavy0, { playbackRate: 0.8 })
    .defineSample("cloth", softMedium0, { playbackRate: 0.7 })
    .defineSample("cutter-set", plateLight1, { playbackRate: 0.8 })
    .defineSample("lathe-loop", engineCircular, { loop: true, playbackRate: 0.78, detune: -300 })
    .defineSample("cnc-console", computerNoise0, { playbackRate: 1.0 })
    .defineSample("radio-data", computerNoise2, { playbackRate: 1.3 })
    .defineSample("gun-crack", explosionCrunch, { playbackRate: 1.35 })
    .defineSample("gun-low", lowExplosion, { playbackRate: 0.9 })
    .defineSample("suit-thud", softHeavy0, { playbackRate: 0.42, detune: -500 })
    .defineSample("thruster-a", thruster0, { playbackRate: 1.0 })
    .defineSample("thruster-b", thruster2, { playbackRate: 0.85 })
    .defineSample("station-drone", engineLow, { loop: true, playbackRate: 0.6, detune: -400 })
    .defineSample("hatch-close", doorClose, { playbackRate: 0.8 })
    .defineSample("hatch-open", doorOpen, { playbackRate: 0.8 })
    .defineSample("alarm-sweep", forceField, { playbackRate: 0.7 })
    .defineSample("switch-a", switch1, { playbackRate: 1.0 })
    .defineSample("switch-b", switch5, { playbackRate: 0.9 })
    .defineSample("switch-c", switch10, { playbackRate: 1.1 })
    .defineSample("switch-d", switch21, { playbackRate: 0.8 })
    .defineSample("phone-tap", click2, { playbackRate: 1.0 })
    .defineSample("ui-blip", rollover3, { playbackRate: 1.2 });

  // ---------------------------------------------------------------- procedural

  /** Filtered noise buffer, reused by several factories. */
  const noiseBuffer = (ac: AudioContext, seconds = 2) => {
    const b = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
    const d = b.getChannelData(0);
    let s = 1234567;
    for (let i = 0; i < d.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      d[i] = (s / 4294967296) * 2 - 1;
    }
    return b;
  };

  // Old-house room tone: mains hum, faint hiss, a clock ticking once a second.
  audio.define("room-study", ({ audioContext: ac, output, offset }) => {
    const t0 = ac.currentTime;
    const hum = ac.createOscillator();
    hum.type = "sine"; hum.frequency.value = 50;
    const humGain = ac.createGain(); humGain.gain.value = 0.035;
    hum.connect(humGain).connect(output);
    const noise = ac.createBufferSource(); noise.buffer = noiseBuffer(ac); noise.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600;
    const ng = ac.createGain(); ng.gain.value = 0.05;
    noise.connect(lp).connect(ng).connect(output);
    // Clock ticks scheduled deterministically relative to the cue offset.
    const tick = ac.createGain(); tick.gain.value = 0;
    const tickOsc = ac.createOscillator(); tickOsc.type = "square"; tickOsc.frequency.value = 2200;
    const tickHp = ac.createBiquadFilter(); tickHp.type = "highpass"; tickHp.frequency.value = 1500;
    tickOsc.connect(tickHp).connect(tick).connect(output);
    const phase = offset % 1;
    for (let i = 0; i < 120; i++) {
      const at = t0 + (1 - phase) + i;
      tick.gain.setValueAtTime(0.0001, at);
      tick.gain.exponentialRampToValueAtTime(i % 2 ? 0.05 : 0.035, at + 0.004);
      tick.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    }
    hum.start(); noise.start(); tickOsc.start();
    return { stop: () => { try { hum.stop(); noise.stop(); tickOsc.stop(); } catch {} } };
  });

  // Basement: a bulb's buzz and a deep, damp silence.
  audio.define("room-basement", ({ audioContext: ac, output }) => {
    const hum = ac.createOscillator(); hum.type = "sawtooth"; hum.frequency.value = 100;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 380;
    const g = ac.createGain(); g.gain.value = 0.02;
    hum.connect(lp).connect(g).connect(output);
    const noise = ac.createBufferSource(); noise.buffer = noiseBuffer(ac); noise.loop = true;
    const nlp = ac.createBiquadFilter(); nlp.type = "lowpass"; nlp.frequency.value = 250;
    const ng = ac.createGain(); ng.gain.value = 0.06;
    noise.connect(nlp).connect(ng).connect(output);
    hum.start(); noise.start();
    return { stop: () => { try { hum.stop(); noise.stop(); } catch {} } };
  });

  // Workshop: ventilation and a large empty hall.
  audio.define("room-workshop", ({ audioContext: ac, output }) => {
    const noise = ac.createBufferSource(); noise.buffer = noiseBuffer(ac); noise.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 180; bp.Q.value = 0.7;
    const g = ac.createGain(); g.gain.value = 0.12;
    noise.connect(bp).connect(g).connect(output);
    const fan = ac.createOscillator(); fan.type = "triangle"; fan.frequency.value = 62;
    const fg = ac.createGain(); fg.gain.value = 0.02;
    fan.connect(fg).connect(output);
    noise.start(); fan.start();
    return { stop: () => { try { noise.stop(); fan.stop(); } catch {} } };
  });

  // The gunshot's reflection inside a concrete box: a dense, bright tail that
  // hangs for over a second. Layered under the recorded crack.
  audio.define("basement-reverb", ({ audioContext: ac, output }) => {
    const t0 = ac.currentTime;
    const src = ac.createBufferSource(); src.buffer = noiseBuffer(ac, 1.5);
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 0.5;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(6000, t0); lp.frequency.exponentialRampToValueAtTime(300, t0 + 1.4);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
    // A few discrete early reflections.
    const delays = [0.011, 0.019, 0.027, 0.041];
    src.connect(bp).connect(lp).connect(g).connect(output);
    for (const d of delays) {
      const dl = ac.createDelay(0.1); dl.delayTime.value = d;
      const dg = ac.createGain(); dg.gain.value = 0.35;
      lp.connect(dl).connect(dg).connect(g);
    }
    // Sub thump felt in the chest.
    const sub = ac.createOscillator(); sub.type = "sine";
    sub.frequency.setValueAtTime(110, t0); sub.frequency.exponentialRampToValueAtTime(35, t0 + 0.25);
    const sg = ac.createGain();
    sg.gain.setValueAtTime(0.0001, t0); sg.gain.exponentialRampToValueAtTime(0.8, t0 + 0.006); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    sub.connect(sg).connect(output);
    src.start(); sub.start(); sub.stop(t0 + 0.4);
    return { stop: () => { try { src.stop(); sub.stop(); } catch {} } };
  });

  // Ringing ears after the shots.
  audio.define("tinnitus", ({ audioContext: ac, output }) => {
    const t0 = ac.currentTime;
    const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = 7600;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.045, t0 + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 5.5);
    o.connect(g).connect(output); o.start(); o.stop(t0 + 5.6);
    return { stop: () => { try { o.stop(); } catch {} } };
  });

  // Inside the helmet: slow breathing, the fan, the faint whine of electronics.
  audio.define("suit-interior", ({ audioContext: ac, output, offset }) => {
    const t0 = ac.currentTime;
    const noise = ac.createBufferSource(); noise.buffer = noiseBuffer(ac, 3); noise.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 520; bp.Q.value = 0.8;
    const breath = ac.createGain(); breath.gain.value = 0;
    noise.connect(bp).connect(breath).connect(output);
    const period = 4.6, phase = offset % period;
    for (let i = 0; i < 90; i++) {
      const at = t0 - phase + i * period;
      if (at + period < t0) continue;
      const s = Math.max(at, t0);
      breath.gain.setValueAtTime(0.0001, s);
      breath.gain.linearRampToValueAtTime(0.16, Math.max(s + 0.01, at + 1.4));   // inhale
      breath.gain.linearRampToValueAtTime(0.02, Math.max(s + 0.02, at + 2.1));
      breath.gain.linearRampToValueAtTime(0.13, Math.max(s + 0.03, at + 3.2));   // exhale
      breath.gain.linearRampToValueAtTime(0.0001, Math.max(s + 0.04, at + 4.4));
    }
    const fan = ac.createOscillator(); fan.type = "triangle"; fan.frequency.value = 96;
    const fg = ac.createGain(); fg.gain.value = 0.012;
    fan.connect(fg).connect(output);
    const whine = ac.createOscillator(); whine.type = "sine"; whine.frequency.value = 3100;
    const wg = ac.createGain(); wg.gain.value = 0.004;
    whine.connect(wg).connect(output);
    noise.start(); fan.start(); whine.start();
    return { stop: () => { try { noise.stop(); fan.stop(); whine.stop(); } catch {} } };
  });

  // Radio squelch: a short burst of band-limited noise, then a click.
  audio.define("radio-squelch", ({ audioContext: ac, output }) => {
    const t0 = ac.currentTime;
    const n = ac.createBufferSource(); n.buffer = noiseBuffer(ac, 0.5);
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 1.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    n.connect(bp).connect(g).connect(output); n.start();
    return { stop: () => { try { n.stop(); } catch {} } };
  });

  // Open channel: constant faint radio hiss while others are talking.
  audio.define("radio-bed", ({ audioContext: ac, output }) => {
    const n = ac.createBufferSource(); n.buffer = noiseBuffer(ac, 2); n.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 0.9;
    const g = ac.createGain(); g.gain.value = 0.04;
    n.connect(bp).connect(g).connect(output); n.start();
    return { stop: () => { try { n.stop(); } catch {} } };
  });

  // Space drone: two detuned low voices with a very slow swell. The music.
  audio.define("drone", ({ audioContext: ac, output, offset }) => {
    const t0 = ac.currentTime;
    const make = (f: number, type: OscillatorType, gain: number) => {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = f;
      const g = ac.createGain(); g.gain.value = gain;
      o.connect(g).connect(output); o.start();
      return o;
    };
    const a = make(55, "sine", 0.11);
    const b = make(82.6, "triangle", 0.035);
    const c = make(110.7, "sine", 0.03);
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ac.createGain(); lg.gain.value = 0.6;
    lfo.connect(lg).connect(b.frequency); lfo.start(t0 - (offset % 14));
    return { stop: () => { try { a.stop(); b.stop(); c.stop(); lfo.stop(); } catch {} } };
  });

  // A colder, thinner drone for the killing, with a slow pulse underneath.
  audio.define("drone-cold", ({ audioContext: ac, output, offset }) => {
    const t0 = ac.currentTime;
    const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = 41.2;
    const g = ac.createGain(); g.gain.value = 0.14;
    o.connect(g).connect(output);
    const hi = ac.createOscillator(); hi.type = "sine"; hi.frequency.value = 1318.5;
    const hg = ac.createGain(); hg.gain.value = 0.006;
    hi.connect(hg).connect(output);
    const pulse = ac.createGain(); pulse.gain.value = 0;
    const po = ac.createOscillator(); po.type = "sine"; po.frequency.value = 62;
    po.connect(pulse).connect(output);
    const period = 1.15, phase = offset % period;
    for (let i = 0; i < 80; i++) {
      const at = t0 - phase + i * period;
      if (at < t0) continue;
      pulse.gain.setValueAtTime(0.0001, at);
      pulse.gain.exponentialRampToValueAtTime(0.09, at + 0.03);
      pulse.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    }
    o.start(); hi.start(); po.start();
    return { stop: () => { try { o.stop(); hi.stop(); po.stop(); } catch {} } };
  });

  // The recoil felt through the suit: no air, so only a body-conducted knock.
  audio.define("suit-knock", ({ audioContext: ac, output }) => {
    const t0 = ac.currentTime;
    const o = ac.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(140, t0); o.frequency.exponentialRampToValueAtTime(48, t0 + 0.09);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    o.connect(g).connect(output); o.start(); o.stop(t0 + 0.2);
    return { stop: () => { try { o.stop(); } catch {} } };
  });

  // Heartbeat, for the ten seconds of flight.
  audio.define("heartbeat", ({ audioContext: ac, output, offset }) => {
    const t0 = ac.currentTime;
    const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = 52;
    const g = ac.createGain(); g.gain.value = 0;
    o.connect(g).connect(output);
    const period = 0.95, phase = offset % period;
    for (let i = 0; i < 40; i++) {
      const at = t0 - phase + i * period;
      if (at < t0) continue;
      for (const [d, a] of [[0, 0.32], [0.17, 0.22]] as const) {
        g.gain.setValueAtTime(0.0001, at + d);
        g.gain.exponentialRampToValueAtTime(a, at + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + d + 0.14);
      }
    }
    o.start();
    return { stop: () => { try { o.stop(); } catch {} } };
  });

  // Subjective ring as the first impact appears: a high, thin note.
  audio.define("impact-tone", ({ audioContext: ac, output }) => {
    const t0 = ac.currentTime;
    const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = 2637;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 5.0);
    o.connect(g).connect(output); o.start(); o.stop(t0 + 5.1);
    return { stop: () => { try { o.stop(); } catch {} } };
  });

  // Glove ring twist, felt through the arm: a low ratchet.
  audio.define("ring-twist", ({ audioContext: ac, output }) => {
    const t0 = ac.currentTime;
    const o = ac.createOscillator(); o.type = "square"; o.frequency.value = 210;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500;
    const g = ac.createGain(); g.gain.value = 0;
    for (let i = 0; i < 9; i++) {
      const at = t0 + i * 0.07;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.09, at + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    }
    o.connect(lp).connect(g).connect(output); o.start(); o.stop(t0 + 0.8);
    return { stop: () => { try { o.stop(); } catch {} } };
  });
}

let n = 0;
const cue = (sound: string, start: number, len: number, gain = 0.8, group = "sfx", sustain = false): SoundCue => ({
  id: `sfx-${String(++n).padStart(3, "0")}-${sound}`,
  kind: "sound",
  sound,
  group,
  gain,
  sustain,
  start,
  end: start + len,
});

/** Timings of the thirty silent shots in orbit, shared with the shot list. */
export const SPACE_SHOTS: number[] = (() => {
  const out: number[] = [];
  for (let m = 0; m < 3; m++) {
    const base = [256.8, 260.2, 263.7][m]!;
    for (let i = 0; i < 10; i++) out.push(base + i * 0.22);
  }
  return out;
})();

/** The four basement test shots. */
export const BASEMENT_SHOTS = [133.2, 134.4, 135.3, 136.5];

export const soundCues: SoundCue[] = [
  // Prologue: suit interior, drone.
  cue("suit-interior", 0, 22.5, 0.9, "amb", true),
  cue("drone", 0, 23, 0.55, "music", true),

  // Study.
  cue("room-study", 23, 78, 0.9, "amb", true),
  cue("door-wood", 31.6, 1.2, 0.6),
  cue("step-wood-a", 33.6, 0.5, 0.5), cue("step-wood-b", 34.25, 0.5, 0.45), cue("step-wood-c", 34.9, 0.5, 0.5),
  cue("step-wood-a", 35.55, 0.5, 0.45), cue("step-wood-b", 36.2, 0.5, 0.5), cue("step-wood-c", 36.85, 0.5, 0.45), cue("step-wood-a", 37.5, 0.5, 0.4),
  cue("cup-set", 39.6, 0.6, 0.5),
  cue("cup-set", 68.6, 0.6, 0.45),
  cue("cabinet-glass", 83.0, 0.8, 0.5),
  cue("stone-on-wood", 86.4, 0.6, 0.7), cue("stone-generic", 87.2, 0.6, 0.7), cue("stone-on-wood", 88.0, 0.6, 0.7),
  cue("phone-tap", 90.6, 0.3, 0.5), cue("phone-tap", 91.3, 0.3, 0.4),

  // Workshop.
  cue("room-workshop", 100, 19, 0.8, "amb", true),
  cue("cnc-console", 100.2, 1.6, 0.5),
  cue("lathe-loop", 101.0, 11.2, 0.7, "sfx", true),
  cue("metal-tick", 103.4, 0.5, 0.5), cue("metal-tick-b", 105.1, 0.5, 0.5), cue("metal-tick", 106.7, 0.5, 0.5), cue("metal-tick-b", 108.6, 0.5, 0.45), cue("metal-tick", 110.3, 0.5, 0.45),
  cue("step-concrete-a", 112.4, 0.6, 0.4), cue("step-concrete-b", 113.1, 0.6, 0.4),
  cue("shavings", 115.2, 0.8, 0.6), cue("shavings", 116.0, 0.8, 0.5),
  cue("cutter-set", 117.3, 0.8, 0.6),

  // Basement.
  cue("room-basement", 118.5, 31.5, 0.9, "amb", true),
  cue("metal-tick", 120.4, 0.4, 0.5), cue("metal-tick-b", 121.9, 0.4, 0.5), cue("metal-tick", 123.3, 0.4, 0.5), cue("metal-tick-b", 125.6, 0.4, 0.45), cue("metal-tick", 127.4, 0.4, 0.45),
  cue("switch-a", 130.6, 0.4, 0.5), cue("switch-a", 130.95, 0.4, 0.5), cue("switch-a", 131.3, 0.4, 0.5), cue("switch-a", 131.65, 0.4, 0.5),
  cue("mag-insert", 132.1, 0.6, 0.8),
  cue("slide-rack", 132.55, 0.6, 0.8),
  ...BASEMENT_SHOTS.flatMap((t) => [
    cue("gun-crack", t, 1.2, 1.0),
    cue("gun-low", t + 0.01, 1.6, 0.9),
    cue("basement-reverb", t + 0.015, 1.6, 0.9),
    cue("bundle-hit", t + 0.02, 0.6, 0.6),
  ]),
  cue("tinnitus", 136.7, 5.6, 0.7),
  cue("cloth", 141.6, 0.8, 0.5), cue("cloth", 142.6, 0.8, 0.45),
  cue("stone-generic", 145.4, 0.5, 0.4), cue("stone-generic", 146.0, 0.5, 0.35), cue("stone-generic", 146.5, 0.5, 0.3),

  // Orbit.
  cue("drone", 150, 51, 0.5, "music", true),
  cue("station-drone", 150, 14, 0.5, "amb", true),
  cue("radio-squelch", 151.8, 0.3, 0.7), cue("radio-bed", 152, 6.2, 0.7, "amb", true), cue("radio-squelch", 158.0, 0.3, 0.6),
  cue("ui-blip", 166.4, 0.3, 0.5), cue("switch-c", 167.2, 0.4, 0.5),
  cue("hatch-close", 170.2, 1.4, 0.7),
  cue("suit-interior", 172, 136, 0.9, "amb", true),
  cue("thruster-a", 172.3, 2.2, 0.55), cue("thruster-b", 176.0, 1.6, 0.5), cue("thruster-a", 179.2, 1.4, 0.45), cue("thruster-b", 181.3, 0.9, 0.4),
  cue("drone", 201, 55, 0.45, "music", true),
  cue("switch-d", 208.4, 0.5, 0.5),                       // hatch lamp: red to green, seen through the scope (a suit HUD tick)
  cue("radio-squelch", 213.8, 0.3, 0.6), cue("radio-bed", 214, 12.4, 0.6, "amb", true), cue("radio-squelch", 226.3, 0.3, 0.5),
  cue("ring-twist", 226.8, 0.9, 0.8), cue("switch-b", 227.8, 0.4, 0.5),
  cue("cloth", 231.2, 0.6, 0.5), cue("metal-tick-b", 232.4, 0.4, 0.5),
  cue("switch-c", 236.2, 0.4, 0.6), cue("mag-insert", 236.25, 0.6, 0.5),   // scope magnets snap on
  cue("drone-cold", 256, 24, 0.6, "music", true),
  ...SPACE_SHOTS.map((t) => cue("suit-knock", t, 0.25, 0.8)),
  ...SPACE_SHOTS.filter((_, i) => i % 3 === 0).map((t) => cue("suit-thud", t + 0.005, 0.5, 0.35)),
  cue("mag-insert", 259.4, 0.5, 0.45), cue("switch-b", 259.8, 0.4, 0.4),
  cue("mag-insert", 262.9, 0.5, 0.45), cue("switch-b", 263.3, 0.4, 0.4),
  cue("radio-squelch", 260.4, 0.3, 0.5), cue("radio-bed", 260.6, 2.9, 0.5, "amb", true),
  cue("heartbeat", 266.0, 8.5, 0.7, "music", true),
  cue("impact-tone", 270.5, 5.2, 0.7),
  cue("radio-squelch", 272.4, 0.3, 0.7), cue("radio-bed", 272.6, 6.0, 0.7, "amb", true), cue("alarm-sweep", 274.8, 1.6, 0.35), cue("radio-data", 276.2, 1.0, 0.3),
  cue("drone", 280, 30, 0.5, "music", true),
  cue("thruster-a", 290.6, 2.4, 0.55), cue("thruster-b", 294.0, 2.0, 0.45),

  // Coda.
  cue("room-study", 308, 10.2, 0.8, "amb", true),
  cue("stone-generic", 310.4, 0.5, 0.4),
  cue("drone", 318, 14, 0.4, "music", true),
];
