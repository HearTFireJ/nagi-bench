import type { SoundCue } from "@agentbench/cinematic-player";
import { T } from "./timing";
import type { Track } from "./film/core";
import { alleyTrack, collHouse, zhangHouse } from "./film/act1";
import { zhangBase, zhangShop } from "./film/act2";
import { SHOTS } from "./film/act3";

/* ---------------------------------------------------------------- the cues */

const cues: SoundCue[] = [];
let counter = 0;
function snd(sound: string, start: number, dur: number, gain = 1, group = "sfx", sustain = false): void {
  const end = Math.min(T.duration, start + dur);
  if (end <= start) return;
  cues.push({
    id: `sfx-${String(++counter).padStart(3, "0")}-${sound.replace(/[^a-z0-9]+/gi, "_")}`,
    kind: "sound",
    sound,
    group,
    gain,
    sustain,
    start: Math.round(start * 1000) / 1000,
    end: Math.round(end * 1000) / 1000,
  });
}
const bed = (sound: string, start: number, end: number, gain: number, group = "amb") => snd(sound, start, end - start, gain, group, true);

function stepTimes(track: Track, t0: number, t1: number, stride = 0.78): number[] {
  const out: number[] = [];
  let next = stride * 0.5;
  const d0 = track.dist(t0);
  for (let t = t0; t <= t1; t += 0.02) {
    const d = track.dist(t) - d0;
    if (d >= next && track.speed(t) > 0.22) {
      out.push(t);
      next += stride;
    }
  }
  return out;
}
function steps(track: Track, t0: number, t1: number, kind: "c" | "w", gain: number, stride = 0.78): void {
  stepTimes(track, t0, t1, stride).forEach((t, i) => snd(`step-${kind}${(i * 3 + 1) % 5}`, t, 0.4, gain * (0.85 + ((i * 7) % 5) * 0.06)));
}

