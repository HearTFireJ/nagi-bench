import * as THREE from "three";
import { VoxGrid, glow, matte } from "../util/vox";
import { hash2, jitter, mix } from "../util/math";
import { locator } from "../art/props";
import type { LightPreset } from "../direction/rig";

/**
 * Base One: the task-force crew cabin (a steel cell with a porthole) and the
 * airlock that opens onto the void. Cabin frame: x right, z toward the hatch
 * (+z), floor y = 0. The airlock chamber continues beyond the hatch.
 */
export const CABIN = { hx: 1.6, hz: 1.7, h: 2.3 };

export interface Cabin {
  group: THREE.Group;
  bunkPillow: THREE.Vector3;
  locator: { group: THREE.Group; led: THREE.Mesh; ledMat: THREE.MeshBasicMaterial; halo: THREE.Mesh };
  hatch: THREE.Group;
  porthole: THREE.Vector3;
  airlock: THREE.Group;
  outerL: THREE.Mesh;
  outerR: THREE.Mesh;
  airlockLamp: THREE.MeshBasicMaterial;
  ledStrips: THREE.MeshBasicMaterial;
  previewLight: LightPreset;
}

function panelWall(w: number, h: number, axisX: boolean, seed: number, hole?: [number, number, number, number]): THREE.Mesh {
  const v = 0.05;
  const nw = Math.round(w / v), nh = Math.round(h / v);
  const g = new VoxGrid(axisX ? nw : 2, nh, axisX ? 2 : nw);
  g.box(0, 0, 0, g.sx, g.sy, g.sz, (x, y, z) => {
    const u = axisX ? x : z;
    if (hole && u >= hole[0] && u < hole[1] && y >= hole[2] && y < hole[3]) return null;
    const seam = u % 20 === 0 || y % 24 === 0;
    const rivet = (u % 20 === 2 || u % 20 === 18) && (y % 24 === 2 || y % 24 === 22);
    let c = mix(0xb3bdc8, 0x9fa9b5, hash2(Math.floor(u / 20), Math.floor(y / 24), seed));
    if (seam) c = 0x6c7683;
    if (rivet) c = 0xd7dde4;
    if (y < 6) c = 0x59616b;
    return jitter(c, 0.03, x, y, z, seed);
  });
  return g.mesh(v, matte({ roughness: 0.55, metalness: 0.05 }), "min");
}

function bunk(): THREE.Group {
  const grp = new THREE.Group();
  const v = 0.05;
  const g = new VoxGrid(20, 42, 40); // 1.0 x 2.1 x 2.0 (x, y, z)
  for (const x of [0, 18]) for (const z of [0, 38]) g.box(x, 0, z, x + 2, 42, z + 2, 0x59616b);
  for (const y of [8, 26]) {
    g.box(0, y, 0, 20, y + 3, 40, 0x59616b);
    g.box(1, y + 3, 1, 19, y + 6, 39, (x, yy, z) => (z < 8 ? 0xe8ecef : jitter(0x4f5a43, 0.06, x, yy, z, 3)));
    g.box(1, y + 3, 30, 19, y + 6, 31, 0x3b4433);
  }
  g.box(0, 26, 0, 20, 34, 1, 0x59616b);
  const m = g.mesh(v, matte({ roughness: 0.8 }), "min");
  grp.add(m);
  return grp;
}

function locker(): THREE.Group {
  const grp = new THREE.Group();
  const v = 0.05;
  const g = new VoxGrid(16, 40, 12);
  g.box(0, 0, 0, 16, 40, 12, (x, y, z) => (z === 11 && (y === 20 || x === 8 || x === 0 || x === 15) ? 0x2f353c : jitter(0x6e7d8c, 0.04, x, y, z, 2)));
  for (const y of [12, 30]) g.box(2, y, 11, 14, y + 3, 12, 0x2b3037);
  g.box(12, 24, 11, 14, 28, 12, 0xd7dde4);
  g.box(3, 34, 11, 13, 38, 12, 0xe8ecef);
  grp.add(g.mesh(v, matte({ roughness: 0.5 }), "min"));
  return grp;
}

