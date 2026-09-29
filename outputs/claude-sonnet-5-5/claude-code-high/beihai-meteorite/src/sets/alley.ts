import * as THREE from "three";
import { BoxBatch, glowSprite, mats, rng, type V3 } from "../blocks";
import { Frame } from "../kit";

export interface AlleySet {
  group: THREE.Group;
  gateLeaf: THREE.Group;
  update(t: number): void;
}

const BRICK = 0x6c6a66;
const BRICK_D = 0x55534f;
const TILE = 0x34373c;
const RED = 0x8e2a22;

function tileRoof(fr: Frame, x: number, y: number, z: number, w: number, d: number, layers: number): void {
  for (let i = 0; i < layers; i++) {
    fr.box(x + i * 0.35, y + i * 0.2, z + i * 0.2, w - i * 0.7, 0.2, d - i * 0.4, TILE, { cell: 0.3, jitter: 0.12, streak: 0 });
  }
}

export function buildAlley(): AlleySet {
  const solid = new BoxBatch(0.45, 0.09);
  const glow = new BoxBatch(0.2, 0);
  const F = new Frame(solid);
  const G = new Frame(glow);

  // ground
  F.box(-9, -0.4, -34, 18, 0.4, 48, 0x5b5851, { cell: 0.5, jitter: 0.1 });
  F.box(-1.1, 0.0, -34, 2.2, 0.02, 48, 0x4a4842, { cell: 0.5, jitter: 0.12 }); // worn central track
  // long walls
  F.box(-4.2, 0, -34, 0.6, 3.1, 44, BRICK);
  F.box(3.6, 0, -34, 0.6, 3.1, 44, BRICK);
  F.box(-4.35, 3.1, -34, 0.9, 0.16, 44, TILE);
  F.box(3.45, 3.1, -34, 0.9, 0.16, 44, TILE);
  // brick courses
  for (let y = 0.5; y < 3; y += 0.5) {
    F.box(-3.62, y, -34, 0.03, 0.05, 44, BRICK_D, { cell: 2, jitter: 0.05 });
    F.box(3.6, y, -34, 0.03, 0.05, 44, BRICK_D, { cell: 2, jitter: 0.05 });
  }
  // rooftops beyond the walls
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = -32 + i * 9;
      const x0 = sx < 0 ? -12 : 4.8;
      tileRoof(F, x0, 3.2, z, 6.6, 6.5, 4);
      F.box(x0 + 0.4, 0.0, z + 0.2, 5.8, 3.2, 6.1, 0x4a4640);
    }
  }
  // far end cross wall
  F.box(-4.2, 0, -34, 8.4, 3.4, 0.6, BRICK);
  // warm windows in the far houses
  G.box(-6, 1.8, -20, 0.05, 0.7, 0.9, 0xffb45c, { jitter: 0.1, cell: 0.3 });
  G.box(6.3, 1.7, -14, 0.05, 0.7, 0.9, 0xffb45c, { jitter: 0.1, cell: 0.3 });
  G.box(6.3, 1.7, -26, 0.05, 0.7, 0.9, 0xffa04c, { jitter: 0.1, cell: 0.3 });

  // ---- the red gate (left wall, facing +x) — local +z is out of the wall into the alley
  const gate = new Frame(solid, -3.6, -8.2, 1);
  const gateG = new Frame(glow, -3.6, -8.2, 1);
  gate.box(-1.6, 0, 0, 0.25, 3.05, 0.5, 0x7a2a20);
  gate.box(1.35, 0, 0, 0.25, 3.05, 0.5, 0x7a2a20);
  gate.box(-1.6, 2.8, 0, 3.2, 0.3, 0.5, 0x7a2a20);
  gate.box(-1.35, 0, 0, 2.7, 2.8, 0.12, RED);
  gate.box(-0.02, 0, 0.12, 0.04, 2.8, 0.03, 0x5a1a14);
  for (let i = 0; i < 2; i++) {
    const cx = i === 0 ? -0.6 : 0.6;
    gate.box(cx - 0.1, 1.3, 0.12, 0.2, 0.2, 0.06, 0x2a2a2a, { jitter: 0, cell: 1 });
  }
  const studs = new BoxBatch(1, 0);
  const sf = new Frame(studs, -3.6, -8.2, 1);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    for (const s of [-1, 1]) sf.box(s * (0.2 + i * 0.22) - 0.04, 0.35 + j * 0.5, 0.12, 0.08, 0.08, 0.05, 0xd9a93c, { jitter: 0, cell: 1 });
  }
  // gate roof
  gate.box(-2.4, 3.15, -0.4, 4.8, 0.2, 1.7, TILE, { cell: 0.3, jitter: 0.1 });
  gate.box(-2.0, 3.35, -0.2, 4.0, 0.2, 1.3, TILE, { cell: 0.3, jitter: 0.1 });
  gate.box(-1.5, 3.55, 0.0, 3.0, 0.2, 0.9, TILE, { cell: 0.3, jitter: 0.1 });
  gate.box(-2.6, 3.35, -0.4, 0.3, 0.3, 1.7, TILE); // upturned ends
  gate.box(2.3, 3.35, -0.4, 0.3, 0.3, 1.7, TILE);
  gate.box(-1.9, 3.0, 0.1, 3.8, 0.15, 0.3, 0x2f6e6a); // painted eave
  // steps & drums
  gate.box(-1.5, 0, 0.5, 3.0, 0.15, 0.55, 0x8a877e);
  gate.box(-2.05, 0, 0.1, 0.55, 0.55, 0.55, 0x8a877e);
  gate.box(1.5, 0, 0.1, 0.55, 0.55, 0.55, 0x8a877e);
  // lanterns
  for (const s of [-1, 1]) {
    gateG.box(s * 1.9 - 0.18, 2.35, 0.9, 0.36, 0.5, 0.36, 0xff4a2a, { jitter: 0.08, cell: 0.18 });
    gate.box(s * 1.9 - 0.02, 2.85, 0.98, 0.04, 0.3, 0.04, 0x222222);
  }
  // name plaque
  gate.box(-0.6, 2.85, 0.5, 1.2, 0.3, 0.05, 0x1a1a1a);

  // ---- props: bicycles, coal stack, bins
  const bike = new Frame(solid, 2.6, -14, 0);
  bike.box(-0.5, 0.05, 0, 0.32, 0.5, 0.05, 0x1c1c1c);
  bike.box(0.3, 0.05, 0, 0.32, 0.5, 0.05, 0x1c1c1c);
  bike.box(-0.3, 0.5, 0, 0.7, 0.05, 0.05, 0x2f4a6a);
  bike.box(0.25, 0.5, -0.05, 0.05, 0.4, 0.15, 0x2f4a6a);
  const coal = new Frame(solid, 3.0, -20, 0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3 - (i > 1 ? 1 : 0); j++) coal.box(-0.9 + j * 0.4, i * 0.2, 0, 0.36, 0.2, 0.4, 0x1e1c1c, { cell: 0.2, jitter: 0.2 });
  const bin = new Frame(solid, -2.9, -16, 0);
  bin.box(-0.3, 0, -0.3, 0.6, 0.9, 0.6, 0x3c5a4a);
  bin.box(-0.34, 0.9, -0.34, 0.68, 0.08, 0.68, 0x2c4438);
  // locust tree overhanging the alley near the entrance
  const tree = new Frame(solid, 3.4, -2.5, 0);
  tree.box(-0.2, 0, -0.2, 0.4, 3.6, 0.4, 0x2b2119);
  tree.box(-0.1, 2.4, -0.1, 0.2, 0.2, -1.6, 0x2b2119);
  for (const [dx, dy, dz, w] of [[-1.6, 3.5, -1.4, 2.6], [-0.6, 4.1, -0.4, 2.2], [-2.4, 3.9, 0.6, 1.8], [0.4, 3.6, -1.6, 1.6]] as const) {
    tree.box(dx, dy, dz, w, 0.5, w * 0.9, 0x243b25, { cell: 0.35, jitter: 0.2 });
  }
  // wires
  for (let i = 0; i < 3; i++) F.box(-3.8, 3.9 + i * 0.12, -26, 7.6, 0.03, 0.03, 0x111111, { cell: 4, jitter: 0 });
  F.box(-3.7, 0, -26, 0.16, 4.5, 0.16, 0x2b2b2b);

  const group = new THREE.Group();
  group.add(solid.mesh(mats.solid(0.95)), glow.mesh(mats.glow(), false), studs.mesh(mats.solid(0.4, 0.6)));
  const halos: THREE.Sprite[] = [];
  for (const s of [-1, 1]) {
    const h = glowSprite("255,90,40", 2.2, 0.9, 6);
    h.position.set(-3.6 + 0.9, 2.6, -8.2 - s * 1.9);
    group.add(h);
    halos.push(h);
  }
  // falling leaves
  const leafGeo = new THREE.BoxGeometry(0.09, 0.02, 0.07);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshBasicMaterial({ color: 0x8a7a30 }), 18);
  const r = rng(9);
  const seeds: V3[] = Array.from({ length: 18 }, () => [r() * 6 - 3, r() * 4, r() * 20 - 14]);
  group.add(leaves);
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const gateLeaf = new THREE.Group();
  return {
    group,
    gateLeaf,
    update(t: number) {
      halos.forEach((h, i) => {
        h.material.opacity = 0.75 + Math.sin(t * 3.1 + i * 2) * 0.08;
      });
      seeds.forEach((s, i) => {
        const fall = ((t * 0.28 + s[1] * 0.25 + i * 0.13) % 1);
        const y = 4.2 - fall * 4.2;
        e.set(t * 1.3 + i, t * 0.9, i);
        q.setFromEuler(e);
        m.compose(new THREE.Vector3(s[0] + Math.sin(t * 0.7 + i) * 0.5, y, s[2]), q, new THREE.Vector3(1, 1, 1));
        leaves.setMatrixAt(i, m);
      });
      leaves.instanceMatrix.needsUpdate = true;
    },
  };
}