function scoreAndSound(): void {
  /* ---- prologue: the void */
  bed("suit-air", 0, 19.4, 0.85);
  bed("pad:void", 0, 19.4, 0.8, "mus");
  bed("radio-hiss", 0, 19.4, 0.22);
  bed("heart:slow", 6, 19.0, 0.32, "mus");
  snd("sub-drop", 19.2, 3.0, 0.75, "mus");
  snd("bell-low", 19.7, 4.6, 0.6, "mus");

  /* ---- the alley */
  bed("wind", 24.6, 37.2, 0.55);
  bed("hum:city", 24.6, 37.2, 0.3);
  bed("pluck:warm", 25.4, 118.0, 0.85, "mus");
  steps(alleyTrack, 24.4, 36.4, "c", 0.5, 0.76);
  snd("wood-m", 36.55, 0.5, 0.55);
  snd("wood-m", 36.85, 0.5, 0.5);

  /* ---- the collector's house */
  snd("creak", 37.1, 1.6, 0.9);
  snd("wood-h", 38.35, 0.5, 0.5);
  bed("hum:room", 37.0, 118.0, 0.4);
  bed("clock", 38.0, 118.0, 0.4);
  steps(zhangHouse, 39.6, 46.4, "w", 0.42, 0.7);
  steps(zhangHouse, 81.8, 82.75, "w", 0.35, 0.7);
  steps(zhangHouse, 86.2, 87.25, "w", 0.35, 0.7);
  steps(collHouse, 73.6, 83.65, "w", 0.4, 0.8);
  steps(collHouse, 90.6, 92.05, "w", 0.4, 0.75);
  steps(collHouse, 94.6, 95.85, "w", 0.4, 0.75);
  snd("glass-l", 46.9, 0.4, 0.5);
  snd("glass-l2", 47.5, 0.4, 0.45);
  snd("glass-l", 64.7, 0.4, 0.35);
  snd("glass-l2", 72.1, 0.4, 0.4);
  snd("creak", 92.3, 1.2, 0.35);
  snd("glass-m", 92.7, 0.6, 0.35);
  [77.6, 77.85, 78.1, 78.35].forEach((t, i) => snd(i % 2 ? "click-b" : "click-a", t, 0.15, 0.55));
  snd("metal-h0", 78.3, 0.5, 0.6);
  snd("door-slow", 78.5, 0.9, 0.5);
  snd("glass-l", 79.6, 0.4, 0.25);
  snd("roll", 83.0, 0.3, 0.35);
  snd("soft-m0", 98.4, 0.3, 0.5);
  snd("soft-m1", 98.58, 0.3, 0.5);
  snd("soft-m0", 98.76, 0.3, 0.5);
  snd("metal-l1", 99.2, 0.4, 0.3);
  snd("roll6", 105.4, 0.3, 0.4);
  snd("click-a", 105.9, 0.2, 0.5);
  snd("ding", 107.0, 1.6, 0.5);
  snd("soft-m1", 116.7, 0.4, 0.4);
  bed("pad:low", 110.5, 118.6, 0.6, "mus");

  /* ---- the workshop */
  bed("hum:room", 118.0, 121.4, 0.3);
  steps(zhangShop, 119.3, 121.5, "c", 0.6, 0.78);
  snd("switch-a", 120.95, 0.4, 0.7);
  [121.2, 121.33, 121.52].forEach((t) => snd("metal-l2", t, 0.3, 0.3));
  bed("hum:fluor", 121.2, 146.25, 0.32);
  steps(zhangShop, 121.9, 125.0, "c", 0.6, 0.78);
  snd("door-o2", 125.2, 0.6, 0.5);
  snd("metal-m0", 126.6, 0.4, 0.5);
  [127.3, 127.55, 127.8].forEach((t) => snd("switch-b", t, 0.2, 0.5));
  snd("door-c", 128.6, 0.6, 0.55);
  snd("click-a", 129.8, 0.15, 0.6);
  snd("beep", 129.85, 0.2, 0.6);
  bed("cnc-spin", T.drill0, T.drill1 + 0.3, 0.55);
  bed("cutting-noise", T.drill0 + 0.1, T.drill1, 0.5);
  [130.3, 131.3, 132.3, 133.3].forEach((t) => snd("mining", t, 1.0, 0.5));
  bed("cnc-saw", T.saw0, T.saw1, 0.5);
  bed("cutting-noise", T.saw0, T.saw1, 0.55);
  bed("pulse:mech", T.drill0, T.saw1, 0.5, "mus");
  for (let k = 0; k < 18; k++) snd(`metal-l${k % 4}`, T.saw0 + k * 0.29 + 0.08, 0.3, 0.22);
  for (let k = 0; k < 18; k++) snd("click-c", T.saw0 + 0.3 + k * 0.29, 0.1, 0.22);
  snd("door-o2", 140.8, 0.6, 0.5);
  snd("sweep", 141.6, 2.0, 0.5);
  snd("tin", 143.65, 0.3, 0.55);
  snd("switch-c", 143.9, 0.3, 0.5);
  snd("metal-m1", 144.3, 0.4, 0.55);
  steps(zhangShop, 145.45, 146.0, "c", 0.6, 0.78);
  snd("switch-a", 146.15, 0.4, 0.75);
  snd("metal-m1", 146.25, 0.4, 0.3);
  bed("hum:room", 146.2, 148.0, 0.3);
  steps(zhangShop, 146.5, 147.9, "c", 0.55, 0.78);
  bed("drone:mech", 119.0, 148.4, 0.6, "mus");

  /* ---- the basement */
  bed("hum:room-b", 148.0, 197.6, 0.42);
  bed("drip", 148.0, 197.4, 0.2);
  bed("drone:dark", 148.4, 198.4, 0.7, "mus");
  snd("metal-h0", 149.8, 0.5, 0.7);
  snd("door-slow", 149.8, 0.9, 0.6);
  steps(zhangBase, 150.9, 154.5, "c", 0.55, 0.62);
  [155.2, 155.5].forEach(() => 0);
  for (let k = 0; k < 36; k++) {
    const t = T.bPliers0 + 0.15 + (k * (T.bPliers1 - T.bPliers0 - 0.3)) / 35;
    snd(`metal-l${k % 4}`, t, 0.3, 0.2 + (k % 3) * 0.03);
    if (k % 2) snd("click-c", t + 0.04, 0.1, 0.16);
  }
  for (let k = 0; k < 6; k++) snd("slime", T.bGlue0 + 0.25 + k * 0.86, 0.6, 0.35);
  [168.3, 169.4, 170.5, 171.5].forEach((t, i) => {
    snd(`metal-l${i}`, t, 0.3, 0.3);
    snd("click-b", t + 0.06, 0.1, 0.35);
  });
  snd("metal-m0", 171.62, 0.4, 0.4);
  snd("metal-m1", 172.95, 0.4, 0.5);
  snd("click-a", 173.0, 0.15, 0.5);
  snd("metal-l3", 174.05, 0.4, 0.4);
  snd("switch-c", 174.08, 0.3, 0.5);
  steps(zhangBase, 174.6, 176.4, "c", 0.5, 0.7);
  T.bShots.forEach((t) => {
    snd("gun-base", t, 3.4, 0.8);
    snd("soft-h", t + 0.03, 0.6, 0.5);
  });
  snd("tinnitus", 179.35, 3.4, 0.7);
  snd("soft-m0", 182.2, 0.4, 0.5);
  snd("soft-m1", 183.4, 0.4, 0.4);
  snd("cloth-rip", 184.0, 0.7, 0.5);
  snd("cloth-rip", 185.6, 0.6, 0.4);
  snd("soft-m1", 186.4, 0.3, 0.4);
  snd("soft-m0", 187.0, 0.3, 0.4);
  [188.7, 189.05, 189.5].forEach((t) => snd("shard", t, 0.4, 0.28));
  [193.5, 194.0, 194.5, 195.0, 195.5].forEach((t, i) => {
    snd("click-b", t, 0.15, 0.4);
    snd(`metal-l${i % 4}`, t + 0.03, 0.3, 0.2);
  });
  steps(zhangBase, 196.5, 197.7, "c", 0.5, 0.7);
  snd("door-slow", 197.0, 0.9, 0.5);
  bed("heart:build", 158.0, 176.7, 0.28, "mus");

  /* ---- the station from the outside: only the score, no air to carry anything */
  bed("pad:void", 198.0, 216.4, 0.85, "mus");
  bed("arp:cold", 199.0, 216.0, 0.6, "mus");
  snd("blip", 209.6, 0.2, 0.25);
  snd("blip", 211.0, 0.2, 0.25);
  snd("blip", 212.4, 0.2, 0.25);

  /* ---- Base One, the cabin */
  bed("hum:cabin", 216.0, 229.6, 0.42);
  bed("pad:cabin", 216.0, 230.4, 0.7, "mus");
  for (let t = (Math.PI / 2) / 5; t < 231; t += (2 * Math.PI) / 5) if (t >= 216 && t < 230) snd("click-c", t, 0.1, 0.2);
  snd("metal-l2", 220.4, 0.3, 0.4);
  snd("click-a", 220.45, 0.15, 0.4);
  snd("plate-l", 223.5, 0.5, 0.5);
  snd("switch-d", 223.7, 0.2, 0.5);
  snd("hiss", 223.8, 1.4, 0.7);
  snd("door-o", 224.9, 0.6, 0.6);
  snd("hiss", 225.0, 1.2, 0.5);
  snd("door-c", 228.4, 0.6, 0.6);

  /* ---- space: everything is heard through the suit */
  bed("suit-air", 224.2, 304.0, 0.8);
  bed("radio-hiss", 230.0, 304.0, 0.2);
  snd("thr:flight", 230.4, 8.4, 0.85, "cond");
  snd("thr:brake", 238.2, 2.4, 0.7, "cond");
  bed("pad:void", 230.0, 249.0, 0.7, "mus");
  snd("click-c", 247.3, 0.1, 0.3);
  snd("blip", 251.0, 0.2, 0.3);
  bed("pad:sunset", 245.0, 264.0, 0.8, "mus");
  bed("pad:tense", 262.0, 304.0, 0.8, "mus");
  bed("heart:build", 262.0, 304.6, 0.5, "mus");
  [274.5, 274.75, 275.0].forEach((t) => snd("cond:metal-l", t, 0.3, 0.7, "cond"));
  snd("cond:switch", 275.6, 0.3, 0.7, "cond");
  snd("hiss", 275.65, 0.8, 0.28);
  snd("cond:metal-l", 277.6, 0.3, 0.7, "cond");
  snd("click-a", 277.65, 0.15, 0.3);
  // the training loop in the dark
  [279.05, 281.05, 283.05].forEach((t) => snd("beep", t, 0.2, 0.45));
  snd("switch-c", 279.5, 0.3, 0.5);
  snd("click-a", 279.9, 0.15, 0.5);
  snd("click-a", 281.7, 0.15, 0.5);
  snd("metal-m0", 282.2, 0.4, 0.5);
  snd("switch-c", 283.9, 0.3, 0.5);
  snd("metal-l1", 284.3, 0.3, 0.5);
  bed("tick:train", 279.0, 285.0, 0.4);
  snd("click-b", 285.5, 0.15, 0.35);
  snd("cond:metal-m", 286.2, 0.4, 0.8, "cond");
  snd("click-a", 286.22, 0.15, 0.5);
  snd("cond:metal-m", 287.6, 0.4, 0.7, "cond");
  snd("cond:switch", 287.62, 0.3, 0.6, "cond");
  // the volley: felt through the bones, never heard
  SHOTS.forEach((t) => {
    snd("cond:thump", t, 0.6, 0.75, "cond");
    snd("cond:sub", t, 0.9, 0.5, "cond");
    snd("cond:clack", t + 0.012, 0.3, 0.4, "cond");
  });
  [298.95, 301.55].forEach((t) => {
    snd("cond:metal-m", t, 0.4, 0.6, "cond");
    snd("cond:metal-l", t + 0.7, 0.3, 0.6, "cond");
  });
  // ten seconds of nothing
  bed("tone:void", 304.0, 307.5, 0.55, "mus");
  bed("heart:build", 304.0, 323.0, 0.5, "mus");
  for (let t = (Math.PI / 2) / 5; t < 307; t += (2 * Math.PI) / 5) if (t >= 305.4 && t < 306.2) snd("click-c", t, 0.1, 0.1);
  snd("sub-drop", 307.35, 3.0, 0.7, "mus");
  bed("swell:tense", 307.4, 323.6, 0.8, "mus");
  bed("suit-air", 321.4, 349.2, 0.8);
  bed("pad:resolve", 323.0, 349.6, 0.85, "mus");
  bed("heart:calm", 324.0, 346.5, 0.3, "mus");
  snd("thr:return", 331.8, 15.2, 0.85, "cond");
  snd("bell-low", 349.6, 5.0, 0.55, "mus");
  snd("sub-thud", 349.6, 2.0, 0.3, "mus");
}
scoreAndSound();
export const soundCues: SoundCue[] = cues;

