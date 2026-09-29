// Axis-aligned box world with a uniform XZ grid broadphase: overlap queries, ray casts and the actor
// move-and-slide (Quake-style hull sweep, one axis at a time, with automatic step-up for stairs / low ledges).
import type { Vec3 } from '../core/math';
import { BODY } from './config';

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** What this box is: floor | wall | roof | crate | door | prop. Used by renderer / footstep material lookup. */
  tag: string;
  /** Dedupe stamp for grid queries. */
  stamp: number;
  /** Disabled boxes are ignored by every query (used by doors that are fully open). */
  enabled: boolean;
}

export const makeBox = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, tag: string): Box => ({
  minX,
  minY,
  minZ,
  maxX,
  maxY,
  maxZ,
  tag,
  stamp: 0,
  enabled: true,
});

export interface RayHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
  box: Box | null;
}

export const makeRayHit = (): RayHit => ({ t: 0, nx: 0, ny: 0, nz: 0, box: null });

const OVERLAP_EPS = 1e-4;
const FACE_GAP = 1e-3;

export class CollisionWorld {
  readonly statics: Box[] = [];
  readonly dynamics: Box[] = [];
  private readonly cellSize: number;
  private readonly originX: number;
  private readonly originZ: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: Box[][];
  private stamp = 1;
  private readonly scratch: Box[] = [];
  /** Separate buffer for `isClear` so it can be called while iterating the result of `overlapping`. */
  private readonly scratchClear: Box[] = [];

  constructor(minX: number, minZ: number, maxX: number, maxZ: number, cellSize = 4) {
    this.cellSize = cellSize;
    this.originX = minX;
    this.originZ = minZ;
    this.cols = Math.max(1, Math.ceil((maxX - minX) / cellSize));
    this.rows = Math.max(1, Math.ceil((maxZ - minZ) / cellSize));
    this.cells = [];
    for (let i = 0; i < this.cols * this.rows; i++) this.cells.push([]);
  }