export function buildCabin(): Cabin {
  const group = new THREE.Group();
  group.name = "cabin";
  const { hx, hz, h } = CABIN;
  const v = 0.05;

  // floor (tread plate) and ceiling
  const fl = new VoxGrid(Math.round((hx * 2) / v), 2, Math.round((hz * 2 + 3.4) / v));
  fl.box(0, 0, 0, fl.sx, 2, fl.sz, (x, y, z) => {
    const tread = (x + z) % 4 === 0 || (x - z + 100) % 4 === 0;
    return y === 1 && tread ? 0x4a525c : jitter(0x2e343c, 0.04, x, y, z, 1);
  });
  const flm = fl.mesh(v, matte({ roughness: 0.7 }), "min");
  flm.position.set(-hx, -0.1, -hz);
  flm.castShadow = false;
  group.add(flm);
  const cl = new VoxGrid(Math.round((hx * 2) / v), 3, Math.round((hz * 2) / v));
  cl.box(0, 0, 0, cl.sx, 3, cl.sz, (x, y, z) => (x % 20 < 3 && y < 2 ? 0x59616b : jitter(0xa9b3be, 0.03, x, y, z, 3)));
  const clm = cl.mesh(v, matte(), "min");
  clm.position.set(-hx, h, -hz);
  clm.castShadow = false;
  group.add(clm);

  // walls: back wall carries the porthole, the hatch wall (z = +hz) has an opening
  const back = panelWall(hx * 2 + 0.2, h, true, 1, [Math.round((0.2 + hx) / v), Math.round((0.7 + hx) / v), Math.round(1.1 / v), Math.round(1.6 / v)]);
  back.position.set(-hx - 0.1, 0, -hz - 0.1);
  group.add(back);
  const left = panelWall(hz * 2, h, false, 2);
  left.position.set(-hx - 0.1, 0, -hz);
  group.add(left);
  const right = panelWall(hz * 2, h, false, 3);
  right.position.set(hx, 0, -hz);
  group.add(right);
  const front = panelWall(hx * 2 + 0.2, h, true, 4, [Math.round((-0.45 + hx) / v), Math.round((0.45 + hx) / v), 0, Math.round(1.9 / v)]);
  front.position.set(-hx - 0.1, 0, hz);
  group.add(front);

  const b = bunk();
  b.position.set(-hx + 0.05, 0, -hz + 0.05);
  group.add(b);
  const bunkPillow = new THREE.Vector3(-hx + 0.55, 0.72, -hz + 0.45);

  const lk = locker();
  lk.position.set(hx - 0.85, 0, -hz + 0.95);
  group.add(lk);
  const lk2 = locker();
  lk2.position.set(hx - 0.85, 0, -hz + 0.9);
  lk2.visible = false;
  group.add(lk2);

  // desk shelf with a cup and a photo
  const shelf = new VoxGrid(24, 2, 10).box(0, 0, 0, 24, 2, 10, 0x59616b).mesh(v, matte(), "min");
  shelf.position.set(0.4, 1.05, -hz + 0.05);
  group.add(shelf);
  const photo = new VoxGrid(6, 8, 1).box(0, 0, 0, 6, 8, 1, (x, y) => (y > 4 ? 0x8fb4de : (x === 2 ? 0xe0642a : 0xe8f0f5))).mesh(0.03, matte(), "min");
  photo.position.set(0.55, 1.12, -hz + 0.12);
  group.add(photo);

  // sign
  const cv = document.createElement("canvas");
  cv.width = 96;
  cv.height = 32;
  const cx = cv.getContext("2d")!;
  cx.fillStyle = "#1a2b45";
  cx.fillRect(0, 0, 96, 32);
  cx.fillStyle = "#e6b422";
  cx.fillRect(0, 0, 96, 3);
  cx.fillRect(0, 29, 96, 3);
  cx.fillStyle = "#ffffff";
  cx.font = "bold 14px sans-serif";
  cx.fillText("增援未来", 6, 14);
  cx.fillText("第一特遣队", 6, 28);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.25), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  sign.position.set(0.9, 1.75, -hz + 0.02);
  group.add(sign);

  // porthole trim
  const trim = new VoxGrid(12, 12, 3);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (x < 2 || y < 2 || x > 9 || y > 9) trim.set(x, y, 0, 0x59616b);
  const tm = trim.mesh(0.05, matte(), "center");
  tm.position.set(0.45 - 0.0, 1.35, -hz - 0.08);
  group.add(tm);

  // LED strips
  const ledMat = glow({ toneMapped: false });
  ledMat.color.set(0xfff2d0);
  const strip = new VoxGrid(Math.round((hx * 2 - 0.4) / v), 1, 3).box(0, 0, 0, Math.round((hx * 2 - 0.4) / v), 1, 3, 0xffffff).geometry(v, "min");
  const s1 = new THREE.Mesh(strip, ledMat);
  s1.position.set(-hx + 0.2, h - 0.08, -hz + 0.25);
  group.add(s1);
  const s2 = new THREE.Mesh(strip, ledMat);
  s2.position.set(-hx + 0.2, h - 0.08, hz - 0.4);
  group.add(s2);

  // locator on the pillow
  const loc = locator(0.045);
  loc.group.position.copy(bunkPillow).add(new THREE.Vector3(0.0, 0.05, 0.0));
  loc.group.rotation.y = 0.2;
  group.add(loc.group);

  // hatch frame (open) on the +z wall, leading into the airlock
  const hatch = new THREE.Group();
  const hf = new VoxGrid(24, 40, 6);
  hf.box(0, 0, 0, 24, 40, 6, 0x6c7683);
  hf.clear(3, 0, 0, 21, 38, 6);
  hf.box(0, 36, 0, 24, 40, 6, 0xe6b422);
  const hm = hf.mesh(v, matte({ roughness: 0.5 }), "min");
  hm.position.set(-0.6, 0, hz - 0.05);
  hatch.add(hm);
  group.add(hatch);

  // airlock chamber beyond the hatch
  const airlock = new THREE.Group();
  const aw = 2.4, ah = 2.4, ad = 3.2;
  const ax = Math.round(aw / v), ay = Math.round(ah / v), az = Math.round(ad / v);
  const ag = new VoxGrid(ax, ay, az);
  ag.shell(0, 0, 0, ax, ay, az, 2, (x, y, z) => {
    const ring = z % 16 < 2;
    return ring ? 0x6c7683 : jitter(mix(0xc4ccd5, 0xa9b3be, hash2(z >> 3, y >> 3, 6)), 0.03, x, y, z, 7);
  });
  ag.clear(0, 3, 0, ax, ay - 3, 2);
  ag.clear(3, 0, az - 2, ax - 3, ay - 3, az); // opening at the far end
  ag.box(0, 0, 0, ax, 2, az, (x, y, z) => (y === 1 && (x + z) % 4 === 0 ? 0x4a525c : 0x2e343c));
  const agm = ag.mesh(v, matte({ roughness: 0.6 }), "min");
  agm.position.set(-aw / 2, 0, hz + 0.05);
  airlock.add(agm);
  // caution stripes near the outer door
  const stripe = new VoxGrid(ax, 1, 6);
  stripe.box(0, 0, 0, ax, 1, 6, (x) => (Math.floor(x / 4) % 2 ? 0xe6b422 : 0x1a1c20));
  const strm = stripe.mesh(v, matte(), "min");
  strm.position.set(-aw / 2, 0.02, hz + 0.05 + ad - 0.5);
  airlock.add(strm);
  // outer door leaves (open, slid apart)
  const leaf = new VoxGrid(20, 34, 4);
  leaf.box(0, 0, 0, 20, 34, 4, (x, y, z) => (x < 2 || y < 2 || x > 17 || y > 31 ? 0x6c7683 : jitter(0xdde2e8, 0.03, x, y, z, 4)));
  leaf.box(8, 12, 3, 12, 22, 4, 0xe6b422);
  const lg = leaf.geometry(v, "min");
  const outerL = new THREE.Mesh(lg, matte({ roughness: 0.5 }));
  const outerR = new THREE.Mesh(lg, matte({ roughness: 0.5 }));
  outerL.position.set(-aw / 2 + 0.15, 0.15, hz + 0.05 + ad - 0.2);
  outerR.position.set(aw / 2 - 0.15 - 20 * v, 0.15, hz + 0.05 + ad - 0.2);
  airlock.add(outerL, outerR);
  const lampMat = glow({ toneMapped: false });
  lampMat.color.set(0xff2a1a);
  const lamp = new THREE.Mesh(new VoxGrid(6, 3, 2).box(0, 0, 0, 6, 3, 2, 0xffffff).geometry(v, "center"), lampMat);
  lamp.position.set(0, ah - 0.35, hz + 0.05 + ad - 0.5);
  airlock.add(lamp);
  const al = new THREE.Mesh(new VoxGrid(Math.round((aw - 0.8) / v), 1, 3).box(0, 0, 0, Math.round((aw - 0.8) / v), 1, 3, 0xfff2d0).geometry(v, "min"), ledMat);
  al.position.set(-aw / 2 + 0.4, ah - 0.06, hz + 1.2);
  airlock.add(al);
  group.add(airlock);

  const previewLight: LightPreset = {
    bg: 0x030507,
    fog: { color: 0x0a0e12, density: 0.01 },
    hemi: [0x9fb2c8, 0x2a3038, 0.9],
    spot: { color: 0xfff2d8, intensity: 40, pos: [0, h - 0.2, 0.2], target: [0, 0, -0.5], angle: 1.2, penumbra: 0.8, distance: 8 },
    points: [{ color: 0x9fd0ff, intensity: 6, pos: [0.45, 1.35, -hz + 0.5], distance: 5 }],
  };
  return {
    group, bunkPillow, locator: loc, hatch, porthole: new THREE.Vector3(0.45, 1.35, -hz), airlock, outerL, outerR,
    airlockLamp: lampMat, ledStrips: ledMat, previewLight,
  };
}
