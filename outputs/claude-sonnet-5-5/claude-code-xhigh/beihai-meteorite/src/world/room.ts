import * as THREE from "three";
import { voxelModel, voxelMaterial } from "@agentbench/voxel-kit";
import { VoxGrid, glow, matte } from "../util/vox";
import { hash, hash2, hash3, jitter, mix, mulberry32 } from "../util/math";
import { magnifier, radio, rock, rockGeometry, ironSlice, teacup, teapot, type RockKind } from "../art/props";
import type { LightPreset } from "../direction/rig";

/**
 * The collector's old courtyard house: a small geological museum in a warm,
 * lived-in room. Cold cabinet light on old stone; warm lamp on the work bench.
 *
 * Frame: x to the right, z toward the door (door wall at z = +3.6), floor y = 0.
 */
export const ROOM = { hx: 4.2, hz: 3.6, h: 3.3 };
export const DOOR_X = 2.3;

export interface RoomSet {
  group: THREE.Group;
  benchTop: number;
  stoolPos: THREE.Vector3;
  benchCentre: THREE.Vector3;
  teaTable: THREE.Vector3;
  cabinetCentres: THREE.Vector3[];
  safe: { door: THREE.Group; pos: THREE.Vector3 };
  radio: { dialMat: THREE.MeshBasicMaterial; pos: THREE.Vector3 };
  lampPos: THREE.Vector3;
  felt: THREE.Vector3;
  cups: THREE.Mesh[];
  pot: THREE.Group;
  bigStones: THREE.Mesh[];
  slice: THREE.Mesh;
  marsBox: THREE.Group;
  emptyShelf: THREE.Vector3;
  emptyShelfMarkers: THREE.Mesh[];
  doorLeaf: THREE.Group;
  stool: THREE.Mesh;
  windowPaper: THREE.MeshBasicMaterial;
  dents: THREE.Group;
  /** A magnified meteorite surface, parked outside the room for the eyepiece shot. */
  micro: { centre: THREE.Vector3 };
  previewLight: LightPreset;
}

const WOOD_DARK = 0x3a281b;
const WOOD_MID = 0x6b4a2c;

function planks(hx: number, hz: number): THREE.Mesh {
  const v = 0.125;
  const sx = Math.round((hx * 2) / v), sz = Math.round((hz * 2) / v);
  const g = new VoxGrid(sx, 2, sz);
  g.box(0, 0, 0, sx, 2, sz, (x, y, z) => {
    const plank = Math.floor(x / 3);
    const seam = x % 3 === 0;
    const stagger = (plank * 17) % 11;
    const joint = (z + stagger * 4) % 44 === 0;
    let c = mix(0x8a5d36, 0x6a4526, hash(plank));
    if (seam || joint) c = 0x3b2716;
    return jitter(c, 0.05, x, y, z, 2);
  });
  const m = g.mesh(v, matte({ roughness: 0.7 }), "min");
  m.position.set(-hx, -0.25, -hz);
  m.castShadow = false;
  return m;
}

function rug(w: number, d: number): THREE.Mesh {
  const v = 0.0625;
  const sx = Math.round(w / v), sz = Math.round(d / v);
  const g = new VoxGrid(sx, 1, sz);
  g.box(0, 0, 0, sx, 1, sz, (x, y, z) => {
    const edge = Math.min(x, sx - 1 - x, z, sz - 1 - z);
    if (edge < 3) return edge < 1 ? 0xd8c69a : 0x1d2d54;
    if (edge < 5) return 0xb0342a;
    const cx = x - sx / 2, cz = z - sz / 2;
    const dia = Math.abs(cx) / (sx / 2) + Math.abs(cz) / (sz / 2);
    if (Math.abs(dia - 0.55) < 0.05) return 0xd8c69a;
    if (dia < 0.4 && (Math.floor(x / 3) + Math.floor(z / 3)) % 2 === 0) return 0x1d2d54;
    return jitter(dia < 0.55 ? 0x8f2f28 : 0x6e2622, 0.06, x, y, z, 4);
  });
  const m = g.mesh(v, matte({ roughness: 1 }), "min");
  m.castShadow = false;
  return m;
}

