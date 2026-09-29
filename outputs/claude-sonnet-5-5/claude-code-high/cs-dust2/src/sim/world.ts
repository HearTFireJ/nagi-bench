// Collision world: static wall boxes generated from the map grid, crates, and dynamic door
// leaves. Provides circle-vs-box push-out (player/AI movement), ground queries (standing on
// crates) and ray casts (bullets + line of sight).

import { CRATES, DOORS, WALL_H, buildGrid } from './map.ts';
import type { MapGrid } from './map.ts';

export type BoxKind = 'wall' | 'crate' | 'door';

export interface Box {
  id: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  kind: BoxKind;
  /** inactive boxes (open doors) are ignored by everything */
  active: boolean;
  /** crate style for rendering */
  style?: string;
  doorId?: string;
}

export interface RayHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
  box: Box;
}

export function rayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  b: Box,
  maxT: number,
): RayHit | null {
  let tNear = -Infinity;
  let tFar = Infinity;
  let axis = -1;
  let sign = 0;

  // x
  if (Math.abs(dx) < 1e-9) {
    if (ox < b.minX || ox > b.maxX) return null;
  } else {
    let t1 = (b.minX - ox) / dx;
    let t2 = (b.maxX - ox) / dx;
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tNear) {
      tNear = t1;
      axis = 0;
      sign = s;
    }
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return null;
  }
  // y
  if (Math.abs(dy) < 1e-9) {
    if (oy < b.minY || oy > b.maxY) return null;
  } else {
    let t1 = (b.minY - oy) / dy;
    let t2 = (b.maxY - oy) / dy;
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tNear) {
      tNear = t1;
      axis = 1;
      sign = s;
    }
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return null;
  }
  // z
  if (Math.abs(dz) < 1e-9) {
    if (oz < b.minZ || oz > b.maxZ) return null;
  } else {
    let t1 = (b.minZ - oz) / dz;
    let t2 = (b.maxZ - oz) / dz;
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tNear) {
      tNear = t1;
      axis = 2;
      sign = s;
    }
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return null;
  }
  if (tFar < 0 || tNear < 0 || tNear > maxT || axis < 0) return null;
  return {
    t: tNear,
    nx: axis === 0 ? sign : 0,
    ny: axis === 1 ? sign : 0,
    nz: axis === 2 ? sign : 0,
    box: b,
  };
}

const BUCKET = 4;

export class World {
  readonly grid: MapGrid;
  readonly boxes: Box[] = [];
  readonly doorBoxes: Map<string, Box[]> = new Map();
  private buckets: Box[][];
  private bCols: number;
  private bRows: number;
  private nextId = 1;

  constructor() {
    this.grid = buildGrid();
    this.bCols = Math.ceil(this.grid.W / BUCKET);
    this.bRows = Math.ceil(this.grid.H / BUCKET);
    this.buckets = Array.from({ length: this.bCols * this.bRows }, () => []);
    this.buildWalls();
    for (const c of CRATES) {
      this.addBox(c.x, 0, c.z, c.x + c.w, c.h, c.z + c.d, 'crate', c.kind);
    }
    for (const d of DOORS) {
      const list: Box[] = [];
      for (const l of d.leaves) {
        const b = this.addBox(l.x0, 0, l.z0, l.x1, WALL_H, l.z1, 'door');
        b.doorId = d.id;
        list.push(b);
      }
      this.doorBoxes.set(d.id, list);
    }
  }

  isWalkCell(cx: number, cz: number): boolean {
    if (cx < 0 || cz < 0 || cx >= this.grid.W || cz >= this.grid.H) return false;
    return this.grid.walk[cz * this.grid.W + cx] === 1;
  }

