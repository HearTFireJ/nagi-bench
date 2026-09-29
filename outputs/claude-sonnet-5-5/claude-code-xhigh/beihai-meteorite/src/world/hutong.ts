import * as THREE from "three";
import { VoxGrid, glow, matte } from "../util/vox";
import { hash, hash2, hash3, jitter, mix, mulberry32, shade } from "../util/math";

/**
 * A Beijing hutong at dusk: grey brick walls, a red gate, a golden ginkgo, wires
 * overhead. The lane runs along +Z; the gate is on the right (+X) wall at z≈18.
 */
export const GATE_Z = 18;
export const LANE_HALF = 3;

export interface Hutong {
  group: THREE.Group;
  /** World position of the door knocker (for the insert shot). */
  knocker: THREE.Vector3;
  doorLeaf: THREE.Mesh;
  lantern: THREE.Mesh;
  lanternPos: THREE.Vector3;
  leaves: THREE.InstancedMesh;
  animate(t: number): void;
}

function brickWall(len: number, height: number, thick: number, voxel: number, seed: number, gap?: [number, number]): VoxGrid {
  const g = new VoxGrid(thick, height, len);
  g.box(0, 0, 0, thick, height, len, (x, y, z) => {
    if (gap && z >= gap[0] && z < gap[1] && y < height - 14) return null;
    const course = Math.floor(y / 2);
    const off = course % 2 ? 4 : 0;
    const brickIx = Math.floor((z + off) / 8);
    const mortar = y % 2 === 1 || (z + off) % 8 === 7;
    let col: number;
    if (y < 10) col = jitter(0x8b877f, 0.07, x, y, z, seed);
    else if (mortar) col = 0x8c8983;
    else {
      const h = hash2(brickIx, course, seed);
      col = mix(0x5b5a5d, 0x4a4b50, h);
      if (h > 0.9) col = 0x6d5f57;
      col = jitter(col, 0.05, x, y, z, seed + 1);
    }
    if (y >= height - 6) {
      // capping tiles
      const ridge = (z % 4 < 2);
      col = ridge ? 0x3a3d42 : 0x2d3035;
      if (y >= height - 2) col = 0x2a2c31;
    }
    return col;
  });
  void voxel;
  return g;
}

function buildGate(): THREE.Group {
  const grp = new THREE.Group();
  const v = 0.0625;
  const g = new VoxGrid(40, 68, 60);
  const RED = 0x8f2a21;
  const BRASS = 0xc9a04a;
  // door leaves set back into the wall (x 20..24)
  g.box(20, 0, 8, 24, 44, 52, (x, y, z) => {
    if (z >= 29 && z < 31) return 0x231210;
    const stud = (z % 8 === 3 || z % 8 === 4) && (y % 8 === 3 || y % 8 === 4) && y > 6 && y < 40 && x === 23;
    if (stud) return BRASS;
    return jitter(RED, 0.05, x, y, z, 3);
  });
  // knockers
  for (const z of [22, 37]) {
    g.box(24, 20, z, 25, 26, z + 1, BRASS);
    g.box(24, 20, z, 25, 21, z + 5, BRASS);
    g.box(24, 25, z, 25, 26, z + 5, BRASS);
    g.box(24, 20, z + 4, 25, 26, z + 5, BRASS);
  }
  // door frame + lintel
  g.box(16, 0, 4, 28, 48, 8, RED);
  g.box(16, 0, 52, 28, 48, 56, RED);
  g.box(16, 44, 4, 30, 52, 56, (x, y, z) => (y === 44 ? 0x2a6b5e : jitter(RED, 0.05, x, y, z, 2)));
  // painted eave band (blue/green/gold)
  g.box(8, 52, 0, 34, 56, 60, (x, y, z) => {
    const k = Math.floor(z / 4) % 3;
    return k === 0 ? 0x2a6b5e : k === 1 ? 0x2f5aa8 : 0xe0b34a;
  });
  // stone drums and steps
  for (const z of [0, 56]) {
    g.box(14, 0, z, 30, 14, z + 4, (x, y, zz) => jitter(0x8f8b84, 0.06, x, y, zz, 4));
  }
  g.box(24, 0, 8, 32, 3, 52, 0x9a968f);
  g.box(28, 0, 8, 34, 2, 52, 0xa39f98);
  // gable roof (grey tiles), ridge along Z
  for (let level = 0; level < 12; level++) {
    const y = 56 + level;
    const half = 30 - Math.floor(level * 1.9);
    const x0 = 22 - Math.floor(level * 1.7), x1 = 22 + Math.floor(level * 1.7);
    void half; void x0; void x1;
  }
  const roof = new VoxGrid(48, 16, 68);
  for (let y = 0; y < 16; y++) {
    const inset = Math.floor(y * 1.5);
    for (let x = inset; x < 48 - inset; x++) {
      for (let z = 0; z < 68; z++) {
        const tile = (z % 4 < 2) ? 0x3d4046 : 0x30333a;
        const edge = x === inset || x === 47 - inset;
        roof.set(x, y, z, jitter(edge ? 0x54575d : tile, 0.05, x, y, z, 6));
      }
    }
  }
  const roofMesh = roof.mesh(v, matte(), "min");
  roofMesh.position.set(-0.5, 56 * v + 0.2 - 0.4, -0.4);
  const gateMesh = g.mesh(v, matte(), "min");
  grp.add(gateMesh, roofMesh);
  // ridge ornaments
  const orn = new VoxGrid(6, 5, 8).box(0, 0, 0, 6, 5, 8, 0x25272c);
  const ornMesh = orn.mesh(v, matte(), "min");
  ornMesh.position.set(1.0, 56 * v + 16 * v + 0.0, -0.1);
  grp.add(ornMesh);
  return grp;
}

