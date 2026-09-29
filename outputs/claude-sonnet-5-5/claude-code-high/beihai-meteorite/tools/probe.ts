import "./shim";
import * as THREE from "three";
import { writeFileSync } from "node:fs";
import { encodePNG, render } from "./raster";
import { createFilm } from "../src/film";

// usage: bun tools/probe.ts <name> <t> px py pz lx ly lz fov
const overlay = { scope() {}, lens() {}, title() {}, fade() {}, flash() {} };
const film = createFilm(overlay as never, []);
const [name, t, px, py, pz, lx, ly, lz, fov] = process.argv.slice(2);
film.player.seek(Number(t));
const cam = film.ctx.camera;
cam.position.set(Number(px), Number(py), Number(pz));
cam.up.set(0, 1, 0);
cam.lookAt(Number(lx), Number(ly), Number(lz));
cam.fov = Number(fov ?? 40);
cam.updateProjectionMatrix();
const W = 900;
const H = 506;
writeFileSync(`out/probe_${name}.png`, encodePNG(W, H, render(film.ctx.scene, cam, W, H)));
void THREE;
