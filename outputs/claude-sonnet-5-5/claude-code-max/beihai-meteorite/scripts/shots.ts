// 为指定序列的每一个镜头渲染“中点帧”，拼成联系表，并按顺序打印镜头 id 与时间。
// 用法： bun run scripts/shots.ts <序列名> [--w 560] [--at 0.5] [--from N --to M]
import "./fakedom";
import fs from "node:fs";
import { SoftRenderer, contactSheet, encodePNG } from "./softrender";
import { buildFilm } from "../src/film/build";

const a = process.argv.slice(2);
const seq = a[0];
let W = 560;
let at = 0.5;
let from = 0;
let to = 1e9;
for (let i = 1; i < a.length; i++) {
  if (a[i] === "--w") W = Number(a[++i]);
  else if (a[i] === "--at") at = Number(a[++i]);
  else if (a[i] === "--from") from = Number(a[++i]);
  else if (a[i] === "--to") to = Number(a[++i]);
}
const H = Math.round(W / 2.35);
const r = new SoftRenderer({ width: W, height: H });
const film = buildFilm({ only: [seq] });
const shots = [...film.player.getShots()].filter((s) => s.id.length > 0).slice(from, to);
const frames: Uint8Array[] = [];
shots.forEach((s, i) => {
  const t = s.start + (s.end - s.start) * at;
  film.player.seek(t);
  film.renderFrame(r);
  frames.push(r.toRGB8());
  console.log(String(from + i).padStart(2, " "), s.id.padEnd(18), `${s.start.toFixed(1)}–${s.end.toFixed(1)}`, `@${t.toFixed(1)}`);
});
const cols = 3;
const { data, w, h } = contactSheet(frames, W, H, cols);
fs.mkdirSync("preview", { recursive: true });
fs.writeFileSync(`preview/shots_${seq}.png`, encodePNG(w, h, data, 3));
console.log("sheet -> preview/shots_" + seq + ".png");
