// Offline verification for a sandbox without a browser: the REAL player, shots, cues and
// overlays are driven through the whole timeline and checked.  bun run check
import { installDomStub } from "./dom-stub";
installDomStub();
import * as THREE from "three";

const { createFilm } = await import("../src/film");
const { DURATION, T } = await import("../src/timeline");
const { voiceCues } = await import("../src/voiceCues");
const { soundCues } = await import("../src/audio/soundCues");
const { SAMPLES } = await import("../src/audio/samples");
const { createSoundDesign, FACTORY_NAMES } = await import("../src/audio/engine");
const { overlayAt } = await import("../src/overlay");

let failures = 0;
const fail = (msg: string): void => {
  failures++;
  console.log("  ✗", msg);
};
const ok = (msg: string): void => console.log("  ✓", msg);

console.log("── structure");
if (DURATION > 360) fail(`duration ${DURATION}s exceeds 360s`);
else ok(`duration ${DURATION}s (limit 360s)`);

const film = createFilm();
const { player } = film;
const shots = [...player.getShots()];
ok(`${shots.length} shots, ${voiceCues.length} voice cues, ${soundCues.length} sound cues`);

// every second of the film is covered by at least one shot, apart from deliberate black gaps
const gaps: Array<[number, number]> = [];
let cursor = 0;
for (const s of [...shots].sort((a, b) => a.start - b.start)) {
  if (s.start > cursor + 0.001) gaps.push([cursor, s.start]);
  cursor = Math.max(cursor, s.end);
}
if (cursor < DURATION) gaps.push([cursor, DURATION]);
const allowed = (_g: [number, number]): boolean => false;
const bad = gaps.filter((g) => !allowed(g));
if (bad.length) fail(`uncovered spans: ${bad.map((g) => g.map((x) => x.toFixed(2)).join("–")).join(", ")}`);
else ok(`every second is covered by a shot (title/end black are explicit shots too)`);

console.log("── speech manifest");
const fields = ["id", "kind", "speaker", "text", "delivery", "start", "end"];
for (const c of voiceCues) {
  const keys = Object.keys(c).sort().join(",");
  if (keys !== [...fields].sort().join(",")) fail(`${c.id} fields: ${keys}`);
  if (c.end <= c.start) fail(`${c.id} has non-positive duration`);
  if (c.end > DURATION) fail(`${c.id} beyond the end`);
  const cps = c.text.length / (c.end - c.start);
  if (cps > 8.5) fail(`${c.id} too fast to read: ${cps.toFixed(1)} chars/s`);
}
const sorted = [...voiceCues].sort((a, b) => a.start - b.start);
for (let i = 1; i < sorted.length; i++) {
  if (sorted[i]!.start < sorted[i - 1]!.end) fail(`${sorted[i - 1]!.id} overlaps ${sorted[i]!.id}`);
}
const maxCps = Math.max(...voiceCues.map((c) => c.text.length / (c.end - c.start)));
ok(`${voiceCues.length} cues, fields exact, no overlaps, slowest read ${maxCps.toFixed(1)} chars/s`);

console.log("── sound cues");
createSoundDesign(player); // registers factories (no AudioContext needed)
const known = new Set([...Object.keys(SAMPLES), ...FACTORY_NAMES]);
const unknown = new Set<string>();
for (const c of soundCues) if (!known.has(c.sound)) unknown.add(c.sound);
if (unknown.size) fail(`undefined sounds: ${[...unknown].join(", ")}`);
else ok(`every cue resolves to a real sample or a factory (${known.size} sounds available)`);
for (const c of soundCues) if (c.end > DURATION + 1e-6 || c.end <= c.start) fail(`${c.id} bad interval`);
// in vacuum (after the airlock has vented) nothing airborne may play
const airborne = new Set(["gun-room", "step-basement", "door-open-a", "door-open-b", "door-close-a", "door-close-b", "wood-knock-a", "wood-knock-b", "glass-a", "glass-b", "pour", "radio-static"]);
const bad2 = soundCues.filter((c) => airborne.has(c.sound) && c.start > 187.4 && c.start < 318.4);
if (bad2.length) fail(`airborne sounds inside vacuum: ${bad2.map((c) => `${c.sound}@${c.start}`).join(", ")}`);
else ok("no airborne sound plays while the film is in vacuum (187.4–318.4 s)");
const shotThumps = soundCues.filter((c) => c.sound === "gun-thump").length;
if (shotThumps !== 30) fail(`expected 30 conducted recoil thumps, got ${shotThumps}`);
else ok("30 shots → 30 suit-conducted recoil thumps, zero bangs in vacuum");

