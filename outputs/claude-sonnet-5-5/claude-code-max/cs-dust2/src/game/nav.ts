// Navigation grid generated from the collision world (so paths agree with the physics), plus A* with string pulling.
import { MinHeap } from '../core/math';
import type { CollisionWorld } from './collision';
import { BODY } from './config';
import type { MapData } from './map/build';

export interface NavPoint {
  x: number;
  z: number;
}

const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Extra clearance (m) beyond the hull radius that a nav cell must have. */
const NAV_MARGIN = 0.1;
const MAX_STEP = 0.45;

export class NavGrid {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  readonly minX: number;
  readonly minZ: number;
  readonly walkable: Uint8Array;
  readonly height: Float32Array;
  /** Distance (in cells, capped) to the nearest blocked cell; used to keep paths off walls. */
  readonly clearance: Uint8Array;
  /** Connected component id of every walkable cell (0 = not walkable). */
  readonly component: Int32Array;

  private readonly g: Float32Array;
  private readonly parent: Int32Array;
  private readonly seen: Int32Array;
  private readonly closed: Int32Array;
  private search = 0;
  private readonly heap = new MinHeap();

  constructor(cw: CollisionWorld, map: MapData) {
    this.cell = map.cell;
    this.cols = map.cols;
    this.rows = map.rows;
    this.minX = map.minX;
    this.minZ = map.minZ;
    const n = this.cols * this.rows;
    this.walkable = new Uint8Array(n);
    this.height = new Float32Array(n).fill(NaN);
    this.clearance = new Uint8Array(n);
    this.component = new Int32Array(n);
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Int32Array(n);
    this.closed = new Int32Array(n);

    const rr = BODY.radius + NAV_MARGIN;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        const h = map.floor[i];
        if (Number.isNaN(h)) continue;
        const x = this.minX + (c + 0.5) * this.cell;
        const z = this.minZ + (r + 0.5) * this.cell;
        // Ignore anything lower than the step height: the movement code climbs it automatically (stairs).
        const clear = cw.isClear(x - rr, h + BODY.stepHeight + 0.02, z - rr, x + rr, h + BODY.height, z + rr, false);
        if (clear) {
          this.walkable[i] = 1;
          this.height[i] = h;
        }
      }
    }
    this.computeClearance();
    this.labelComponents();
  }

  private computeClearance(): void {
    const { cols, rows } = this;
    const cap = 5;
    const d = this.clearance;
    const q: number[] = [];
    for (let i = 0; i < d.length; i++) {
      if (this.walkable[i] === 0) d[i] = 0;
      else d[i] = cap;
    }
    for (let i = 0; i < d.length; i++) if (d[i] === 0) q.push(i);
    for (let head = 0; head < q.length; head++) {
      const i = q[head];
      const c = i % cols;
      const r = (i - c) / cols;
      const nd = d[i] + 1;
      for (let k = 0; k < 4; k++) {
        const cc = c + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const rr = r + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
        const j = rr * cols + cc;
        if (this.walkable[j] === 1 && d[j] > nd) {
          d[j] = nd;
          q.push(j);
        }
      }
    }
  }

  private labelComponents(): void {
    let next = 0;
    const stack: number[] = [];
    for (let s = 0; s < this.walkable.length; s++) {
      if (this.walkable[s] === 0 || this.component[s] !== 0) continue;
      next++;
      this.component[s] = next;
      stack.push(s);
      while (stack.length > 0) {
        const i = stack.pop() as number;
        const c = i % this.cols;
        const r = (i - c) / this.cols;
        for (let k = 0; k < 8; k++) {
          const nb = NEIGHBORS[k];
          if (!this.canStep(c, r, nb[0], nb[1])) continue;
          const j = (r + nb[1]) * this.cols + (c + nb[0]);
          if (this.component[j] === 0) {
            this.component[j] = next;
            stack.push(j);
          }
        }
      }
    }
  }

  /** Can we move from cell (c,r) by (dc,dr)? Diagonals may not cut blocked corners. */
  private canStep(c: number, r: number, dc: number, dr: number): boolean {
    const cc = c + dc;
    const rr = r + dr;
    if (cc < 0 || rr < 0 || cc >= this.cols || rr >= this.rows) return false;
    const i = r * this.cols + c;
    const j = rr * this.cols + cc;
    if (this.walkable[j] === 0) return false;
    if (Math.abs(this.height[j] - this.height[i]) > MAX_STEP) return false;
    if (dc !== 0 && dr !== 0) {
      const a = r * this.cols + cc;
      const b = rr * this.cols + c;
      if (this.walkable[a] === 0 || this.walkable[b] === 0) return false;
      if (Math.abs(this.height[a] - this.height[i]) > MAX_STEP || Math.abs(this.height[b] - this.height[i]) > MAX_STEP) return false;
    }
    return true;
  }

  cellIndex(x: number, z: number): number {
    const c = Math.floor((x - this.minX) / this.cell);
    const r = Math.floor((z - this.minZ) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  cellCenter(i: number, out: NavPoint): NavPoint {
    const c = i % this.cols;
    const r = (i - c) / this.cols;
    out.x = this.minX + (c + 0.5) * this.cell;
    out.z = this.minZ + (r + 0.5) * this.cell;
    return out;
  }

  isWalkableAt(x: number, z: number): boolean {
    const i = this.cellIndex(x, z);
    return i >= 0 && this.walkable[i] === 1;
  }

  /** Nearest walkable cell to a world position (ring search). Returns -1 if none within `maxRing` cells. */
  nearestWalkable(x: number, z: number, maxRing = 16): number {
    const i0 = this.cellIndex(x, z);
    if (i0 >= 0 && this.walkable[i0] === 1) return i0;
    const c0 = Math.floor((x - this.minX) / this.cell);
    const r0 = Math.floor((z - this.minZ) / this.cell);
    let best = -1;
    let bestD = Infinity;
    for (let ring = 1; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          const j = r * this.cols + c;
          if (this.walkable[j] === 0) continue;
          const d = dc * dc + dr * dr;
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
      }
      if (best >= 0) return best;
    }
    return best;
  }

  /** True if a straight walk between the two points stays on walkable, step-able cells. */
  lineWalkable(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    let prev = this.cellIndex(ax, az);
    if (prev < 0 || this.walkable[prev] === 0) return false;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const cur = this.cellIndex(ax + dx * t, az + dz * t);
      if (cur < 0 || this.walkable[cur] === 0) return false;
      if (cur !== prev) {
        if (Math.abs(this.height[cur] - this.height[prev]) > MAX_STEP) return false;
        // Diagonal cell change: both side cells must be walkable too (no corner clipping).
        const pc = prev % this.cols;
        const pr = (prev - pc) / this.cols;
        const cc = cur % this.cols;
        const cr = (cur - cc) / this.cols;
        if (pc !== cc && pr !== cr) {
          if (this.walkable[pr * this.cols + cc] === 0 || this.walkable[cr * this.cols + pc] === 0) return false;
        }
      }
      prev = cur;
    }
    return true;
  }

  /**
   * A* from (sx,sz) to (gx,gz) in world coordinates. Returns smoothed waypoints (excluding the start) or null.
   */
  findPath(sx: number, sz: number, gx: number, gz: number): NavPoint[] | null {
    const s = this.nearestWalkable(sx, sz);
    const e = this.nearestWalkable(gx, gz);
    if (s < 0 || e < 0) return null;
    if (this.component[s] !== this.component[e]) return null;
    const cols = this.cols;
    const stamp = ++this.search;
    const g = this.g;
    const parent = this.parent;
    const seen = this.seen;
    const closed = this.closed;
    const heap = this.heap;
    heap.clear();
    const ec = e % cols;
    const er = (e - ec) / cols;
    const heur = (c: number, r: number): number => {
      const dx = Math.abs(c - ec);
      const dz = Math.abs(r - er);
      return dx > dz ? dx + (Math.SQRT2 - 1) * dz : dz + (Math.SQRT2 - 1) * dx;
    };
    g[s] = 0;
    parent[s] = -1;
    seen[s] = stamp;
    heap.push(s, heur(s % cols, (s - (s % cols)) / cols));
    let found = false;
    while (heap.size > 0) {
      const i = heap.pop();
      if (closed[i] === stamp) continue;
      closed[i] = stamp;
      if (i === e) {
        found = true;
        break;
      }
      const c = i % cols;
      const r = (i - c) / cols;
      for (let k = 0; k < 8; k++) {
        const nb = NEIGHBORS[k];
        if (!this.canStep(c, r, nb[0], nb[1])) continue;
        const nc = c + nb[0];
        const nr = r + nb[1];
        const j = nr * cols + nc;
        if (closed[j] === stamp) continue;
        // Prefer staying away from walls.
        const near = this.clearance[j];
        const cost = nb[2] * (1 + (near < 4 ? (4 - near) * 0.35 : 0));
        const ng = g[i] + cost;
        if (seen[j] !== stamp || ng < g[j]) {
          seen[j] = stamp;
          g[j] = ng;
          parent[j] = i;
          heap.push(j, ng + heur(nc, nr));
        }
      }
    }
    if (!found) return null;

    // Reconstruct.
    const cells: number[] = [];
    for (let i = e; i !== -1; i = parent[i]) cells.push(i);
    cells.reverse();
    const pts: NavPoint[] = cells.map((i) => this.cellCenter(i, { x: 0, z: 0 }));
    // Use the exact goal for the last point when it is itself walkable.
    if (this.isWalkableAt(gx, gz)) pts[pts.length - 1] = { x: gx, z: gz };
    return this.smooth(pts, sx, sz);
  }

  /** String pulling: skip waypoints that can be reached with a straight walkable line. */
  private smooth(pts: NavPoint[], sx: number, sz: number): NavPoint[] {
    const out: NavPoint[] = [];
    let ax = sx;
    let az = sz;
    let idx = 0;
    while (idx < pts.length) {
      let far = idx;
      for (let k = pts.length - 1; k > idx; k--) {
        if (this.lineWalkable(ax, az, pts[k].x, pts[k].z)) {
          far = k;
          break;
        }
      }
      out.push(pts[far]);
      ax = pts[far].x;
      az = pts[far].z;
      idx = far + 1;
    }
    return out;
  }

  /** Total polyline length of a path starting at (sx,sz). */
  static pathLength(sx: number, sz: number, path: NavPoint[]): number {
    let len = 0;
    let x = sx;
    let z = sz;
    for (const p of path) {
      len += Math.hypot(p.x - x, p.z - z);
      x = p.x;
      z = p.z;
    }
    return len;
  }

  /** Random walkable point within `radius` of (x,z) (falls back to the nearest walkable cell). */
  randomNear(x: number, z: number, radius: number, rand: () => number): NavPoint {
    for (let i = 0; i < 12; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * radius;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      const idx = this.cellIndex(px, pz);
      if (idx >= 0 && this.walkable[idx] === 1 && this.clearance[idx] >= 2) return { x: px, z: pz };
    }
    const j = this.nearestWalkable(x, z);
    return j >= 0 ? this.cellCenter(j, { x: 0, z: 0 }) : { x, z };
  }
}
