import "./shim";
import { mkdirSync, writeFileSync } from "node:fs";
import { encodePNG, render } from "./raster";
import { createFilm, fadeAt } from "../src/film";

mkdirSync("out", { recursive: true });
const CW = 480;
const CH = 270;
const COLS = 3;
const overlay = { scope() {}, lens() {}, title() {}, fade() {}, flash() {} };
const film = createFilm(overlay as never, []);
const name = process.argv[2]!;
const times = process.argv.slice(3).map(Number);
const rows = Math.ceil(times.length / COLS);
const W = CW * COLS;
const H = CH * rows;
const sheet = new Uint8Array(W * H * 3);
times.forEach((t, k) => {
  film.player.seek(t);
  const rgb = render(film.ctx.scene, film.ctx.camera, CW, CH);
  const shot = film.shots.find((d) => t >= d.start && t < d.end);
  if (shot?.scope) {
    const r = 0.38 * CH;
    for (let y = 0; y < CH; y++)
      for (let x = 0; x < CW; x++) {
        const d = Math.hypot(x - CW / 2, y - CH / 2);
        const i = (y * CW + x) * 3;
        if (d > r) rgb[i] = rgb[i + 1] = rgb[i + 2] = 0;
        else if (Math.abs(x - CW / 2) < 0.6 || Math.abs(y - CH / 2) < 0.6) rgb[i] = rgb[i + 1] = rgb[i + 2] = 20;
      }
  }
  const f = fadeAt(t);
  if (f > 0) for (let i = 0; i < rgb.length; i++) rgb[i] = Math.round(rgb[i]! * (1 - f));
  const cx = (k % COLS) * CW;
  const cy = Math.floor(k / COLS) * CH;
  for (let y = 0; y < CH; y++) sheet.set(rgb.subarray(y * CW * 3, (y + 1) * CW * 3), ((cy + y) * W + cx) * 3);
  // label tick marks so the frame can be identified: draw a small bar whose length encodes nothing, print to console instead
  console.log(k, t, shot?.id ?? "-");
});
writeFileSync(`out/sheet_${name}.png`, encodePNG(W, H, sheet));
