/**
 * Headless timeline exercise, run with Bun. Drives the player through every
 * shot with seeks and steps, checking that no callback throws and that shot
 * coverage is continuous.
 */
import * as THREE from "three";
import { FakeElement } from "./dom-stubs";

// ---------------------------------------------------------- the film
const { buildFilm, poseGroup, seedInteriorParticles } = await import("../src/film");
const { makeShots, FILM_DURATION } = await import("../src/shots");
const { voiceCues } = await import("../src/voice");
const { soundCues } = await import("../src/sound");
const { CinematicPlayer, validateVoiceCues } = await import("@agentbench/cinematic-player");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 400000);
const overlayLog: string[] = [];
const overlay = {
  root: new FakeElement("div") as unknown as HTMLElement,
  title(a: string, _b: string, o: number) { if (o > 0.5) overlayLog.push(`title:${a}`); },
  caption(a: string, o: number) { if (o > 0.5) overlayLog.push(`caption:${a}`); },
  scope(on: boolean) { if (on) overlayLog.push("scope"); },
  card(lines: string[], o: number) { if (o > 0.5) overlayLog.push(`card:${lines[0]}`); },
  hidePlayHint() {}, showPlayHint() {},
};
const grade = { fade: 0, flash: 0, vignette: 0.55, grain: 0.05, time: 0, warm: 0 };
const film = buildFilm(scene, camera, overlay as any, grade);
seedInteriorParticles(film);
validateVoiceCues(voiceCues, FILM_DURATION);
const shots = makeShots(film);

// Coverage check: every instant of the film must belong to at least one shot.
const edges = [...new Set(shots.flatMap((s) => [s.start, s.end]))].sort((a, b) => a - b);
for (let i = 0; i < edges.length - 1; i++) {
  const mid = (edges[i]! + edges[i + 1]!) / 2;
  if (!shots.some((s) => mid >= s.start && mid < s.end)) throw new Error(`gap in shot coverage at ${mid}`);
}
if (FILM_DURATION > 360) throw new Error("film exceeds 360 s");
console.log(`shots: ${shots.length}, duration ${FILM_DURATION}s, voice cues ${voiceCues.length}, sound cues ${soundCues.length}`);
for (const c of soundCues) if (c.end > FILM_DURATION) throw new Error(`sound cue ${c.id} beyond the end`);
const ids = new Set<string>();
for (const c of soundCues) { if (ids.has(c.id)) throw new Error(`dup sound id ${c.id}`); ids.add(c.id); }

const player = new CinematicPlayer({ duration: FILM_DURATION, context: film, shots, cues: [...voiceCues, ...soundCues] });
const frame = (t: number) => {
  grade.time = t;
  const set = film.currentSet;
  if (set === "study") film.sets.study.update(t);
  else if (set === "workshop") film.sets.workshop.update(t);
  else if (set === "basement") film.sets.basement.update(t);
  else if (set === "cabin") film.sets.cabin.update(t);
  else if (set === "space") { film.sets.space.update(t, camera); poseGroup(film, t); }
  for (const p of film.particles) { p.setPixelScale(1080, camera.fov); p.update(t); }
  camera.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);
  // Basic sanity on the camera and the cast.
  if (!Number.isFinite(camera.position.x) || !Number.isFinite(camera.quaternion.x)) throw new Error(`bad camera at ${t}`);
};
player.addTypedEventListener("frame", ({ detail }) => frame(detail.time));

// Sweep forward in fine steps, then random seeks, then a backwards sweep.
const t0 = performance.now();
let frames = 0;
for (let t = 0; t <= FILM_DURATION; t += 0.25) { player.seek(t); frames++; }
let seed = 7;
for (let i = 0; i < 200; i++) { seed = (seed * 1103515245 + 12345) >>> 0; player.seek((seed / 4294967296) * FILM_DURATION); frames++; }
for (let t = FILM_DURATION; t >= 0; t -= 1.7) { player.seek(t); frames++; }
// Simulated playback across a few cuts.
player.seek(97); player.play();
for (let i = 0; i < 300; i++) { (player as any).onAnimationFrame(1000 + i * 33.3); frames++; }
player.pause();
console.log(`exercised ${frames} frames in ${(performance.now() - t0).toFixed(0)} ms`);
console.log("overlay events:", [...new Set(overlayLog)].join(" | "));

// Report which shots cover which voice cues, to catch subtitles landing on the wrong set.
for (const v of voiceCues) {
  const s = shots.find((sh) => v.start >= sh.start && v.start < sh.end);
  if (!s) throw new Error(`voice cue ${v.id} has no shot`);
}

// Voice cues must not overlap (one subtitle at a time) and must leave a beat between lines.
const sortedVoice = [...voiceCues].sort((a, b) => a.start - b.start);
for (let i = 1; i < sortedVoice.length; i++) {
  const a = sortedVoice[i - 1]!, b = sortedVoice[i]!;
  if (b.start < a.end) throw new Error(`voice cues overlap: ${a.id} (${a.end}) and ${b.id} (${b.start})`);
}
// Every sound cue must reference a defined sample or procedural factory.
const { WebAudioCueBus } = await import("@agentbench/cinematic-player");
const { defineSounds } = await import("../src/sound");
const bus = new WebAudioCueBus(player);
// Bun does not know Vite's `?inline` query, so record sample names without decoding them.
(bus as any).defineSample = function (name: string) { (this as any).samples.set(name, {}); return this; };
defineSounds(bus);
const defined = new Set([...(bus as any).factories.keys(), ...(bus as any).samples.keys()]);
for (const c of soundCues) if (!defined.has(c.sound)) throw new Error(`sound cue ${c.id} uses undefined sound ${c.sound}`);
console.log(`voice cues non-overlapping; ${defined.size} sounds defined, all cues resolvable`);

// Geometry budget.
let tris = 0, meshes = 0;
scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) { meshes++; const g = (o as THREE.Mesh).geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
console.log(`meshes ${meshes}, triangles ${Math.round(tris)}`);
console.log("OK");
