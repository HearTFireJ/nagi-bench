import * as THREE from "three";
import { BoxBatch, mats, rng, seg, voxelCylinder, type V3 } from "../blocks";
import { Frame } from "../kit";
import { T } from "../timing";

export interface ShopSet {
  group: THREE.Group;
  drillTool: THREE.Object3D;
  tin: THREE.Object3D;
  tray: THREE.Vector3;
  update(t: number): void;
}

/** Brightness of the overhead tubes over time: dark, a stutter, full, then out. */
export function tubeLevel(t: number): number {
  const on = t - T.shopLight;
  let v = 0;
  if (on > 0) v = on < 0.9 ? (Math.sin(on * 60) > 0.2 ? 1 : 0.15) * (on < 0.45 ? 0.5 : 1) : 1;
  if (t > T.shopDark) v = t - T.shopDark < 0.5 ? 0.3 : 0;
  return v;
}

export const SHOP = {
  spindle: [0.0, 1.9, -1.4] as V3,
  sawAt: [0.35, 1.3, -1.4] as V3,
  trayAt: [1.55, 0.98, 1.05] as V3,
  entrance: [-6.6, 0, 2.2] as V3,
};

export function buildShop(): ShopSet {
  const solid = new BoxBatch(0.6, 0.06);
  const glow = new BoxBatch(0.3, 0);
  const glass = new BoxBatch(1, 0);
  const F = new Frame(solid);
  const G = new Frame(glow);

  // ---- shell
  F.box(-7.3, -0.3, -5.8, 14.6, 0.3, 11.6, 0x4d5157, { cell: 0.7, jitter: 0.06 });
  for (const x of [-3.2, 3.2]) F.box(x - 0.05, 0.001, -3.4, 0.1, 0.006, 4.8, 0xd8b53a, { jitter: 0, cell: 3 });
  F.box(-3.2, 0.001, -3.4, 6.4, 0.006, 0.1, 0xd8b53a, { jitter: 0, cell: 3 });
  F.box(-3.2, 0.001, 1.3, 6.4, 0.006, 0.1, 0xd8b53a, { jitter: 0, cell: 3 });
  F.box(-7.3, 0, -5.8, 14.6, 5.4, 0.3, 0x808b93);
  F.box(-7.3, 0, -5.5, 14.6, 1.3, 0.06, 0x4b6072);
  F.box(-7.3, 0, -5.5, 0.3, 5.4, 6.9, 0x808b93);
  F.box(-7.3, 0, 3.0, 0.3, 5.4, 2.5, 0x808b93);
  F.box(-7.3, 2.5, 1.4, 0.3, 2.9, 1.6, 0x808b93);
  F.box(7, 0, -5.5, 0.3, 5.4, 11, 0x808b93);
  F.box(-7, 0, -5.5, 0.06, 1.3, 6.9, 0x4b6072);
  F.box(-7, 0, 3.0, 0.06, 1.3, 2.5, 0x4b6072);
  F.box(6.94, 0, -5.5, 0.06, 1.3, 11, 0x4b6072);
  F.box(-7.3, 0, 5.5, 14.6, 5.4, 0.3, 0x808b93);
  F.box(-7.3, 5.2, -5.8, 14.6, 0.3, 11.6, 0x2b2f34);
  for (let z = -5; z <= 5; z += 2.5) F.box(-7, 4.75, z - 0.12, 14, 0.4, 0.24, 0x30343a);
  for (const x of [-6, -2, 2, 6]) F.box(x - 0.08, 4.75, -5.5, 0.16, 0.4, 11, 0x30343a);
  // windows high on the back wall
  for (const x of [-4.8, -1.6, 1.6, 4.8]) {
    G.box(x - 1.0, 3.0, -5.48, 2.0, 1.4, 0.05, 0x3a4c82, { jitter: 0.05, cell: 0.5 });
    F.box(x - 1.05, 2.95, -5.5, 2.1, 0.08, 0.1, 0x30343a);
    F.box(x - 1.05, 4.4, -5.5, 2.1, 0.08, 0.1, 0x30343a);
    F.box(x - 0.03, 3.0, -5.5, 0.06, 1.4, 0.1, 0x30343a);
    F.box(x - 1.05, 3.0, -5.5, 0.06, 1.4, 0.1, 0x30343a);
    F.box(x + 0.99, 3.0, -5.5, 0.06, 1.4, 0.1, 0x30343a);
  }
  // entrance, left wall
  G.box(-7.9, 0, 1.4, 0.05, 2.5, 1.6, 0xb8c8e8, { jitter: 0.04, cell: 0.5 }); // corridor light beyond the open door
  F.box(-7.9, -0.3, 1.0, 0.6, 0.3, 2.4, 0x4d5157);
  F.box(-7.05, 2.45, 1.4, 0.18, 0.15, 1.6, 0x30343a);
  F.box(-7.05, 0, 1.4, 0.18, 2.5, 0.12, 0x30343a);
  F.box(-7.05, 0, 2.98, 0.18, 2.5, 0.12, 0x30343a);
  // safety sign
  G.box(-6.96, 2.6, -1.0, 0.03, 0.7, 0.9, 0x2f9a58, { jitter: 0, cell: 1 });
  G.box(-6.94, 2.9, -0.7, 0.03, 0.1, 0.3, 0xf2f2f2, { jitter: 0, cell: 1 });
  G.box(-6.94, 2.7, -0.6, 0.03, 0.5, 0.1, 0xf2f2f2, { jitter: 0, cell: 1 });

  // ---- old lathe (dressing)
  const L = new Frame(solid, -5.3, -3.6, 0);
  L.box(-1.5, 0, -0.7, 3.0, 0.8, 1.4, 0x3d5a45);
  L.box(-1.4, 0.8, -0.5, 2.8, 0.15, 0.9, 0x2a3a30);
  L.box(-1.4, 0.95, -0.4, 0.7, 0.6, 0.7, 0x3d5a45);
  L.box(-0.7, 1.1, -0.1, 0.3, 0.3, 0.3, 0x9aa1a8);
  L.box(0.9, 0.95, -0.3, 0.5, 0.4, 0.6, 0x3d5a45);
  // ---- workbench & tools
  const wb = new Frame(solid, 4.6, -4.5, 0);
  wb.box(-1.6, 0.85, -0.5, 3.2, 0.1, 1.0, 0x5a4636);
  wb.box(-1.55, 0, -0.45, 0.1, 0.85, 0.9, 0x30343a);
  wb.box(1.45, 0, -0.45, 0.1, 0.85, 0.9, 0x30343a);
  wb.box(-0.3, 0.95, -0.3, 0.4, 0.22, 0.3, 0x2a2e33);
  wb.box(-0.15, 1.17, -0.25, 0.1, 0.06, 0.2, 0x8f979e);
  const tc = new Frame(solid, 6.3, -2.2, 0);
  tc.box(-0.5, 0, -0.35, 1.0, 1.2, 0.7, 0xa62b25);
  for (let i = 0; i < 4; i++) tc.box(-0.45, 0.1 + i * 0.28, 0.34, 0.9, 0.22, 0.03, 0x7f1f1b);
  const barrels = new BoxBatch(1, 0.05);
  // oil drums (voxel cylinders)
  const drumGeo = voxelCylinder(5, 12, (x, y) => (y % 5 === 0 ? 0x1f3a66 : 0x2a4d88), 0.08, "y");
  const drums: THREE.Mesh[] = [];
  for (const [x, z] of [[-6.2, 3.8], [-5.4, 4.2], [-6.3, 4.6]] as const) {
    const d = new THREE.Mesh(drumGeo, mats.solid(0.6, 0.3));
    d.position.set(x, 0.48, z);
    d.castShadow = true;
    drums.push(d);
  }
  void barrels;
  // shelves with boxes
  const sh = new Frame(solid, 5.8, 4.7, 0);
  for (let i = 0; i < 3; i++) sh.box(-1.4, 0.4 + i * 0.8, -0.3, 2.8, 0.05, 0.6, 0x5c626a);
  for (const x of [-1.4, 1.35]) sh.box(x, 0, -0.3, 0.05, 2.5, 0.6, 0x5c626a);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) sh.box(-1.3 + j * 0.55, 0.45 + i * 0.8, -0.25, 0.45, 0.32 + ((i + j) % 2) * 0.1, 0.5, [0x9a7b4f, 0x8a6d44, 0xb08d5c][(i + j) % 3]!);
  // aluminium bar pallet
  for (let i = 0; i < 5; i++) F.box(-5.9, 0.15 + i * 0.1, 0.2, 1.4, 0.08, 0.15, 0xaeb6bd, { cell: 0.4 });
  F.box(-6.0, 0, 0.1, 1.6, 0.12, 0.5, 0x6a5a45);

  // ---- the CNC machine
  const mz = -1.4;
  F.box(-1.9, 0, mz - 1.3, 3.8, 0.9, 2.6, 0x35485a, { jitter: 0.04 });
  F.box(-1.9, 2.4, mz - 1.3, 3.8, 0.16, 2.6, 0x35485a, { jitter: 0.04 });
  F.box(-1.9, 0.9, mz - 1.3, 3.8, 1.5, 0.1, 0x2c3a46);
  for (const x of [-1.9, 1.78]) F.box(x, 0.9, mz + 1.15, 0.12, 1.5, 0.15, 0x2a3844);
  F.box(-1.9, 0.9, mz - 1.3, 0.1, 1.5, 2.6, 0x2c3a46);
  F.box(1.8, 0.9, mz - 1.3, 0.1, 1.5, 2.6, 0x2c3a46);
  F.box(0.65, 0.9, mz + 1.15, 1.13, 1.5, 0.12, 0x35485a);
  G.box(0.85, 1.75, mz + 1.28, 0.75, 0.5, 0.02, 0x3ee08a, { jitter: 0.1, cell: 0.1 });
  for (let i = 0; i < 4; i++) G.box(0.85 + i * 0.2, 1.45, mz + 1.28, 0.12, 0.08, 0.02, [0xff5040, 0xffc040, 0x40ff80, 0x60a0ff][i]!, { jitter: 0, cell: 1 });
  F.box(0.85, 1.05, mz + 1.28, 0.75, 0.3, 0.03, 0x1f2830);
  F.box(-1.75, 0.9, mz + 1.13, 2.4, 0.05, 0.08, 0x1f2830);
  F.box(-1.75, 2.3, mz + 1.13, 2.4, 0.1, 0.08, 0x1f2830);
  // bed & vise
  F.box(-1.6, 0.9, mz - 1.2, 3.2, 0.14, 2.3, 0x59606a, { jitter: 0.05 });
  for (let i = 0; i < 5; i++) F.box(-1.6, 1.04, mz - 1.0 + i * 0.45, 3.2, 0.012, 0.05, 0x2f353c, { jitter: 0, cell: 2 });
  F.box(-0.45, 1.04, mz - 0.55, 0.9, 0.16, 0.16, 0x2a2e33);
  F.box(-0.45, 1.04, mz + 0.15, 0.9, 0.16, 0.16, 0x2a2e33);
  // gantry head
  F.box(-0.55, 1.98, mz - 1.2, 1.1, 0.5, 1.0, 0x2f4356);
  F.box(-0.3, 1.9, mz - 0.25, 0.6, 0.12, 0.4, 0x8a929a);

  // stock block on the vise (metal)
  const stock = new BoxBatch(0.06, 0.16);
  const S = new Frame(stock);
  S.box(-0.4, 1.2, mz - 0.4, 0.8, 0.38, 0.7, 0x6e625a, { cell: 0.06, jitter: 0.16 });
  S.box(-0.28, 1.58, mz - 0.3, 0.55, 0.08, 0.5, 0x7a6d64, { cell: 0.06, jitter: 0.18 });
  const stockMesh = stock.mesh(mats.solid(0.45, 0.7));
  // core holes (revealed after drilling)
  const holes = new BoxBatch(0.05, 0);
  const H = new Frame(holes);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) H.box(-0.3 + i * 0.25, 1.655, mz - 0.25 + j * 0.28, 0.07, 0.01, 0.07, 0x141210, { jitter: 0, cell: 1 });
  const holeMesh = holes.mesh(mats.glow(), false);

  // drill spindle assembly
  const drillGroup = new THREE.Group();
  const chuck = new THREE.Mesh(voxelCylinder(4, 4, (x, y, z) => ((x + z) % 3 === 0 ? 0x7d858d : 0x9aa1a8), 0.05, "y"), mats.solid(0.4, 0.7));
  chuck.position.set(0, 0.1, 0);
  const bit = new THREE.Mesh(voxelCylinder(3, 12, (x, y, z) => ((Math.floor((y + x + z) / 2) % 2) ? 0xc4cad0 : 0x5b626a), 0.05, "y"), mats.solid(0.3, 0.8));
  bit.position.set(0, -0.32, 0);
  drillGroup.add(chuck, bit);
  const drillTool = bit;

  // saw assembly
  const sawGroup = new THREE.Group();
  const disc = new THREE.Mesh(
    voxelCylinder(8, 1, (x, y, z) => (((x * 3 + z * 5) % 7 === 0) ? 0x8a9199 : 0xd5dade), 0.045, "z"),
    mats.solid(0.35, 0.8),
  );
  sawGroup.add(disc);
  const arm = new BoxBatch(0.1, 0.04);
  new Frame(arm).box(-0.05, 0.15, -0.05, 0.1, 0.65, 0.1, 0x2a2e33);
  new Frame(arm).box(-0.05, 0.75, -0.05, 0.1, 0.1, 0.5, 0x2a2e33);
  sawGroup.add(arm.mesh(mats.solid(0.6, 0.3)));

  // rods + slices
  const rodGeo = voxelCylinder(1.6, 14, 0xb4b8bc, 0.032, "x");
  const rods = new THREE.InstancedMesh(rodGeo, mats.solid(0.35, 0.8), 6);
  const sliceGeo = voxelCylinder(1.6, 3, 0xb9bdc0, 0.032, "y");
  const slices = new THREE.InstancedMesh(sliceGeo, mats.solid(0.35, 0.8), 36);
  slices.count = 0;

  // tray with 36 slots
  const trayBatch = new BoxBatch(0.2, 0.05);
  const TR = new Frame(trayBatch);
  const tx = SHOP.trayAt[0];
  const ty = SHOP.trayAt[1];
  const tz = SHOP.trayAt[2];
  TR.box(tx - 0.42, ty - 0.14, tz - 0.32, 0.84, 0.08, 0.64, 0x6a7078);
  TR.box(tx - 0.42, ty - 0.06, tz - 0.32, 0.84, 0.05, 0.04, 0x8a9198);
  TR.box(tx - 0.42, ty - 0.06, tz + 0.28, 0.84, 0.05, 0.04, 0x8a9198);
  TR.box(tx - 0.42, ty - 0.06, tz - 0.32, 0.04, 0.05, 0.64, 0x8a9198);
  TR.box(tx + 0.38, ty - 0.06, tz - 0.32, 0.04, 0.05, 0.64, 0x8a9198);
  // cart under the tray
  TR.box(tx - 0.45, 0, tz - 0.35, 0.06, ty - 0.14, 0.06, 0x2a2e33);
  TR.box(tx + 0.39, 0, tz - 0.35, 0.06, ty - 0.14, 0.06, 0x2a2e33);
  TR.box(tx - 0.45, 0, tz + 0.29, 0.06, ty - 0.14, 0.06, 0x2a2e33);
  TR.box(tx + 0.39, 0, tz + 0.29, 0.06, ty - 0.14, 0.06, 0x2a2e33);
  TR.box(tx - 0.45, 0.35, tz - 0.35, 0.9, 0.04, 0.7, 0x3a3f46);
  const trayMesh = trayBatch.mesh(mats.solid(0.5, 0.4));
  const pieceGeo = voxelCylinder(1.5, 3, 0xc2c6c9, 0.03, "y");
  const trayPieces = new THREE.InstancedMesh(pieceGeo, mats.solid(0.35, 0.8), 36);
  trayPieces.count = 0;

  // chips on the bed & tin
  const chipBatch = new BoxBatch(0.03, 0.2);
  const chipF = new Frame(chipBatch);
  const cr = rng(19);
  for (let i = 0; i < 48; i++) chipF.box(-1.3 + cr() * 2.6, 1.04, mz - 1.0 + cr() * 1.8, 0.03 + cr() * 0.03, 0.02, 0.03 + cr() * 0.03, cr() > 0.5 ? 0x9aa0a6 : 0x6b5b50, { jitter: 0.1, cell: 1 });
  const chipMesh = chipBatch.mesh(mats.solid(0.4, 0.8), false);
  const tin = new THREE.Mesh(voxelCylinder(4, 4, (x, y) => (y === 3 ? 0xd9d2c0 : 0xb4342e), 0.045, "y"), mats.solid(0.6, 0.3));
  tin.position.set(-1.25, 1.1, -0.6);

  // sliding glass door
  const door = new THREE.Group();
  const dgl = new BoxBatch(1, 0);
  new Frame(dgl).box(-1.75, 0.98, mz + 1.16, 2.4, 1.3, 0.03, 0xbfe0ff, { jitter: 0, cell: 3 });
  const dfr = new BoxBatch(0.3, 0.02);
  new Frame(dfr).box(-1.75, 0.95, mz + 1.15, 2.4, 0.05, 0.06, 0x1f2830);
  new Frame(dfr).box(-1.75, 2.25, mz + 1.15, 2.4, 0.05, 0.06, 0x1f2830);
  new Frame(dfr).box(-1.75, 0.95, mz + 1.15, 0.05, 1.35, 0.06, 0x1f2830);
  new Frame(dfr).box(0.6, 0.95, mz + 1.15, 0.05, 1.35, 0.06, 0x1f2830);
  new Frame(dfr).box(0.35, 1.3, mz + 1.19, 0.05, 0.5, 0.05, 0xb0b6bc);
  door.add(dgl.mesh(mats.glass(0.15), false), dfr.mesh(mats.solid(0.5, 0.4)));

  // fluorescent tubes
  const tubeOn = new BoxBatch(1, 0);
  const tubeOff = new BoxBatch(1, 0);
  for (const x of [-4, 0, 4]) {
    for (const z of [-3.5, 0.2, 3.6]) {
      (x === 0 ? tubeOn : tubeOff).box(x - 0.9, 4.66, z - 0.1, 1.8, 0.06, 0.2, x === 0 ? 0xeaf4ff : 0x9aa0a6, { jitter: 0, cell: 3 });
    }
  }
  const tubeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const tubes = tubeOn.mesh(tubeMat, false);

  // sparks
  const sparkN = 46;
  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 0.025, 0.025), new THREE.MeshBasicMaterial({ color: 0xffc36a }), sparkN);
  const sr = rng(77);
  const sparkSeed = Array.from({ length: sparkN }, () => ({ a: sr() * Math.PI * 2, s: 0.8 + sr() * 2.2, up: 0.5 + sr() * 1.6, ph: sr() }));

  const group = new THREE.Group();
  group.add(
    solid.mesh(mats.solid(0.9)),
    glow.mesh(mats.glow(), false),
    tubes,
    tubeOff.mesh(mats.glow(), false),
    stockMesh,
    holeMesh,
    trayMesh,
    trayPieces,
    chipMesh,
    tin,
    door,
    rods,
    slices,
    sparks,
    ...drums,
  );
  group.add(glass.mesh(mats.glass(), false));
  drillGroup.position.set(SHOP.spindle[0], SHOP.spindle[1], mz - 0.05);
  sawGroup.position.set(SHOP.sawAt[0], SHOP.sawAt[1], mz);
  group.add(drillGroup, sawGroup);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0, 0, 0);
  const cycle = 0.29;
  return {
    group,
    drillTool,
    tin,
    tray: new THREE.Vector3(...SHOP.trayAt),
    update(t: number) {
      tubeMat.color.setScalar(tubeLevel(t));
      // door slide
      const dOpen = Math.max(seg(t, T.shopDoor0, T.shopDoor1) - seg(t, T.shopClose0, T.shopClose1), 0) + seg(t, T.shopOpen0, T.shopOpen1);
      door.position.x = -Math.min(1, dOpen) * 2.1;
      door.position.z = 0;
      // drilling
      const drilling = t >= T.drill0 && t < T.drill1;
      const dprog = seg(t, T.drill0, T.drill1);
      const dip = drilling ? Math.sin(dprog * Math.PI * 3) ** 2 * 0.5 + 0.0 : 0;
      drillGroup.position.y = SHOP.spindle[1] - dip - (drilling ? 0.05 : 0);
      drillGroup.rotation.y = drilling ? t * 60 : 0;
      drillGroup.visible = t < T.toolOut || true;
      drillTool.visible = t < T.toolOut;
      holeMesh.visible = t >= T.drill0 + 1.6 && t < T.saw0;
      stockMesh.visible = t >= T.shopDoor1 + 0.9 && t < T.saw0;
      // rods & saw
      const sawing = t >= T.saw0 && t < T.saw1;
      const sp = t - T.saw0;
      const cyc = Math.floor(sp / cycle);
      const ph = (sp / cycle) % 1;
      const rodsVisible = t >= T.saw0 - 0.6 && t < T.saw1 + 0.2;
      for (let i = 0; i < 6; i++) {
        const consumed = sawing ? Math.min(1, (cyc + ph) / 18) : t >= T.saw1 ? 1 : 0;
        const len = 1 - consumed;
        const x = 0.4 - (1 - len) * 0.45 - 0.2;
        m.compose(new THREE.Vector3(x + 0.12, 1.1, mz - 0.5 + i * 0.16 - 0.3), q, new THREE.Vector3(len < 0.02 ? 0.001 : len, 1, 1));
        rods.setMatrixAt(i, rodsVisible ? m : m.compose(zero, q, zero));
      }
      rods.instanceMatrix.needsUpdate = true;
      const dsaw = sawing ? Math.sin(Math.min(1, ph * 1.6) * Math.PI) : 0;
      sawGroup.position.y = SHOP.sawAt[1] + 0.35 - dsaw * 0.35;
      sawGroup.visible = t >= T.saw0 - 1.5 && t < T.saw1 + 1;
      disc.rotation.z = sawing || (t > T.saw0 - 1 && t < T.saw1) ? t * 90 : 0;
      // slices leaving the saw → tray
      const done = Math.min(36, Math.floor(seg(t, T.saw0 + 0.15, T.saw1 - 0.2) * 36));
      trayPieces.count = t >= T.saw0 ? done : 0;
      for (let i = 0; i < 36; i++) {
        const cx = tx - 0.295 + (i % 6) * 0.118;
        const cz = tz - 0.245 + Math.floor(i / 6) * 0.098;
        const pop = seg(t, T.saw0 + 0.15 + (i / 36) * (T.saw1 - T.saw0 - 0.35), T.saw0 + 0.15 + (i / 36) * (T.saw1 - T.saw0 - 0.35) + 0.15);
        m.compose(new THREE.Vector3(cx, ty - 0.06 + (1 - pop) * 0.12, cz), q, new THREE.Vector3(0.75, pop * 0.75, 0.75));
        trayPieces.setMatrixAt(i, m);
      }
      trayPieces.instanceMatrix.needsUpdate = true;
      slices.count = 0;
      chipMesh.visible = t >= T.drill0 + 1 && t < T.toolOut - 1.5;
      // sparks
      const active = drilling ? 1 : sawing ? 2 : 0;
      for (let i = 0; i < sparkN; i++) {
        const s = sparkSeed[i]!;
        if (!active) {
          sparks.setMatrixAt(i, m.compose(zero, q, zero));
          continue;
        }
        const life = 0.42;
        const tau = ((t * (active === 2 ? 3.4 : 2.2) + s.ph) % 1) * life;
        const ox = active === 2 ? SHOP.sawAt[0] : 0;
        const oy = active === 2 ? SHOP.sawAt[1] - 0.32 : 1.6 - dip;
        const dir = active === 2 ? 1 : Math.cos(s.a);
        const p = new THREE.Vector3(
          ox + dir * s.s * tau * 0.6,
          oy + s.up * tau - 4.6 * tau * tau,
          mz + (active === 2 ? 0.2 : Math.sin(s.a) * s.s * tau * 0.6),
        );
        const fade = 1 - tau / life;
        m.compose(p, q, one.clone().multiplyScalar(0.4 + fade));
        sparks.setMatrixAt(i, m);
      }
      sparks.instanceMatrix.needsUpdate = true;
    },
  };
}