  addStatic(box: Box): Box {
    this.statics.push(box);
    const c0 = this.clampCol(Math.floor((box.minX - this.originX) / this.cellSize));
    const c1 = this.clampCol(Math.floor((box.maxX - this.originX) / this.cellSize));
    const r0 = this.clampRow(Math.floor((box.minZ - this.originZ) / this.cellSize));
    const r1 = this.clampRow(Math.floor((box.maxZ - this.originZ) / this.cellSize));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c].push(box);
    return box;
  }

  addDynamic(box: Box): Box {
    this.dynamics.push(box);
    return box;
  }

  private clampCol(c: number): number {
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }
  private clampRow(r: number): number {
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  /** Collect candidate boxes whose grid cells touch the XZ rectangle (unique). */
  private gather(minX: number, minZ: number, maxX: number, maxZ: number, includeDynamic: boolean, out: Box[]): Box[] {
    out.length = 0;
    const stamp = ++this.stamp;
    const c0 = this.clampCol(Math.floor((minX - this.originX) / this.cellSize));
    const c1 = this.clampCol(Math.floor((maxX - this.originX) / this.cellSize));
    const r0 = this.clampRow(Math.floor((minZ - this.originZ) / this.cellSize));
    const r1 = this.clampRow(Math.floor((maxZ - this.originZ) / this.cellSize));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = this.cells[r * this.cols + c];
        for (let i = 0; i < cell.length; i++) {
          const b = cell[i];
          if (b.stamp !== stamp) {
            b.stamp = stamp;
            out.push(b);
          }
        }
      }
    }
    if (includeDynamic) {
      for (let i = 0; i < this.dynamics.length; i++) {
        const b = this.dynamics[i];
        if (b.enabled) out.push(b);
      }
    }
    return out;
  }

  /** Boxes strictly overlapping the given AABB (touching faces do not count). Result array is reused between calls. */
  overlapping(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    includeDynamic = true,
    out: Box[] = this.scratch,
  ): Box[] {
    const cand = this.gather(minX, minZ, maxX, maxZ, includeDynamic, out);
    let n = 0;
    for (let i = 0; i < cand.length; i++) {
      const b = cand[i];
      if (
        b.enabled &&
        maxX > b.minX + OVERLAP_EPS &&
        minX < b.maxX - OVERLAP_EPS &&
        maxY > b.minY + OVERLAP_EPS &&
        minY < b.maxY - OVERLAP_EPS &&
        maxZ > b.minZ + OVERLAP_EPS &&
        minZ < b.maxZ - OVERLAP_EPS
      ) {
        cand[n++] = b;
      }
    }
    cand.length = n;
    return cand;
  }

  isClear(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, includeDynamic = true): boolean {
    return this.overlapping(minX, minY, minZ, maxX, maxY, maxZ, includeDynamic, this.scratchClear).length === 0;
  }

  /** Can a standing hull with feet at (x,y,z) exist there? */
  hullClear(x: number, y: number, z: number, margin = 0, includeDynamic = true): boolean {
    const r = BODY.radius + margin;
    return this.isClear(x - r, y + 0.02, z - r, x + r, y + BODY.height, z + r, includeDynamic);
  }

  /**
   * Highest surface top at (x,z) that is at or below `maxY`. Returns -Infinity when there is none.
   * Used for spawning and nav-grid construction.
   */
  surfaceBelow(x: number, z: number, maxY: number, includeDynamic = false): number {
    const cand = this.gather(x - 0.01, z - 0.01, x + 0.01, z + 0.01, includeDynamic, this.scratch);
    let best = -Infinity;
    for (let i = 0; i < cand.length; i++) {
      const b = cand[i];
      if (!b.enabled) continue;
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && b.maxY <= maxY + 1e-6 && b.maxY > best) best = b.maxY;
    }
    return best;
  }

  private rayBox(ox: number, oy: number, oz: number, ix: number, iy: number, iz: number, b: Box, tMax: number, hit: RayHit): boolean {
    let t1 = (b.minX - ox) * ix;
    let t2 = (b.maxX - ox) * ix;
    let tNear = t1 < t2 ? t1 : t2;
    let tFar = t1 < t2 ? t2 : t1;
    let axis = 0;
    let sign = t1 < t2 ? -1 : 1;
    t1 = (b.minY - oy) * iy;
    t2 = (b.maxY - oy) * iy;
    let n = t1 < t2 ? t1 : t2;
    let f = t1 < t2 ? t2 : t1;
    if (n > tNear) {
      tNear = n;
      axis = 1;
      sign = t1 < t2 ? -1 : 1;
    }
    if (f < tFar) tFar = f;
    t1 = (b.minZ - oz) * iz;
    t2 = (b.maxZ - oz) * iz;
    n = t1 < t2 ? t1 : t2;
    f = t1 < t2 ? t2 : t1;
    if (n > tNear) {
      tNear = n;
      axis = 2;
      sign = t1 < t2 ? -1 : 1;
    }
    if (f < tFar) tFar = f;
    if (tNear > tFar || tFar < 0) return false;
    if (tNear < 0) {
      // Origin inside the box.
      hit.t = 0;
      hit.nx = hit.ny = hit.nz = 0;
      hit.box = b;
      return true;
    }
    if (tNear >= tMax) return false;
    hit.t = tNear;
    hit.nx = axis === 0 ? sign : 0;
    hit.ny = axis === 1 ? sign : 0;
    hit.nz = axis === 2 ? sign : 0;
    hit.box = b;
    return true;
  }

  /**
   * Cast a ray (direction must be normalised). Returns true and fills `out` when something closer than `maxDist` is hit.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, out: RayHit): boolean {
    const ix = dx !== 0 ? 1 / dx : Infinity;
    const iy = dy !== 0 ? 1 / dy : Infinity;
    const iz = dz !== 0 ? 1 / dz : Infinity;
    let best = maxDist;
    let found = false;
    const tmp = this.tmpHit;

    for (let i = 0; i < this.dynamics.length; i++) {
      const b = this.dynamics[i];
      if (b.enabled && this.rayBox(ox, oy, oz, ix, iy, iz, b, best, tmp) && tmp.t < best) {
        best = tmp.t;
        out.t = tmp.t;
        out.nx = tmp.nx;
        out.ny = tmp.ny;
        out.nz = tmp.nz;
        out.box = tmp.box;
        found = true;
      }
    }

    const cs = this.cellSize;
    let cx = Math.floor((ox - this.originX) / cs);
    let cz = Math.floor((oz - this.originZ) / cs);
    if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) return found;
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const nextBx = this.originX + (dx > 0 ? cx + 1 : cx) * cs;
    const nextBz = this.originZ + (dz > 0 ? cz + 1 : cz) * cs;
    let tMaxX = dx !== 0 ? (nextBx - ox) / dx : Infinity;
    let tMaxZ = dz !== 0 ? (nextBz - oz) / dz : Infinity;
    const tDeltaX = dx !== 0 ? cs / Math.abs(dx) : Infinity;
    const tDeltaZ = dz !== 0 ? cs / Math.abs(dz) : Infinity;
    const stamp = ++this.stamp;

    for (;;) {
      const cell = this.cells[cz * this.cols + cx];
      for (let i = 0; i < cell.length; i++) {
        const b = cell[i];
        if (b.stamp === stamp || !b.enabled) continue;
        b.stamp = stamp;
        if (this.rayBox(ox, oy, oz, ix, iy, iz, b, best, tmp) && tmp.t < best) {
          best = tmp.t;
          out.t = tmp.t;
          out.nx = tmp.nx;
          out.ny = tmp.ny;
          out.nz = tmp.nz;
          out.box = tmp.box;
          found = true;
        }
      }
      const tNext = tMaxX < tMaxZ ? tMaxX : tMaxZ;
      if (best <= tNext || tNext > maxDist) break;
      if (tMaxX < tMaxZ) {
        cx += stepX;
        tMaxX += tDeltaX;
      } else {
        cz += stepZ;
        tMaxZ += tDeltaZ;
      }
      if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) break;
    }
    return found;
  }

  private readonly tmpHit: RayHit = makeRayHit();

  /** Line of sight test between two points (true = nothing solid in between). */
  lineClear(a: Vec3, b: Vec3, ay = a.y, by = b.y): boolean {
    const dx = b.x - a.x;
    const dy = by - ay;
    const dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return true;
    return !this.raycast(a.x, ay, a.z, dx / len, dy / len, dz / len, len - 0.02, this.losHit);
  }
  private readonly losHit: RayHit = makeRayHit();

  // ------------------------------------------------------------------------------------------------------------
  // Body movement
  // ------------------------------------------------------------------------------------------------------------

  /**
   * Move a hull (feet position `pos`, velocity `vel`) for `dt` seconds with collision response.
   * Horizontal axes are resolved one at a time (giving wall sliding), stepping up onto ledges <= stepHeight.
   * Returns whether the hull ends up standing on something.
   */
  moveBody(pos: Vec3, vel: Vec3, dt: number, wasOnGround: boolean): boolean {
    const r = BODY.radius;
    const h = BODY.height;
    const stepH = BODY.stepHeight;

    // Horizontal, axis by axis. Split long displacements so we can never tunnel through thin door leaves.
    const dispX = vel.x * dt;
    const dispZ = vel.z * dt;
    const pieces = Math.max(1, Math.ceil(Math.max(Math.abs(dispX), Math.abs(dispZ)) / 0.12));
    for (let p = 0; p < pieces; p++) {
      this.slideAxis(pos, vel, 0, dispX / pieces, r, h, stepH);
      this.slideAxis(pos, vel, 2, dispZ / pieces, r, h, stepH);
    }

    // Stay glued to stairs / ramps when walking down.
    if (wasOnGround && vel.y <= 0) this.snapDown(pos, r, stepH);

    // Vertical.
    let onGround = false;
    const dy = vel.y * dt;
    if (dy !== 0) {
      const ny = pos.y + dy;
      const hitsList = this.overlapping(pos.x - r, Math.min(pos.y, ny) + 0.001, pos.z - r, pos.x + r, Math.max(pos.y, ny) + h - 0.001, pos.z + r);
      if (dy < 0) {
        let floor = -Infinity;
        for (let i = 0; i < hitsList.length; i++) {
          const b = hitsList[i];
          if (b.maxY <= pos.y + stepH && b.maxY > floor) floor = b.maxY;
        }
        if (floor > -Infinity && floor > ny - 1e-9) {
          pos.y = floor;
          vel.y = 0;
          onGround = true;
        } else {
          pos.y = ny;
        }
      } else {
        let ceil = Infinity;
        for (let i = 0; i < hitsList.length; i++) {
          const b = hitsList[i];
          if (b.minY >= pos.y + h - stepH && b.minY < ceil) ceil = b.minY;
        }
        if (ceil < Infinity && ceil < ny + h + 1e-9) {
          pos.y = ceil - h - FACE_GAP;
          vel.y = 0;
        } else {
          pos.y = ny;
        }
      }
    }

    // Ground probe (resting contact).
    if (!onGround && vel.y <= 0) {
      const probe = this.overlapping(pos.x - r, pos.y - 0.05, pos.z - r, pos.x + r, pos.y + 0.001, pos.z + r);
      if (probe.length > 0) {
        // Resting contact: settle exactly on the highest surface just below the feet.
        let top = -Infinity;
        for (let i = 0; i < probe.length; i++) if (probe[i].maxY <= pos.y + 0.001 && probe[i].maxY > top) top = probe[i].maxY;
        if (top > -Infinity) pos.y = top;
        onGround = true;
        vel.y = 0;
      }
    }
    return onGround;
  }

  private slideAxis(pos: Vec3, vel: Vec3, axis: 0 | 2, d: number, r: number, h: number, stepH: number): void {
    if (d === 0) return;
    const nx = axis === 0 ? pos.x + d : pos.x;
    const nz = axis === 2 ? pos.z + d : pos.z;
    const blockers = this.overlapping(nx - r, pos.y + 0.02, nz - r, nx + r, pos.y + h - 0.02, nz + r);
    if (blockers.length === 0) {
      if (axis === 0) pos.x = nx;
      else pos.z = nz;
      return;
    }
    // Try stepping up onto low ledges / stairs.
    let top = -Infinity;
    for (let i = 0; i < blockers.length; i++) if (blockers[i].maxY > top) top = blockers[i].maxY;
    if (top > pos.y && top - pos.y <= stepH) {
      const y2 = top + FACE_GAP;
      if (this.isClear(nx - r, y2 + 0.02, nz - r, nx + r, y2 + h - 0.02, nz + r)) {
        pos.y = top;
        if (axis === 0) pos.x = nx;
        else pos.z = nz;
        if (vel.y < 0) vel.y = 0;
        return;
      }
    }
    // Blocked: clamp against the nearest face and kill that velocity component.
    if (axis === 0) {
      if (d > 0) {
        let limit = Infinity;
        for (let i = 0; i < blockers.length; i++) if (blockers[i].minX < limit) limit = blockers[i].minX;
        pos.x = Math.max(pos.x, Math.min(nx, limit - r - FACE_GAP));
      } else {
        let limit = -Infinity;
        for (let i = 0; i < blockers.length; i++) if (blockers[i].maxX > limit) limit = blockers[i].maxX;
        pos.x = Math.min(pos.x, Math.max(nx, limit + r + FACE_GAP));
      }
      vel.x = 0;
    } else {
      if (d > 0) {
        let limit = Infinity;
        for (let i = 0; i < blockers.length; i++) if (blockers[i].minZ < limit) limit = blockers[i].minZ;
        pos.z = Math.max(pos.z, Math.min(nz, limit - r - FACE_GAP));
      } else {
        let limit = -Infinity;
        for (let i = 0; i < blockers.length; i++) if (blockers[i].maxZ > limit) limit = blockers[i].maxZ;
        pos.z = Math.min(pos.z, Math.max(nz, limit + r + FACE_GAP));
      }
      vel.z = 0;
    }
  }

  private snapDown(pos: Vec3, r: number, stepH: number): void {
    // Only snap if we are currently resting (nothing directly below within a hair) and there is ground within stepH.
    const near = this.overlapping(pos.x - r, pos.y - 0.05, pos.z - r, pos.x + r, pos.y + 0.001, pos.z + r);
    if (near.length > 0) return;
    const below = this.overlapping(pos.x - r, pos.y - stepH, pos.z - r, pos.x + r, pos.y + 0.001, pos.z + r);
    let floor = -Infinity;
    for (let i = 0; i < below.length; i++) if (below[i].maxY <= pos.y + 1e-6 && below[i].maxY > floor) floor = below[i].maxY;
    if (floor > -Infinity && pos.y - floor <= stepH) pos.y = floor;
  }

  /** Push a hull out of any boxes it overlaps (safety net, e.g. after spawning or a door closing). */
  depenetrate(pos: Vec3): boolean {
    const r = BODY.radius;
    const h = BODY.height;
    let moved = false;
    for (let iter = 0; iter < 4; iter++) {
      const list = this.overlapping(pos.x - r, pos.y + 0.02, pos.z - r, pos.x + r, pos.y + h - 0.02, pos.z + r);
      if (list.length === 0) return moved;
      const b = list[0];
      const pushL = pos.x + r - b.minX;
      const pushR = b.maxX - (pos.x - r);
      const pushB = pos.z + r - b.minZ;
      const pushF = b.maxZ - (pos.z - r);
      const pushUp = b.maxY - pos.y;
      const m = Math.min(pushL, pushR, pushB, pushF);
      if (pushUp <= BODY.stepHeight * 1.2 && pushUp < m + 0.5) pos.y = b.maxY;
      else if (m === pushL) pos.x = b.minX - r - FACE_GAP;
      else if (m === pushR) pos.x = b.maxX + r + FACE_GAP;
      else if (m === pushB) pos.z = b.minZ - r - FACE_GAP;
      else pos.z = b.maxZ + r + FACE_GAP;
      moved = true;
    }
    return moved;
  }
}