  private buildWalls(): void {
    const { W, H, walk } = this.grid;
    const shell = new Uint8Array(W * H);
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        if (walk[z * W + x]) continue;
        let near = false;
        for (let dz = -1; dz <= 1 && !near; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue;
            if (this.isWalkCell(x + dx, z + dz)) {
              near = true;
              break;
            }
          }
        }
        if (near) shell[z * W + x] = 1;
      }
    }
    // merge into rectangles: horizontal runs, then stack identical runs vertically
    const active = new Map<string, { x0: number; x1: number; z0: number }>();
    for (let z = 0; z <= H; z++) {
      const runs = new Map<string, { x0: number; x1: number }>();
      if (z < H) {
        let x = 0;
        while (x < W) {
          if (shell[z * W + x]) {
            const x0 = x;
            while (x < W && shell[z * W + x]) x++;
            runs.set(x0 + ':' + x, { x0, x1: x });
          } else x++;
        }
      }
      for (const [key, a] of active) {
        if (!runs.has(key)) {
          this.addBox(a.x0, 0, a.z0, a.x1, WALL_H, z, 'wall');
          active.delete(key);
        }
      }
      for (const [key, r] of runs) {
        if (!active.has(key)) active.set(key, { x0: r.x0, x1: r.x1, z0: z });
      }
    }
  }

  addBox(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    kind: BoxKind,
    style?: string,
  ): Box {
    const b: Box = { id: this.nextId++, minX, minY, minZ, maxX, maxY, maxZ, kind, active: true, style };
    this.boxes.push(b);
    const bx0 = Math.max(0, Math.floor(minX / BUCKET));
    const bx1 = Math.min(this.bCols - 1, Math.floor((maxX - 1e-6) / BUCKET));
    const bz0 = Math.max(0, Math.floor(minZ / BUCKET));
    const bz1 = Math.min(this.bRows - 1, Math.floor((maxZ - 1e-6) / BUCKET));
    for (let bz = bz0; bz <= bz1; bz++) {
      for (let bx = bx0; bx <= bx1; bx++) this.buckets[bz * this.bCols + bx].push(b);
    }
    return b;
  }

  setDoorActive(doorId: string, active: boolean): void {
    const list = this.doorBoxes.get(doorId);
    if (!list) return;
    for (const b of list) b.active = active;
  }

  /** Boxes whose bucket overlaps the query rectangle (may contain duplicates). */
  private query(minX: number, minZ: number, maxX: number, maxZ: number, out: Box[]): void {
    out.length = 0;
    const bx0 = Math.max(0, Math.floor(minX / BUCKET));
    const bx1 = Math.min(this.bCols - 1, Math.floor(maxX / BUCKET));
    const bz0 = Math.max(0, Math.floor(minZ / BUCKET));
    const bz1 = Math.min(this.bRows - 1, Math.floor(maxZ / BUCKET));
    for (let bz = bz0; bz <= bz1; bz++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const list = this.buckets[bz * this.bCols + bx];
        for (let i = 0; i < list.length; i++) out.push(list[i]);
      }
    }
  }

  private scratch: Box[] = [];

  /**
   * Push a vertical cylinder (circle in XZ) out of every overlapping box.
   * Returns the total displacement applied.
   */
  resolveCircle(
    p: { x: number; z: number },
    r: number,
    feetY: number,
    height: number,
    stepH: number,
    ignoreDoors = false,
  ): { dx: number; dz: number } {
    const startX = p.x;
    const startZ = p.z;
    for (let iter = 0; iter < 3; iter++) {
      this.query(p.x - r, p.z - r, p.x + r, p.z + r, this.scratch);
      let moved = false;
      for (let i = 0; i < this.scratch.length; i++) {
        const b = this.scratch[i];
        if (!b.active) continue;
        if (ignoreDoors && b.kind === 'door') continue;
        if (b.maxY <= feetY + stepH) continue;
        if (b.minY >= feetY + height) continue;
        const cx = p.x < b.minX ? b.minX : p.x > b.maxX ? b.maxX : p.x;
        const cz = p.z < b.minZ ? b.minZ : p.z > b.maxZ ? b.maxZ : p.z;
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = r - d;
          p.x += (dx / d) * push;
          p.z += (dz / d) * push;
        } else {
          // centre is inside the box: leave through the closest face
          const l = p.x - b.minX;
          const rr = b.maxX - p.x;
          const t = p.z - b.minZ;
          const bt = b.maxZ - p.z;
          const m = Math.min(l, rr, t, bt);
          if (m === l) p.x = b.minX - r;
          else if (m === rr) p.x = b.maxX + r;
          else if (m === t) p.z = b.minZ - r;
          else p.z = b.maxZ + r;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return { dx: p.x - startX, dz: p.z - startZ };
  }

  /** True if a circle at (x,z) would intersect a (static, unless includeDoors) box. */
  circleBlocked(x: number, z: number, r: number, feetY = 0, stepH = 0.5, includeDoors = false): boolean {
    this.query(x - r, z - r, x + r, z + r, this.scratch);
    for (let i = 0; i < this.scratch.length; i++) {
      const b = this.scratch[i];
      if (!b.active) continue;
      if (!includeDoors && b.kind === 'door') continue;
      if (b.maxY <= feetY + stepH) continue;
      const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
      const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  /** Highest standable surface under a circle (0 = floor). */
  groundHeight(x: number, z: number, r: number, feetY: number, stepH: number): number {
    this.query(x - r, z - r, x + r, z + r, this.scratch);
    let g = 0;
    const rr = r * 0.85;
    for (let i = 0; i < this.scratch.length; i++) {
      const b = this.scratch[i];
      if (!b.active || b.maxY > feetY + stepH + 0.001) continue;
      if (b.maxY <= g) continue;
      const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
      const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < rr * rr) g = b.maxY;
    }
    return g;
  }

  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxT: number,
  ): RayHit | null {
    let best: RayHit | null = null;
    let bestT = maxT;
    // cheap ray AABB in XZ to skip far boxes
    const ex = ox + dx * maxT;
    const ez = oz + dz * maxT;
    const rminX = Math.min(ox, ex);
    const rmaxX = Math.max(ox, ex);
    const rminZ = Math.min(oz, ez);
    const rmaxZ = Math.max(oz, ez);
    const boxes = this.boxes;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!b.active) continue;
      if (b.maxX < rminX || b.minX > rmaxX || b.maxZ < rminZ || b.minZ > rmaxZ) continue;
      const h = rayBox(ox, oy, oz, dx, dy, dz, b, bestT);
      if (h && h.t < bestT) {
        best = h;
        bestT = h.t;
      }
    }
    return best;
  }

  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    return this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.02) === null;
  }
}
