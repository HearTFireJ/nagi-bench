import "./shim";
import * as THREE from "three";
import { WebAudioCueBus } from "@agentbench/cinematic-player";
import { createFilm } from "../src/film";
import { soundCues } from "../src/soundcues";
import { installAudio } from "../src/sound";
import { voiceCues } from "../src/voice";

// a promiscuous stand-in for Web Audio: every property is a callable, chainable node
const numeric = Symbol.toPrimitive;
function node(): any {
  const target = function () {};
  const store: Record<string | symbol, unknown> = {};
  return new Proxy(target, {
    get(_t, k) {
      if (k === "then") return undefined;
      if (k === numeric) return () => 0;
      if (k === "length") return 0;
      if (k === "sampleRate") return 48000;
      if (k === "duration") return 1;
      if (k in store) return store[k];
      return node();
    },
    set(_t, k, v) {
      store[k] = v;
      return true;
    },
    apply() {
      return node();
    },
  });
}
const calls: string[] = [];
class MockContext {
  state = "running";
  sampleRate = 48000;
  currentTime = 0;
  destination = node();
  constructor() {
    return new Proxy(this, {
      get(t, k) {
        if (k === "then") return undefined;
        if (k in t) return (t as any)[k];
        if (typeof k === "string") calls.push(k);
        if (k === "decodeAudioData") return async () => ({ duration: 1, getChannelData: () => new Float32Array(10) });
        if (k === "resume") return async () => {};
        if (k === "createBuffer") return () => ({ getChannelData: () => new Float32Array(100000), duration: 2, length: 100000 });
        return () => node();
      },
    });
  }
}
(globalThis as any).window.AudioContext = MockContext;

const overlay = {
  scope() {},
  lens() {},
  title() {},
  fade() {},
  flash() {},
};
const fake = "data:audio/ogg;base64,T2dnUw==";
const files = new Proxy({}, { get: () => fake }) as Record<string, string>;

const errors: string[] = [];
process.on("uncaughtException", (e) => errors.push(String(e)));
const film = createFilm(overlay as never, soundCues);
const { player, ctx } = film;
console.log("duration", player.duration, "shots", film.shots.length, "cues", film.cues.length, "voice", voiceCues.length);

console.error("film ok");
const audio = new WebAudioCueBus(player);
installAudio(audio, files);
console.error("installed");
await audio.unlock();
console.error("unlocked");

// 0) run every sound factory directly, at the start and mid-way (as after a seek), so a throw cannot hide in an event listener
{
  let failed = 0;
  for (const cue of soundCues) {
    for (const off of [0, (cue.end - cue.start) * 0.5]) {
      try {
        (audio as any).stop(cue.id);
        (audio as any).start(cue, off);
      } catch (e) {
        failed++;
        console.log("FACTORY THROW", cue.id, cue.sound, String(e));
      }
    }
  }
  console.log("factories run:", soundCues.length * 2, "failed:", failed);
  audio.stopAll();
}
// 1) walk the whole timeline forward, firing every sound cue through the mocked graph
let bad = 0;
const t0 = Date.now();
player.seek(0);
for (let t = 0; t < player.duration - 0.05; t += 0.1) {
  player.step(0.1);
  if (Math.round(t * 10) % 300 === 0) console.error("t", t.toFixed(1), Date.now() - t0);
  const p = ctx.camera.position;
  if (![p.x, p.y, p.z, ctx.camera.fov].every(Number.isFinite)) {
    bad++;
    console.log("bad camera at", t.toFixed(2), p.toArray(), ctx.camera.fov);
  }
  // any NaN in a visible figure transform?
  ctx.scene.traverse((o) => {
    if (!o.visible) return;
    const q = o.position;
    if (!Number.isFinite(q.x + q.y + q.z)) {
      bad++;
      console.log("NaN transform", o.name, "at", t.toFixed(2));
    }
  });
}
console.log("forward pass ms", Date.now() - t0, "bad", bad);

// 2) random seeks, backwards and forwards, must land in valid states
for (const t of [355.9, 0.2, 180, 40, 300, 12, 250, 120, 356, 0]) {
  player.seek(Math.min(t, player.duration));
  const p = ctx.camera.position;
  if (![p.x, p.y, p.z].every(Number.isFinite)) console.log("bad seek", t);
}

// 3) coverage: every second of the film is covered by exactly one main shot
const shots = film.shots;
for (let t = 0; t < player.duration; t += 0.25) {
  const n = shots.filter((s) => t >= s.start && t < s.end).length;
  if (n !== 1) console.log("shot coverage at", t, "=", n);
}

// 4) subtitle overlap
const v = [...voiceCues].sort((a, b) => a.start - b.start);
for (let i = 1; i < v.length; i++) if (v[i]!.start < v[i - 1]!.end) console.log("voice overlap", v[i - 1]!.id, v[i]!.id);
for (const c of v) {
  const cps = c.text.length / (c.end - c.start);
  if (cps > 6.3) console.log("fast line", c.id, cps.toFixed(1));
}
console.log("audio calls seen:", new Set(calls).size, "errors:", errors.length, errors.slice(0, 5));
void THREE;
process.exit(0);
