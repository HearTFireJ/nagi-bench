// 预览：装配整部影片（或部分序列），在指定时间点渲染帧到 preview/*.png，并可生成联系表。
// 用法： bun run scripts/preview.ts [--only open,space] [--sheet name] t1 t2 t3 ...
import "./fakedom";
import fs from "node:fs";
import { SoftRenderer, contactSheet, encodePNG } from "./softrender";
import { buildFilm } from "../src/film/build";

const args = process.argv.slice(2);
let only: string[] | undefined;
let sheet = "";
let width = 800;
const times: number[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--only") only = args[++i].split(",");
  else if (args[i] === "--sheet") sheet = args[++i];
  else if (args[i] === "--w") width = Number(args[++i]);
  else if (args[i].includes("..")) {
    // 区间：a..b..step
    const [a, b, s] = args[i].split("..").map(Number);
    for (let t = a; t <= b + 1e-6; t += s || 1) times.push(t);
  } else times.push(Number(args[i]));
}

const W = width;
const H = Math.round(W / 2.35);
const r = new SoftRenderer({ width: W, height: H });

const t0 = performance.now();
const film = buildFilm({ only });
console.log("film build ms", (performance.now() - t0).toFixed(0), "duration", film.player.duration);

fs.mkdirSync("preview", { recursive: true });
const frames: Uint8Array[] = [];
for (const t of times) {
  const s = performance.now();
  film.player.seek(t);
  film.renderFrame(r);
  const rgb = r.toRGB8();
  frames.push(rgb);
  if (!sheet) fs.writeFileSync(`preview/f_${String(t).replace(".", "_")}.png`, encodePNG(W, H, rgb, 3));
  const cues = film.player.getActiveCues().filter((c) => (c as { speaker?: string }).speaker).map((c) => `【${(c as unknown as { speaker: string }).speaker}】${(c as unknown as { text: string }).text}`);
  console.log(`t=${t}`, `${(performance.now() - s).toFixed(0)}ms`, cues.join(" | "));
}
if (sheet) {
  const cols = Math.min(3, frames.length);
  const { data, w, h } = contactSheet(frames, W, H, cols);
  fs.writeFileSync(`preview/${sheet}.png`, encodePNG(w, h, data, 3));
  console.log("sheet ->", `preview/${sheet}.png`);
}