function shell(): THREE.Group {
  const grp = new THREE.Group();
  const v = 0.125;
  const { hx, hz, h } = ROOM;
  const T = 3; // wall thickness in voxels
  // helper: one wall as a grid
  const wall = (len: number, x0: number, z0: number, alongX: boolean, holes: Array<[number, number, number, number]>, seed: number) => {
    const n = Math.round(len / v);
    const hh = Math.round(h / v);
    const g = new VoxGrid(alongX ? n : T, hh, alongX ? T : n);
    g.box(0, 0, 0, g.sx, g.sy, g.sz, (x, y, z) => {
      const u = alongX ? x : z;
      for (const [a, b, c, d] of holes) if (u >= a && u < b && y >= c && y < d) return null;
      if (y < 7) return 0x3c4a3c; // wainscot
      if (y === 7) return 0x2a2016;
      if (y > hh - 3) return 0x3a281b;
      return jitter(0xcfc2a6, 0.035, x, y, z, seed);
    });
    const m = g.mesh(v, matte({ roughness: 0.95 }), "min");
    m.position.set(x0, 0, z0);
    return m;
  };
  const doorU = Math.round((DOOR_X - 0.55 + hx) / v);
  const doorW = Math.round(1.1 / v);
  grp.add(wall(hx * 2 + T * v * 2, -hx - T * v, -hz - T * v, true, [], 1));
  grp.add(wall(hx * 2 + T * v * 2, -hx - T * v, hz, true, [[doorU + T, doorU + T + doorW, 0, Math.round(2.25 / v)]], 2));
  grp.add(wall(hz * 2, -hx - T * v, -hz, false, [], 3));
  const winA = Math.round((-1.6 + hz) / v), winB = Math.round((0.5 + hz) / v);
  grp.add(wall(hz * 2, hx, -hz, false, [[winA, winB, Math.round(0.95 / v), Math.round(2.55 / v)]], 4));
  // ceiling with beams
  const cx = Math.round((hx * 2) / v), cz = Math.round((hz * 2) / v);
  const ceil = new VoxGrid(cx, 3, cz);
  ceil.box(0, 0, 0, cx, 3, cz, (x, y, z) => {
    const beam = Math.floor(x / 9) % 3 === 1 && y < 2;
    return beam ? jitter(0x3a281b, 0.06, x, y, z, 5) : jitter(0xc9bc9f, 0.03, x, y, z, 6);
  });
  const cm = ceil.mesh(v, matte(), "min");
  cm.position.set(-hx, h, -hz);
  cm.castShadow = false;
  grp.add(cm);
  return grp;
}

function windowLattice(): { group: THREE.Group; paperMat: THREE.MeshBasicMaterial } {
  const grp = new THREE.Group();
  const v = 0.04;
  const W = Math.round(2.1 / v), H = Math.round(1.6 / v);
  const frame = new VoxGrid(3, H, W);
  frame.box(0, 0, 0, 3, H, W, (x, y, z) => {
    const border = y < 3 || y >= H - 3 || z < 3 || z >= W - 3;
    const bar = (z % 13 < 2) || (y % 13 < 2);
    return border || bar ? jitter(0x5a1f18, 0.06, x, y, z, 2) : null;
  });
  const paper = new VoxGrid(1, H, W);
  paper.box(0, 0, 0, 1, H, W, (x, y, z) => jitter(0xdde6f3, 0.02, x, y, z, 3));
  const fm = frame.mesh(v, matte(), "min");
  const paperMat = glow({ toneMapped: false });
  const pm = paper.mesh(v, paperMat, "min");
  pm.position.x = 0.05;
  grp.add(fm, pm);
  return { group: grp, paperMat };
}

