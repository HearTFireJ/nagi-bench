import * as THREE from "three";
import { VoxGrid, glow, matte } from "../util/vox";
import { hash, hash2, hash3, jitter, mix } from "../util/math";
import { roundGeometry } from "../art/props";
import type { LightPreset } from "../direction/rig";

/**
 * The hidden basement: bare concrete, one bulb, a table, a bundle of cloth against
 * sandbags. The stairwell runs out of the +z end. Floor y = 0.
 */
export const BASE = { hx: 2.6, hz: 2.4, h: 2.7, stairLen: 2.9 };

export interface Basement {
  group: THREE.Group;
  bulbPos: THREE.Vector3;
  bulb: THREE.Group;
  tablePos: THREE.Vector3;
  tableTop: number;
  bundle: THREE.Group;
  bundlePos: THREE.Vector3;
  holes: THREE.Mesh[];
  beef: THREE.Group;
  rounds: THREE.InstancedMesh;
  heads: THREE.InstancedMesh;
  meteorRounds: THREE.InstancedMesh;
  stripped: THREE.InstancedMesh;
  case32: THREE.Group;
  pliers: THREE.Object3D;
  stairTop: THREE.Vector3;
  door: THREE.Group;
  smoke: THREE.InstancedMesh;
  dust: THREE.InstancedMesh;
  previewLight: LightPreset;
}

