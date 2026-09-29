import * as THREE from "three";
import { BoxBatch, rng, type V3 } from "./blocks";

/** Adds boxes in a local frame rotated by a multiple of 90° about Y and moved to (cx, cz). */
export class Frame {
  constructor(public batch: BoxBatch, public cx = 0, public cz = 0, public quarter = 0, public dy = 0) {}
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: number, o: Parameters<BoxBatch["box"]>[7] = {}): void {
    const k = ((this.quarter % 4) + 4) % 4;
    const cos = [1, 0, -1, 0][k]!;
    const sin = [0, 1, 0, -1][k]!;
    const tx = (lx: number, lz: number) => this.cx + lx * cos + lz * sin;
    const tz = (lx: number, lz: number) => this.cz - lx * sin + lz * cos;
    const ax = tx(x, z);
    const az = tz(x, z);
    const bx = tx(x + w, z + d);
    const bz = tz(x + w, z + d);
    this.batch.box(Math.min(ax, bx), y + this.dy, Math.min(az, bz), Math.abs(bx - ax), h, Math.abs(bz - az), color, o);
  }
}

/** Flat pixel-art panel on a wall: rows are top→bottom, characters index the palette. */
export function pixelPanel(
  fr: Frame,
  x: number,
  y: number,
  z: number,
  rows: string[],
  palette: Record<string, number>,
  cell: number,
  thick = 0.02,
): void {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = palette[row[i]!];
      if (c === undefined) continue;
      fr.box(x + i * cell, y + (rows.length - 1 - j) * cell, z, cell, cell, thick, c, { jitter: 0, cell });
    }
  });
}

const ROCKS = [0x4a4038, 0x5b5148, 0x2f2b28, 0x6d5f50, 0x3a3532, 0x7a6a58, 0x2b3038];

/** A little irregular rock made of stacked, offset blocks. */
export function rock(fr: Frame, x: number, y: number, z: number, s: number, seed: number, color?: number): void {
  const r = rng(seed * 977 + 13);
  const c = color ?? ROCKS[Math.floor(r() * ROCKS.length)]!;
  fr.box(x - s * 0.5, y, z - s * 0.4, s, s * 0.55, s * 0.8, c, { cell: s / 2, jitter: 0.14, seed });
  fr.box(x - s * 0.35 + (r() - 0.5) * s * 0.3, y + s * 0.5, z - s * 0.25, s * 0.6, s * 0.35, s * 0.5, c, { cell: s / 2, jitter: 0.14, seed: seed + 1 });
  if (r() > 0.4) fr.box(x + s * 0.2, y, z - s * 0.6, s * 0.35, s * 0.3, s * 0.35, c, { cell: s / 2, jitter: 0.14, seed: seed + 2 });
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.add(...children);
  return g;
}

export function vec(v: V3): THREE.Vector3 {
  return new THREE.Vector3(...v);
}

/** Deterministic points scattered in a box, used for motes, debris and sparks. */
export function scatter(n: number, seed: number, min: V3, max: V3): V3[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => [
    min[0] + (max[0] - min[0]) * r(),
    min[1] + (max[1] - min[1]) * r(),
    min[2] + (max[2] - min[2]) * r(),
  ]);
}
