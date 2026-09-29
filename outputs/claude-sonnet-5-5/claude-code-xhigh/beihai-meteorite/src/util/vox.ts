import * as THREE from "three";
import { buildVoxelGeometry, voxelMaterial } from "@agentbench/voxel-kit";
import { jitter } from "./math";

export type ColourFn = (x: number, y: number, z: number) => number | null;
export type Fill = number | ColourFn;

/**
 * A dense editable voxel grid. Every set piece and prop that is not a figure is
 * drawn into one of these and merged by the kit's `buildVoxelGeometry`, so the
 * whole world shares the block language of the cast. Coordinates are voxel
 * indices; `build(size)` fixes how large one voxel is in metres.
 */
export class VoxGrid {
  readonly data: Int32Array;
  constructor(readonly sx: number, readonly sy: number, readonly sz: number) {
    this.data = new Int32Array(sx * sy * sz).fill(-1);
  }

  private idx(x: number, y: number, z: number): number {
    return (y * this.sz + z) * this.sx + x;
  }
  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }
  set(x: number, y: number, z: number, c: number | null): this {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (this.inside(x, y, z)) this.data[this.idx(x, y, z)] = c === null ? -1 : c;
    return this;
  }
  get(x: number, y: number, z: number): number | null {
    if (!this.inside(x, y, z)) return null;
    const v = this.data[this.idx(x, y, z)]!;
    return v < 0 ? null : v;
  }

  /** Fill [x0,x1) × [y0,y1) × [z0,z1). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, fill: Fill): this {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.sy, Math.ceil(y1)); y++) {
      for (let z = Math.max(0, Math.floor(z0)); z < Math.min(this.sz, Math.ceil(z1)); z++) {
        for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.sx, Math.ceil(x1)); x++) {
          const c = typeof fill === "number" ? fill : fill(x, y, z);
          this.data[this.idx(x, y, z)] = c === null ? -1 : c;
        }
      }
    }
    return this;
  }
  /** Hollow shell: walls of thickness `t` (voxels) around the outer box. */
  shell(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t: number, fill: Fill): this {
    for (let y = y0; y < y1; y++) {
      for (let z = z0; z < z1; z++) {
        for (let x = x0; x < x1; x++) {
          const edge = x < x0 + t || x >= x1 - t || y < y0 + t || y >= y1 - t || z < z0 + t || z >= z1 - t;
          if (!edge) continue;
          const c = typeof fill === "number" ? fill : fill(x, y, z);
          this.set(x, y, z, c);
        }
      }
    }
    return this;
  }
  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): this {
    return this.box(x0, y0, z0, x1, y1, z1, () => null);
  }
  /** Vertical (Y axis) cylinder. */
  cyl(cx: number, cz: number, r: number, y0: number, y1: number, fill: Fill): this {
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d > r) continue;
        for (let y = y0; y < y1; y++) {
          const c = typeof fill === "number" ? fill : fill(x, y, z);
          this.set(x, y, z, c);
        }
      }
    }
    return this;
  }
  ball(cx: number, cy: number, cz: number, r: number, fill: Fill): this {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz) > r) continue;
          const c = typeof fill === "number" ? fill : fill(x, y, z);
          this.set(x, y, z, c);
        }
      }
    }
    return this;
  }

  geometry(voxel: number, anchor: "min" | "center" = "min"): THREE.BufferGeometry {
    return buildVoxelGeometry(
      {
        size: [this.sx, this.sy, this.sz],
        at: (x, y, z) => {
          const v = this.data[this.idx(x, y, z)]!;
          return v < 0 ? null : v;
        },
      },
      { voxel, anchor },
    );
  }

  mesh(voxel: number, material: THREE.Material = voxelMaterial(), anchor: "min" | "center" = "min"): THREE.Mesh {
    const m = new THREE.Mesh(this.geometry(voxel, anchor), material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}

/** Standard set-piece material (roughness-biased, colour on the vertices). */
export function matte(opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return voxelMaterial({ roughness: 0.92, metalness: 0, ...opts });
}
/** Unlit, self-luminous voxels: lamps, screens, the sun. */
export function glow(opts: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ vertexColors: true, ...opts });
}

export function place<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number, ry = 0): T {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  return obj;
}

/** Shorthand to jitter a colour per voxel. */
export const J = jitter;

/**
 * Translate a geometry so that a chosen voxel's centre sits at the origin.
 * Handy for props that must be gripped at a specific point.
 */
export function pivotAt(geo: THREE.BufferGeometry, voxel: number, x: number, y: number, z: number): THREE.BufferGeometry {
  geo.translate(-(x + 0.5) * voxel, -(y + 0.5) * voxel, -(z + 0.5) * voxel);
  return geo;
}
