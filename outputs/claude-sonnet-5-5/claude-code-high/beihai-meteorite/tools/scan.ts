import "./shim";
import { render } from "./raster";
import { createFilm, fadeAt } from "../src/film";

// Automated frame audit: render every half second at thumbnail size and flag frames that are (nearly) blank or blown out.
const overlay = { scope() {}, lens() {}, title() {}, fade() {}, flash() {} };
const film = createFilm(overlay as never, []);
const W = 128;
const H = 72;
const step = Number(process.argv[2] ?? 0.5);
let flagged = 0;
for (let t = 0; t < film.player.duration; t += step) {
  film.player.seek(t);
  if (fadeAt(t) > 0.05) continue;
  const shot = film.shots.find((d) => t >= d.start && t < d.end);
  if (!shot) continue;
  const rgb = render(film.ctx.scene, film.ctx.camera, W, H);
  let sum = 0;
  let bright = 0;
  let dark = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    const l = (rgb[i]! + rgb[i + 1]! + rgb[i + 2]!) / 3;
    sum += l;
    if (l > 235) bright++;
    if (l < 6) dark++;
  }
  const mean = sum / (W * H);
  const fb = bright / (W * H);
  const fd = dark / (W * H);
  const scope = shot.scope ? " (scope)" : "";
  if (mean < 4 || (fb > 0.7 && !scope) || (fd > 0.985 && !scope)) {
    flagged++;
    console.log(t.toFixed(1), shot.id, "mean", mean.toFixed(1), "bright", fb.toFixed(2), "dark", fd.toFixed(2));
  }
}
console.log("flagged", flagged);
