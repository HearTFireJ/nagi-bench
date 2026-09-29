import type { SoundCue } from "@agentbench/cinematic-player";
import { SAMPLES } from "./samples";
import { DURATION, EV, SHOT_TIMES, T } from "../timeline";
import { voiceCues } from "../voiceCues";

/**
 * The sound score as data. Physical rules it follows:
 *  · rooms have air, so steps/doors/knocks are airborne, and the basement is a
 *    reverberant concrete box (see the `gun-room` and `step-basement` factories);
 *  · once the airlock has vented (t ≥ 185.6) there is no air — nothing outside the
 *    suit is ever heard. Zhang hears his fan, his breath, his pulse, and what
 *    travels through the suit: recoil thumps, a conducted thruster rumble;
 *  · the thirty shots are therefore *thumps in the hand*, not bangs;
 *  · the men being struck are seen but never heard.
 */
const cues: SoundCue[] = [];
let seq = 0;

interface Opts {
  gain?: number;
  group?: "sfx" | "foley" | "amb" | "music";
  sustain?: boolean;
  /** Explicit duration (factories); samples default to their real length. */
  dur?: number;
}

function add(sound: string, start: number, o: Opts = {}): void {
  const sample = SAMPLES[sound];
  const rate = sample?.opts?.playbackRate ?? 1;
  const dur = o.dur ?? (sample ? sample.dur / rate + 0.03 : 1);
  cues.push({
    id: `sfx-${String(++seq).padStart(3, "0")}`,
    kind: "sound",
    sound,
    group: o.group ?? "sfx",
    gain: o.gain ?? 1,
    sustain: o.sustain ?? false,
    start: Math.max(0, start),
    end: Math.min(DURATION, Math.max(start, 0) + dur),
  });
}

const bed = (sound: string, a: number, b: number, gain = 1, group: Opts["group"] = "amb"): void =>
  add(sound, a, { dur: b - a, gain, group, sustain: true });

/** Footfalls exactly on the walk cycle's contact frames: t = (¼ + ½m) / speed. */
function steps(a: number, b: number, speed: number, kind: "concrete" | "wood" | "snow" | "metal" | "basement", gain: number): void {
  let variant = 0;
  for (let m = Math.ceil(speed * a * 2 - 0.5); ; m++) {
    const t = (0.25 + 0.5 * m) / speed;
    if (t >= b) break;
    if (t < a) continue;
    if (kind === "basement") add("step-basement", t, { dur: 2.8, gain, group: "foley" });
    else if (kind === "metal") add("step-metal", t, { gain, group: "foley" });
    else add(`step-${kind}-${variant++ % 4}`, t, { gain, group: "foley" });
  }
}

// ── 序 · orbit ────────────────────────────────────────────────────────────────
bed("suit-loop", 0.0, 18.2, 0.8);
bed("pad-cold", 0.4, 18.6, 0.55, "music");
add("heart-slow", 13.0, { dur: 4.6, gain: 0.35 });
add("title-sting", T.title[0], { dur: 4.6, gain: 0.9, group: "music" });

// ── 一 · the hutong and the house ────────────────────────────────────────────────
bed("amb-alley", 21.6, 28.9, 0.95);
add("motif-warm-a", 22.4, { dur: 7.4, gain: 0.55, group: "music" });
steps(T.a1[0], T.a1[1] - 0.2, 0.9, "concrete", 0.38);
add("wood-knock-a", EV.knock1, { gain: 0.8, group: "foley" });
add("wood-knock-b", EV.knock2, { gain: 0.85, group: "foley" });
bed("amb-room", 28.3, 62.3, 0.9);
add("switch-b", 28.7, { gain: 0.5, group: "foley" });
add("radio-static", 28.7, { dur: 5.3, gain: 0.85, sustain: false });
add("wood-knock-a", EV.knock3, { gain: 0.4, group: "foley" });
add("radio-static", 36.4, { dur: 5.5, gain: 0.85 });
add("door-open-a", EV.doorOpen - 0.1, { gain: 0.6, group: "foley" });
add("plank", EV.doorOpen + 0.05, { gain: 0.16, group: "foley" });
steps(37.0, 38.9, 0.8, "wood", 0.5);
add("wood-light", 42.05, { gain: 0.3, group: "foley" });
add("motif-warm-b", 44.8, { dur: 6.0, gain: 0.5, group: "music" });
add("wood-light", 50.3, { gain: 0.26, group: "foley" });
add("wood-light", 50.42, { gain: 0.22, group: "foley" });
add("pour", 50.5, { dur: 2.3, gain: 0.9, group: "foley" });
add("glass-a", 52.9, { gain: 0.4, group: "foley" });
add("glass-b", 56.45, { gain: 0.3, group: "foley" });
bed("amb-snow", 61.8, 67.4, 1.0);
add("motif-warm-a", 62.0, { dur: 6.5, gain: 0.5, group: "music" });
steps(T.a10[0], T.a10[1], 0.7, "snow", 0.28);
add("stone-tap", 66.0, { gain: 0.14, group: "foley" });
bed("amb-room", 66.9, 110.4, 0.9);
add("stone-tap", 67.6, { gain: 0.12, group: "foley" });
add("glass-a", 72.45, { gain: 0.2, group: "foley" });
add("glass-b", 75.25, { gain: 0.3, group: "foley" });
add("switch-c", 81.25, { gain: 0.35, group: "foley" });
add("safe-a", 81.85, { gain: 0.5, group: "foley" });
add("door-heavy", 81.95, { gain: 0.35, group: "foley" });
add("soft-a", 83.4, { gain: 0.25, group: "foley" });
for (const [t, g] of [[92.1, 0.55], [92.8, 0.55], [93.4, 0.6]] as const) {
  add("soft-a", t, { gain: g, group: "foley" });
  add("stone-tap", t + 0.03, { gain: 0.16, group: "foley" });
}
add("blip", 96.4, { gain: 0.35, group: "foley" });
add("chime-pay", EV.payment, { dur: 1.3, gain: 0.55 });
add("cloth", 105.7, { dur: 0.5, gain: 0.6, group: "foley" });
add("cloth", 107.0, { dur: 0.5, gain: 0.5, group: "foley" });
add("soft-a", 107.5, { gain: 0.35, group: "foley" });
steps(108.5, 110.0, 0.8, "wood", 0.5);
add("motif-warm-b", 101.4, { dur: 6.5, gain: 0.45, group: "music" });

