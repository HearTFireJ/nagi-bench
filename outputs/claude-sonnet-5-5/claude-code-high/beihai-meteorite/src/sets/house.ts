import * as THREE from "three";
import { BoxBatch, mats, rng, voxelCylinder, type V3 } from "../blocks";
import { Frame, pixelPanel, rock } from "../kit";
import { T } from "../timing";

export interface HouseSet {
  group: THREE.Group;
  safeDoor: THREE.Group;
  marsCase: THREE.Group;
  update(t: number): void;
}

const WOOD = 0x4a3323;
const WOOD_D = 0x33231a;
const PLASTER = 0x958a72;

function cabinet(solid: BoxBatch, glow: BoxBatch, glass: BoxBatch, cx: number, cz: number, quarter: number, seed: number): void {
  const s = new Frame(solid, cx, cz, quarter);
  const g = new Frame(glow, cx, cz, quarter);
  const gl = new Frame(glass, cx, cz, quarter);
  const W = 2.1;
  const D = 0.6;
  const H = 2.55;
  s.box(-W / 2, 0, -D / 2, W, 0.28, D, WOOD_D); // plinth
  s.box(-W / 2, 0.28, -D / 2, W, H - 0.28, 0.05, 0x1b1a1d); // back panel
  s.box(-W / 2, 0.28, -D / 2, 0.06, H - 0.28, D, WOOD); // sides
  s.box(W / 2 - 0.06, 0.28, -D / 2, 0.06, H - 0.28, D, WOOD);
  s.box(-W / 2 - 0.02, H, -D / 2 - 0.02, W + 0.04, 0.1, D + 0.04, WOOD_D); // crown
  const shelves = [0.28, 0.9, 1.5, 2.08];
  const r = rng(seed);
  shelves.forEach((y, si) => {
    s.box(-W / 2 + 0.06, y, -D / 2 + 0.05, W - 0.12, 0.05, D - 0.05, 0x2b241f);
    if (si > 0) g.box(-W / 2 + 0.1, y - 0.03, D / 2 - 0.12, W - 0.2, 0.025, 0.04, 0xeaf3ff, { jitter: 0, cell: 1 });
    const slots = 5;
    for (let i = 0; i < slots; i++) {
      const x = -W / 2 + 0.28 + (i * (W - 0.56)) / (slots - 1);
      if (r() < 0.12) continue;
      const size = 0.13 + r() * 0.14;
      const plinth = r() < 0.5 ? 0.05 + r() * 0.05 : 0;
      if (plinth) s.box(x - 0.09, y + 0.05, -0.08, 0.18, plinth, 0.18, 0x1c1c1f);
      rock(s, x, y + 0.05 + plinth, -0.02, size, seed * 31 + si * 7 + i);
      s.box(x - 0.05, y + 0.05, 0.16, 0.1, 0.012, 0.05, 0xd8d4c6, { jitter: 0, cell: 1 });
    }
  });
  gl.box(-W / 2 + 0.06, 0.28, D / 2 - 0.03, W - 0.12, H - 0.28, 0.02, 0xbcdcff, { jitter: 0, cell: 3 });
  s.box(-W / 2 + 0.06, 0.28, D / 2 - 0.045, W - 0.12, 0.04, 0.05, WOOD); // glass rails
  s.box(-W / 2 + 0.06, H - 0.05, D / 2 - 0.045, W - 0.12, 0.05, 0.05, WOOD);
  s.box(-0.02, 0.28, D / 2 - 0.045, 0.04, H - 0.33, 0.05, WOOD); // central mullion
}

function stool(fr: Frame, x: number, z: number): void {
  fr.box(x - 0.2, 0.44, z - 0.2, 0.4, 0.06, 0.4, WOOD);
  for (const [dx, dz] of [[-0.16, -0.16], [0.12, -0.16], [-0.16, 0.12], [0.12, 0.12]] as const) fr.box(x + dx, 0, z + dz, 0.05, 0.44, 0.05, WOOD_D);
}

