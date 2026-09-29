import * as THREE from "three";
import { voxelMaterial, voxelModel } from "@agentbench/voxel-kit";
import { BoxBatch, mats, voxelCylinder } from "./blocks";
import { Frame } from "./kit";

/** Hand-held props are modelled in figure px (1 px = 0.056 m at 1.8 m); +Z is where the fist points. */

export function cupGeometry(): THREE.BufferGeometry {
  const A = ["wwww", "wwww", "wwww", "wwww"];
  const B = ["tttt", "wwww", "wwww", "wwww"];
  return voxelModel({ palette: { w: 0xe6e2d6, t: 0x8a6a3a }, layers: [A, B, B, A], axis: "x", voxel: 0.55 });
}

export function loupeGeometry(): THREE.BufferGeometry {
  const s = ["..ooo.....", ".oLLLo....", ".oLLLo....", "..ooo.....", "....h.....", ".....h....", "......hhhh"];
  return voxelModel({ palette: { o: 0x2a2a2e, L: 0xbfe0ff, h: 0x6b4a2a }, layers: [s, s], axis: "x", voxel: 0.5 });
}

export function phoneGeometry(): THREE.BufferGeometry {
  const s = ["bbbbbbb", "bssssb", "bssssb", "bssssb", "bssssb", "bssssb", "bbbbbbb"].map((r) => r.padEnd(7, "b"));
  return voxelModel({ palette: { b: 0x15171a, s: 0x9be8ff }, layers: [s.map((r) => r.replace(/s/g, "b")), s, s], axis: "z", voxel: 0.45 });
}

export function pliersGeometry(): THREE.BufferGeometry {
  const s = ["..ii....", ".iiii...", "..iirrrr", "..iirrrr", ".ii.....", "ii......"];
  return voxelModel({ palette: { i: 0x9aa1a8, r: 0xc23a2a }, layers: [s, s], axis: "x", voxel: 0.5 });
}

export function magazineGeometry(): THREE.BufferGeometry {
  const s = ["bbbbb", "bbbbb", "bbbbb", "bbbbb", "bbbbb", "bbbbb"];
  return voxelModel({ palette: { b: 0x23272d }, layers: [s, s, s], axis: "x", voxel: 0.5 });
}

export function knifeGeometry(): THREE.BufferGeometry {
  const s = ["hhhh.......", "hhhhbbbbbbb", ".....bbbbb."];
  return voxelModel({ palette: { h: 0x2a2a2e, b: 0xcfd4d8 }, layers: [s], axis: "x", voxel: 0.5 });
}

export function brushGeometry(): THREE.BufferGeometry {
  const s = ["hhhhhhhh.", "hhhhhhhhk", "........k"];
  return voxelModel({ palette: { h: 0x8a5a3a, k: 0xd8caa0 }, layers: [s, s, s], axis: "x", voxel: 0.5 });
}

export function rockInHand(): THREE.BufferGeometry {
  const s = ["..rr..", ".rrrr.", "rrrrrr", ".rrrr."];
  return voxelModel({ palette: { r: 0x4a4038 }, layers: [s, s, s, s], axis: "x", voxel: 0.6 });
}

export function ironLump(size: number, seed: number, metallic = true): THREE.Mesh {
  const b = new BoxBatch(size / 5, 0.16);
  const f = new Frame(b);
  const c = 0x5a5048;
  f.box(-size * 0.5, 0, -size * 0.4, size, size * 0.55, size * 0.8, c, { cell: size / 5, jitter: 0.2, seed });
  f.box(-size * 0.4, size * 0.5, -size * 0.3, size * 0.75, size * 0.35, size * 0.6, 0x64594f, { cell: size / 5, jitter: 0.2, seed: seed + 3 });
  f.box(size * 0.1, size * 0.2, -size * 0.55, size * 0.4, size * 0.3, size * 0.2, 0x4a4038, { cell: size / 5, jitter: 0.2, seed: seed + 5 });
  return b.mesh(mats.solid(metallic ? 0.4 : 0.8, metallic ? 0.75 : 0.1));
}

/** A cut face showing Widmanstätten lines, as tiny diagonal blocks. */
export function etchedSlab(): THREE.Group {
  const n = 14;
  const cell = 0.02;
  const b = new BoxBatch(0.02, 0);
  const f = new Frame(b);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const c = (i + j) % 5 < 2 ? 0xd6dade : (i * 2 + j) % 7 === 0 ? 0x8a9198 : 0x9aa1a8;
      f.box(i * cell, 0, j * cell, cell, 0.004, cell, c, { jitter: 0, cell: 1 });
    }
  const m = b.mesh(mats.solid(0.25, 0.9), false);
  m.position.set(-n * cell * 0.5, 0, -n * cell * 0.5);
  const g = new THREE.Group();
  g.add(m);
  const base = new BoxBatch(0.06, 0.1);
  new Frame(base).box(-n * cell * 0.5, -0.09, -n * cell * 0.5, n * cell, 0.09, n * cell, 0x5a5048, { cell: 0.06, jitter: 0.2 });
  g.add(base.mesh(mats.solid(0.5, 0.6)));
  return g;
}

export function tinGeometry(): THREE.BufferGeometry {
  return voxelCylinder(4, 4, (x, y) => (y === 3 ? 0xd9d2c0 : 0xb4342e), 0.045, "y");
}

export function propMesh(geo: THREE.BufferGeometry, rough = 0.6, metal = 0.1): THREE.Mesh {
  const m = new THREE.Mesh(geo, voxelMaterial({ roughness: rough, metalness: metal }));
  m.castShadow = true;
  return m;
}
