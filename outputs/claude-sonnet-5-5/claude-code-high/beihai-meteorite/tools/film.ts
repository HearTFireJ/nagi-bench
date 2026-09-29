import "./shim";
import * as THREE from "three";
import { mkdirSync, writeFileSync } from "node:fs";
import { encodePNG, render } from "./raster";
import { createFilm, fadeAt } from "../src/film";

mkdirSync("out", { recursive: true });
const wArg = process.argv.find((a) => a.startsWith("px"));
const W = wArg ? Number(wArg.slice(2)) : 800;
const H = Math.round((W * 9) / 16);
const overlay = { scope() {}, lens() {}, title() {}, fade() {}, flash() {} };
const film = createFilm(overlay as never, []);
const times = process.argv.slice(2).filter((a) => !a.startsWith("px")).map(Number);
for (const t of times) {
  const t0 = Date.now();
  film.player.seek(t);
  const rgb = render(film.ctx.scene, film.ctx.camera, W, H);
  const shot = film.shots.find((d) => t >= d.start && t < d.end);
  if (shot?.scope) {
    const r = 0.38 * H;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - W / 2, y - H / 2);
        const i = (y * W + x) * 3;
        if (d > r) rgb[i] = rgb[i + 1] = rgb[i + 2] = 0;
        else if (Math.abs(x - W / 2) < 1 || Math.abs(y - H / 2) < 1) {
          rgb[i] = 20;
          rgb[i + 1] = 20;
          rgb[i + 2] = 20;
        }
      }
  }
  const f = fadeAt(t);
  if (f > 0) for (let i = 0; i < rgb.length; i++) rgb[i] = Math.round(rgb[i]! * (1 - f));
  writeFileSync(`out/f_${String(t).replace(".", "_")}.png`, encodePNG(W, H, rgb));
  console.log(t, shot?.id ?? "-", Date.now() - t0, "ms");
}
void THREE;