function cabinet(w: number, h: number, d: number, seed: number, empty = false): { group: THREE.Group; shelfY: number[]; rocks: Array<{ pos: THREE.Vector3; kind: RockKind; seed: number; r: number }> } {
  const v = 0.05;
  const nx = Math.round(w / v), ny = Math.round(h / v), nz = Math.round(d / v);
  const shelves = 5;
  const gap = Math.floor((ny - 6) / shelves);
  const g = new VoxGrid(nx, ny, nz);
  const wood = (x: number, y: number, z: number) => jitter(WOOD_DARK, 0.07, x, y, z, seed);
  g.box(0, 0, 0, nx, ny, nz, () => null);
  g.box(0, 0, 0, 2, ny, nz, wood);
  g.box(nx - 2, 0, 0, nx, ny, nz, wood);
  g.box(0, 0, 0, nx, 4, nz, wood);
  g.box(0, ny - 3, 0, nx, ny, nz, wood);
  g.box(2, 4, 0, nx - 2, ny - 3, 1, (x, y, z) => jitter(0x1b1611, 0.05, x, y, z, 2));
  const shelfY: number[] = [];
  for (let s = 0; s < shelves; s++) {
    const y = 4 + s * gap;
    shelfY.push(y);
    g.box(2, y, 0, nx - 2, y + 1, nz - 1, (x, yy, z) => jitter(z > nz - 5 ? 0x243a55 : 0x1c3327, 0.05, x, yy, z, 4));
  }
  const group = new THREE.Group();
  const m = g.mesh(v, matte({ roughness: 0.7 }), "min");
  group.add(m);
  // glass front
  const glass = new VoxGrid(nx - 4, ny - 7, 1);
  glass.box(0, 0, 0, nx - 4, ny - 7, 1, 0xcfe7ff);
  const gm = new THREE.Mesh(glass.geometry(v, "min"), new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.09, roughness: 0.05, depthWrite: false }));
  gm.position.set(2 * v, 4 * v, (nz - 0.5) * v);
  group.add(gm);
  // LED strips under each shelf (self-lit)
  const led = new VoxGrid(nx - 6, 1, 2);
  led.box(0, 0, 0, nx - 6, 1, 2, 0xe8f3ff);
  const ledGeo = led.geometry(v, "min");
  const ledMat = glow({ toneMapped: false });
  for (let s = 1; s < shelves; s++) {
    const lm = new THREE.Mesh(ledGeo, ledMat);
    lm.position.set(3 * v, (shelfY[s]! - 1) * v, (nz - 5) * v);
    group.add(lm);
  }
  const lm0 = new THREE.Mesh(ledGeo, ledMat);
  lm0.position.set(3 * v, (ny - 4) * v, (nz - 5) * v);
  group.add(lm0);

  const rocks: Array<{ pos: THREE.Vector3; kind: RockKind; seed: number; r: number }> = [];
  const rand = mulberry32(seed * 31 + 7);
  const kinds: RockKind[] = ["iron", "stone", "pallasite", "glass", "moon", "mars", "iron", "stone"];
  for (let s = 0; s < shelves; s++) {
    const count = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      if (empty && s === 2 && i > 0) continue;
      const kind = kinds[Math.floor(rand() * kinds.length)]!;
      const r = 2.6 + rand() * 2.2;
      const px = (5 + ((i + 0.5) / count) * (nx - 10)) * v;
      const py = (shelfY[s]! + 1) * v + r * 0.018 * 1.05;
      const pz = (nz * (0.35 + rand() * 0.25)) * v;
      rocks.push({ pos: new THREE.Vector3(px, py, pz), kind, seed: Math.floor(rand() * 1000), r });
      // label card
      const card = new VoxGrid(6, 1, 4);
      card.box(0, 0, 0, 6, 1, 4, (x, y, z) => (z === 1 && x > 0 && x < 5 ? 0x6a6a6a : 0xf1ead6));
      const cmesh = card.mesh(0.02, matte(), "min");
      cmesh.position.set(px - 0.06, (shelfY[s]! + 1) * v, (nz - 7) * v);
      group.add(cmesh);
    }
  }
  return { group, shelfY, rocks };
}

function bench(): { group: THREE.Group; top: number } {
  const grp = new THREE.Group();
  const v = 0.0625;
  const nx = 30, nz = 14, ny = 14; // 1.9 m x 0.9 m x 0.9 m at 0.0625
  const g = new VoxGrid(nx, ny, nz);
  const top = ny - 3;
  g.box(0, top, 0, nx, ny, nz, (x, y, z) => jitter(mix(0x7a5532, 0x6a4828, hash(Math.floor(z / 4))), 0.05, x, y, z, 3));
  g.box(0, top - 2, 0, nx, top, 2, WOOD_MID);
  g.box(0, top - 2, nz - 2, nx, top, nz, WOOD_MID);
  for (const [x, z] of [[1, 1], [nx - 3, 1], [1, nz - 3], [nx - 3, nz - 3]] as const) g.box(x, 0, z, x + 2, top, z + 2, (xx, y, zz) => jitter(WOOD_MID, 0.06, xx, y, zz, 5));
  // drawer unit
  g.box(nx - 12, 2, 2, nx - 3, top, nz - 2, (x, y, z) => (y % 5 === 0 ? 0x2b1d12 : jitter(0x5c3f24, 0.05, x, y, z, 6)));
  for (const y of [4, 8]) g.box(nx - 8, y, nz - 2, nx - 6, y + 1, nz - 1, 0xc9a04a);
  grp.add(g.mesh(v, matte({ roughness: 0.75 }), "min"));
  grp.children[0]!.position.set(-nx * v / 2, 0, -nz * v / 2);
  return { group: grp, top: ny * v };
}

