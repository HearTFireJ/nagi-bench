// 用法：bun run scripts/debug-cam.ts <t> <px> <py> <pz> <lx> <ly> <lz> <lens> [only]
import "./fakedom";
import fs from "node:fs";
import { SoftRenderer } from "./softrender";
import { buildFilm } from "../src/film/build";
import { applyCam } from "../src/film/shotkit";

const a = process.argv.slice(2);
const t = Number(a[0]);
const pos = [Number(a[1]), Number(a[2]), Number(a[3])] as [number, number, number];
const look = [Number(a[4]), Number(a[5]), Number(a[6])] as [number, number, number];
const lens = Number(a[7]);
const only = (a[8] ?? "courtyard").split(",");
const W = 900, H = Math.round(W / 2.35);
const r = new SoftRenderer({ width: W, height: H });
const film = buildFilm({ only });
film.player.seek(t);
applyCam(film.ctx, { pos, look, lens, near: 0.05, far: 200000 });
// 直接渲染（跳过 shot 更新覆盖相机）
film.ctx.overlay.grain = 0;
film.renderFrame(r);
fs.writeFileSync("preview/debug_cam.png", r.toPNG());
console.log("ok", t);
