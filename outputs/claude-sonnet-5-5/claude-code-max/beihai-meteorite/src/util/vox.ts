// 体素网格构建器：以“世界米”为单位在网格里画盒子/球/圆柱等，最后交给 Voxel Kit 的 buildVoxelGeometry 合并成单个几何。
import * as THREE from "three";
import { buildVoxelGeometry } from "@agentbench/voxel-kit";
import { hash3 } from "./math";
import { shade } from "./color";

/** 颜色函数：参数是体素中心的世界坐标；返回 null 表示该处不填充 */
export type ColorFn = (x: number, y: number, z: number, i: number, j: number, k: number) => number | null;
export type Paint = number | ColorFn;

const EMPTY = -1;

export class Vox {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly data: Int32Array;

  /**
   * @param min 网格最小角（世界米）
   * @param max 网格最大角（世界米）
   * @param vs  单个体素边长（米）
   */
  constructor(
    readonly min: [number, number, number],
    readonly max: [number, number, number],
    readonly vs: number,
  ) {
    this.sx = Math.max(1, Math.ceil((max[0] - min[0]) / vs - 1e-6));
    this.sy = Math.max(1, Math.ceil((max[1] - min[1]) / vs - 1e-6));
    this.sz = Math.max(1, Math.ceil((max[2] - min[2]) / vs - 1e-6));
    this.data = new Int32Array(this.sx * this.sy * this.sz).fill(EMPTY);
  }

  idx(i: number, j: number, k: number): number {
    return (j * this.sz + k) * this.sx + i;
  }
  inside(i: number, j: number, k: number): boolean {
    return i >= 0 && j >= 0 && k >= 0 && i < this.sx && j < this.sy && k < this.sz;
  }
  /** 世界坐标 -> 体素下标（向下取整） */
  cell(x: number, y: number, z: number): [number, number, number] {
    return [
      Math.floor((x - this.min[0]) / this.vs),
      Math.floor((y - this.min[1]) / this.vs),
      Math.floor((z - this.min[2]) / this.vs),
    ];
  }
  center(i: number, j: number, k: number): [number, number, number] {
    return [
      this.min[0] + (i + 0.5) * this.vs,
      this.min[1] + (j + 0.5) * this.vs,
      this.min[2] + (k + 0.5) * this.vs,
    ];
  }

  set(i: number, j: number, k: number, c: number): void {
    if (this.inside(i, j, k)) this.data[this.idx(i, j, k)] = c;
  }
  get(i: number, j: number, k: number): number {
    return this.inside(i, j, k) ? this.data[this.idx(i, j, k)] : EMPTY;
  }
  clearCell(i: number, j: number, k: number): void {
    if (this.inside(i, j, k)) this.data[this.idx(i, j, k)] = EMPTY;
  }

  private put(i: number, j: number, k: number, paint: Paint): void {
    const [cx, cy, cz] = this.center(i, j, k);
    const c = typeof paint === "number" ? paint : paint(cx, cy, cz, i, j, k);
    if (c === null) return;
    this.data[this.idx(i, j, k)] = c;
  }

