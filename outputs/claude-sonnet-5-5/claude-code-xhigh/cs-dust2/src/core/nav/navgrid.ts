import type { Vec2 } from '../math.ts';
import { PLAYER } from '../config.ts';
import type { World } from '../physics/world.ts';

const CELL = 0.5;
const AGENT_R = 0.46;
const MAX_STEP = 0.5; // max height change between neighbouring nav cells

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

/**
 * Navigation grid generated automatically from the collision world (not hand-placed
 * waypoints): a cell is walkable when a player-sized cylinder standing on the local
 * floor does not intersect anything the physics would block. Movement between cells is
 * allowed when the height difference is steppable. Paths are found with A* (wall-distance
 * penalty keeps bots off the walls) and then smoothed with a clearance-aware line-of-walk test.
 */
export class NavGrid {
  readonly cell = CELL;
  readonly cols: number;
  readonly rows: number;
  readonly walk: Uint8Array;
  readonly height: Float32Array;
  readonly clear: Float32Array; // distance (m) to nearest blocked cell
  readonly component: Int32Array;
  private world: World;

  // A* scratch
  private gScore: Float32Array;
  private parent: Int32Array;
  private seen: Int32Array;
  private closed: Int32Array;
  private searchId = 0;
  private heap: Int32Array;
  private heapF: Float32Array;
  private heapN = 0;

  constructor(world: World) {
    this.world = world;
    this.cols = Math.ceil(world.width / CELL);
    this.rows = Math.ceil(world.depth / CELL);
    const n = this.cols * this.rows;
    this.walk = new Uint8Array(n);
    this.height = new Float32Array(n);
    this.clear = new Float32Array(n);
    this.component = new Int32Array(n).fill(-1);
    this.gScore = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Int32Array(n);
    this.closed = new Int32Array(n);
    this.heap = new Int32Array(n * 2);
    this.heapF = new Float32Array(n);
    this.build();
  }

  private build(): void {
    // doors count as open for navigation
    const world = this.world;
    for (let z = 0; z < this.rows; z++) {
      for (let x = 0; x < this.cols; x++) {
        const cx = (x + 0.5) * CELL;
        const cz = (z + 0.5) * CELL;
        const h = world.terrainHeight(cx, cz);
        const i = z * this.cols + x;
        if (Number.isNaN(h)) continue;
        this.height[i] = h;
        if (!world.circleBlocked(cx, cz, AGENT_R, h, PLAYER.height, PLAYER.stepHeight, false)) this.walk[i] = 1;
      }
    }
    this.buildClearance();
    this.labelComponents();
  }