console.log("── playback (forward, every 1/12 s) and determinism");
type Snap = { cam: number[]; actors: number[]; vis: string };
const snap = (): Snap => {
  const cam = film.camera;
  const actors: number[] = [];
  for (const a of film.ctx.cast.all) {
    if (a.root.visible) actors.push(a.root.position.x, a.root.position.y, a.root.position.z, a.root.rotation.x, a.root.rotation.y);
    for (const j of ["hips", "neck", "armR", "armL", "legR", "legL"] as const) {
      if (a.root.visible) actors.push(a.fig.joints[j].rotation.x, a.fig.joints[j].rotation.y, a.fig.joints[j].rotation.z);
    }
  }
  return {
    cam: [cam.position.x, cam.position.y, cam.position.z, cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w, cam.fov],
    actors,
    vis: film.scene.children.filter((c) => c.visible).length.toString(),
  };
};
const forward = new Map<number, Snap>();
let worst = 0;
let slowest = { t: 0, ms: 0 };
const t0 = performance.now();
player.seek(0);
for (let k = 0; k * (1 / 12) <= DURATION; k++) {
  const t = Math.min(DURATION, k / 12);
  const s0 = performance.now();
  try {
    player.seek(t);
  } catch (error) {
    fail(`exception at t=${t.toFixed(2)}: ${(error as Error).message}`);
    break;
  }
  const dt = performance.now() - s0;
  if (dt > slowest.ms) slowest = { t, ms: dt };
  worst = Math.max(worst, dt);
  const o = overlayAt(t);
  if (!(o.fade >= 0 && o.fade <= 1)) fail(`overlay fade out of range at ${t}`);
  if (k % 24 === 0) forward.set(t, snap());
  const active = voiceCues.filter((c) => t >= c.start && t < c.end).length;
  if (active > 1) fail(`two subtitles at t=${t.toFixed(2)}`);
}
ok(`stepped ${Math.floor(DURATION * 12)} frames without an exception in ${((performance.now() - t0) / 1000).toFixed(1)} s (slowest update ${slowest.ms.toFixed(0)} ms at t=${slowest.t.toFixed(1)})`);

// jump around in a scrambled order, then compare with the forward pass
const order = [...forward.keys()].sort((a, b) => ((a * 7919) % 101) - ((b * 7919) % 101));
let mismatches = 0;
for (const t of order) {
  player.seek(t);
  const a = forward.get(t)!;
  const b = snap();
  const same = (x: number[], y: number[]): boolean => x.length === y.length && x.every((v, i) => Math.abs(v - y[i]!) < 1e-6);
  if (!same(a.cam, b.cam) || !same(a.actors, b.actors) || a.vis !== b.vis) {
    mismatches++;
    if (mismatches <= 3) fail(`seek(${t}) differs between forward play and a jump`);
  }
}
if (!mismatches) ok(`${order.length} scrambled seeks reproduce the forward-play state exactly (camera, poses, visibility)`);

// step() path, as used when scrubbing
player.seek(100);
for (let i = 0; i < 48; i++) player.step(1 / 24);
if (Math.abs(player.currentTime - 102) > 1e-6) fail("step() drifted");
else ok("step() advances exactly");

console.log("── shots");
const perShot = shots.map((s) => `${s.id}(${(s.end - s.start).toFixed(1)}s)`);
console.log("  " + perShot.join(" "));
const dur = shots.map((s) => s.end - s.start);
ok(`shortest shot ${Math.min(...dur).toFixed(2)} s, longest ${Math.max(...dur).toFixed(1)} s, mean ${(dur.reduce((a, b) => a + b, 0) / dur.length).toFixed(2)} s`);
void THREE; void T;

console.log(failures ? `\n${failures} problem(s)` : "\nall checks passed");
if (failures) process.exit(1);