  /** 世界米坐标的实心盒（[x0,x1) 等），以体素中心是否落入判定 */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, paint: Paint): this {
    const [i0, j0, k0] = this.cell(x0 + 1e-9, y0 + 1e-9, z0 + 1e-9);
    const [i1, j1, k1] = this.cell(x1 - 1e-9, y1 - 1e-9, z1 - 1e-9);
    // 体素中心判定：中心必须落入盒内，否则下标 +1 过滤
    for (let k = Math.max(0, k0); k <= Math.min(this.sz - 1, k1); k++) {
      const cz = this.min[2] + (k + 0.5) * this.vs;
      if (cz < z0 || cz >= z1) continue;
      for (let j = Math.max(0, j0); j <= Math.min(this.sy - 1, j1); j++) {
        const cy = this.min[1] + (j + 0.5) * this.vs;
        if (cy < y0 || cy >= y1) continue;
        for (let i = Math.max(0, i0); i <= Math.min(this.sx - 1, i1); i++) {
          const cx = this.min[0] + (i + 0.5) * this.vs;
          if (cx < x0 || cx >= x1) continue;
          this.put(i, j, k, paint);
        }
      }
    }
    return this;
  }

  /** 以中心 + 尺寸给盒子 */
  boxC(cx: number, cy: number, cz: number, w: number, h: number, d: number, paint: Paint): this {
    return this.box(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2, paint);
  }

  clearBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): this {
    return this.box(x0, y0, z0, x1, y1, z1, () => {
      return EMPTY as unknown as number;
    });
  }

  /** 空心盒：墙厚 t，可选择性开放某些面 */
  shell(
    x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t: number, paint: Paint,
    open: { px?: boolean; nx?: boolean; py?: boolean; ny?: boolean; pz?: boolean; nz?: boolean } = {},
  ): this {
    this.box(x0, y0, z0, x1, y1, z1, paint);
    this.box(
      x0 + (open.nx ? -1 : t), y0 + (open.ny ? -1 : t), z0 + (open.nz ? -1 : t),
      x1 - (open.px ? -1 : t), y1 - (open.py ? -1 : t), z1 - (open.pz ? -1 : t),
      () => EMPTY as unknown as number,
    );
    return this;
  }

  sphere(cx: number, cy: number, cz: number, r: number, paint: Paint): this {
    return this.ellipsoid(cx, cy, cz, r, r, r, paint);
  }

  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, paint: Paint): this {
    const [i0, j0, k0] = this.cell(cx - rx, cy - ry, cz - rz);
    const [i1, j1, k1] = this.cell(cx + rx, cy + ry, cz + rz);
    for (let k = Math.max(0, k0); k <= Math.min(this.sz - 1, k1); k++) {
      for (let j = Math.max(0, j0); j <= Math.min(this.sy - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(this.sx - 1, i1); i++) {
          const [x, y, z] = this.center(i, j, k);
          const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
          if (dx * dx + dy * dy + dz * dz <= 1) this.put(i, j, k, paint);
        }
      }
    }
    return this;
  }

  /** 沿 Y 轴的圆柱 */
  cylY(cx: number, cz: number, r: number, y0: number, y1: number, paint: Paint, rInner = 0): this {
    const [i0, j0, k0] = this.cell(cx - r, y0, cz - r);
    const [i1, j1, k1] = this.cell(cx + r, y1 - 1e-9, cz + r);
    for (let k = Math.max(0, k0); k <= Math.min(this.sz - 1, k1); k++) {
      for (let j = Math.max(0, j0); j <= Math.min(this.sy - 1, j1); j++) {
        const cy = this.min[1] + (j + 0.5) * this.vs;
        if (cy < y0 || cy >= y1) continue;
        for (let i = Math.max(0, i0); i <= Math.min(this.sx - 1, i1); i++) {
          const x = this.min[0] + (i + 0.5) * this.vs, z = this.min[2] + (k + 0.5) * this.vs;
          const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
          if (d2 <= r * r && d2 >= rInner * rInner) this.put(i, j, k, paint);
        }
      }
    }
    return this;
  }
  /** 沿 X 轴的圆柱 */
  cylX(cy: number, cz: number, r: number, x0: number, x1: number, paint: Paint, rInner = 0): this {
    const [i0, j0, k0] = this.cell(x0, cy - r, cz - r);
    const [i1, j1, k1] = this.cell(x1 - 1e-9, cy + r, cz + r);
    for (let k = Math.max(0, k0); k <= Math.min(this.sz - 1, k1); k++) {
      for (let j = Math.max(0, j0); j <= Math.min(this.sy - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(this.sx - 1, i1); i++) {
          const x = this.min[0] + (i + 0.5) * this.vs;
          if (x < x0 || x >= x1) continue;
          const y = this.min[1] + (j + 0.5) * this.vs, z = this.min[2] + (k + 0.5) * this.vs;
          const d2 = (y - cy) * (y - cy) + (z - cz) * (z - cz);
          if (d2 <= r * r && d2 >= rInner * rInner) this.put(i, j, k, paint);
        }
      }
    }
    return this;
  }
  /** 沿 Z 轴的圆柱 */
  cylZ(cx: number, cy: number, r: number, z0: number, z1: number, paint: Paint, rInner = 0): this {
    const [i0, j0, k0] = this.cell(cx - r, cy - r, z0);
    const [i1, j1, k1] = this.cell(cx + r, cy + r, z1 - 1e-9);
    for (let k = Math.max(0, k0); k <= Math.min(this.sz - 1, k1); k++) {
      const z = this.min[2] + (k + 0.5) * this.vs;
      if (z < z0 || z >= z1) continue;
      for (let j = Math.max(0, j0); j <= Math.min(this.sy - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(this.sx - 1, i1); i++) {
          const x = this.min[0] + (i + 0.5) * this.vs, y = this.min[1] + (j + 0.5) * this.vs;
          const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
          if (d2 <= r * r && d2 >= rInner * rInner) this.put(i, j, k, paint);
        }
      }
    }
    return this;
  }

  /** 水平圆环（XZ 平面）：中心线半径 R，截面为矩形 w(径向) × h(垂直) */
  ringY(cx: number, cy: number, cz: number, R: number, w: number, h: number, paint: Paint): this {
    const rMax = R + w / 2;
    const [i0, j0, k0] = this.cell(cx - rMax, cy - h / 2, cz - rMax);
    const [i1, j1, k1] = this.cell(cx + rMax, cy + h / 2, cz + rMax);
    for (let k = Math.max(0, k0); k <= Math.min(this.sz - 1, k1); k++) {
      for (let j = Math.max(0, j0); j <= Math.min(this.sy - 1, j1); j++) {
        const y = this.min[1] + (j + 0.5) * this.vs;
        if (Math.abs(y - cy) > h / 2) continue;
        for (let i = Math.max(0, i0); i <= Math.min(this.sx - 1, i1); i++) {
          const x = this.min[0] + (i + 0.5) * this.vs, z = this.min[2] + (k + 0.5) * this.vs;
          const d = Math.hypot(x - cx, z - cz);
          if (Math.abs(d - R) <= w / 2) this.put(i, j, k, paint);
        }
      }
    }
    return this;
  }

  /** 任意粗细的线段（胶囊近似：点到线段距离 <= r） */
  line(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, paint: Paint): this {
    const x0 = Math.min(ax, bx) - r, x1 = Math.max(ax, bx) + r;
    const y0 = Math.min(ay, by) - r, y1 = Math.max(ay, by) + r;
    const z0 = Math.min(az, bz) - r, z1 = Math.max(az, bz) + r;
    const [i0, j0, k0] = this.cell(x0, y0, z0);
    const [i1, j1, k1] = this.cell(x1, y1, z1);
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L2 = dx * dx + dy * dy + dz * dz || 1e-9;
    for (let k = Math.max(0, k0); k <= Math.min(this.sz - 1, k1); k++) {
      for (let j = Math.max(0, j0); j <= Math.min(this.sy - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(this.sx - 1, i1); i++) {
          const [x, y, z] = this.center(i, j, k);
          let t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ax + dx * t - x, py = ay + dy * t - y, pz = az + dz * t - z;
          if (px * px + py * py + pz * pz <= r * r) this.put(i, j, k, paint);
        }
      }
    }
    return this;
  }

  /** 对已填充体素做“重新着色”，例如在墙上绘制图案 */
  recolor(fn: (x: number, y: number, z: number, c: number, i: number, j: number, k: number) => number | null): this {
    for (let k = 0; k < this.sz; k++) {
      for (let j = 0; j < this.sy; j++) {
        for (let i = 0; i < this.sx; i++) {
          const v = this.data[this.idx(i, j, k)];
          if (v === EMPTY) continue;
          const [x, y, z] = this.center(i, j, k);
          const nc = fn(x, y, z, v, i, j, k);
          if (nc !== null) this.data[this.idx(i, j, k)] = nc;
        }
      }
    }
    return this;
  }

  count(): number {
    let n = 0;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] !== EMPTY) n++;
    return n;
  }

  /**
   * 把满足条件的体素从本网格“挖出”，放进一个同尺寸的新网格（用于自发光层：
   * 主体挖空 + 发光体素填回同一位置，二者没有共面重叠，因此不会 z-fighting）。
   * pick 返回新颜色即挖出，返回 null 则保留。
   */
  split(pick: (x: number, y: number, z: number, c: number, i: number, j: number, k: number) => number | null): Vox {
    const out = new Vox(this.min, this.max, this.vs);
    for (let k = 0; k < this.sz; k++) {
      for (let j = 0; j < this.sy; j++) {
        for (let i = 0; i < this.sx; i++) {
          const idx = this.idx(i, j, k);
          const v = this.data[idx];
          if (v === EMPTY) continue;
          const [x, y, z] = this.center(i, j, k);
          const nc = pick(x, y, z, v, i, j, k);
          if (nc === null) continue;
          out.data[idx] = nc;
          this.data[idx] = EMPTY;
        }
      }
    }
    return out;
  }

  toGeometry(): THREE.BufferGeometry {
    const data = this.data;
    const sx = this.sx, sy = this.sy, sz = this.sz;
    const g = buildVoxelGeometry(
      {
        size: [sx, sy, sz],
        at: (x, y, z) => {
          const v = data[(y * sz + z) * sx + x];
          return v === EMPTY ? null : v;
        },
      },
      { voxel: this.vs, anchor: "min" },
    );
    g.translate(this.min[0], this.min[1], this.min[2]);
    return g;
  }
}

// ---------- 常用着色函数 ----------
/** 基础色 + 每体素明暗抖动 */
export function noisy(base: number, amount = 0.08, seed = 0): ColorFn {
  return (_x, _y, _z, i, j, k) => shade(base, 1 + (hash3(i + seed * 131, j + seed * 17, k + seed * 71) * 2 - 1) * amount);
}
/** 垂直渐变（按世界 y） */
export function gradientY(y0: number, c0: number, y1: number, c1: number, mixFn: (a: number, b: number, t: number) => number): ColorFn {
  return (_x, y) => mixFn(c0, c1, Math.min(1, Math.max(0, (y - y0) / (y1 - y0))));
}