// ── 二 · the workshop ──────────────────────────────────────────────────────────
bed("amb-shop", 110.0, 137.6, 0.9);
add("door-open-b", 110.35, { gain: 0.6, group: "foley" });
add("switch-b", 110.95, { gain: 0.7, group: "foley" });
add("zap", 111.0, { dur: 1.5, gain: 0.55 });
steps(110.4, 113.6, 0.85, "concrete", 0.45);
add("soft-heavy", 113.7, { gain: 0.3, group: "foley" });
add("tool-a", 115.55, { gain: 0.4, group: "foley" });
for (const t of [116.05, 116.2, 116.36]) add("tool-click", t, { gain: 0.5, group: "foley" });
for (const t of [117.85, 118.05, 118.25]) add("blip", t, { gain: 0.4, group: "foley" });
add("machine-hum", 118.4, { dur: 12.0, gain: 0.12 });
add("cnc-spinup", 119.35, { dur: 0.95, gain: 0.6 });
add("cnc-grind", 120.2, { dur: 5.4, gain: 0.7 });
add("sparks", 120.4, { dur: 4.7, gain: 0.55 });
add("coolant", 120.2, { dur: 5.0, gain: 0.7 });
add("seg-ticks", 126.4, { dur: T.b4[1] - 126.4 - 0.7, gain: 0.85 });
add("tool-click", 127.55, { gain: 0.25, group: "foley" });
add("tool-click", 128.7, { gain: 0.25, group: "foley" });
add("blip", 129.85, { gain: 0.5, group: "foley" });
add("blip", 130.05, { gain: 0.5, group: "foley" });
add("brush", 130.6, { dur: 2.6, gain: 0.9, group: "foley" });
add("switch-a", 133.7, { gain: 0.35, group: "foley" });
add("tool-b", 134.0, { gain: 0.45, group: "foley" });
add("cloth", 135.0, { dur: 0.5, gain: 0.4, group: "foley" });
add("switch-b", 135.85, { gain: 0.7, group: "foley" });
add("zap", 135.95, { dur: 1.5, gain: 0.6 });
steps(135.8, 138.2, 0.85, "concrete", 0.45);
add("door-close-b", 138.1, { gain: 0.65, group: "foley" });