function buildTree(): THREE.Group {
  const grp = new THREE.Group();
  const v = 0.125;
  const g = new VoxGrid(72, 72, 72);
  g.cyl(36, 36, 3.2, 0, 34, (x, y, z) => jitter(0x4b3a2b, 0.12, x, y, z, 7));
  const rand = mulberry32(19);
  const balls: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 9; i++) {
    balls.push([36 + (rand() - 0.5) * 34, 44 + rand() * 16, 36 + (rand() - 0.5) * 34, 10 + rand() * 7]);
  }
  for (const [cx, cy, cz, r] of balls) {
    g.ball(cx, cy, cz, r, (x, y, z) => {
      if (hash3(x, y, z, 12) > 0.72) return null;
      const h = hash3(x, y, z, 5);
      return h > 0.75 ? 0xe89a2a : h > 0.35 ? 0xe2b432 : 0xc98f22;
    });
  }
  // branches
  for (const [dx, dz] of [[-9, 4], [8, -6], [3, 10], [-4, -10]] as const) {
    for (let s = 0; s < 14; s++) g.box(36 + dx * (s / 14) * 1.2, 32 + s * 0.9, 36 + dz * (s / 14) * 1.2, 38 + dx * (s / 14) * 1.2, 34 + s * 0.9, 38 + dz * (s / 14) * 1.2, 0x4b3a2b);
  }
  grp.add(g.mesh(v, matte({ roughness: 1 }), "center"));
  grp.children[0]!.position.y = 36 * v;
  return grp;
}

function buildBicycle(): THREE.Group {
  const v = 0.0625;
  const g = new VoxGrid(4, 24, 40);
  const ring = (cz: number) => {
    for (let y = 0; y < 24; y++) {
      for (let z = 0; z < 40; z++) {
        const d = Math.hypot(y - 11.5, z - cz);
        if (d > 9.4 && d < 11) g.set(1, y, z, 0x1a1a1c);
        if (d < 1.4) g.set(1, y, z, 0x9aa1aa);
      }
    }
  };
  ring(10.5);
  ring(29.5);
  g.box(1, 10, 10, 2, 11, 30, 0x33607a);
  for (let s = 0; s < 14; s++) g.box(1, 11 + s * 0.6, 10 + s, 2, 12 + s * 0.6, 11 + s, 0x33607a);
  for (let s = 0; s < 12; s++) g.box(1, 11 + s * 0.8, 30 - s * 0.9, 2, 12 + s * 0.8, 31 - s * 0.9, 0x33607a);
  g.box(0, 21, 8, 3, 22, 14, 0x1a1a1c);
  g.box(0, 21, 26, 3, 22, 34, 0x1a1a1c);
  g.box(1, 24 - 1, 26, 2, 24, 30, 0x1a1a1c);
  return (() => {
    const grp = new THREE.Group();
    grp.add(g.mesh(v, matte({ roughness: 0.6 }), "min"));
    return grp;
  })();
}

