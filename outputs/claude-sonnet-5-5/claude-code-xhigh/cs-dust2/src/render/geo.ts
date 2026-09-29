import * as THREE from 'three';

/**
 * Geometry helpers. Everything in the game is built from code: boxes, wedges and a few
 * cylinders. Lighting is *baked into vertex colours* (fixed sun direction + a vertical
 * gradient for cheap ambient occlusion) and drawn with MeshBasicMaterial, so the look is
 * deterministic, needs no lights, and is very cheap to render.
 */

const LX = 0.35;
const LY = 0.85;
const LZ = 0.4;
const LLEN = Math.hypot(LX, LY, LZ);

/** Brightness (0.58 .. ~0.95) of a surface with the given normal under the baked sun. */
export function shadeFromNormal(nx: number, ny: number, nz: number): number {
  const d = Math.max(0, (nx * LX + ny * LY + nz * LZ) / LLEN);
  return 0.58 + 0.4 * d;
}

export function hexToRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

export interface BoxOpts {
  /** texture tile size in metres (world-space UVs) */
  uv?: number;
  /** vertical colour multiplier at the bottom / top of side faces (cheap ambient occlusion) */
  grad?: [number, number];
  skipBottom?: boolean;
  /** per-box brightness jitter amplitude */
  jitter?: number;
}

/** Accumulates quads into one BufferGeometry (positions, normals, uvs, vertex colours). */
export class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  get triangleCount(): number {
    return this.idx.length / 3;
  }

  /**
   * Add a quad. Winding is fixed automatically so that the front face looks along `n`.
   * a,b,c,d are corner points in order around the quad.
   */
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], rgb: [number, number, number], cb: number, ct: number, uvScale: number): void {
    // ensure counter-clockwise when seen from the normal side
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    let v = [a, b, c, d];
    let g = [cb, cb, ct, ct];
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) {
      v = [a, d, c, b];
      g = [g[0], g[3], g[2], g[1]];
    }
    const base = this.pos.length / 3;
    const shade = shadeFromNormal(n[0], n[1], n[2]);
    for (let i = 0; i < 4; i++) {
      const p = v[i];
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      // world-space UVs, dominant axis of the normal decides the projection plane
      const ax = Math.abs(n[0]);
      const ay = Math.abs(n[1]);
      if (ay >= ax && ay >= Math.abs(n[2])) this.uv.push(p[0] / uvScale, p[2] / uvScale);
      else if (ax >= Math.abs(n[2])) this.uv.push(p[2] / uvScale, p[1] / uvScale);
      else this.uv.push(p[0] / uvScale, p[1] / uvScale);
      const k = shade * g[i];
      this.col.push(rgb[0] * k, rgb[1] * k, rgb[2] * k);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  addBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, o: BoxOpts = {}): void {
    const uvS = o.uv ?? 4;
    const grad = o.grad ?? [1, 1];
    const rgb = hexToRgb(color);
    const j = o.jitter ?? 0;
    if (j > 0) {
      // deterministic pseudo-random jitter from the position
      const h = Math.sin(x0 * 12.9898 + z0 * 78.233 + y1 * 37.719) * 43758.5453;
      const f = 1 + (h - Math.floor(h) - 0.5) * 2 * j;
      rgb[0] *= f;
      rgb[1] *= f;
      rgb[2] *= f;
    }
    const [gb, gt] = grad;
    // +Y
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], rgb, gt, gt, uvS);
    // -Y
    if (!o.skipBottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], rgb, gb, gb, uvS);
    // +X / -X
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], rgb, gb, gt, uvS);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], rgb, gb, gt, uvS);
    // +Z / -Z
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], rgb, gb, gt, uvS);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], rgb, gb, gt, uvS);
  }

  /**
   * Ramp wedge: solid from yBase up to a sloped top. The slope runs along `axis`, from
   * height hFrom at the min side to hTo at the max side.
   */
  addWedge(x0: number, z0: number, x1: number, z1: number, axis: 'x' | 'z', hFrom: number, hTo: number, yBase: number, color: number, uvS = 4): void {
    const rgb = hexToRgb(color);
    const hAt = (x: number, z: number): number => {
      const t = axis === 'x' ? (x - x0) / (x1 - x0) : (z - z0) / (z1 - z0);
      return hFrom + (hTo - hFrom) * t;
    };
    const p00 = [x0, hAt(x0, z0), z0];
    const p10 = [x1, hAt(x1, z0), z0];
    const p11 = [x1, hAt(x1, z1), z1];
    const p01 = [x0, hAt(x0, z1), z1];
    // top surface normal from the slope
    const slope = (hTo - hFrom) / (axis === 'x' ? x1 - x0 : z1 - z0);
    const nl = Math.hypot(slope, 1);
    const n = axis === 'x' ? [-slope / nl, 1 / nl, 0] : [0, 1 / nl, -slope / nl];
    this.quad(p00, p10, p11, p01, n, rgb, 1, 1, uvS);
    // sides
    const b = (p: number[]): number[] => [p[0], yBase, p[2]];
    this.quad(b(p00), b(p10), p10, p00, [0, 0, -1], rgb, 0.8, 1, uvS);
    this.quad(b(p01), b(p11), p11, p01, [0, 0, 1], rgb, 0.8, 1, uvS);
    this.quad(b(p00), b(p01), p01, p00, [-1, 0, 0], rgb, 0.8, 1, uvS);
    this.quad(b(p10), b(p11), p11, p10, [1, 0, 0], rgb, 0.8, 1, uvS);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const boxCache = new Map<string, THREE.BufferGeometry>();

/** Cached, pre-shaded box centred on the origin (used for characters, weapons, props). */
export function boxGeo(w: number, h: number, d: number, color: number, grad: [number, number] = [0.85, 1]): THREE.BufferGeometry {
  const key = `${w}|${h}|${d}|${color}|${grad[0]}|${grad[1]}`;
  let g = boxCache.get(key);
  if (!g) {
    const b = new GeoBuilder();
    b.addBox(-w / 2, -h / 2, -d / 2, w / 2, h / 2, d / 2, color, { grad, uv: 1 });
    g = b.build();
    boxCache.set(key, g);
  }
  return g;
}

/** Cylinder along the Z axis with baked shading (radius, length). */
export function cylGeo(radius: number, length: number, color: number, segments = 10): THREE.BufferGeometry {
  const key = `cyl|${radius}|${length}|${color}|${segments}`;
  let g = boxCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(radius, radius, length, segments, 1, false);
    g.rotateX(Math.PI / 2);
    const nor = g.getAttribute('normal');
    const rgb = hexToRgb(color);
    const cols: number[] = [];
    for (let i = 0; i < nor.count; i++) {
      const k = shadeFromNormal(nor.getX(i), nor.getY(i), nor.getZ(i));
      cols.push(rgb[0] * k, rgb[1] * k, rgb[2] * k);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    boxCache.set(key, g);
  }
  return g;
}

let sharedMat: THREE.MeshBasicMaterial | null = null;

/** One shared white material: the colour comes from vertex colours. */
export function vertexColorMaterial(): THREE.MeshBasicMaterial {
  if (!sharedMat) sharedMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  return sharedMat;
}

export function disposeGeoCache(): void {
  for (const g of boxCache.values()) g.dispose();
  boxCache.clear();
  if (sharedMat) {
    sharedMat.dispose();
    sharedMat = null;
  }
}