function shell(): THREE.Group {
  const grp = new THREE.Group();
  const v = 0.1;
  const { hx, hz, h, stairLen } = BASE;
  const concrete = (x: number, y: number, z: number, seed: number, streaks = true): number => {
    const block = Math.floor(x / 5) + Math.floor(y / 2.5) * 7;
    let c = mix(0x5e6871, 0x4f5861, hash(block + seed));
    if ((x % 5 === 0) || (Math.floor(y) % 5 === 0)) c = shade(c);
    if (streaks && hash2(Math.floor(x / 2), seed, 11) > 0.86 && y < 20) c = mix(c, 0x3e444b, 0.4);
    return jitter(c, 0.04, x, y, z, seed);
  };
  function shade(c: number): number {
    return mix(c, 0x2a3036, 0.35);
  }
  const wall = (len: number, x0: number, z0: number, alongX: boolean, seed: number, holes: Array<[number, number, number, number]> = []) => {
    const n = Math.round(len / v);
    const hh = Math.round(h / v);
    const g = new VoxGrid(alongX ? n : 3, hh, alongX ? 3 : n);
    g.box(0, 0, 0, g.sx, g.sy, g.sz, (x, y, z) => {
      const u = alongX ? x : z;
      for (const [a, b, c, d] of holes) if (u >= a && u < b && y >= c && y < d) return null;
      return concrete(u, y, alongX ? z : x, seed);
    });
    const m = g.mesh(v, matte({ roughness: 1 }), "min");
    m.position.set(x0, 0, z0);
    return m;
  };
  const stairOpen: [number, number, number, number] = [Math.round((-0.6 + hx) / v), Math.round((0.6 + hx) / v), 0, Math.round(h / v)];
  grp.add(wall(hx * 2 + 0.6, -hx - 0.3, -hz - 0.3, true, 1));
  grp.add(wall(hx * 2 + 0.6, -hx - 0.3, hz, true, 2, [[stairOpen[0] + 3, stairOpen[1] + 3, 0, stairOpen[3]]]));
  grp.add(wall(hz * 2, -hx - 0.3, -hz, false, 3));
  grp.add(wall(hz * 2, hx, -hz, false, 4));
  // stairwell walls
  const sw = (x0: number, seed: number) => {
    const n = Math.round(stairLen / v);
    const g = new VoxGrid(3, Math.round((h + 0.3) / v), n);
    g.box(0, 0, 0, 3, g.sy, n, (x, y, z) => concrete(z, y, x, seed));
    const m = g.mesh(v, matte({ roughness: 1 }), "min");
    m.position.set(x0, 0, hz + 0.3);
    return m;
  };
  grp.add(sw(-0.9, 5), sw(0.6, 6));
  // floor
  const nx = Math.round((hx * 2) / v), nz = Math.round((hz * 2) / v);
  const floor = new VoxGrid(nx, 2, nz);
  floor.box(0, 0, 0, nx, 2, nz, (x, y, z) => {
    let c = mix(0x69717a, 0x59616a, hash2(x >> 2, z >> 2, 8));
    if (x % 26 === 0 || z % 26 === 0) c = 0x3f454c;
    if (Math.hypot(x - 20, z - 24) < 3) c = 0x22262a;
    if (hash2(x, z, 9) > 0.985) c = 0xb7a98a;
    return jitter(c, 0.05, x, y, z, 2);
  });
  const fm = floor.mesh(v, matte({ roughness: 0.85 }), "min");
  fm.position.set(-hx, -0.2, -hz);
  fm.castShadow = false;
  grp.add(fm);
  // ceiling + pipes
  const ceil = new VoxGrid(nx, 3, nz + Math.round(stairLen / v));
  ceil.box(0, 0, 0, nx, 3, ceil.sz, (x, y, z) => concrete(x, y + 10, z, 9, false));
  for (let z = 4; z < ceil.sz - 4; z += 1) {
    ceil.box(12, 0, z, 16, 1, z + 1, 0x8a9199);
  }
  const cm = ceil.mesh(v, matte({ roughness: 1 }), "min");
  cm.position.set(-hx, h, -hz);
  cm.castShadow = false;
  grp.add(cm);
  const pipes = new VoxGrid(nx, 4, 4);
  pipes.box(0, 0, 0, nx, 4, 4, (x, y, z) => (x % 40 < 2 ? 0x555b62 : jitter(0x9a8f7a, 0.06, x, y, z, 5)));
  const pm = pipes.mesh(v, matte({ roughness: 0.5, metalness: 0.15 }), "min");
  pm.position.set(-hx, h - 0.6, -hz + 0.35);
  grp.add(pm);
  const pm2 = pipes.mesh(v, matte({ roughness: 0.5, metalness: 0.15 }), "min");
  pm2.scale.set(1, 0.6, 0.6);
  pm2.position.set(-hx, h - 0.4, -hz + 0.9);
  grp.add(pm2);
  // stairs
  const steps = 9;
  const stair = new VoxGrid(12, Math.round(h / v), Math.round(stairLen / v));
  for (let s = 0; s < steps; s++) {
    const z0 = Math.round((s * stairLen) / steps / v), z1 = Math.round(((s + 1) * stairLen) / steps / v);
    const top = Math.round(((s + 1) * (h - 0.1)) / steps / v);
    stair.box(0, 0, z0, 12, top, z1, (x, y, z) => (y === top - 1 ? jitter(0x8a929a, 0.05, x, y, z, 3) : jitter(0x656d75, 0.05, x, y, z, 4)));
  }
  const stm = stair.mesh(v, matte({ roughness: 0.9 }), "min");
  stm.position.set(-0.6, 0, hz + 0.3);
  grp.add(stm);
  return grp;
}

function bulb(): { group: THREE.Group; mat: THREE.MeshBasicMaterial } {
  const grp = new THREE.Group();
  const cord = new VoxGrid(1, 16, 1).box(0, 0, 0, 1, 16, 1, 0x141414).mesh(0.04, matte(), "min");
  cord.position.set(-0.02, 0.05, -0.02);
  grp.add(cord);
  const soc = new VoxGrid(4, 3, 4).box(0, 0, 0, 4, 3, 4, 0x2a2a2a).mesh(0.04, matte(), "center");
  soc.position.set(0, 0.0, 0);
  grp.add(soc);
  const b = new VoxGrid(4, 5, 4).box(0, 0, 0, 4, 5, 4, (x, y) => (y < 2 ? 0xfff4c8 : 0xffe9a8));
  const mat = glow({ toneMapped: false });
  const bm = new THREE.Mesh(b.geometry(0.04, "center"), mat);
  bm.position.set(0, -0.2, 0);
  grp.add(bm);
  return { group: grp, mat };
}

