import type { Vec3 } from '../core/vec';
import { CELL } from './MapData';
import type { Cell, MapGrid } from './MapGrid';

/** Binary min-heap keyed on f score. */
class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, key: number) {
    this.items.push(item);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      const n = this.items.length;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < n && this.keys[l] < this.keys[m]) m = l;
        if (r < n && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    const ti = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = ti;
    const tk = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = tk;
  }
}

const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export class NavGrid {
  private readonly w: number;
  private readonly h: number;
  private readonly gScore: Float32Array;
  private readonly cameFrom: Int32Array;
  private readonly closed: Uint8Array;
  private readonly openStamp: Uint32Array;
  private stamp = 1;
  /** Extra traversal cost per cell (e.g. cells adjacent to walls) to keep bots off corners. */
  private readonly cellCost: Float32Array;

  constructor(private readonly map: MapGrid) {
    this.w = map.w;
    this.h = map.h;
    const n = this.w * this.h;
    this.gScore = new Float32Array(n);
    this.cameFrom = new Int32Array(n);
    this.closed = new Uint8Array(n);
    this.openStamp = new Uint32Array(n);
    this.cellCost = new Float32Array(n);
    for (const c of map.cells) {
      if (!map.isNavWalkable(c)) continue;
      let cost = 1;
      for (const [dx, dz] of DIRS) {
        const nb = map.cell(c.x + dx, c.z + dz);
        if (!nb || !map.canStep(c, nb)) cost += 0.35;
      }
      this.cellCost[c.z * this.w + c.x] = cost;
    }
  }

  private idx(x: number, z: number) {
    return z * this.w + x;
  }

  /** Nearest walkable cell to a world position (spiral search). */
  nearestWalkable(wx: number, wz: number): Cell | null {
    const { x, z } = this.map.toCell(wx, wz);
    for (let r = 0; r < 6; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const c = this.map.cell(x + dx, z + dz);
          if (this.map.isNavWalkable(c)) return c;
        }
      }
    }
    return null;
  }

  /**
   * A* from world position to world position. Returns world waypoints (cell centers,
   * with the final point being the exact target) or null when unreachable.
   */
  findPath(from: Vec3, to: Vec3): Vec3[] | null {
    const start = this.nearestWalkable(from.x, from.z);
    const goal = this.nearestWalkable(to.x, to.z);
    if (!start || !goal) return null;
    if (start === goal) return [{ x: to.x, y: goal.h, z: to.z }];

    const stamp = ++this.stamp;
    if (stamp === 0xffffffff) {
      this.openStamp.fill(0);
      this.stamp = 1;
    }
    this.closed.fill(0);
    const heap = new Heap();
    const s = this.idx(start.x, start.z);
    const g = this.idx(goal.x, goal.z);
    this.gScore[s] = 0;
    this.cameFrom[s] = -1;
    this.openStamp[s] = stamp;
    heap.push(s, this.heuristic(start.x, start.z, goal.x, goal.z));

    let found = false;
    let iterations = 0;
    while (heap.size > 0 && iterations++ < 20000) {
      const cur = heap.pop();
      if (this.closed[cur]) continue;
      if (cur === g) {
        found = true;
        break;
      }
      this.closed[cur] = 1;
      const cx = cur % this.w;
      const cz = (cur - cx) / this.w;
      const cc = this.map.cell(cx, cz)!;
      for (const [dx, dz, cost] of DIRS) {
        const nx = cx + dx;
        const nz = cz + dz;
        const nc = this.map.cell(nx, nz);
        if (!nc || !this.map.isNavWalkable(nc) || !this.map.canStep(cc, nc)) continue;
        if (dx !== 0 && dz !== 0) {
          // prevent corner cutting
          const a = this.map.cell(cx + dx, cz);
          const b = this.map.cell(cx, cz + dz);
          if (!a || !b || !this.map.isNavWalkable(a) || !this.map.isNavWalkable(b)) continue;
          if (!this.map.canStep(cc, a) || !this.map.canStep(cc, b)) continue;
        }
        const ni = this.idx(nx, nz);
        if (this.closed[ni]) continue;
        const tentative = this.gScore[cur] + cost * this.cellCost[ni];
        if (this.openStamp[ni] !== stamp || tentative < this.gScore[ni]) {
          this.openStamp[ni] = stamp;
          this.gScore[ni] = tentative;
          this.cameFrom[ni] = cur;
          heap.push(ni, tentative + this.heuristic(nx, nz, goal.x, goal.z));
        }
      }
    }
    if (!found) return null;

    const cells: Cell[] = [];
    let cur = g;
    while (cur !== -1) {
      const cx = cur % this.w;
      const cz = (cur - cx) / this.w;
      cells.push(this.map.cell(cx, cz)!);
      cur = this.cameFrom[cur];
    }
    cells.reverse();
    const pts: Vec3[] = cells.map((c) => ({ x: c.x * CELL + CELL / 2, y: c.h, z: c.z * CELL + CELL / 2 }));
    // Replace the final cell center by the exact requested target when it's inside that cell.
    const last = cells[cells.length - 1];
    if (this.map.cellAtWorld(to.x, to.z) === last) pts[pts.length - 1] = { x: to.x, y: last.h, z: to.z };
    return this.smooth(pts);
  }

  private heuristic(x0: number, z0: number, x1: number, z1: number): number {
    const dx = Math.abs(x0 - x1);
    const dz = Math.abs(z0 - z1);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  }

  /** String pulling: drop intermediate waypoints when a straight walk is clear. */
  private smooth(pts: Vec3[]): Vec3[] {
    if (pts.length <= 2) return pts;
    const out: Vec3[] = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.lineWalkable(pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  /** Whether a straight walk between two points stays on walkable, step-compatible cells with clearance. */
  lineWalkable(a: Vec3, b: Vec3, clearance = 0.5): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-4) return true;
    const nx = -dz / len;
    const nz = dx / len;
    const steps = Math.ceil(len / 0.5);
    for (const off of [-clearance, 0, clearance]) {
      let prev: Cell | null = null;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = a.x + dx * t + nx * off;
        const pz = a.z + dz * t + nz * off;
        const c = this.map.cellAtWorld(px, pz);
        if (!this.map.isNavWalkable(c)) return false;
        if (prev && c !== prev && !this.map.canStep(prev, c!)) return false;
        prev = c;
      }
    }
    return true;
  }
}