function buildCabbages(): THREE.Group {
  const grp = new THREE.Group();
  const v = 0.0625;
  const g = new VoxGrid(28, 16, 20);
  const rand = mulberry32(5);
  for (let i = 0; i < 12; i++) {
    const cx = 3 + (i % 4) * 6, cz = 3 + Math.floor(i / 4) * 6, cy = (i % 3 === 0 ? 0 : 0);
    g.ball(cx + 1, cy + 3.5 + (i > 7 ? 5 : 0), cz + 1, 3.3, (x, y, z) => (hash3(x, y, z, 2) > 0.5 ? 0x7fae4a : 0xb7d67a));
    void rand;
  }
  grp.add(g.mesh(v, matte(), "min"));
  const coal = new VoxGrid(24, 14, 14);
  for (let i = 0; i < 10; i++) {
    const cx = 2 + (i % 5) * 4.5, cz = 2 + Math.floor(i / 5) * 6.5;
    coal.cyl(cx + 1.5, cz + 1.5, 2.2, 0, 4 + (i % 2) * 4, (x, y, z) => (Math.hypot(x - cx - 1.5, z - cz - 1.5) < 0.7 ? 0x0a0a0a : jitter(0x26272a, 0.1, x, y, z, 1)));
  }
  const cm = coal.mesh(v, matte(), "min");
  cm.position.set(0, 0, 1.6);
  grp.add(cm);
  return grp;
}

function buildWires(): THREE.Mesh {
  const v = 0.0625;
  const g = new VoxGrid(100, 14, 3);
  for (const [zi, sag] of [[0, 1.0]] as const) {
    for (let x = 0; x < 100; x++) {
      const k = (x / 99) * 2 - 1;
      const y = Math.round(12 - (1 - k * k) * 9 * sag);
      g.set(x, y, zi + 1, 0x101114);
    }
  }
  return g.mesh(v, matte(), "min");
}

function skyBands(w: number, h: number, voxel: number): THREE.Mesh {
  const g = new VoxGrid(w, h, 1);
  const bands = [0x141c38, 0x1b2549, 0x2a2f5a, 0x3d3a6b, 0x584578, 0x7c4f80, 0xa85d78, 0xd0707a, 0xe98f6c, 0xf3b17a, 0xf7cf95, 0xfae3b0];
  for (let y = 0; y < h; y++) {
    const k = Math.min(bands.length - 1, Math.floor(((h - 1 - y) / h) * bands.length));
    for (let x = 0; x < w; x++) {
      let col = bands[k]!;
      if (k <= 3 && hash2(x, y, 4) > 0.996) col = 0xdfe6ff;
      g.set(x, y, 0, col);
    }
  }
  return g.mesh(voxel, glow({ toneMapped: false, fog: false }), "min");
}

function skyline(w: number, voxel: number): THREE.Mesh {
  const g = new VoxGrid(w, 26, 1);
  const rand = mulberry32(77);
  let x = 0;
  while (x < w) {
    const bw = 6 + Math.floor(rand() * 14);
    const bh = 6 + Math.floor(rand() * 18);
    g.box(x, 0, 0, Math.min(w, x + bw), bh, 1, 0x1a1a24);
    // roof lip, lit window specks
    for (let k = 0; k < 3; k++) {
      const wx = x + 1 + Math.floor(rand() * (bw - 2)), wy = 2 + Math.floor(rand() * Math.max(1, bh - 4));
      if (rand() > 0.5) g.set(wx, wy, 0, 0xffc76b);
    }
    x += bw;
  }
  return g.mesh(voxel, glow({ toneMapped: false, fog: false }), "min");
}