  private buildClearance(): void {
    const { cols, rows, walk, clear } = this;
    const INF = 1e9;
    for (let i = 0; i < clear.length; i++) clear[i] = walk[i] ? INF : 0;
    const d1 = 1;
    const d2 = Math.SQRT2;
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const i = z * cols + x;
        if (!walk[i]) continue;
        let v = clear[i];
        if (x > 0) v = Math.min(v, clear[i - 1] + d1);
        if (z > 0) {
          v = Math.min(v, clear[i - cols] + d1);
          if (x > 0) v = Math.min(v, clear[i - cols - 1] + d2);
          if (x < cols - 1) v = Math.min(v, clear[i - cols + 1] + d2);
        }
        clear[i] = v;
      }
    }
    for (let z = rows - 1; z >= 0; z--) {
      for (let x = cols - 1; x >= 0; x--) {
        const i = z * cols + x;
        if (!walk[i]) continue;
        let v = clear[i];
        if (x < cols - 1) v = Math.min(v, clear[i + 1] + d1);
        if (z < rows - 1) {
          v = Math.min(v, clear[i + cols] + d1);
          if (x < cols - 1) v = Math.min(v, clear[i + cols + 1] + d2);
          if (x > 0) v = Math.min(v, clear[i + cols - 1] + d2);
        }
        clear[i] = v;
      }
    }
    for (let i = 0; i < clear.length; i++) clear[i] = Math.min(clear[i], 60) * CELL;
  }

  private labelComponents(): void {
    let id = 0;
    const stack: number[] = [];
    for (let s = 0; s < this.walk.length; s++) {
      if (!this.walk[s] || this.component[s] >= 0) continue;
      this.component[s] = id;
      stack.push(s);
      while (stack.length) {
        const i = stack.pop() as number;
        const x = i % this.cols;
        const z = (i - x) / this.cols;
        for (const [dx, dz] of DIRS) {
          const nx = x + dx;
          const nz = z + dz;
          if (!this.edgeOk(x, z, nx, nz)) continue;
          const ni = nz * this.cols + nx;
          if (this.component[ni] >= 0) continue;
          this.component[ni] = id;
          stack.push(ni);
        }
      }
      id++;
    }
  }

  // ------------------------------------------------------------------ queries

  cellX(x: number): number {
    return Math.floor(x / CELL);
  }

  inBounds(cx: number, cz: number): boolean {
    return cx >= 0 && cz >= 0 && cx < this.cols && cz < this.rows;
  }

  isWalkableCell(cx: number, cz: number): boolean {
    return this.inBounds(cx, cz) && this.walk[cz * this.cols + cx] === 1;
  }

  isWalkable(x: number, z: number): boolean {
    return this.isWalkableCell(Math.floor(x / CELL), Math.floor(z / CELL));
  }

  clearanceAt(x: number, z: number): number {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    return this.inBounds(cx, cz) ? this.clear[cz * this.cols + cx] : 0;
  }

  private edgeOk(x: number, z: number, nx: number, nz: number): boolean {
    if (!this.isWalkableCell(nx, nz)) return false;
    const i = z * this.cols + x;
    const ni = nz * this.cols + nx;
    if (Math.abs(this.height[i] - this.height[ni]) > MAX_STEP) return false;
    if (nx !== x && nz !== z) {
      // no corner cutting
      if (!this.isWalkableCell(nx, z) || !this.isWalkableCell(x, nz)) return false;
      if (Math.abs(this.height[i] - this.height[z * this.cols + nx]) > MAX_STEP) return false;
      if (Math.abs(this.height[i] - this.height[nz * this.cols + x]) > MAX_STEP) return false;
    }
    return true;
  }

  /** Closest walkable cell centre to a world point (spiral search). */
  nearestWalkable(x: number, z: number, maxRadius = 8): Vec2 | null {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    if (this.isWalkableCell(cx, cz)) return { x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL };
    const maxR = Math.ceil(maxRadius / CELL);
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (!this.isWalkableCell(cx + dx, cz + dz)) continue;
          const px = (cx + dx + 0.5) * CELL;
          const pz = (cz + dz + 0.5) * CELL;
          const d = (px - x) * (px - x) + (pz - z) * (pz - z);
          if (d < bestD) {
            bestD = d;
            best = { x: px, z: pz };
          }
        }
      }
      if (best) return best;
    }
    return best;
  }

  sameComponent(ax: number, az: number, bx: number, bz: number): boolean {
    const a = this.nearestWalkable(ax, az);
    const b = this.nearestWalkable(bx, bz);
    if (!a || !b) return false;
    return this.component[Math.floor(a.z / CELL) * this.cols + Math.floor(a.x / CELL)] === this.component[Math.floor(b.z / CELL) * this.cols + Math.floor(b.x / CELL)];
  }

  // ------------------------------------------------------------------ heap

  private heapPush(idx: number, f: number): void {
    let i = this.heapN++;
    this.heap[i] = idx;
    this.heapF[i] = f;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.heapF[p] <= this.heapF[i]) break;
      const ti = this.heap[p];
      const tf = this.heapF[p];
      this.heap[p] = this.heap[i];
      this.heapF[p] = this.heapF[i];
      this.heap[i] = ti;
      this.heapF[i] = tf;
      i = p;
    }
  }

  private heapPop(): number {
    const top = this.heap[0];
    this.heapN--;
    if (this.heapN > 0) {
      this.heap[0] = this.heap[this.heapN];
      this.heapF[0] = this.heapF[this.heapN];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.heapN && this.heapF[l] < this.heapF[m]) m = l;
        if (r < this.heapN && this.heapF[r] < this.heapF[m]) m = r;
        if (m === i) break;
        const ti = this.heap[m];
        const tf = this.heapF[m];
        this.heap[m] = this.heap[i];
        this.heapF[m] = this.heapF[i];
        this.heap[i] = ti;
        this.heapF[i] = tf;
        i = m;
      }
    }
    return top;
  }

  // ------------------------------------------------------------------ A*

  /**
   * Find a smoothed path (list of world points; first element is the start).
   * Returns null when start/goal are disconnected.
   */
  findPath(sx: number, sz: number, gx: number, gz: number, smooth = true): Vec2[] | null {
    const s = this.nearestWalkable(sx, sz);
    const g = this.nearestWalkable(gx, gz);
    if (!s || !g) return null;
    const cols = this.cols;
    const start = Math.floor(s.z / CELL) * cols + Math.floor(s.x / CELL);
    const goal = Math.floor(g.z / CELL) * cols + Math.floor(g.x / CELL);
    if (this.component[start] !== this.component[goal]) return null;
    if (start === goal) return [{ x: sx, z: sz }, { x: g.x, z: g.z }];

    const id = ++this.searchId;
    this.heapN = 0;
    this.gScore[start] = 0;
    this.seen[start] = id;
    this.parent[start] = -1;
    const goalX = goal % cols;
    const goalZ = (goal - goalX) / cols;
    this.heapPush(start, 0);

    let found = false;
    while (this.heapN > 0) {
      const cur = this.heapPop();
      if (this.closed[cur] === id) continue;
      this.closed[cur] = id;
      if (cur === goal) {
        found = true;
        break;
      }
      const x = cur % cols;
      const z = (cur - x) / cols;
      const gc = this.gScore[cur];
      for (let d = 0; d < 8; d++) {
        const dir = DIRS[d];
        const nx = x + dir[0];
        const nz = z + dir[1];
        if (!this.edgeOk(x, z, nx, nz)) continue;
        const ni = nz * cols + nx;
        if (this.closed[ni] === id) continue;
        const c = this.clear[ni];
        const pen = c < 1.5 ? 1 + 1.5 * (1 - c / 1.5) : 1;
        const ng = gc + dir[2] * pen;
        if (this.seen[ni] !== id || ng < this.gScore[ni]) {
          this.seen[ni] = id;
          this.gScore[ni] = ng;
          this.parent[ni] = cur;
          const ddx = Math.abs(nx - goalX);
          const ddz = Math.abs(nz - goalZ);
          const h = ddx + ddz + (Math.SQRT2 - 2) * Math.min(ddx, ddz);
          this.heapPush(ni, ng + h);
        }
      }
    }
    if (!found) return null;

    const cells: Vec2[] = [];
    for (let i = goal; i !== -1; i = this.parent[i]) {
      const x = i % cols;
      const z = (i - x) / cols;
      cells.push({ x: (x + 0.5) * CELL, z: (z + 0.5) * CELL });
    }
    cells.reverse();
    cells[0] = { x: sx, z: sz };
    if (!smooth) return cells;
    return this.smoothPath(cells);
  }

  /** Can an agent walk straight from A to B without touching anything? */
  segmentWalkable(x0: number, z0: number, x1: number, z1: number): boolean {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / 0.25));
    let lastH = NaN;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      // 2x2 stencil of cell centres around the point
      const fx = x / CELL - 0.5;
      const fz = z / CELL - 0.5;
      const cx = Math.floor(fx);
      const cz = Math.floor(fz);
      let hsum = 0;
      for (let dz = 0; dz < 2; dz++) {
        for (let dx = 0; dx < 2; dx++) {
          if (!this.isWalkableCell(cx + dx, cz + dz)) return false;
          hsum += this.height[(cz + dz) * this.cols + cx + dx];
        }
      }
      const h = hsum / 4;
      if (!Number.isNaN(lastH) && Math.abs(h - lastH) > 0.3) return false;
      lastH = h;
    }
    return true;
  }

  private smoothPath(pts: Vec2[]): Vec2[] {
    if (pts.length <= 2) return pts;
    const out: Vec2[] = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.segmentWalkable(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  pathLength(path: Vec2[]): number {
    let l = 0;
    for (let i = 1; i < path.length; i++) l += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    return l;
  }
}
