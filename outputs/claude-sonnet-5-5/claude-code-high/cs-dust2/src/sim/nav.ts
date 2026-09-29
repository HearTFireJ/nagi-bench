// Navigation: 1 m grid derived from the collision world + A* + string-pulling.
// No hand-placed waypoints are needed: any two walkable points can be connected, and paths
// avoid hugging walls (which is what makes bots "not stick to walls").

import { CFG } from './config.ts';
import type { World } from './world.ts';

export interface P2 {
  x: number;
  z: number;
}

const SQRT2 = Math.SQRT2;

class MinHeap {
  keys: number[] = [];
  vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  clear(): void {
    this.keys.length = 0;
    this.vals.length = 0;
  }
  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lastK = k.pop() as number;
    const lastV = v.pop() as number;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return top;
  }
}

export class NavGrid {
  readonly W: number;
  readonly H: number;
  /** 1 = a body-sized circle fits at the cell centre */
  readonly ok: Uint8Array;
  /** extra traversal cost for cells that hug obstacles */
  readonly penalty: Float32Array;
  private g: Float32Array;
  private parent: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private curStamp = 0;
  private heap = new MinHeap();

  private world: World;

  constructor(world: World) {
    this.world = world;
    this.W = world.grid.W;
    this.H = world.grid.H;
    const n = this.W * this.H;
    this.ok = new Uint8Array(n);
    this.penalty = new Float32Array(n);
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    for (let z = 0; z < this.H; z++) {
      for (let x = 0; x < this.W; x++) {
        if (!world.isWalkCell(x, z)) continue;
        if (world.circleBlocked(x + 0.5, z + 0.5, CFG.RADIUS + 0.02)) continue;
        this.ok[z * this.W + x] = 1;
      }
    }
    // penalty: distance-to-obstacle proxy (count of blocked cells within radius 2)
    for (let z = 0; z < this.H; z++) {
      for (let x = 0; x < this.W; x++) {
        const i = z * this.W + x;
        if (!this.ok[i]) continue;
        let p = 0;
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (!this.cellOk(x + dx, z + dz)) p += Math.abs(dx) <= 1 && Math.abs(dz) <= 1 ? 0.5 : 0.12;
          }
        }
        this.penalty[i] = p;
      }
    }
  }

  cellOk(cx: number, cz: number): boolean {
    if (cx < 0 || cz < 0 || cx >= this.W || cz >= this.H) return false;
    return this.ok[cz * this.W + cx] === 1;
  }

  isWalkable(x: number, z: number): boolean {
    return this.cellOk(Math.floor(x), Math.floor(z));
  }

  /** Nearest navigable cell centre to (x,z). */
  snap(x: number, z: number): P2 | null {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (this.cellOk(cx, cz)) return { x: cx + 0.5, z: cz + 0.5 };
    for (let r = 1; r < 12; r++) {
      let best: P2 | null = null;
      let bd = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (!this.cellOk(cx + dx, cz + dz)) continue;
          const px = cx + dx + 0.5;
          const pz = cz + dz + 0.5;
          const d = (px - x) * (px - x) + (pz - z) * (pz - z);
          if (d < bd) {
            bd = d;
            best = { x: px, z: pz };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Straight walk between a and b free of obstacles (sampled circle sweep, doors ignored). */
  walkable(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / 0.35));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.world.circleBlocked(ax + dx * t, az + dz * t, CFG.RADIUS + 0.05)) return false;
    }
    return true;
  }

  /**
   * A* from (sx,sz) to (gx,gz). Returns smoothed waypoints (start excluded, goal included),
   * or null if unreachable.
   */
  findPath(sx: number, sz: number, gx: number, gz: number): P2[] | null {
    const s = this.snap(sx, sz);
    const e = this.snap(gx, gz);
    if (!s || !e) return null;
    const W = this.W;
    const start = Math.floor(s.z) * W + Math.floor(s.x);
    const goal = Math.floor(e.z) * W + Math.floor(e.x);
    if (start === goal) return [{ x: gx, z: gz }];

    this.curStamp++;
    const st = this.curStamp;
    const { g, parent, stamp, closed, heap, ok, penalty } = this;
    heap.clear();
    g[start] = 0;
    stamp[start] = st;
    parent[start] = -1;
    const goalX = goal % W;
    const goalZ = (goal / W) | 0;
    const h = (i: number): number => {
      const dx = Math.abs((i % W) - goalX);
      const dz = Math.abs(((i / W) | 0) - goalZ);
      return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
    };
    heap.push(h(start), start);
    let found = false;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (closed[cur] === st) continue;
      closed[cur] = st;
      if (cur === goal) {
        found = true;
        break;
      }
      const cx = cur % W;
      const cz = (cur / W) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= this.H) continue;
          const ni = nz * W + nx;
          if (!ok[ni] || closed[ni] === st) continue;
          if (dx !== 0 && dz !== 0) {
            // no corner cutting
            if (!ok[cz * W + nx] || !ok[nz * W + cx]) continue;
          }
          const step = (dx !== 0 && dz !== 0 ? SQRT2 : 1) * (1 + penalty[ni] * 0.6);
          const ng = g[cur] + step;
          if (stamp[ni] !== st || ng < g[ni]) {
            stamp[ni] = st;
            g[ni] = ng;
            parent[ni] = cur;
            heap.push(ng + h(ni), ni);
          }
        }
      }
    }
    if (!found) return null;

    const cells: P2[] = [];
    for (let i = goal; i !== -1; i = parent[i]) {
      cells.push({ x: (i % W) + 0.5, z: ((i / W) | 0) + 0.5 });
    }
    cells.reverse();
    // exact start / goal
    cells[0] = { x: sx, z: sz };
    cells[cells.length - 1] = { x: e.x === gx && e.z === gz ? gx : e.x, z: e.x === gx && e.z === gz ? gz : e.z };

    // string pulling
    const out: P2[] = [];
    let anchor = 0;
    while (anchor < cells.length - 1) {
      let far = anchor + 1;
      for (let j = cells.length - 1; j > anchor + 1; j--) {
        if (this.walkable(cells[anchor].x, cells[anchor].z, cells[j].x, cells[j].z)) {
          far = j;
          break;
        }
      }
      out.push(cells[far]);
      anchor = far;
    }
    return out;
  }
}