function lamp(): { group: THREE.Group; head: THREE.Vector3 } {
  const grp = new THREE.Group();
  const v = 0.02;
  const g = new VoxGrid(60, 50, 12);
  g.cyl(6, 6, 6, 0, 2, 0x2a2d31);
  for (let y = 2; y < 26; y++) g.box(5, y, 5, 7, y + 1, 7, 0x8e949c);
  for (let s = 0; s < 22; s++) g.box(6 + s, 25 + Math.floor(s * 0.35), 5, 8 + s, 26 + Math.floor(s * 0.35), 7, 0x8e949c);
  g.cyl(0, 0, 0, 0, 0, 0);
  // shade
  for (let y = 0; y < 8; y++) {
    const r = 3 + y * 0.9;
    for (let z = 0; z < 12; z++) {
      for (let x = 0; x < 60; x++) {
        const d = Math.hypot(x - 32, z - 6);
        if (d < r && d > r - 1.6) g.set(x, 34 - y + 0, z, 0x2f5b46);
      }
    }
  }
  const m = g.mesh(v, matte({ roughness: 0.5 }), "min");
  grp.add(m);
  const bulb = new VoxGrid(6, 2, 6).box(0, 0, 0, 6, 2, 6, 0xfff2cc);
  const bm = new THREE.Mesh(bulb.geometry(v, "center"), glow({ toneMapped: false }));
  bm.position.set(32 * v, 27.5 * v, 6 * v);
  grp.add(bm);
  return { group: grp, head: new THREE.Vector3(32 * v, 27 * v, 6 * v) };
}

function microscope(): THREE.Group {
  const grp = new THREE.Group();
  const geo = voxelModel({
    palette: { k: 0x1e2126, g: 0x8b939e, w: 0xd8dde3, l: 0x7ec8ff },
    layers: [
      ["....kk....", "...kgk....", "...kgk....", "..kkgkk...", "..kwwk....", "..kgg.....", "..kgg.....", "..kgg.....", "..kgk.....", "kkkkkkkkkk", "kkkkkkkkkk"],
    ],
    axis: "x",
    voxel: 0.03,
    anchor: "center",
  });
  const m = new THREE.Mesh(geo, voxelMaterial({ roughness: 0.4, metalness: 0.25 }));
  grp.add(m);
  return grp;
}

function safe(): { group: THREE.Group; door: THREE.Group; box: THREE.Group } {
  const grp = new THREE.Group();
  const v = 0.05;
  const g = new VoxGrid(16, 20, 14);
  g.box(0, 0, 0, 16, 20, 14, (x, y, z) => jitter(0x3f4f47, 0.05, x, y, z, 3));
  g.clear(2, 3, 3, 14, 17, 14);
  g.box(2, 3, 3, 14, 4, 13, 0x2a1616);
  g.box(2, 3, 3, 14, 17, 4, 0x2a1616);
  const body = g.mesh(v, matte({ roughness: 0.5 }), "min");
  grp.add(body);
  const doorG = new THREE.Group();
  const d = new VoxGrid(14, 18, 2);
  d.box(0, 0, 0, 14, 18, 2, (x, y, z) => (x < 1 || y < 1 || x > 12 || y > 16 ? 0x32423a : jitter(0x455a50, 0.04, x, y, z, 4)));
  d.cyl(7, 12, 2.6, 0, 2, 0xb9c0c8);
  d.box(7, 12, 1, 8, 15, 2, 0x222222);
  d.box(3, 6, 1, 6, 7, 2, 0xc9a04a);
  const dm = d.mesh(v, matte({ roughness: 0.45 }), "min");
  doorG.add(dm);
  doorG.position.set(15 * v, 2 * v, 13 * v);
  grp.add(doorG);
  // velvet box with the Martian sliver
  const box = new THREE.Group();
  const bx = new VoxGrid(8, 3, 6);
  bx.box(0, 0, 0, 8, 3, 6, (x, y, z) => (y === 2 && x > 0 && x < 7 && z > 0 && z < 5 ? 0x6e1420 : jitter(0x2a1d14, 0.05, x, y, z, 5)));
  const bxm = bx.mesh(v, matte(), "min");
  box.add(bxm);
  const tiny = rock(4, 1.2, "mars", 0.022);
  tiny.position.set(4 * v, 3.6 * v, 3 * v);
  box.add(tiny);
  box.position.set(4 * v, 4 * v, 5 * v);
  grp.add(box);
  return { group: grp, door: doorG, box };
}

