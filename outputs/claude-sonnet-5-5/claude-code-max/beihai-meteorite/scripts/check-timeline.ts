// 时间轴自检：整片装配后
//  1. 列出所有镜头（起止、时长），检查首尾相接、无空隙/无重叠；总时长 ≤ 360
//  2. 每 0.25 秒 seek 一次（含逆序跳转），检查抛错、相机/叠层数值是否为有限值
//  3. 语音清单：字段、重叠、字幕语速
import "./fakedom";
import { buildFilm } from "../src/film/build";
import { voiceCues } from "../src/voice/voiceCues";
import { TOTAL } from "../src/film/timing";

const t0 = performance.now();
const film = buildFilm();
console.log("build ms", (performance.now() - t0).toFixed(0), "duration", film.player.duration);

// ---- 1. 镜头 ----
const shots = [...film.player.getShots()];
let prevEnd = 0;
let gaps = 0;
for (const s of shots) {
  const gap = s.start - prevEnd;
  if (Math.abs(gap) > 1e-6) {
    gaps++;
    console.log("  !! gap/overlap", gap.toFixed(3), "before", s.id);
  }
  prevEnd = s.end;
}
console.log("shots", shots.length, "first", shots[0]?.start, "last end", prevEnd, "gaps", gaps);
if (prevEnd > TOTAL + 1e-6) console.log("  !! last shot ends after TOTAL", prevEnd, TOTAL);
if (film.player.duration > 360) console.log("  !! duration exceeds 360");

// ---- 2. seek 扫描 ----
let bad = 0;
const cam = film.ctx.camera;
const finite = (n: number) => Number.isFinite(n);
const check = (t: number) => {
  try {
    film.player.seek(t);
  } catch (e) {
    bad++;
    console.log("  !! seek threw at", t, String(e).slice(0, 200));
    return;
  }
  const p = cam.position;
  const q = cam.quaternion;
  if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w, cam.fov, cam.near, cam.far].every(finite)) {
    bad++;
    console.log("  !! non-finite camera at", t);
  }
  const o = film.ctx.overlay;
  if (![o.fade, o.flash, o.vignette, o.grain, o.scope, o.reticleX, o.reticleY].every(finite)) {
    bad++;
    console.log("  !! non-finite overlay at", t);
  }
  if (!film.ctx.world) {
    bad++;
    console.log("  !! no world at", t);
  }
};
const s0 = performance.now();
for (let t = 0; t < film.player.duration; t += 0.25) check(t);
check(film.player.duration - 0.001);
// 逆序、随机跳转
for (let i = 0; i < 200; i++) check(((i * 7919) % 3520) / 10);
console.log("seek sweep ms", (performance.now() - s0).toFixed(0), "bad", bad);

// ---- 3. 语音 ----
const ids = new Set<string>();
let over = 0;
let maxRate = 0;
const sorted = [...voiceCues].sort((a, b) => a.start - b.start);
for (let i = 0; i < sorted.length; i++) {
  const c = sorted[i];
  if (ids.has(c.id)) console.log("  !! duplicate id", c.id);
  ids.add(c.id);
  const dur = c.end - c.start;
  const rate = c.text.replace(/[，。！？、…—\s]/g, "").length / dur;
  maxRate = Math.max(maxRate, rate);
  if (rate > 6.2) console.log("  !! fast subtitle", c.id, rate.toFixed(2), "char/s", c.text);
  if (dur < 1.0) console.log("  !! very short cue", c.id, dur.toFixed(2));
  if (c.end > film.player.duration) console.log("  !! cue beyond duration", c.id);
  for (let j = i + 1; j < sorted.length && sorted[j].start < c.end; j++) {
    over++;
    console.log("  !! overlap", c.id, sorted[j].id);
  }
}
console.log("voice cues", voiceCues.length, "overlaps", over, "max char/s", maxRate.toFixed(2));
