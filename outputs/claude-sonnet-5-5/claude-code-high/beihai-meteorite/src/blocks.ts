import * as THREE from "three";
import { buildVoxelGeometry } from "@agentbench/voxel-kit";

export type V3 = [number, number, number];

/** Deterministic hash in 0..1 — the same block always gets the same tint. */
export function hash3(x: number, y: number, z: number, s = 0): number {
  let h =
    Math.imul((Math.floor(x * 7.31) + 4096) | 0, 374761393) ^
    Math.imul((Math.floor(y * 5.77) + 4096) | 0, 668265263) ^
    Math.imul((Math.floor(z * 9.13) + 4096) | 0, 1274126177) ^
    Math.imul(s + 17, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface BoxOpts {
  cell?: number;
  jitter?: number;
  /** 0: strips vary along the first face axis, 1: along the second. */
  streak?: 0 | 1;
  seed?: number;
  skip?: Array<"px" | "nx" | "py" | "ny" | "pz" | "nz">;
}

const FACES: Array<{
  key: "px" | "nx" | "py" | "ny" | "pz" | "nz";
  n: V3;
  o: (x: number, y: number, z: number, w: number, h: number, d: number) => V3;
  u: (w: number, h: number, d: number) => V3;
  v: (w: number, h: number, d: number) => V3;
}> = [
  { key: "px", n: [1, 0, 0], o: (x, y, z, w, _h, d) => [x + w, y, z + d], u: (_w, _h, d) => [0, 0, -d], v: (_w, h) => [0, h, 0] },
  { key: "nx", n: [-1, 0, 0], o: (x, y, z) => [x, y, z], u: (_w, _h, d) => [0, 0, d], v: (_w, h) => [0, h, 0] },
  { key: "py", n: [0, 1, 0], o: (x, y, z, _w, h, d) => [x, y + h, z + d], u: (w) => [w, 0, 0], v: (_w, _h, d) => [0, 0, -d] },
  { key: "ny", n: [0, -1, 0], o: (x, y, z) => [x, y, z], u: (w) => [w, 0, 0], v: (_w, _h, d) => [0, 0, d] },
  { key: "pz", n: [0, 0, 1], o: (x, y, z, _w, _h, d) => [x, y, z + d], u: (w) => [w, 0, 0], v: (_w, h) => [0, h, 0] },
  { key: "nz", n: [0, 0, -1], o: (x, y, z, w) => [x + w, y, z], u: (w) => [-w, 0, 0], v: (_w, h) => [0, h, 0] },
];

/**
 * Accumulates axis-aligned blocks into one vertex-coloured geometry. Large faces are tiled
 * into small cells with a deterministic tint, so plaster, brick and planks read as block
 * material without any texture.
 */
export class BoxBatch {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private tmp = new THREE.Color();

  constructor(private cell = 0.5, private jitter = 0.07) {}

  box(x: number, y: number, z: number, w: number, h: number, d: number, color: number, o: BoxOpts = {}): this {
    const cell = o.cell ?? this.cell;
    const jit = o.jitter ?? this.jitter;
    const seed = o.seed ?? 0;
    for (const f of FACES) {
      if (o.skip?.includes(f.key)) continue;
      const org = f.o(x, y, z, w, h, d);
      const u = f.u(w, h, d);
      const v = f.v(w, h, d);
      const lu = Math.hypot(...u);
      const lv = Math.hypot(...v);
      const nu = Math.max(1, Math.round(lu / cell));
      const nv = Math.max(1, Math.round(lv / cell));
      for (let i = 0; i < nu; i++) {
        for (let j = 0; j < nv; j++) {
          const cx = org[0] + (u[0] * (i + 0.5)) / nu + (v[0] * (j + 0.5)) / nv;
          const cy = org[1] + (u[1] * (i + 0.5)) / nu + (v[1] * (j + 0.5)) / nv;
          const cz = org[2] + (u[2] * (i + 0.5)) / nu + (v[2] * (j + 0.5)) / nv;
          let hv = hash3(cx, cy, cz, seed);
          if (o.streak !== undefined) {
            const a = o.streak === 0 ? i : j;
            hv = hv * 0.35 + hash3(a, f.n[0] * 3 + f.n[1] * 5 + f.n[2] * 7, seed, 3) * 0.65;
          }
          const k = 1 + (hv - 0.5) * 2 * jit;
          this.tmp.setHex(color);
          const r = Math.min(1, this.tmp.r * k);
          const g = Math.min(1, this.tmp.g * k);
          const b = Math.min(1, this.tmp.b * k);
          const base = this.pos.length / 3;
          const ps: V3[] = [
            [org[0] + (u[0] * i) / nu + (v[0] * j) / nv, org[1] + (u[1] * i) / nu + (v[1] * j) / nv, org[2] + (u[2] * i) / nu + (v[2] * j) / nv],
            [org[0] + (u[0] * (i + 1)) / nu + (v[0] * j) / nv, org[1] + (u[1] * (i + 1)) / nu + (v[1] * j) / nv, org[2] + (u[2] * (i + 1)) / nu + (v[2] * j) / nv],
            [org[0] + (u[0] * (i + 1)) / nu + (v[0] * (j + 1)) / nv, org[1] + (u[1] * (i + 1)) / nu + (v[1] * (j + 1)) / nv, org[2] + (u[2] * (i + 1)) / nu + (v[2] * (j + 1)) / nv],
            [org[0] + (u[0] * i) / nu + (v[0] * (j + 1)) / nv, org[1] + (u[1] * i) / nu + (v[1] * (j + 1)) / nv, org[2] + (u[2] * i) / nu + (v[2] * (j + 1)) / nv],
          ];
          for (const p of ps) {
            this.pos.push(p[0], p[1], p[2]);
            this.nor.push(f.n[0], f.n[1], f.n[2]);
            this.col.push(r, g, b);
          }
          this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
    return this;
  }

  /** Box given by its centre. */
  boxC(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: number, o: BoxOpts = {}): this {
    return this.box(cx - w / 2, cy - h / 2, cz - d / 2, w, h, d, color, o);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }

  mesh(material: THREE.Material, shadows = true): THREE.Mesh {
    const m = new THREE.Mesh(this.geometry(), material);
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    return m;
  }
}

export const mats = {
  solid: (rough = 0.92, metal = 0) =>
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal }),
  glow: () => new THREE.MeshBasicMaterial({ vertexColors: true }),
  glass: (opacity = 0.16) =>
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
};

/** Blocky cylinder along an axis, built through the voxel kit. */
export function voxelCylinder(
  radius: number,
  length: number,
  color: number | ((x: number, y: number, z: number) => number),
  voxel: number,
  axis: "x" | "y" | "z" = "y",
): THREE.BufferGeometry {
  const span = Math.max(1, Math.ceil(radius * 2));
  const len = Math.max(1, Math.round(length));
  const size: V3 = axis === "x" ? [len, span, span] : axis === "y" ? [span, len, span] : [span, span, len];
  const c = span / 2;
  return buildVoxelGeometry(
    {
      size,
      at(x, y, z) {
        const a = axis === "x" ? y : x;
        const b = axis === "z" ? y : z;
        const dx = a + 0.5 - c;
        const dz = b + 0.5 - c;
        if (dx * dx + dz * dz > radius * radius) return null;
        return typeof color === "function" ? color(x, y, z) : color;
      },
    },
    { voxel, anchor: "center" },
  );
}

/** Pixel-stepped radial glow used for the sun, lamps and muzzle flashes. */
export function glowTexture(steps = 8, tint = "255,214,150", size = 64): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const cellPx = size / 16;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = (Math.floor(x / cellPx) + 0.5) / 16 - 0.5;
      const cy = (Math.floor(y / cellPx) + 0.5) / 16 - 0.5;
      const r = Math.hypot(cx, cy) * 2;
      const a = Math.max(0, 1 - r);
      const q = Math.floor(a * steps) / steps;
      const i = (y * size + x) * 4;
      const [rr, gg, bb] = tint.split(",").map(Number);
      img.data[i] = rr;
      img.data[i + 1] = gg;
      img.data[i + 2] = bb;
      img.data[i + 3] = Math.round(255 * q * q);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glowSprite(tint: string, scale: number, opacity = 1, steps = 8): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(steps, tint),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity,
    fog: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale, 1);
  return s;
}

export const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