// ── 二 · the cellar ──────────────────────────────────────────────────────────────
bed("amb-basement", 138.5, 157.7, 0.9);
add("drone-swell", 138.6, { dur: 19.1, gain: 0.7, group: "music" });
add("door-close-a", 140.85, { gain: 0.45, group: "foley" });
steps(138.9, 142.1, 0.75, "basement", 0.9);
add("bulb-click", 141.55, { dur: 1.2, gain: 0.9 });
add("zap", 141.7, { dur: 0.9, gain: 0.3 });
add("pliers-run", 143.6, { dur: 4.7, gain: 0.85 });
add("glue-run", 149.7, { dur: 4.8, gain: 0.85 });
for (const t of [155.5, 155.75, 156.0, 156.25]) add("tool-click", t, { gain: 0.55, group: "foley" });
add("switch-d", 156.55, { gain: 0.6, group: "foley" });
add("switch-c", 157.05, { gain: 0.6, group: "foley" });
for (const t of EV.testShots) add("gun-room", t, { dur: 3.4, gain: 1.0 });
bed("amb-basement-muffled", 157.6, 165.6, 0.9);
add("tinnitus", 157.8, { dur: 6.4, gain: 0.7 });
steps(161.7, 163.8, 0.8, "basement", 0.55);
add("cloth", 164.35, { dur: 0.5, gain: 0.5, group: "foley" });
for (const t of [165.2, 165.5, 165.8]) add("soft-a", t, { gain: 0.5, group: "foley" });
add("stone-tap", 167.7, { gain: 0.1, group: "foley" });
bed("amb-basement", 164.6, 175.4, 0.55);
add("case-run", 171.0, { dur: 1.7, gain: 0.7 });
add("plate-light", 173.3, { gain: 0.6, group: "foley" });
add("bulb-click", 174.95, { dur: 1.0, gain: 0.9 });

// ── 三 · the void ────────────────────────────────────────────────────────────────
bed("amb-cabin", 176.0, 185.6, 0.85);
add("locator-tick", 176.0, { dur: 7.0, gain: 0.5 });
add("soft-a", 180.55, { gain: 0.4, group: "foley" });
add("chirp", 180.6, { gain: 0.16, group: "foley" });
steps(183.0, 184.7, 0.75, "metal", 0.3);
add("door-close-b", 184.05, { gain: 0.6, group: "foley" });
add("safe-a", 184.1, { gain: 0.5, group: "foley" });
add("field-hum", 184.2, { gain: 0.35 });
add("alarm-beeps", 184.3, { dur: 1.3, gain: 0.55 });
add("depress-hiss", 184.6, { dur: 2.6, gain: 0.95 });
add("suit-burn", 185.5, { dur: 2.0, gain: 0.3 });
add("suit-burn", 187.15, { dur: 1.2, gain: 0.22 });
bed("suit-loop", 187.4, 318.4, 1.0);
bed("pad-cold", 191.0, 288.4, 0.7, "music");
add("motif-minor", 233.4, { dur: 8.4, gain: 0.5, group: "music" });

// the photo call arrives by radio only — the audience alone hears it
const radioCues = ["vc-030", "vc-031", "vc-032", "vc-033", "vc-039"];
for (const id of radioCues) {
  const v = voiceCues.find((c) => c.id === id)!;
  add("squelch-open", v.start - 0.08, { dur: 0.2, gain: 0.5 });
  add("squelch-close", v.end, { dur: 0.25, gain: 0.5 });
}

add("switch-c", 261.8, { gain: 0.22, group: "foley" });
add("soft-a", EV.gloveOff, { gain: 0.18, group: "foley" });
for (let k = 0; k < 8; k++) add("click-a", 263.4 + k * 0.43, { gain: 0.3, group: "foley" });
add("switch-c", 264.2, { gain: 0.5, group: "foley" });
add("metal-a", 265.1, { gain: 0.5, group: "foley" });
add("switch-d", 266.0, { gain: 0.5, group: "foley" });
add("tool-a", 267.35, { gain: 0.22, group: "foley" });
add("metal-a", 269.1, { gain: 0.3, group: "foley" });
add("switch-b", 269.13, { gain: 0.3, group: "foley" });
add("switch-d", 269.65, { gain: 0.24, group: "foley" });

add("heart-slow", 271.0, { dur: 14.6, gain: 0.32 });
// thirty recoils, felt not heard
for (const t of SHOT_TIMES) add("gun-thump", t, { dur: 0.3, gain: 0.85 });
add("switch-d", 280.4, { gain: 0.26, group: "foley" });
add("tool-click", 280.78, { gain: 0.3, group: "foley" });
add("switch-d", 283.1, { gain: 0.26, group: "foley" });
add("tool-click", 283.48, { gain: 0.3, group: "foley" });
add("heart-fast", 285.6, { dur: 16.6, gain: 0.5 });
add("sub-boom", EV.fireStart[0] + EV.flight, { dur: 1.7, gain: 0.7 });
add("tinnitus", 289.4, { dur: 12.6, gain: 0.55 });
add("suit-burn", 302.4, { dur: 4.6, gain: 0.7 });
bed("pad-warm", 301.8, 318.4, 0.8, "music");
add("motif-warm-b", 309.4, { dur: 6.2, gain: 0.55, group: "music" });

// ── 尾声 · the house, hours later ────────────────────────────────────────────────
bed("amb-room-night", 318.8, 337.6, 0.9);
add("switch-b", 320.8, { gain: 0.4, group: "foley" });
add("radio-static", 320.8, { dur: 7.4, gain: 0.85 });
add("motif-minor", 329.2, { dur: 8.4, gain: 0.5, group: "music" });

export const soundCues: SoundCue[] = cues.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
