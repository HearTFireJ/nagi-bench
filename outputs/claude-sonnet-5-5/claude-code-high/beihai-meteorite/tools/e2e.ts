// End-to-end drill without a browser: boots the real src/main.ts against a mini DOM, a fake renderer and a mocked
// Web Audio graph, then presses Play, lets the clock run, pauses, seeks, resumes and reads the subtitles back.
import { mock } from "bun:test";
import "./shim";
import * as REAL from "three";
import { installDom } from "./dom";
import { FakeCanvas } from "./shim";
import { MockContext } from "./audio-mock";

const { document, window } = installDom();
window.AudioContext = MockContext;
let pending: FrameRequestCallback | null = null;
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
  pending = cb;
  return 1;
};
(globalThis as any).cancelAnimationFrame = () => {
  pending = null;
};

let frames = 0;
class FakeRenderer {
  domElement = new FakeCanvas();
  shadowMap = { enabled: false, type: 0 };
  toneMapping = 0;
  toneMappingExposure = 1;
  setSize() {}
  setPixelRatio() {}
  render() {
    frames++;
  }
  dispose() {}
}
mock.module("three", () => ({ ...REAL, WebGLRenderer: FakeRenderer }));
const fake = "data:audio/ogg;base64,T2dnUw==";
mock.module("/workspace/src/audiofiles.ts", () => ({ audioFiles: new Proxy({}, { get: () => fake }) }));

const errors: string[] = [];
const origError = console.error;
console.error = (...a: unknown[]) => {
  errors.push(a.map(String).join(" "));
  origError(...a);
};
process.on("uncaughtException", (e) => {
  errors.push(String(e));
  origError("UNCAUGHT", e);
});

const t0 = Date.now();
try {
  await import("../src/main.ts");
} catch (e) {
  origError("BOOT FAILED", e);
  process.exit(1);
}
console.log("boot ms", Date.now() - t0, "renders during warm-up", frames);
const film = (window as any).film;
const player = film.player;
const q = (s: string) => document.body.querySelector(s) as any;
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));
const run = (seconds: number) => {
  let now = performance.now();
  const end = now + seconds * 1000;
  // drive requestAnimationFrame by hand at 60 fps of virtual time
  let ts = 1000;
  while (ts < 1000 + seconds * 1000) {
    if (!pending) break;
    const cb = pending;
    pending = null;
    ts += 1000 / 60;
    cb(ts);
  }
  void now;
  void end;
};
const subtitle = () => q(".ab-cinematic-subtitle").textContent;

console.log("initial state", player.state, "t", player.currentTime.toFixed(2), "play button visible", !q(".mr-play").classList.contains("hide"));
console.log("first-frame shot active:", player.getCues().length, "cues; DOM nodes in overlay:", q(".mr-layer") ? "ok" : "missing");

// 1) real Play click through the overlay's big button
q(".mr-play").click();
await tick(30);
console.log("after Play click → state", player.state, "audio ctx unlocked:", true);
run(0.01);
console.log("state after first frame:", player.state);

// advance ~6 s of playback frame by frame
let last = player.currentTime;
let ts = 1000;
let monotone = true;
for (let i = 0; i < 360; i++) {
  if (!pending) {
    console.log("rAF chain broke at frame", i, "t=", player.currentTime);
    break;
  }
  const cb = pending;
  pending = null;
  ts += 1000 / 60;
  cb(ts);
  if (player.currentTime < last) monotone = false;
  last = player.currentTime;
}
console.log("played to t =", player.currentTime.toFixed(2), "monotone:", monotone, "subtitle:", JSON.stringify(subtitle()), "hide play button:", q(".mr-play").classList.contains("hide"));

// 2) pause
q('[data-action="play"]').click();
await tick(10);
const paused = player.currentTime;
console.log("paused →", player.state, "t", paused.toFixed(2));
if (pending) {
  const cb = pending;
  pending = null;
  cb(ts + 16);
}
console.log("t after a stray frame (should be unchanged):", player.currentTime.toFixed(2));

// 3) seek by dragging the range input
const seek = q('[data-action="seek"]');
for (const target of [50.5, 76.5, 178, 253, 300, 309.6, 330, 349.5]) {
  seek.value = String(target);
  seek.dispatch("input");
  const sub = subtitle();
  console.log("seek", target, "→ t", player.currentTime.toFixed(2), "subtitle", JSON.stringify(sub), "scope", q(".mr-scope").style.opacity, "fade", q(".mr-fade").style.opacity, "title", q(".mr-title").style.opacity);
}

// 4) resume from a seek and play through the end of the film
seek.value = "340";
seek.dispatch("input");
q('[data-action="play"]').click();
await tick(30);
let n = 0;
while (pending && n < 3000) {
  const cb = pending;
  pending = null;
  ts += 1000 / 60;
  cb(ts);
  n++;
}
console.log("resumed and ran", n, "frames → state", player.state, "t", player.currentTime.toFixed(2), "play button symbol", q(".mr-play").textContent);

// 5) replay from the end
q(".mr-play").click();
await tick(30);
console.log("replay → state", player.state, "t", player.currentTime.toFixed(2));
player.pause();

console.log("renders:", frames, "console errors:", errors.length);
for (const e of errors.slice(0, 8)) console.log(" !", e);
process.exit(0);