export function buildHouse(): HouseSet {
  const solid = new BoxBatch(0.5, 0.055);
  const glow = new BoxBatch(0.2, 0);
  const glass = new BoxBatch(1, 0);
  const F = new Frame(solid);
  const G = new Frame(glow);

  // ---- shell
  F.box(-5.3, -0.3, -4.8, 10.6, 0.3, 9.6, 0x5a4030, { streak: 0, cell: 0.45, jitter: 0.09 });
  F.box(-5.3, 3.4, -4.8, 10.6, 0.25, 9.6, 0x2a2019);
  for (const z of [-4, -2.6, -1.2, 0.2, 1.6, 3, 4.2]) F.box(-5, 3.05, z - 0.15, 10, 0.35, 0.3, 0x3a2a1f);
  F.box(-5.3, 0, -4.8, 10.6, 3.4, 0.3, PLASTER);
  F.box(-5.3, 0, -4.5, 0.3, 3.4, 9, PLASTER);
  F.box(5, 0, -4.5, 0.3, 3.4, 9, PLASTER);
  F.box(-5.3, 0, 4.5, 4.2, 3.4, 0.3, PLASTER);
  F.box(1.1, 0, 4.5, 4.2, 3.4, 0.3, PLASTER);
  F.box(-1.1, 2.7, 4.5, 2.2, 0.7, 0.3, PLASTER);
  F.box(-5.3, 0, 4.8, 4.2, 3.4, 0.03, 0x6b6a66, { jitter: 0.1 }); // brick face of the wall, courtyard side
  F.box(1.1, 0, 4.8, 4.2, 3.4, 0.03, 0x6b6a66, { jitter: 0.1 });
  F.box(-1.1, 2.7, 4.8, 2.2, 0.7, 0.03, 0x6b6a66, { jitter: 0.1 });
  // wainscot
  F.box(-5, 0, 4.42, 3.9, 0.9, 0.08, WOOD_D);
  F.box(1.1, 0, 4.42, 3.9, 0.9, 0.08, WOOD_D);
  F.box(-5, 0, -4.5, 0.08, 0.9, 9, WOOD_D);
  F.box(4.92, 0, -4.5, 0.08, 0.9, 9, WOOD_D);
  // door frame (lacquer red)
  F.box(-1.3, 0, 4.42, 0.2, 2.8, 0.42, 0x7a2a20);
  F.box(1.1, 0, 4.42, 0.2, 2.8, 0.42, 0x7a2a20);
  F.box(-1.3, 2.7, 4.42, 2.6, 0.18, 0.42, 0x7a2a20);
  F.box(-1.3, 0, 4.4, 2.6, 0.06, 0.5, 0x8a8478); // threshold stone

  // ---- courtyard beyond the door
  F.box(-9, -0.3, 4.8, 18, 0.3, 8, 0x6b6a66, { cell: 0.75, jitter: 0.1 });
  F.box(-9, 0, 12.6, 18, 2.6, 0.4, 0x74716b);
  F.box(-9, 0, 4.8, 0.4, 2.6, 8, 0x74716b);
  F.box(8.6, 0, 4.8, 0.4, 2.6, 8, 0x74716b);
  // jujube tree
  F.box(3.1, 0, 8.4, 0.35, 2.4, 0.35, 0x3b2a20);
  F.box(2.75, 2.1, 8.05, 1.5, 0.35, 1.2, 0x2f4a2c, { cell: 0.35, jitter: 0.16 });
  F.box(2.3, 2.5, 7.8, 1.9, 0.5, 1.7, 0x35552f, { cell: 0.35, jitter: 0.16 });
  F.box(2.9, 3.0, 8.1, 1.0, 0.4, 0.9, 0x3d6034, { cell: 0.35, jitter: 0.16 });
  F.box(-6.5, 0, 9, 1.6, 0.8, 0.9, 0x50493f); // planter
  // sky
  const skyRows = [0xf0a35e, 0xe8905a, 0xd67e5c, 0xb46a64, 0x8a5f78, 0x5f5a86, 0x40507a];
  skyRows.forEach((c, i) => G.box(-14, 0.2 + i * 1.6, 13.3, 28, 1.6, 0.1, c, { cell: 8, jitter: 0 }));

  // ---- cabinets
  [-3.3, -1.1, 1.1, 3.3].forEach((x, i) => cabinet(solid, glow, glass, x, -4.2, 0, 11 + i));
  [-2.2, 0.0].forEach((z, i) => cabinet(solid, glow, glass, -4.7, z, 1, 31 + i));
  cabinet(solid, glow, glass, 4.7, -2.2, 3, 47);

  // ---- rug
  F.box(-3.4, 0.0, -2.4, 4.6, 0.025, 4.4, 0x6a2a24, { cell: 0.4, jitter: 0.08 });
  F.box(-3.25, 0.03, -2.25, 4.3, 0.005, 4.1, 0x3a2620, { cell: 0.4, jitter: 0.05 });
  F.box(-3.1, 0.035, -2.1, 4.0, 0.005, 3.8, 0x6a2a24, { cell: 0.4, jitter: 0.08 });

  // ---- workbench
  const bx = -2.5;
  const bz = -0.85;
  F.box(bx, 0.84, bz, 2.6, 0.1, 1.1, 0x4b3323, { streak: 0 });
  F.box(bx + 0.15, 0.94, bz + 0.25, 1.4, 0.012, 0.65, 0x2f5b45, { cell: 0.3, jitter: 0.04 });
  for (const [dx, dz] of [[0.08, 0.08], [2.42, 0.08], [0.08, 0.92], [2.42, 0.92]] as const) F.box(bx + dx, 0, bz + dz, 0.1, 0.84, 0.1, WOOD_D);
  F.box(bx + 0.08, 0.5, bz + 0.08, 2.44, 0.34, 0.06, WOOD);
  for (let i = 0; i < 3; i++) {
    F.box(bx + 0.2 + i * 0.75, 0.55, bz + 0.98, 0.65, 0.24, 0.03, 0x3a2a1f);
    F.box(bx + 0.5 + i * 0.75, 0.66, bz + 1.01, 0.05, 0.05, 0.03, 0xb5893a, { jitter: 0, cell: 1 });
  }
  // lamp
  F.box(bx + 0.25, 0.94, bz + 0.15, 0.2, 0.04, 0.2, 0x1e3a2e);
  F.box(bx + 0.33, 0.98, bz + 0.23, 0.04, 0.5, 0.04, 0x1e3a2e);
  F.box(bx + 0.33, 1.46, bz + 0.23, 0.55, 0.04, 0.04, 0x1e3a2e);
  F.box(bx + 0.78, 1.36, bz + 0.16, 0.24, 0.12, 0.18, 0x1e3a2e);
  G.box(bx + 0.82, 1.32, bz + 0.2, 0.16, 0.04, 0.1, 0xfff0c0, { jitter: 0, cell: 1 });
  // microscope, eyepiece toward the viewer at the front edge of the bench
  const mx = bx + 2.05;
  const mz = bz + 0.8;
  F.box(mx, 0.94, mz, 0.24, 0.05, 0.28, 0x22252a);
  F.box(mx + 0.09, 0.99, mz + 0.02, 0.06, 0.4, 0.06, 0x2c3037);
  F.box(mx + 0.05, 1.3, mz + 0.02, 0.14, 0.1, 0.24, 0x2c3037);
  F.box(mx + 0.07, 1.4, mz + 0.14, 0.1, 0.2, 0.1, 0x1a1c20);
  F.box(mx + 0.07, 1.6, mz + 0.14, 0.1, 0.05, 0.1, 0x9aa3ab);
  F.box(mx + 0.02, 1.02, mz + 0.08, 0.2, 0.03, 0.14, 0x9aa3ab);
  // tea tray
  F.box(bx + 0.9, 0.95, bz + 0.72, 0.5, 0.025, 0.3, 0x2b2b2e);
  F.box(bx + 0.95, 0.975, bz + 0.78, 0.13, 0.13, 0.13, 0xd9d6cc);
  F.box(bx + 1.08, 1.02, bz + 0.8, 0.07, 0.03, 0.05, 0xd9d6cc);
  // stones on the baize
  rock(F, bx + 0.6, 0.955, bz + 0.5, 0.16, 71, 0x4a4038);
  rock(F, bx + 0.95, 0.955, bz + 0.45, 0.12, 72, 0x6d5f50);
  // loupe stand & notebooks
  F.box(bx + 1.45, 0.94, bz + 0.15, 0.28, 0.04, 0.2, 0x8a3a30);
  F.box(bx + 1.47, 0.98, bz + 0.17, 0.24, 0.03, 0.16, 0xe8e0c8);
  // stool behind bench
  stool(F, -1.2, -1.85);

  // ---- tea corner (right)
  F.box(2.3, 0.7, 0.9, 1.1, 0.06, 1.1, WOOD);
  for (const [dx, dz] of [[0.05, 0.05], [1.0, 0.05], [0.05, 1.0], [1.0, 1.0]] as const) F.box(2.3 + dx, 0, 0.9 + dz, 0.07, 0.7, 0.07, WOOD_D);
  F.box(3.75, 0, 0.7, 0.55, 0.45, 0.55, WOOD);
  F.box(3.75, 0.45, 0.7, 0.05, 0.55, 0.55, WOOD);
  F.box(2.35, 0.76, 1.3, 0.35, 0.3, 0.35, 0x3b6b45, { cell: 0.15, jitter: 0.16 }); // plant
  F.box(2.35, 0.76, 1.3, 0.35, 0.12, 0.35, 0x8a5a3a);

  // ---- wall dressing
  const wall = new Frame(solid, 0, 0, 0);
  // Antarctic photo (back wall, between cabinets and crown)
  const photoRows = [
    "bbbbbbbbbbbbbbbb",
    "bbbbbbbbbbbbbbbb",
    "bbbbbwwbbbbbbbbb",
    "bbbbbbbbbbbbbbbb",
    "wwwwwwwwwwwwwwww",
    "wwwwwwwoowwwwwww",
    "wwwwwwwooowwwwww",
    "wwwwwwwkkwwwwwww",
    "wwwwwwwkkwwwwwww",
    "wwwwwwwwwwwwwwww",
  ];
  // right wall: clock + window; left wall: scroll
  const lw = new Frame(solid, -4.94, 2.7, 1);
  pixelPanel(lw, -0.35, 1.2, 0, [
    "kkkkkk", "krkkrk", "kkrrkk", "krkkrk", "kkkkkk", "krrrrk", "kkkrkk", "krkkrk", "kkrkkk", "kkkkkk",
  ].map((r) => r.replace(/r/g, "r")), { k: 0xd8ceb0, r: 0x2a2624 }, 0.12, 0.03);
  lw.box(-0.4, 2.36, -0.03, 0.85, 0.05, 0.08, 0x2a1f18);
  lw.box(-0.4, 1.14, -0.03, 0.85, 0.05, 0.08, 0x2a1f18);
  const rw = new Frame(solid, 4.94, 0.2, 3);
  void photoRows;
  const winF = new Frame(solid, 4.93, 2.6, 3);
  const winG = new Frame(glow, 4.93, 2.6, 3);
  winG.box(-0.9, 1.05, 0.0, 1.8, 1.3, 0.03, 0xe6c48a, { jitter: 0.06, cell: 0.3 });
  for (let i = 0; i <= 4; i++) winF.box(-0.9 + i * 0.45 - 0.02, 1.02, -0.02, 0.05, 1.36, 0.08, WOOD_D);
  for (let j = 0; j <= 3; j++) winF.box(-0.92, 1.02 + j * 0.43, -0.02, 1.84, 0.05, 0.08, WOOD_D);
  void rw;
  // pendant lantern
  G.box(1.45, 2.45, 0.35, 0.4, 0.5, 0.4, 0xffc27a, { jitter: 0.08, cell: 0.2 });
  F.box(1.63, 2.95, 0.53, 0.04, 0.5, 0.04, 0x1a1a1a);
  F.box(1.4, 2.9, 0.3, 0.5, 0.06, 0.5, 0x7a2a20);
  F.box(1.4, 2.39, 0.3, 0.5, 0.06, 0.5, 0x7a2a20);

  // ---- safe (left wall) — body is open at +x, door is a separate hinged group
  const sx = -4.95;
  const sz = 1.25;
  F.box(sx, 0, sz - 0.05, 0.75, 0.32, 1.0, WOOD_D); // stand
  F.box(sx, 0.32, sz - 0.05, 0.75, 1.0, 0.1, 0x3a444c, { jitter: 0.03, cell: 0.25 });
  F.box(sx, 0.32, sz + 0.85, 0.75, 1.0, 0.1, 0x3a444c, { jitter: 0.03, cell: 0.25 });
  F.box(sx, 0.32, sz + 0.05, 0.1, 1.0, 0.8, 0x2c333a);
  F.box(sx, 1.22, sz + 0.05, 0.75, 0.1, 0.8, 0x3a444c);
  F.box(sx, 0.32, sz + 0.05, 0.75, 0.1, 0.8, 0x3a444c);
  F.box(sx + 0.1, 0.72, sz + 0.05, 0.62, 0.04, 0.8, 0x2c333a); // shelf
  const doorGroup = new THREE.Group();
  doorGroup.position.set(sx + 0.75, 0, sz - 0.05);
  const doorBatch = new BoxBatch(0.25, 0.03);
  const D = new Frame(doorBatch, 0, 0, 0);
  D.box(0, 0.32, 0.0, 0.1, 1.0, 0.95, 0x4a5560);
  D.box(0.1, 0.42, 0.08, 0.02, 0.8, 0.79, 0x3a444c);
  D.box(0.1, 0.78, 0.6, 0.06, 0.1, 0.16, 0xb0b6bc);
  doorGroup.add(doorBatch.mesh(mats.solid(0.5, 0.5)));
  const dial = new THREE.Mesh(voxelCylinder(3, 2, 0x9aa1a8, 0.05, "x"), mats.solid(0.4, 0.6));
  (dial.material as THREE.MeshStandardMaterial).vertexColors = true;
  dial.position.set(0.14, 0.93, 0.32);
  doorGroup.add(dial);
  // Mars fragment in a clear case, sits on the safe shelf
  const marsCase = new THREE.Group();
  const mb = new BoxBatch(0.05, 0.1);
  const M = new Frame(mb);
  M.box(-0.07, 0, -0.07, 0.14, 0.02, 0.14, 0x1b1b1d);
  M.box(-0.02, 0.02, -0.02, 0.05, 0.03, 0.04, 0x6b3a2a, { cell: 0.02, jitter: 0.2 });
  marsCase.add(mb.mesh(mats.solid(0.9)));
  const mgl = new BoxBatch(1, 0);
  new Frame(mgl).box(-0.08, 0.02, -0.08, 0.16, 0.12, 0.16, 0xcfe9ff, { jitter: 0, cell: 1 });
  marsCase.add(mgl.mesh(mats.glass(0.22), false));
  marsCase.position.set(sx + 0.42, 1.04, sz + 0.45);

  // ---- assemble
  const group = new THREE.Group();
  group.add(solid.mesh(mats.solid(0.94)));
  group.add(glow.mesh(mats.glow(), false));
  group.add(glass.mesh(mats.glass(0.13), false));
  group.add(doorGroup, marsCase);

  // door leaves
  const leafBatch = (side: 1 | -1) => {
    const b = new BoxBatch(0.3, 0.04);
    const f = new Frame(b);
    const x0 = side === 1 ? 0 : -1.1;
    f.box(x0, 0, 0, 1.1, 2.7, 0.08, 0x8e2a22);
    const studs = new BoxBatch(1, 0);
    const sf = new Frame(studs);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) sf.box(x0 + 0.15 + i * 0.27, 0.3 + j * 0.5, 0.08, 0.07, 0.07, 0.04, 0xd9a93c, { jitter: 0, cell: 1 });
    const g = new THREE.Group();
    g.add(b.mesh(mats.solid(0.7)), studs.mesh(mats.solid(0.4, 0.6)));
    return g;
  };
  const leafL = leafBatch(1);
  leafL.position.set(-1.1, 0, 4.46);
  const leafR = leafBatch(-1);
  leafR.position.set(1.1, 0, 4.46);
  group.add(leafL, leafR);

  // clock
  const clock = new THREE.Group();
  clock.position.set(4.9, 2.25, 0.2);
  const face = new THREE.Mesh(voxelCylinder(5, 1.6, 0xe8e2cf, 0.06, "x"), mats.solid(0.8));
  clock.add(face);
  const hands = new THREE.Group();
  const hb = new BoxBatch(0.05, 0);
  new Frame(hb).box(-0.32, 0, -0.015, 0.03, 0.26, 0.03, 0x1a1a1a);
  const hb2 = new BoxBatch(0.05, 0);
  new Frame(hb2).box(-0.34, 0, -0.012, 0.03, 0.17, 0.03, 0x1a1a1a);
  const minute = hb.mesh(mats.glow(), false);
  const hour = hb2.mesh(mats.glow(), false);
  hands.add(minute, hour);
  clock.add(hands);
  const pend = new THREE.Group();
  pend.position.set(-0.2, -0.3, 0);
  const pb = new BoxBatch(0.05, 0);
  new Frame(pb).box(-0.01, -0.55, -0.01, 0.02, 0.55, 0.02, 0xb5893a);
  new Frame(pb).box(-0.05, -0.65, -0.05, 0.1, 0.1, 0.1, 0xb5893a);
  pend.add(pb.mesh(mats.glow(), false));
  clock.add(pend);
  group.add(clock);

  // dust motes
  const moteGeo = new THREE.BoxGeometry(0.018, 0.018, 0.018);
  const motes = new THREE.InstancedMesh(moteGeo, new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.55, fog: false }), 46);
  const r = rng(5);
  const base: V3[] = Array.from({ length: 46 }, () => [-4 + r() * 8, 0.4 + r() * 2.5, -3 + r() * 6.5]);
  group.add(motes);

  const m4 = new THREE.Matrix4();
  return {
    group,
    safeDoor: doorGroup,
    marsCase,
    update(t: number) {
      const open = THREE.MathUtils.smoothstep(t, T.doorOpen0, T.doorOpen1);
      leafL.rotation.y = -open * 1.6;
      leafR.rotation.y = open * 1.6;
      const so = THREE.MathUtils.smoothstep(t, T.safeOpen0, T.safeOpen1);
      doorGroup.rotation.y = so * 1.75;
      minute.rotation.x = 0;
      hands.rotation.x = t * 0.02;
      hour.rotation.x = 0.7;
      minute.rotation.x = -0.5;
      pend.rotation.x = 0;
      pend.rotation.z = Math.sin(t * Math.PI) * 0.22;
      base.forEach((p, i) => {
        const a = t * 0.13 + i * 1.7;
        m4.makeTranslation(p[0] + Math.sin(a) * 0.25, p[1] + Math.sin(a * 1.3 + i) * 0.12, p[2] + Math.cos(a * 0.9) * 0.2);
        motes.setMatrixAt(i, m4);
      });
      motes.instanceMatrix.needsUpdate = true;
    },
  };
}