function teaTable(): THREE.Group {
  const grp = new THREE.Group();
  const v = 0.0625;
  const g = new VoxGrid(20, 12, 20);
  g.box(0, 9, 0, 20, 12, 20, (x, y, z) => (x < 1 || z < 1 || x > 18 || z > 18 ? 0x2a1a10 : jitter(0x7a4c2a, 0.05, x, y, z, 2)));
  for (const [x, z] of [[1, 1], [16, 1], [1, 16], [16, 16]] as const) g.box(x, 0, z, x + 3, 9, z + 3, jitter(0x5a3a20, 0.06, x, 0, z, 3));
  g.box(1, 3, 1, 19, 4, 3, 0x5a3a20);
  g.box(1, 3, 17, 19, 4, 19, 0x5a3a20);
  const m = g.mesh(0.045, matte({ roughness: 0.7 }), "min");
  m.position.set(-0.45, 0, -0.45);
  grp.add(m);
  return grp;
}

function chair(): THREE.Group {
  const grp = new THREE.Group();
  const v = 0.0625;
  const g = new VoxGrid(14, 30, 14);
  g.box(0, 12, 0, 14, 14, 14, (x, y, z) => jitter(0x6a4326, 0.05, x, y, z, 2));
  for (const [x, z] of [[0, 0], [11, 0], [0, 11], [11, 11]] as const) g.box(x, 0, z, x + 3, 12, z + 3, jitter(0x4a2f1a, 0.06, x, 0, z, 3));
  g.box(0, 14, 0, 14, 30, 2, (x, y, z) => (y < 16 || y > 27 || x < 2 || x > 11 ? jitter(0x4a2f1a, 0.05, x, y, z, 4) : jitter(0x8a5a32, 0.05, x, y, z, 5)));
  const m = g.mesh(0.03, matte({ roughness: 0.7 }), "min");
  m.position.set(-0.21, 0, -0.21);
  grp.add(m);
  return grp;
}

function scrollOrFrame(w: number, h: number, kind: "antarctic" | "ink"): THREE.Mesh {
  const v = 0.03;
  const nx = Math.round(w / v), ny = Math.round(h / v);
  const g = new VoxGrid(nx, ny, 2);
  g.box(0, 0, 0, nx, ny, 2, (x, y, z) => {
    const edge = Math.min(x, nx - 1 - x, y, ny - 1 - y);
    if (edge < 2) return 0x3a281b;
    if (kind === "antarctic") {
      const horizon = ny * 0.45;
      if (y > horizon) return y > ny * 0.75 ? 0x6fa3d8 : 0x9cc4e8;
      let c = 0xeef4f8;
      if (hash2(x, y, 3) > 0.94) c = 0xc8d8e6;
      // tiny orange explorer
      if (Math.abs(x - nx * 0.5) < 2 && y > horizon - 6 && y < horizon + 2) c = 0xe0642a;
      return c;
    }
    const mist = y > ny * 0.55 && hash2(Math.floor(x / 3), y, 9) > 0.55;
    if (mist) return 0xd9cfb8;
    return hash2(x, Math.floor(y / 2), 1) > 0.5 - (ny - y) / ny * 0.3 ? 0x2a2a2a : 0xe6dcc4;
  });
  return g.mesh(v, matte({ roughness: 0.9 }), "min");
}

