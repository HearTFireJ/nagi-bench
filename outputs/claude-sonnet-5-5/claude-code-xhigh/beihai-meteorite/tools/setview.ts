// Quick look at a single set: bun tools/setview.ts <set> "x,y,z>lx,ly,lz@fov" ...
import { installDomStub } from "./dom-stub";
installDomStub();
import * as THREE from "three";
import { writeFileSync, mkdirSync } from "node:fs";
import { rasterize, encodePNG } from "./raster";

const which = process.argv[2]!;
const views = process.argv.slice(3);
const { Rig } = await import("../src/direction/rig");
const scene = new THREE.Scene();
const rig = new Rig(scene);
let preset: import("../src/direction/rig").LightPreset = { bg: 0x000000, hemi: [0xffffff, 0x444444, 2] };
const t0 = performance.now();
if (which === "hutong") {
  const { buildHutong } = await import("../src/world/hutong");
  const h = buildHutong();
  scene.add(h.group);
  h.animate(3);
  preset = {
    bg: 0x2a2f5a,
    fog: { color: 0x4a4468, density: 0.012 },
    hemi: [0x7f8cc0, 0x3a3230, 1.6],
    sun: { color: 0xff9a5a, intensity: 2.2, from: [-30, 12, 6], to: [0, 0, 12], box: 20 },
    points: [
      { color: 0xff6a2a, intensity: 14, pos: [h.lanternPos.x, h.lanternPos.y, h.lanternPos.z], distance: 14 },
      { color: 0xffd08a, intensity: 8, pos: [-2.6, 2.3, 8.5], distance: 10 },
    ],
  };
} else if (which === "room") {
  const { buildRoom } = await import("../src/world/room");
  const r = buildRoom();
  scene.add(r.group);
  preset = r.previewLight;
} else if (which === "snow") {
  const { buildSnow } = await import("../src/world/snow");
  const r = buildSnow();
  scene.add(r.group);
  preset = r.previewLight;
} else if (which === "shop") {
  const { buildShop } = await import("../src/world/shop");
  const r = buildShop();
  scene.add(r.group);
  preset = r.previewLight;
} else if (which === "basement") {
  const { buildBasement } = await import("../src/world/basement");
  const r = buildBasement();
  scene.add(r.group);
  preset = r.previewLight;
} else if (which === "cabin") {
  const { buildCabin } = await import("../src/world/cabin");
  const r = buildCabin();
  scene.add(r.group);
  preset = r.previewLight;
}
console.log("built", which, Math.round(performance.now() - t0), "ms");
rig.apply(preset);
const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 3000);
mkdirSync("preview", { recursive: true });
views.forEach((v, i) => {
  const [a, rest] = v.split(">");
  const [b, fov] = (rest ?? "0,0,0").split("@");
  const p = a!.split(",").map(Number);
  const l = b!.split(",").map(Number);
  cam.fov = fov ? Number(fov) : 40;
  cam.position.set(p[0]!, p[1]!, p[2]!);
  cam.lookAt(new THREE.Vector3(l[0]!, l[1]!, l[2]!));
  const t1 = performance.now();
  const r = rasterize(scene, cam, { width: 960, height: 540 });
  writeFileSync(`preview/${which}-${i}.png`, encodePNG(r.rgb, r.width, r.height));
  console.log(`view ${i}`, Math.round(performance.now() - t1), "ms");
});
