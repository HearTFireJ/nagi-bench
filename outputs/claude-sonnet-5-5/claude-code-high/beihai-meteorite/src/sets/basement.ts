import * as THREE from "three";
import { BoxBatch, glowSprite, mats, rng, seg, voxelCylinder, type V3 } from "../blocks";
import { Frame } from "../kit";
import { T } from "../timing";

export const BASE = {
  table: [0.4, 0.0, -0.5] as V3,
  bag: [-1.95, 0.9, -1.95] as V3,
  bulb: [0.3, 2.05, 0.1] as V3,
  door: [1.9, 0.6, 2.35] as V3,
};

export function bulbPos(t: number): V3 {
  const a = Math.sin(t * 0.8) * 0.06;
  return [BASE.bulb[0] + a * 3, BASE.bulb[1] - 0.05, BASE.bulb[2] + Math.cos(t * 0.6) * 0.03 * 3];
}

export interface BasementSet {
  group: THREE.Group;
  bagGroup: THREE.Group;
  bagYaw: number;
  slabGroup: THREE.Group;
  update(t: number): void;
  muzzle: V3;
}

export function buildBasement(): BasementSet {
  const solid = new BoxBatch(0.5, 0.08);
  const glow = new BoxBatch(0.2, 0);
  const F = new Frame(solid);
  const G = new Frame(glow);

  // shell
  F.box(-3.1, -0.3, -2.7, 6.2, 0.3, 5.4, 0x48484a, { cell: 0.5, jitter: 0.1 });
  F.box(-3.1, 2.6, -2.7, 6.2, 0.3, 5.4, 0x37373a);
  F.box(-3.1, 0, -2.7, 6.2, 2.6, 0.3, 0x5d5e60, { jitter: 0.1 });
  F.box(-3.1, 0, -2.4, 0.3, 2.6, 4.8, 0x5d5e60, { jitter: 0.1 });
  F.box(2.8, 0, -2.4, 0.3, 2.6, 4.8, 0x5d5e60, { jitter: 0.1 });
  F.box(-3.1, 0, 2.4, 6.2, 2.6, 0.3, 0x5d5e60, { jitter: 0.1 });
  // damp stains
  F.box(-0.5, 1.2, -2.395, 1.2, 1.4, 0.01, 0x4a4b4d, { cell: 0.3, jitter: 0.2 });
  F.box(2.0, 0.0, -2.395, 0.6, 1.1, 0.01, 0x46484a, { cell: 0.3, jitter: 0.2 });
  // ceiling pipes & duct
  F.box(-2.8, 2.3, -1.7, 5.6, 0.14, 0.14, 0x6f4a3a);
  F.box(-2.8, 2.3, 1.6, 5.6, 0.14, 0.14, 0x3b5a6a);
  F.box(-2.8, 2.05, -0.6, 5.6, 0.4, 0.5, 0x86898d);
  for (let i = 0; i < 6; i++) F.box(-2.4 + i * 1.0, 2.04, -0.62, 0.08, 0.42, 0.54, 0x5f6266);
  F.box(1.4, 0.0, -2.395, 0.9, 1.6, 0.04, 0x3e4044); // fuse panel
  G.box(1.55, 1.2, -2.35, 0.08, 0.08, 0.03, 0xff3b30, { jitter: 0, cell: 1 });
  G.box(1.75, 1.2, -2.35, 0.08, 0.08, 0.03, 0x38e070, { jitter: 0, cell: 1 });
  // floor drain
  F.box(0.3, 0.001, 1.2, 0.5, 0.01, 0.5, 0x2a2a2c, { cell: 0.1, jitter: 0.3 });
  // steel door + stairs (entry, +z wall)
  F.box(1.1, 0.6, 2.3, 0.1, 2.05, 0.14, 0x2a2e33);
  F.box(2.6, 0.6, 2.3, 0.1, 2.05, 0.14, 0x2a2e33);
  F.box(1.1, 2.6, 2.3, 1.6, 0.05, 0.14, 0x2a2e33);
  G.box(1.2, 0.6, 2.42, 1.4, 2.0, 0.03, 0xf3ecd0, { jitter: 0.03, cell: 0.7 }); // bright corridor beyond
  F.box(1.0, 0.0, 1.5, 1.8, 0.2, 0.9, 0x6a6a6c);
  F.box(1.0, 0.2, 1.9, 1.8, 0.2, 0.5, 0x6a6a6c);
  F.box(1.0, 0.4, 2.2, 1.8, 0.2, 0.2, 0x6a6a6c);
  const doorLeaf = new THREE.Group();
  doorLeaf.position.set(2.6, 0, 2.3);
  const dlb = new BoxBatch(0.25, 0.04);
  new Frame(dlb).box(-1.4, 0.6, -0.04, 1.4, 2.0, 0.08, 0x3a4048);
  new Frame(dlb).box(-1.3, 1.1, -0.1, 0.12, 0.12, 0.06, 0xb0b6bc);
  doorLeaf.add(dlb.mesh(mats.solid(0.5, 0.5)));
  // left shelving
  const sh = new Frame(solid, -2.75, 0.6, 1);
  for (let i = 0; i < 4; i++) sh.box(-1.2, 0.3 + i * 0.6, -0.15, 2.4, 0.05, 0.35, 0x5c626a);
  for (const x of [-1.2, 1.15]) sh.box(x, 0, -0.15, 0.05, 2.0, 0.35, 0x5c626a);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) sh.box(-1.1 + j * 0.58, 0.35 + i * 0.6, -0.1, 0.5, 0.3, 0.25, [0x7a6547, 0x56606a, 0x6b4a3a, 0x8a7d5a][(i * 3 + j) % 4]!);

  // ---- table
  const [tx, , tz] = BASE.table;
  F.box(tx - 0.85, 0.82, tz - 0.5, 1.7, 0.08, 1.0, 0x5a4636, { streak: 0 });
  for (const [dx, dz] of [[-0.8, -0.45], [0.7, -0.45], [-0.8, 0.4], [0.7, 0.4]] as const) F.box(tx + dx, 0, tz + dz, 0.1, 0.82, 0.1, 0x30343a);
  // newspaper & tools
  F.box(tx - 0.75, 0.905, tz + 0.05, 0.5, 0.008, 0.4, 0xd6d0be, { cell: 0.1, jitter: 0.1 });
  F.box(tx + 0.4, 0.905, tz - 0.3, 0.32, 0.03, 0.12, 0x2a2e33); // pliers body
  F.box(tx + 0.36, 0.905, tz - 0.3, 0.16, 0.03, 0.03, 0xc23a2a);
  F.box(tx - 0.2, 0.905, tz + 0.32, 0.14, 0.05, 0.05, 0xd8d8d8); // glue tube
  F.box(tx - 0.28, 0.905, tz + 0.32, 0.08, 0.05, 0.05, 0xd94040);
  // magazine + pistol on the table
  F.box(tx + 0.55, 0.905, tz + 0.15, 0.09, 0.14, 0.05, 0x22262b);
  // sandbags + crate + bag
  const sb = new Frame(solid, -2.05, -2.05, 0);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 3; x++) sb.box(-0.6 + x * 0.4 + (y % 2) * 0.2, y * 0.19, -0.3, 0.38, 0.18, 0.22, y % 2 ? 0x8a7a55 : 0x7a6b4a, { cell: 0.2, jitter: 0.12 });
  F.box(-2.25, 0, -2.25, 0.7, 0.62, 0.7, 0x6a5238);
  F.box(-2.0, 0.62, -2.15, 0.2, 0.05, 0.05, 0x3a2a1a);

  // fabric bag (rotated toward the shooter)
  const bagYaw = Math.atan2(1.4 - BASE.bag[0], 1.2 - BASE.bag[2]);
  const bagGroup = new THREE.Group();
  bagGroup.position.set(...BASE.bag);
  bagGroup.rotation.y = bagYaw;
  const bb = new BoxBatch(0.09, 0.06);
  const B = new Frame(bb);
  B.box(-0.26, 0, -0.16, 0.52, 0.4, 0.32, 0xa8b1b9, { cell: 0.08, jitter: 0.07 });
  B.box(-0.24, 0.4, -0.14, 0.48, 0.05, 0.28, 0x8d969e, { cell: 0.08, jitter: 0.07 });
  for (let i = 0; i < 4; i++) B.box(-0.26 + i * 0.13, 0.02, 0.16, 0.02, 0.36, 0.01, 0xe0762a, { jitter: 0, cell: 1 }); // seams
  const bagMesh = bb.mesh(mats.solid(0.8));
  bagGroup.add(bagMesh);
  const holes = new BoxBatch(0.03, 0);
  const HF = new Frame(holes);
  const holePos: Array<[number, number]> = [[-0.1, 0.28], [0.08, 0.2], [-0.02, 0.12], [0.14, 0.31]];
  holePos.forEach(([x, y]) => HF.box(x, y, 0.16, 0.035, 0.035, 0.012, 0x111114, { jitter: 0, cell: 1 }));
  const holeMesh = holes.mesh(mats.glow(), false);
  bagGroup.add(holeMesh);
  // opened bag revealing the sandwich layers + beef slab
  const slabGroup = new THREE.Group();
  const slab = new BoxBatch(0.05, 0.16);
  const SL = new Frame(slab);
  SL.box(-0.2, 0, -0.14, 0.4, 0.09, 0.28, 0xa8322e, { cell: 0.05, jitter: 0.18 });
  for (let i = 0; i < 9; i++) SL.box(-0.2 + ((i * 37) % 8) * 0.05, 0.091, -0.12 + ((i * 17) % 5) * 0.05, 0.05, 0.005, 0.03, 0xe8c9b0, { jitter: 0, cell: 1 });
  const shell = new BoxBatch(0.05, 0.05);
  const SF = new Frame(shell);
  SF.box(-0.26, -0.03, -0.18, 0.52, 0.03, 0.36, 0xa8b1b9); // fabric under
  SF.box(-0.26, -0.005, -0.18, 0.52, 0.005, 0.02, 0xd8dde2);
  SF.box(-0.26, 0.09, -0.18, 0.52, 0.03, 0.06, 0x8a9198); // flap
  SF.box(-0.24, 0.0, -0.17, 0.48, 0.02, 0.34, 0xe8e0b8); // foam layer
  slabGroup.add(slab.mesh(mats.solid(0.4)), shell.mesh(mats.solid(0.8)));
  slabGroup.position.set(tx - 0.3, 0.905, tz - 0.05);
  const shard = new BoxBatch(0.02, 0.2);
  const sd = new Frame(shard);
  const rr = rng(51);
  for (let i = 0; i < 14; i++) sd.box(-0.03 + rr() * 0.07, 0.005 + (i % 3) * 0.012, -0.03 + rr() * 0.07, 0.014 + rr() * 0.014, 0.012, 0.014 + rr() * 0.014, rr() > 0.5 ? 0x6b625a : 0x413a35, { jitter: 0.1, cell: 1 });
  const shardMesh = shard.mesh(mats.solid(0.6, 0.4), false);
  shardMesh.position.set(tx + 0.1, 0.905, tz - 0.2);

  // bullets on a wooden tray
  const propGeo = voxelCylinder(1.6, 5, 0x8a7550, 0.028, "y");
  const headGeo = voxelCylinder(1.6, 4, 0x7d8489, 0.028, "y");
  const stoneGeo = voxelCylinder(1.6, 4, (x, y, z) => ((x * 3 + y * 7 + z) % 4 === 0 ? 0x5a4d44 : 0x3d3530), 0.028, "y");
  const props = new THREE.InstancedMesh(propGeo, mats.solid(0.6), 36);
  const heads = new THREE.InstancedMesh(headGeo, mats.solid(0.35, 0.8), 36);
  const stones = new THREE.InstancedMesh(stoneGeo, mats.solid(0.4, 0.6), 36);
  const trayB = new BoxBatch(0.2, 0.06);
  const TF = new Frame(trayB);
  const gx = tx - 0.45;
  const gz = tz - 0.05;
  TF.box(gx - 0.05, 0.9, gz - 0.2, 0.72, 0.03, 0.44, 0x6a5238);
  const trayMesh = trayB.mesh(mats.solid(0.85));

  // hanging bulb
  const bulbGroup = new THREE.Group();
  const bulbB = new BoxBatch(0.05, 0);
  new Frame(bulbB).box(-0.01, 0.1, -0.01, 0.02, 0.5, 0.02, 0x111111);
  bulbGroup.add(bulbB.mesh(mats.glow(), false));
  const bulbGlowB = new BoxBatch(0.05, 0);
  new Frame(bulbGlowB).box(-0.05, -0.1, -0.05, 0.1, 0.18, 0.1, 0xfff0c8, { jitter: 0, cell: 1 });
  new Frame(bulbGlowB).box(-0.03, 0.08, -0.03, 0.06, 0.05, 0.06, 0x6a6a6a, { jitter: 0, cell: 1 });
  bulbGroup.add(bulbGlowB.mesh(mats.glow(), false));
  const bulbHalo = glowSprite("255,220,150", 1.3, 0.7, 6);
  bulbHalo.position.set(0, -0.02, 0);
  bulbGroup.add(bulbHalo);

  // smoke puffs (voxel), dust, muzzle flash
  const smokeN = 60;
  const smoke = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.16, 0.16, 0.16),
    new THREE.MeshBasicMaterial({ color: 0x9a9a9c, transparent: true, opacity: 0.32, depthWrite: false }),
    smokeN,
  );
  const sr = rng(4);
  const smokeSeed = Array.from({ length: smokeN }, (_, i) => ({ shot: i % 4, a: sr() * 6.28, sp: 0.25 + sr() * 0.8, up: 0.2 + sr() * 0.5, s: 0.6 + sr() * 1.2, r: sr() }));

  const group = new THREE.Group();
  group.add(doorLeaf, solid.mesh(mats.solid(0.96)), glow.mesh(mats.glow(), false), bagGroup, slabGroup, shardMesh, props, heads, stones, trayMesh, bulbGroup, smoke);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const zero = new THREE.Vector3(0, 0, 0);
  const muzzle: V3 = [0.7, 1.35, 0.3]; // overwritten by the film with the real muzzle position

  return {
    group,
    bagGroup,
    bagYaw,
    slabGroup,
    muzzle,
    update(t: number) {
      const openIn = seg(t, T.bDoor - 0.2, T.bDoor + 0.8) * (1 - seg(t, T.bExit0 + 0.6, T.bExit1));
      doorLeaf.rotation.y = -openIn * 1.45;
      const bp = bulbPos(t);
      bulbGroup.position.set(bp[0], bp[1] + 0.05, bp[2]);
      bulbGroup.rotation.z = Math.sin(t * 0.8) * 0.03;
      // bullets
      const removed = t < T.bPliers0 ? 0 : Math.floor(seg(t, T.bPliers0, T.bPliers1) * 36 + 0.001);
      const glued = t < T.bGlue0 ? 0 : Math.floor(seg(t, T.bGlue0, T.bGlue1) * 36 + 0.001);
      const loaded = t < T.bLoad0 ? 0 : Math.min(4, Math.floor(seg(t, T.bLoad0 + 1, T.bLoad1 - 0.4) * 4 + 0.001));
      const taken = t >= T.bLoad1 ? 4 : loaded;
      for (let i = 0; i < 36; i++) {
        const px = gx + 0.05 + (i % 9) * 0.075;
        const pz = gz - 0.12 + Math.floor(i / 9) * 0.075;
        const alive = t < 174.5 && !(t >= T.bLoad0 && i >= 36 - taken);
        m.compose(alive ? new THREE.Vector3(px, 0.93 + 0.07, pz) : zero, q, alive ? new THREE.Vector3(1, 1, 1) : zero);
        props.setMatrixAt(i, m);
        const hVis = alive && i >= removed;
        m.compose(hVis ? new THREE.Vector3(px, 0.93 + 0.14 + 0.055, pz) : zero, q, hVis ? new THREE.Vector3(1, 1, 1) : zero);
        heads.setMatrixAt(i, m);
        const sVis = alive && i < glued;
        m.compose(sVis ? new THREE.Vector3(px, 0.93 + 0.14 + 0.055, pz) : zero, q, sVis ? new THREE.Vector3(1, 1, 1) : zero);
        stones.setMatrixAt(i, m);
      }
      trayMesh.visible = t < 174.5;
      props.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
      stones.instanceMatrix.needsUpdate = true;
      // bullet holes
      const hits = T.bShots.filter((s) => t >= s).length;
      holeMesh.visible = hits > 0;
      holeMesh.geometry.setDrawRange(0, hits * 36);
      slabGroup.visible = t >= T.bInspect + 1.5;
      shardMesh.visible = t >= T.bInspect + 5.5;
      // smoke
      for (let i = 0; i < smokeN; i++) {
        const s = smokeSeed[i]!;
        const t0 = T.bShots[s.shot]!;
        const tau = t - t0;
        if (tau < 0 || tau > 5) {
          smoke.setMatrixAt(i, m.compose(zero, q, zero));
          continue;
        }
        const k = tau < 0.1 ? tau * 10 : 1;
        const sc = (0.3 + tau * 0.9) * s.s * k;
        m.compose(
          new THREE.Vector3(muzzle[0] + Math.cos(s.a) * tau * s.sp * 0.5 - tau * 0.25, muzzle[1] + tau * s.up * 0.5 + 0.2, muzzle[2] + Math.sin(s.a) * tau * s.sp * 0.5 - tau * 0.2),
          q,
          new THREE.Vector3(sc, sc, sc).multiplyScalar(Math.max(0, 1 - tau / 5)),
        );
        smoke.setMatrixAt(i, m);
      }
      smoke.instanceMatrix.needsUpdate = true;
    },
  };
}
