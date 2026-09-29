import type { BoxDef, CrateMat, DoorDef, MapData, RampDef, ZoneDef } from './types.ts';

/**
 * Declarative level builder. The world starts as solid rock; `floor`/`ramp` carve
 * walkable space out of it. Walls are then generated automatically around whatever
 * was carved, so the level is watertight by construction (no gaps to slip through).
 *
 * All coordinates are integer metres (1m grid).
 */
export const WALL_TOP = 8;
const SHELL = 3; // wall cells farther than this from any walkable cell are void

export class MapBuilder {
  readonly cols: number;
  readonly rows: number;
  private h: Float32Array;
  private style: Uint8Array;
  private wallTop: Float32Array;
  private roofY: Float32Array;
  private ramps: RampDef[] = [];
  private props: BoxDef[] = [];
  private lintels: BoxDef[] = [];
  private doors: DoorDef[] = [];
  private zones: ZoneDef[] = [];

  readonly width: number;
  readonly depth: number;

  constructor(width: number, depth: number) {
    this.width = width;
    this.depth = depth;
    this.cols = width;
    this.rows = depth;
    const n = this.cols * this.rows;
    this.h = new Float32Array(n).fill(NaN);
    this.style = new Uint8Array(n);
    this.wallTop = new Float32Array(n).fill(WALL_TOP);
    this.roofY = new Float32Array(n).fill(NaN);
  }

  private idx(x: number, z: number): number {
    return z * this.cols + x;
  }

