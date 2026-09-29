// bun tools/preview.ts [--w 640] [--sheet name] t1 t2 ...
// Seeks the *real* film (same player, shots and overlays) and rasterises frames.
import { installDomStub } from "./dom-stub";
installDomStub();
import { writeFileSync, mkdirSync } from "node:fs";
import { rasterize, encodePNG } from "./raster";

const args = process.argv.slice(2);
let width = 640;
let sheet = "";
let range: [number, number] | null = null;
let frac = 0.5;
const times: number[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--w") width = Number(args[++i]);
  else if (args[i] === "--sheet") sheet = args[++i]!;
  else if (args[i] === "--range") range = args[++i]!.split(":").map(Number) as [number, number];
  else if (args[i] === "--frac") frac = Number(args[++i]);
  else times.push(Number(args[i]));
}
const height = Math.round((width * 9) / 16);

const t0 = performance.now();
const { createFilm } = await import("../src/film");
const { overlayAt } = await import("../src/overlay");
const film = createFilm();
console.log("film built in", Math.round(performance.now() - t0), "ms");
mkdirSync("preview", { recursive: true });
if (range) {
  const ordered = [...film.player.getShots()].sort((a, b) => a.start - b.start).filter((sh) => !/^(title-card|end-card|black-before-house)$/.test(sh.id));
  for (const sh of ordered.slice(range[0], range[1])) times.push(+(sh.start + (sh.end - sh.start) * frac).toFixed(2));
  console.log("shots:", ordered.slice(range[0], range[1]).map((sh) => sh.id).join(" "));
}

const frames: Uint8Array[] = [];
for (const t of times) {
  const s0 = performance.now();
  film.player.seek(t);
  const r = rasterize(film.scene, film.camera, { width, height });
  const o = overlayAt(t);
  const rgb = r.rgb;
  if (o.optic) {
    const cx = width / 2, cy = height / 2, rad = 0.4556 * height;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const i = (y * width + x) * 3;
        if (d > rad) { rgb[i] = 0; rgb[i + 1] = 0; rgb[i + 2] = 0; }
        else if (o.optic === "rifle" && (Math.abs(y - cy) < 0.6 && d > 0.05 * height || Math.abs(x - cx) < 0.6 && d > 0.05 * height)) {
          rgb[i] = 10; rgb[i + 1] = 10; rgb[i + 2] = 10;
        }
      }
    }
  }
  if (o.fade > 0) for (let i = 0; i < rgb.length; i++) rgb[i] = Math.round(rgb[i]! * (1 - o.fade));
  frames.push(rgb);
  if (!sheet) writeFileSync(`preview/f-${t}.png`, encodePNG(rgb, width, height));
  console.log("t", t, "shot", film.player.getShots().filter((sh) => t >= sh.start && t < sh.end).map((sh) => sh.id).join(","), Math.round(performance.now() - s0), "ms");
}
if (sheet) {
  const cols = frames.length <= 2 ? frames.length : 2;
  const rows = Math.ceil(frames.length / cols);
  const W = cols * width, H = rows * height;
  const out = new Uint8Array(W * H * 3);
  frames.forEach((f, k) => {
    const ox = (k % cols) * width, oy = Math.floor(k / cols) * height;
    for (let y = 0; y < height; y++) out.set(f.subarray(y * width * 3, (y + 1) * width * 3), ((oy + y) * W + ox) * 3);
  });
  writeFileSync(`preview/sheet-${sheet}.png`, encodePNG(out, W, H));
}