function table(): { group: THREE.Group; top: number } {
  const grp = new THREE.Group();
  const v = 0.0625;
  const nx = 22, ny = 12, nz = 12; // 1.4 x 0.75 x 0.75
  const g = new VoxGrid(nx, ny, nz);
  g.box(0, ny - 2, 0, nx, ny, nz, (x, y, z) => jitter(mix(0x7a5a38, 0x6a4a2c, hash(Math.floor(z / 3))), 0.06, x, y, z, 2));
  for (const [x, z] of [[0, 0], [nx - 2, 0], [0, nz - 2], [nx - 2, nz - 2]] as const) g.box(x, 0, z, x + 2, ny - 2, z + 2, jitter(0x4a3420, 0.06, x, 0, z, 3));
  g.box(0, 3, 0, nx, 4, 1, 0x4a3420);
  g.box(0, 3, nz - 1, nx, 4, nz, 0x4a3420);
  const m = g.mesh(v, matte({ roughness: 0.8 }), "min");
  m.position.set(-nx * v / 2, 0, -nz * v / 2);
  grp.add(m);
  return { group: grp, top: ny * v };
}

function bundleMesh(): { group: THREE.Group; holes: THREE.Mesh[]; beef: THREE.Group } {
  const grp = new THREE.Group();
  const v = 0.04;
  const g = new VoxGrid(14, 22, 12);
  g.box(0, 0, 0, 14, 22, 12, (x, y, z) => {
    const edge = x === 0 || x === 13 || z === 0 || z === 11 || y === 0 || y === 21;
    const quilt = (x % 4 === 0 || y % 5 === 0) ? 0xb9c0c8 : 0xe2e6ea;
    const tape = y === 6 || y === 15 ? 0x2f4f88 : null;
    return jitter(tape ?? (edge ? 0xc7cdd4 : quilt), 0.04, x, y, z, 2);
  });
  const body = g.mesh(v, matte({ roughness: 0.85 }), "center");
  grp.add(body);
  // bullet holes drawn on the front face (+z), hidden until struck
  const holes: THREE.Mesh[] = [];
  const holeGeo = new VoxGrid(1, 1, 1).box(0, 0, 0, 1, 1, 1, 0x141010).geometry(v, "center");
  const spots: Array<[number, number]> = [[-0.22, 0.32], [0.05, 0.12], [-0.12, -0.02], [0.2, 0.28], [0.1, -0.22]];
  for (const [hx, hy] of spots) {
    const m = new THREE.Mesh(holeGeo, matte());
    m.position.set(hx, hy, 12 * v / 2 + 0.005);
    m.visible = false;
    holes.push(m);
    grp.add(m);
  }
  // the beef inside, exposed when the cloth is opened
  const beef = new THREE.Group();
  const bg = new VoxGrid(12, 10, 10);
  bg.box(0, 0, 0, 12, 10, 10, (x, y, z) => {
    const marble = hash3(x >> 1, y >> 1, z >> 1, 4) > 0.72;
    const edge = y === 9 || y === 0 || x === 0 || x === 11;
    return jitter(marble ? 0xe6c4bb : edge ? 0x9a1f24 : 0xb4272d, 0.07, x, y, z, 6);
  });
  beef.add(bg.mesh(0.045, matte({ roughness: 0.35 }), "center"));
  beef.visible = false;
  return { group: grp, holes, beef };
}