  private each(x0: number, z0: number, x1: number, z1: number, fn: (i: number, x: number, z: number) => void): void {
    if (x1 <= x0 || z1 <= z0) throw new Error(`empty rect ${x0},${z0},${x1},${z1}`);
    if (x0 < 0 || z0 < 0 || x1 > this.cols || z1 > this.rows) throw new Error(`rect out of range ${x0},${z0},${x1},${z1}`);
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) fn(this.idx(x, z), x, z);
  }

  /** Carve flat walkable floor at height h. */
  floor(x0: number, z0: number, x1: number, z1: number, h: number, style?: number): this {
    this.each(x0, z0, x1, z1, (i) => {
      this.h[i] = h;
      if (style !== undefined) this.style[i] = style;
    });
    return this;
  }

  /** Carve a ramp. Height runs from hFrom at the min edge of `axis` to hTo at the max edge. */
  ramp(x0: number, z0: number, x1: number, z1: number, axis: 'x' | 'z', hFrom: number, hTo: number, style = 0): this {
    this.each(x0, z0, x1, z1, (i) => {
      this.h[i] = Math.min(hFrom, hTo);
      this.style[i] = style;
    });
    this.ramps.push({ x0, z0, x1, z1, axis, hFrom, hTo, style });
    return this;
  }

  /** Turn cells back into solid rock (walls, pillars). */
  solid(x0: number, z0: number, x1: number, z1: number, top = WALL_TOP): this {
    this.each(x0, z0, x1, z1, (i) => {
      this.h[i] = NaN;
      this.wallTop[i] = top;
    });
    // ramps overlapping a solid are dropped
    this.ramps = this.ramps.filter((r) => !(r.x0 >= x0 && r.x1 <= x1 && r.z0 >= z0 && r.z1 <= z1));
    return this;
  }

  /** Paint palette style over a region (walls and floors). */
  paint(x0: number, z0: number, x1: number, z1: number, style: number): this {
    const cx0 = Math.max(0, x0);
    const cz0 = Math.max(0, z0);
    const cx1 = Math.min(this.cols, x1);
    const cz1 = Math.min(this.rows, z1);
    this.each(cx0, cz0, cx1, cz1, (i) => {
      this.style[i] = style;
    });
    return this;
  }

  /** Ceiling (tunnel roof) over walkable cells. */
  roof(x0: number, z0: number, x1: number, z1: number, y: number, style?: number): this {
    this.each(x0, z0, x1, z1, (i) => {
      this.roofY[i] = y;
      if (style !== undefined) this.style[i] = style;
    });
    return this;
  }

  /** Free standing crate sitting on the local floor. */
  crate(x0: number, z0: number, x1: number, z1: number, h: number, mat: CrateMat = 'wood'): this {
    let lo = Infinity;
    let hi = -Infinity;
    this.each(x0, z0, x1, z1, (i) => {
      const cell = this.h[i];
      if (Number.isNaN(cell)) throw new Error(`crate on solid at ${x0},${z0}`);
      lo = Math.min(lo, cell);
      hi = Math.max(hi, cell);
    });
    // On a ramp the crate spans from the lowest surface to (highest surface + h) so it never floats.
    for (const r of this.ramps) {
      if (x1 > r.x0 && x0 < r.x1 && z1 > r.z0 && z0 < r.z1) {
        const a = r.axis === 'x' ? [Math.max(x0, r.x0), Math.min(x1, r.x1)] : [Math.max(z0, r.z0), Math.min(z1, r.z1)];
        const c0 = r.axis === 'x' ? r.x0 : r.z0;
        const c1 = r.axis === 'x' ? r.x1 : r.z1;
        const hAt = (c: number) => r.hFrom + (r.hTo - r.hFrom) * ((c - c0) / (c1 - c0));
        hi = Math.max(hi, hAt(a[0]), hAt(a[1]));
        lo = Math.min(lo, hAt(a[0]), hAt(a[1]));
      }
    }
    this.props.push({ minX: x0, minY: lo - 0.01, minZ: z0, maxX: x1, maxY: hi + h, maxZ: z1, kind: 'crate', style: 0, mat });
    return this;
  }

  /**
   * Sliding double door in a gap. The gap must already be carved as floor; the
   * wall on both sides of the gap is left in place.
   */
  door(id: string, x0: number, z0: number, x1: number, z1: number, slide: 'x' | 'z', floorY: number, height = 3.2, trigger = 4.5): this {
    this.doors.push({ id, x0, z0, x1, z1, slide, floorY, height, triggerRadius: trigger });
    // lintel above door
    this.lintels.push({ minX: x0, minY: floorY + height, minZ: z0, maxX: x1, maxY: WALL_TOP, maxZ: z1, kind: 'lintel', style: 0 });
    return this;
  }

  zone(id: string, name: string, label: string, ...rects: [number, number, number, number][]): this {
    this.zones.push({ id, name, label, rects });
    return this;
  }

  heightAt(x: number, z: number): number {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    if (ix < 0 || iz < 0 || ix >= this.cols || iz >= this.rows) return NaN;
    return this.h[this.idx(ix, iz)];
  }

  // ------------------------------------------------------------------ output

  private isShell(x: number, z: number): boolean {
    for (let dz = -SHELL; dz <= SHELL; dz++) {
      for (let dx = -SHELL; dx <= SHELL; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= this.cols || nz >= this.rows) continue;
        if (!Number.isNaN(this.h[this.idx(nx, nz)])) return true;
      }
    }
    return false;
  }

  /** Greedy rectangle merge over cells for which `key` returns a non-null string. */
  private greedy(key: (x: number, z: number) => string | null, emit: (x0: number, z0: number, x1: number, z1: number, k: string) => void): void {
    const done = new Uint8Array(this.cols * this.rows);
    for (let z = 0; z < this.rows; z++) {
      for (let x = 0; x < this.cols; x++) {
        if (done[this.idx(x, z)]) continue;
        const k = key(x, z);
        if (k === null) continue;
        let w = 1;
        while (x + w < this.cols && !done[this.idx(x + w, z)] && key(x + w, z) === k) w++;
        let d = 1;
        outer: while (z + d < this.rows) {
          for (let i = 0; i < w; i++) {
            if (done[this.idx(x + i, z + d)] || key(x + i, z + d) !== k) break outer;
          }
          d++;
        }
        for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) done[this.idx(x + dx, z + dz)] = 1;
        emit(x, z, x + w, z + d, k);
      }
    }
  }

  build(name: string, extra: Pick<MapData, 'anchors' | 'spawns' | 'sites' | 'routes'>): MapData {
    const boxes: BoxDef[] = [];

    // Floors (solid slabs down to y=-2 so nothing can fall through)
    this.greedy(
      (x, z) => {
        const hh = this.h[this.idx(x, z)];
        return Number.isNaN(hh) ? null : `${hh}|${this.style[this.idx(x, z)]}`;
      },
      (x0, z0, x1, z1, k) => {
        const [hs, ss] = k.split('|');
        boxes.push({ minX: x0, minY: -2, minZ: z0, maxX: x1, maxY: Number(hs), maxZ: z1, kind: 'floor', style: Number(ss) });
      },
    );

    // Walls (only the shell around walkable space)
    this.greedy(
      (x, z) => {
        const i = this.idx(x, z);
        if (!Number.isNaN(this.h[i])) return null;
        if (!this.isShell(x, z)) return null;
        return `${this.wallTop[i]}|${this.style[i]}`;
      },
      (x0, z0, x1, z1, k) => {
        const [ts, ss] = k.split('|');
        boxes.push({ minX: x0, minY: -2, minZ: z0, maxX: x1, maxY: Number(ts), maxZ: z1, kind: 'wall', style: Number(ss) });
      },
    );

    // Roofs
    this.greedy(
      (x, z) => {
        const i = this.idx(x, z);
        if (Number.isNaN(this.h[i]) || Number.isNaN(this.roofY[i])) return null;
        return `${this.roofY[i]}|${this.style[i]}`;
      },
      (x0, z0, x1, z1, k) => {
        const [ys, ss] = k.split('|');
        boxes.push({ minX: x0, minY: Number(ys), minZ: z0, maxX: x1, maxY: WALL_TOP + 0.5, maxZ: z1, kind: 'roof', style: Number(ss) });
      },
    );

    boxes.push(...this.lintels, ...this.props);

    return {
      name,
      width: this.width,
      depth: this.depth,
      cols: this.cols,
      rows: this.rows,
      terrain: this.h,
      styleGrid: this.style,
      boxes,
      ramps: this.ramps,
      doors: this.doors,
      zones: this.zones,
      anchors: extra.anchors,
      spawns: extra.spawns,
      sites: extra.sites,
      routes: extra.routes,
    };
  }
}