export function buildRoom(): RoomSet {
  const group = new THREE.Group();
  group.name = "room";
  const { hx, hz, h } = ROOM;
  group.add(shell());
  group.add(planks(hx, hz));

  const r1 = rug(3.4, 2.4);
  r1.position.set(-1.6, 0.0, -0.6);
  group.add(r1);
  const r2 = rug(2.6, 2.2);
  r2.position.set(1.4, 0.0, -0.6);
  group.add(r2);

  // cabinets: five on the back wall, three on the left wall, one by the door wall
  const rockGeos: Array<{ geo: THREE.BufferGeometry; kind: RockKind }> = [];
  const kinds: RockKind[] = ["iron", "stone", "pallasite", "glass", "moon", "mars"];
  for (let i = 0; i < 12; i++) rockGeos.push({ kind: kinds[i % kinds.length]!, geo: rockGeometry(i * 13 + 2, 4, kinds[i % kinds.length]!, 0.018) });
  const cabinetCentres: THREE.Vector3[] = [];
  const instances: Array<Array<THREE.Matrix4>> = rockGeos.map(() => []);
  const placeCabinet = (x: number, z: number, ry: number, seed: number, empty = false) => {
    const c = cabinet(1.45, 2.4, 0.5, seed, empty);
    c.group.position.set(x, 0, z);
    c.group.rotation.y = ry;
    group.add(c.group);
    c.group.updateMatrixWorld(true);
    for (const rk of c.rocks) {
      const idx = Math.floor(hash(rk.seed) * 12);
      const s = rk.r / 4;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(hash(rk.seed + 1) * 6, hash(rk.seed + 2) * 6, 0));
      const m = new THREE.Matrix4().compose(rk.pos, q, new THREE.Vector3(s, s, s));
      m.premultiply(c.group.matrixWorld);
      instances[idx]!.push(m);
    }
    cabinetCentres.push(new THREE.Vector3(x, 1.2, z));
    return c;
  };
  const wz = -hz + 0.02;
  for (let i = 0; i < 5; i++) placeCabinet(-3.0 + i * 1.5, wz, 0, i + 1, i === 3);
  for (let i = 0; i < 3; i++) placeCabinet(-hx + 0.02 + 0.0, -2.2 + i * 1.5, Math.PI / 2, i + 11);
  rockGeos.forEach((rg, i) => {
    const list = instances[i]!;
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(rg.geo, voxelMaterial({ roughness: rg.kind === "glass" ? 0.25 : 0.85, metalness: rg.kind === "iron" ? 0.2 : 0 }), list.length);
    list.forEach((m, k) => mesh.setMatrixAt(k, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  });

  // right wall: window with paper lattice, safe below/aside
  const winParts = windowLattice();
  const win = winParts.group;
  win.position.set(hx - 0.06, 0.95, -1.6);
  group.add(win);
  const plant = new THREE.Group();
  const pg = new VoxGrid(16, 30, 16);
  pg.cyl(8, 8, 6, 0, 8, 0x8a4a2a);
  pg.cyl(8, 8, 1.2, 8, 20, 0x3f6a34);
  for (let i = 0; i < 40; i++) pg.ball(8 + (hash(i) - 0.5) * 12, 18 + hash(i + 40) * 10, 8 + (hash(i + 90) - 0.5) * 12, 2.2, (x, y, z) => jitter(0x3f7a3a, 0.15, x, y, z, 2));
  plant.add(pg.mesh(0.06, matte(), "center"));
  plant.position.set(hx - 0.7, 0.9, 1.0);
  group.add(plant);

  const sf = safe();
  sf.group.position.set(hx - 0.55, 0, -2.75);
  sf.group.rotation.y = -Math.PI / 2;
  group.add(sf.group);

  // bench area
  const b = bench();
  b.group.position.set(-1.7, 0, -1.2);
  group.add(b.group);
  const benchTop = b.top;
  const felt = new VoxGrid(30, 1, 20).box(0, 0, 0, 30, 1, 20, (x, y, z) => jitter(0x1f4a35, 0.05, x, y, z, 2)).mesh(0.03, matte({ roughness: 1 }), "min");
  felt.position.set(-1.7 - 0.45, benchTop, -1.2 - 0.3);
  group.add(felt);
  const feltCentre = new THREE.Vector3(-1.7, benchTop + 0.02, -1.2);

  const lp = lamp();
  lp.group.position.set(-2.5, benchTop, -1.35);
  lp.group.rotation.y = 0.2;
  group.add(lp.group);
  const lampPos = new THREE.Vector3(-2.5 + 0.55, benchTop + 0.85, -1.35);
  const scope = microscope();
  scope.position.set(-1.05, benchTop + 0.3, -1.45);
  scope.rotation.y = -0.6;
  group.add(scope);

  const rd = radio();
  rd.group.position.set(-0.85, benchTop + 0.2, -1.5);
  rd.group.rotation.y = -0.35;
  group.add(rd.group);

  const slice = ironSlice(0.012);
  slice.position.set(-1.95, benchTop + 0.02, -1.0);
  slice.rotation.y = 0.5;
  group.add(slice);
  const bigStones: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const s = rock(30 + i, 5.4 + i * 0.5, "iron", 0.016);
    s.position.set(-1.7 + i * 0.22 - 0.1, benchTop + 0.08, -1.0 + (i % 2) * 0.06);
    s.visible = false;
    group.add(s);
    bigStones.push(s);
  }
  const mag = magnifier(0.11);
  mag.scale.setScalar(0.056);
  mag.position.set(-1.45, benchTop + 0.02, -1.0);
  mag.rotation.set(0.0, 0.7, 0.0);
  mag.visible = false;
  group.add(mag);

  // stool
  const stool = new VoxGrid(10, 16, 10);
  stool.cyl(5, 5, 5, 14, 16, (x, y, z) => jitter(0x7a4c2a, 0.05, x, y, z, 2));
  for (const [x, z] of [[1, 1], [7, 1], [1, 7], [7, 7]] as const) stool.box(x, 0, z, x + 2, 14, z + 2, 0x5a3a20);
  const stoolMesh = stool.mesh(0.03, matte(), "min");
  stoolMesh.position.set(-1.6 - 0.15, 0, -0.35 - 0.15);
  group.add(stoolMesh);
  const stoolPos = new THREE.Vector3(-1.6, 0.5, -0.35);
  (stoolMesh as THREE.Mesh).name = "stool";

  // tea corner
  const tt = teaTable();
  tt.position.set(1.7, 0, -0.5);
  group.add(tt);
  const cups = [teacup(0.014), teacup(0.014)];
  cups[0]!.position.set(1.45, 0.54 + 0.05, -0.6);
  cups[1]!.position.set(1.95, 0.54 + 0.05, -0.35);
  cups.forEach((c) => group.add(c));
  const pot = teapot(0.014);
  pot.position.set(1.75, 0.54 + 0.09, -0.5);
  group.add(pot);
  const chairA = chair();
  chairA.position.set(0.85, 0, -0.5);
  chairA.rotation.y = Math.PI / 2;
  group.add(chairA);
  const chairB = chair();
  chairB.position.set(2.55, 0, -0.5);
  chairB.rotation.y = -Math.PI / 2;
  group.add(chairB);

  // wall art
  const photo = scrollOrFrame(0.7, 0.5, "antarctic");
  photo.position.set(-hx + 0.03, 1.65, 1.9);
  photo.rotation.y = Math.PI / 2;
  group.add(photo);
  const ink = scrollOrFrame(0.5, 1.2, "ink");
  ink.position.set(-1.7, 1.3, hz - 0.06);
  ink.rotation.y = Math.PI;
  group.add(ink);

  // door leaf (open), and the dusk courtyard visible through it
  const doorLeaf = new THREE.Group();
  const dl = new VoxGrid(2, 37, 17);
  dl.box(0, 0, 0, 2, 37, 17, (x, y, z) => (z % 8 === 0 || y % 12 === 0 ? 0x3a1512 : jitter(0x7a2a20, 0.05, x, y, z, 2)));
  const dlm = dl.mesh(0.0625, matte(), "min");
  doorLeaf.add(dlm);
  doorLeaf.position.set(DOOR_X + 0.55, 0, hz + 0.05);
  doorLeaf.rotation.y = -1.25;
  group.add(doorLeaf);

  const yard = new VoxGrid(160, 60, 1);
  const bands = [0x2b3a66, 0x33446f, 0x3f4f7d, 0x4d5b86, 0x5b688f, 0x6f78a0];
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < 160; x++) {
      const band = bands[Math.min(bands.length - 1, Math.floor((y / 60) * bands.length))]!;
      let c = band;
      const treeH = 18 + Math.sin(x * 0.11) * 6;
      if (y < treeH && hash2(x >> 1, y >> 1, 6) > 0.35) c = 0x1a2033;
      if (y < 4) c = 0x1c2233;
      yard.set(x, y, 0, c);
    }
  }
  const yardMesh = yard.mesh(0.12, glow({ toneMapped: false, fog: false }), "min");
  yardMesh.position.set(-9, -0.5, hz + 6);
  group.add(yardMesh);
  // second backdrop behind the window
  const winBack = yard.mesh(0.12, glow({ toneMapped: false, fog: false }), "min");
  winBack.rotation.y = -Math.PI / 2;
  winBack.position.set(hx + 6, -0.5, 9);
  group.add(winBack);

  // ceiling lamp
  const bulb = new VoxGrid(6, 6, 6).box(0, 0, 0, 6, 6, 6, 0xfff0c8);
  const bm = new THREE.Mesh(bulb.geometry(0.05, "center"), glow({ toneMapped: false }));
  bm.position.set(0, h - 0.5, 0.2);
  group.add(bm);
  const cord = new VoxGrid(1, 12, 1).box(0, 0, 0, 1, 12, 1, 0x141414).mesh(0.05, matte(), "min");
  cord.position.set(-0.025, h - 0.5 + 0.15, 0.175);
  group.add(cord);

  // eyepiece view: a reddish meteorite surface pitted with tiny round craters
  const micro = new VoxGrid(120, 14, 120);
  const pits: Array<[number, number, number]> = [];
  for (let i = 0; i < 46; i++) pits.push([8 + hash(i * 3) * 104, 8 + hash(i * 3 + 1) * 104, 3 + hash(i * 3 + 2) * 4.5]);
  for (let z = 0; z < 120; z++) {
    for (let x = 0; x < 120; x++) {
      let hgt = 8 + Math.floor(hash2(x >> 2, z >> 2, 3) * 3);
      let rim = false;
      let inPit = false;
      for (const [px, pz, pr] of pits) {
        const d = Math.hypot(x - px, z - pz);
        if (d < pr) { hgt -= Math.round((1 - d / pr) * 5 + 1); inPit = true; }
        else if (d < pr + 1.4) rim = true;
      }
      for (let y = 0; y < Math.max(1, hgt); y++) {
        const top = y === hgt - 1;
        let c = mix(0x7c3d2a, 0x5f2b1e, hash3(x, y, z, 2));
        if (top && rim) c = 0xb9805e;
        if (top && inPit) c = 0x2e1610;
        micro.set(x, y, z, jitter(c, 0.08, x, y, z, 4));
      }
    }
  }
  const microMesh = micro.mesh(0.006, matte({ roughness: 0.6 }), "center");
  microMesh.position.set(40, 0, 40);
  group.add(microMesh);

  const dents = new THREE.Group();
  const dentGeo = new VoxGrid(9, 1, 8).box(0, 0, 0, 9, 1, 8, (x, y, z) => ((x === 0 || x === 8) && (z === 0 || z === 7) ? null : jitter(0x040a07, 0.15, x, y, z, 3))).geometry(0.022, "center");
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Mesh(dentGeo, matte({ roughness: 1 }));
    d.position.set(-3.0 + 3 * 1.5 - 0.42 + i * 0.3 + 0.1, 1.056, wz + 0.26);
    dents.add(d);
  }
  group.add(dents);
  const emptyShelf = new THREE.Vector3(-3.0 + 3 * 1.5, 1.2, wz + 0.25);
  const emptyShelfMarkers: THREE.Mesh[] = [];

  const previewLight: LightPreset = {
    bg: 0x0b0906,
    hemi: [0xb59f80, 0x3a2a1c, 0.9],
    spot: { color: 0xffc27a, intensity: 60, pos: [lampPos.x, lampPos.y, lampPos.z], target: [feltCentre.x, benchTop, feltCentre.z], angle: 0.9, penumbra: 0.7, distance: 8 },
    points: [
      { color: 0xbfd8ff, intensity: 8, pos: [0, 1.6, -3.0], distance: 7 },
      { color: 0x8fa8ff, intensity: 6, pos: [hx - 0.6, 1.8, -0.6], distance: 6 },
      { color: 0xffc98a, intensity: 8, pos: [0, h - 0.7, 0.2], distance: 9 },
    ],
  };

  return {
    group, benchTop, stoolPos, benchCentre: feltCentre, teaTable: new THREE.Vector3(1.7, 0.54, -0.5),
    cabinetCentres, safe: { door: sf.door, pos: new THREE.Vector3(hx - 0.55, 0.5, -2.75) },
    radio: { dialMat: rd.dialMat, pos: new THREE.Vector3(-0.85, benchTop + 0.3, -1.5) },
    lampPos, felt: feltCentre, cups, pot, bigStones, slice, marsBox: sf.box, emptyShelf, emptyShelfMarkers, doorLeaf,
    stool: stoolMesh, windowPaper: winParts.paperMat, dents, micro: { centre: new THREE.Vector3(40, 0.05, 40) }, previewLight,
  };
}
