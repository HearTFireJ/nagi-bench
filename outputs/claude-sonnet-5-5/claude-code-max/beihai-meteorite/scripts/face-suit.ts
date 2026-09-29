// 头盔里的脸：章北海在几种表情下、空间站戏里用的灯光强度，检查“平静/安心”是否读得出来。
import "./fakedom";
import * as THREE from "three";
import fs from "node:fs";
import { SoftRenderer } from "./softrender";
import { Actor } from "../src/chars/actor";
import { ZHANG_LOOK, ZHANG_SUIT } from "../src/chars/cast";
import { suitSkin, visorStateFor } from "../src/world/space/crowd";
import type { Expr } from "../src/chars/faces";

const ambient = Number(process.argv[2] ?? 0.45);
const fill = Number(process.argv[3] ?? 0.5);
const W = 1500, H = 380;
const r = new SoftRenderer({ width: W, height: H });
r.setClearColor(0x02030a);
const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0x1a2240, ambient));
const dl = new THREE.DirectionalLight(0xcfdcff, fill);
dl.position.set(0, 0.2, 5);
scene.add(dl);
const hemi = new THREE.HemisphereLight(0x5f97ff, 0x06080e, 0.9);
scene.add(hemi);

const exprs: Expr[] = ["neutral", "stern", "blink", "serene", "squint"];
exprs.forEach((e, i) => {
  const a = new Actor("z", ZHANG_LOOK, { clothes: suitSkin("zhang", ZHANG_SUIT, visorStateFor(0)), expr: e });
  a.setExpr(e);
  a.root.position.set(i * 0.62 - 1.24, -1.7, 0);
  a.pose({});
  scene.add(a.root);
});
const cam = new THREE.PerspectiveCamera(12, W / H, 0.1, 50);
cam.position.set(0, 0.0, 6.2);
cam.lookAt(0, 0.0, 0);
r.clear();
r.render(scene, cam);
fs.writeFileSync("preview/face_suit.png", r.toPNG());
console.log("ok", ambient, fill);