export function buildHutong(): Hutong {
  const group = new THREE.Group();
  group.name = "hutong";
  const v = 0.0625;

  // ground
  const ground = new VoxGrid(128, 3, 640);
  ground.box(0, 0, 0, 128, 3, 640, (x, y, z) => {
    const paver = Math.floor(z / 12) + Math.floor(x / 20) * 3;
    const seam = z % 12 === 0 || x % 20 === 0;
    let col = seam ? 0x3b3a3c : mix(0x6f6d6b, 0x5c5a5a, hash(paver));
    const edge = Math.min(x, 127 - x);
    if (edge < 6) col = mix(col, 0x4a5a3a, (6 - edge) / 10);
    return jitter(col, 0.05, x, y, z, 2);
  });
  const gm = ground.mesh(v, matte(), "min");
  gm.position.set(-4, -3 * v, -6);
  gm.castShadow = false;
  group.add(gm);

  // walls
  const wallL = brickWall(640, 56, 12, v, 3).mesh(v, matte(), "min");
  wallL.position.set(-3.75, 0, -6);
  const gate0 = (GATE_Z - 1.85 + 6) / v;
  const wallR = brickWall(640, 56, 12, v, 5, [gate0, gate0 + 3.7 / v]).mesh(v, matte(), "min");
  wallR.position.set(3.0, 0, -6);
  group.add(wallL, wallR);

  const gate = buildGate();
  gate.position.set(2.2, 0, GATE_Z - 1.9);
  group.add(gate);

  const tree = buildTree();
  tree.position.set(-5.4, 0, 11);
  group.add(tree);
  const tree2 = buildTree();
  tree2.position.set(5.6, 0, 27);
  tree2.rotation.y = 1.3;
  tree2.scale.setScalar(0.85);
  group.add(tree2);

  const bike = buildBicycle();
  bike.position.set(-2.85, 0, 13.2);
  bike.rotation.y = Math.PI / 2 + 0.06;
  bike.position.x = -2.65;
  group.add(bike);
  const veg = buildCabbages();
  veg.position.set(2.15, 0, 7.5);
  group.add(veg);

  // overhead wires
  for (const [z, dy] of [[4, 0], [23, 0.15], [30, -0.1]] as const) {
    const w = buildWires();
    w.scale.x = (6.1 / (100 * v));
    w.position.set(-3.05, 2.9 + dy, z);
    group.add(w);
  }

  // lantern under the gate eave
  const lg = new VoxGrid(8, 10, 8);
  lg.cyl(4, 4, 3.8, 1, 9, (x, y, z) => (y % 3 === 0 ? 0xe8a13a : 0xff3b1f));
  lg.box(3, 9, 3, 5, 10, 5, 0x2a2a2a);
  lg.box(3, 0, 3, 5, 1, 5, 0xe8a13a);
  const lantern = new THREE.Mesh(lg.geometry(0.07, "center"), glow({ toneMapped: false }));
  const lanternPos = new THREE.Vector3(2.55, 2.45, GATE_Z - 1.1);
  lantern.position.copy(lanternPos);
  lantern.castShadow = false;
  group.add(lantern);

  // wall lamp
  const wl = new VoxGrid(4, 5, 4).box(0, 0, 0, 4, 5, 4, 0xfff0c8);
  const lamp = new THREE.Mesh(wl.geometry(0.06, "center"), glow({ toneMapped: false }));
  lamp.position.set(-2.85, 2.3, 8.5);
  group.add(lamp);

  // end of the lane: a cross building with a few warm windows, then sky and skyline
  const endWall = new VoxGrid(128, 64, 10);
  endWall.box(0, 0, 0, 128, 64, 10, (x, y, z) => {
    const win = (x % 24 > 8 && x % 24 < 16) && y > 22 && y < 40 && z === 9;
    if (win) return 0xffc36b;
    return jitter(0x4a4b50, 0.06, x, y, z, 9);
  });
  const ew = endWall.mesh(0.0625 * 2, matte(), "min");
  ew.position.set(-8, 0, 38);
  group.add(ew);

  const sky = skyBands(320, 64, 1);
  sky.position.set(-160, -6, 96);
  sky.scale.set(1, 1, 1);
  group.add(sky);
  const sky2 = skyBands(320, 64, 1);
  sky2.position.set(160, -6, -60);
  sky2.rotation.y = Math.PI;
  group.add(sky2);
  const sl = skyline(320, 1);
  sl.position.set(-160, -4, 94);
  group.add(sl);

  // falling leaves (deterministic in time)
  const leafGeo = new VoxGrid(2, 1, 2).box(0, 0, 0, 2, 1, 2, 0xe6b032).geometry(0.07, "center");
  const leaves = new THREE.InstancedMesh(leafGeo, matte({ roughness: 1 }), 40);
  leaves.frustumCulled = false;
  group.add(leaves);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const animate = (t: number): void => {
    for (let i = 0; i < 40; i++) {
      const seed = i * 7.31;
      const life = 9 + hash(i) * 6;
      const ph = ((t + hash(i + 50) * life) % life) / life;
      const x = -3.2 + hash(i + 100) * 5 + Math.sin(t * 0.8 + seed) * 0.4 + ph * 0.6;
      const z = 6 + hash(i + 200) * 14 + Math.cos(t * 0.6 + seed) * 0.3;
      const y = 4.6 - ph * 4.5;
      e.set(t * 1.3 + seed, t * 0.9, t * 1.7 + seed);
      q.setFromEuler(e);
      p.set(x, y, z);
      m4.compose(p, q, s);
      leaves.setMatrixAt(i, m4);
    }
    leaves.instanceMatrix.needsUpdate = true;
  };

  const knocker = new THREE.Vector3(3.0 + 0.4, 1.4, GATE_Z - 0.6);
  const doorLeaf = gate.children[0] as THREE.Mesh;
  return { group, knocker, doorLeaf, lantern, lanternPos, leaves, animate };
}

export { shade };