export function buildBasement(): Basement {
  const group = new THREE.Group();
  group.name = "basement";
  const { hx, hz, h, stairLen } = BASE;
  group.add(shell());

  const bl = bulb();
  const bulbPos = new THREE.Vector3(0.2, h - 0.62, 0.1);
  bl.group.position.copy(bulbPos);
  group.add(bl.group);

  const tb = table();
  const tablePos = new THREE.Vector3(-0.6, 0, -0.4);
  tb.group.position.copy(tablePos);
  group.add(tb.group);
  const tableTop = tb.top;

  // crates
  const crate = new VoxGrid(10, 10, 10);
  crate.box(0, 0, 0, 10, 10, 10, (x, y, z) => (x % 4 === 0 || y % 4 === 0 || z % 4 === 0 ? jitter(0x6a4a2c, 0.06, x, y, z, 2) : jitter(0x8a6a44, 0.06, x, y, z, 3)));
  const cm = crate.mesh(0.07, matte({ roughness: 0.9 }), "min");
  const positions: Array<[number, number, number, number]> = [[1.6, 0, -1.9, 0.1], [1.6, 0, -1.2, -0.05], [1.65, 0.7, -1.85, 0.3], [2.0, 0, 0.6, 0.0]];
  for (const [x, y, z, r] of positions) {
    const c = cm.clone();
    c.position.set(x, y, z);
    c.rotation.y = r;
    group.add(c);
  }
  // sandbags at the back-left corner
  const sand = new VoxGrid(30, 16, 8);
  for (let row = 0; row < 8; row++) {
    for (let k = 0; k < 6; k++) {
      const x0 = k * 5 + (row % 2 ? 2 : 0);
      sand.box(x0, row * 2, 0, Math.min(30, x0 + 5), row * 2 + 2, 8, (x, y, z) => jitter(mix(0xa89a72, 0x8f8360, hash(k + row * 3)), 0.06, x, y, z, 5));
    }
  }
  const sm = sand.mesh(0.09, matte({ roughness: 1 }), "min");
  sm.position.set(-hx + 0.05, 0, -hz + 0.02);
  group.add(sm);
  const sm2 = sm.clone();
  sm2.rotation.y = Math.PI / 2;
  sm2.position.set(-hx + 0.72, 0, -hz + 0.05);
  sm2.visible = false;
  group.add(sm2);

  // the target: a bundle of layered suit cloth on a plank stand
  const bundle = bundleMesh();
  const bundlePos = new THREE.Vector3(-1.75, 0.98, -1.55);
  bundle.group.position.copy(bundlePos);
  group.add(bundle.group);
  const stand = new VoxGrid(16, 14, 10);
  stand.box(0, 12, 0, 16, 14, 10, 0x6a4a2c);
  for (const [x, z] of [[1, 1], [13, 1], [1, 7], [13, 7]] as const) stand.box(x, 0, z, x + 2, 12, z + 2, 0x4a3420);
  const stm = stand.mesh(0.07, matte(), "center");
  stm.position.set(bundlePos.x, 0.5, bundlePos.z);
  group.add(stm);
  bundle.beef.position.set(bundlePos.x + 0.55, 0.82, bundlePos.z + 0.75);
  group.add(bundle.beef);

  // ammunition on the table
  const rGeo = roundGeometry(0.02, false);
  const mGeo = roundGeometry(0.02, true);
  const rounds = new THREE.InstancedMesh(rGeo, matte({ roughness: 0.4 }), 36);
  const meteorRounds = new THREE.InstancedMesh(mGeo, matte({ roughness: 0.5 }), 36);
  const headGeo = new VoxGrid(2, 2, 3).box(0, 0, 0, 2, 2, 3, (x, y, z) => jitter(0xc98f3a, 0.06, x, y, z, 2)).geometry(0.02, "center");
  const heads = new THREE.InstancedMesh(headGeo, matte({ roughness: 0.4 }), 36);
  const sGeo = new VoxGrid(2, 2, 5).box(0, 0, 0, 2, 2, 5, (x, y, z) => jitter(0xa9793a, 0.08, x, y, z, 2)).geometry(0.02, "center");
  const stripped = new THREE.InstancedMesh(sGeo, matte({ roughness: 0.4 }), 36);
  for (const m of [rounds, meteorRounds, heads, stripped]) {
    m.frustumCulled = false;
    group.add(m);
  }
  // 36 rounds in a 6x6 foam tray
  const tray = new VoxGrid(40, 2, 40).box(0, 0, 0, 40, 2, 40, (x, y, z) => (y === 1 && x % 6 > 1 && z % 6 > 1 && x > 1 && z > 1 && x < 38 && z < 38 ? 0x0f1114 : 0x2a2e34));
  const trayM = tray.mesh(0.0125 * 2, matte(), "center");
  trayM.position.set(tablePos.x + 0.35, tableTop + 0.03, tablePos.z + 0.05);
  group.add(trayM);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 36; i++) {
    const col = i % 6, row = Math.floor(i / 6);
    const px = tablePos.x + 0.35 + (col - 2.5) * 0.075 * 0.85;
    const pz = tablePos.z + 0.05 + (row - 2.5) * 0.075 * 0.85;
    m4.makeTranslation(px, tableTop + 0.06, pz);
    rounds.setMatrixAt(i, m4);
    meteorRounds.setMatrixAt(i, m4);
    const hx2 = tablePos.x - 0.35 + (i % 9) * 0.045;
    const hz2 = tablePos.z - 0.2 + Math.floor(i / 9) * 0.05;
    m4.makeTranslation(hx2, tableTop + 0.02, hz2);
    heads.setMatrixAt(i, m4);
  }
  rounds.count = 36;
  meteorRounds.count = 0;
  heads.count = 0;

  // foam case for the finished rounds
  const case32 = new THREE.Group();
  const cs = new VoxGrid(44, 5, 26);
  cs.box(0, 0, 0, 44, 5, 26, (x, y, z) => (y < 4 && x > 1 && x < 42 && z > 1 && z < 24 ? (y === 3 && x % 5 > 0 && z % 5 > 0 ? 0x101215 : 0x2b2f36) : 0x1a1d21));
  case32.add(cs.mesh(0.03, matte(), "center"));
  case32.position.set(tablePos.x + 0.35, tableTop + 0.06, tablePos.z + 0.05);
  case32.visible = false;
  group.add(case32);

  // smoke and dust (instanced cubes, positioned in the shot from absolute time)
  const smokeGeo = new VoxGrid(1, 1, 1).box(0, 0, 0, 1, 1, 1, 0xc9ccd0).geometry(0.16, "center");
  const smoke = new THREE.InstancedMesh(smokeGeo, new THREE.MeshBasicMaterial({ color: 0xa8acb2, transparent: true, opacity: 0.32, depthWrite: false }), 90);
  smoke.frustumCulled = false;
  group.add(smoke);
  const dustGeo = new VoxGrid(1, 1, 1).box(0, 0, 0, 1, 1, 1, 0x9a9a92).geometry(0.03, "center");
  const dust = new THREE.InstancedMesh(dustGeo, new THREE.MeshBasicMaterial({ color: 0x8e8c84 }), 80);
  dust.frustumCulled = false;
  group.add(dust);

  const pliers = new THREE.Object3D();
  group.add(pliers);

  const door = new THREE.Group();
  const dg = new VoxGrid(2, 34, 18);
  dg.box(0, 0, 0, 2, 34, 18, (x, y, z) => (y % 9 === 0 ? 0x2a1c12 : jitter(0x6a4a2c, 0.05, x, y, z, 2)));
  const dm = dg.mesh(0.0625, matte(), "min");
  dm.rotation.y = Math.PI / 2;
  door.add(dm);
  const stairTop = new THREE.Vector3(0, h - 0.1, hz + 0.3 + stairLen);
  door.position.set(-0.55, h - 0.1 - 2.1 + 0.05, stairTop.z + 0.02);
  group.add(door);
  // the bright rectangle beyond the door
  const light = new VoxGrid(20, 34, 1).box(0, 0, 0, 20, 34, 1, 0xfff1cf);
  const lightMesh = new THREE.Mesh(light.geometry(0.0625, "min"), glow({ toneMapped: false, fog: false }));
  lightMesh.position.set(-0.6, h - 0.1 - 2.1 + 0.05, stairTop.z + 0.5);
  group.add(lightMesh);

  const previewLight: LightPreset = {
    bg: 0x030405,
    fog: { color: 0x0b0d10, density: 0.05 },
    hemi: [0x5a6673, 0x14100c, 0.35],
    spot: { color: 0xffd9a0, intensity: 120, pos: [bulbPos.x, bulbPos.y - 0.1, bulbPos.z], target: [-0.6, 0, -0.6], angle: 1.3, penumbra: 0.9, distance: 10 },
    points: [{ color: 0xffcf8a, intensity: 6, pos: [bulbPos.x, bulbPos.y - 0.2, bulbPos.z], distance: 6 }],
  };
  void hx;
  return {
    group, bulbPos, bulb: bl.group, tablePos, tableTop, bundle: bundle.group, bundlePos, holes: bundle.holes, beef: bundle.beef,
    rounds, heads, meteorRounds, stripped, case32, pliers, stairTop, door, smoke, dust, previewLight,
  };
}
