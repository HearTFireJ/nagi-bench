import type { BoxDef, DoorDef, MapData, RampDef } from '../map/types.ts';
import { PLAYER } from '../config.ts';
import { clamp } from '../math.ts';

/** Solid axis-aligned box in the collision world. */
export interface Box extends BoxDef {
  id: number;
  enabled: boolean;
  /** broadphase de-dup stamp */
  mark: number;
}

export interface Ramp extends RampDef {
  id: number;
  slope: number; // dh per metre along axis
}

export interface RayHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
  box: Box | null;
  ramp: Ramp | null;
}

export function makeRayHit(): RayHit {
  return { t: 0, nx: 0, ny: 1, nz: 0, box: null, ramp: null };
}

const CELL = 4;
const LEAF_THICK = 0.3;
const DOOR_SPEED = 2.4; // open fraction per second
const DOOR_HOLD = 0.9; // seconds the door stays open after the last actor left

/** Sliding double door: two leaves that slide into the wall pockets on either side. */
export class Door {
  readonly def: DoorDef;
  readonly leafA: Box;
  readonly leafB: Box;
  readonly cx: number;
  readonly cz: number;
  open = 0;
  private hold = 0;
  /** true when open state changed sign this frame (for sfx) */
  moved = false;

  constructor(def: DoorDef, idA: number, idB: number) {
    this.def = def;
    this.cx = (def.x0 + def.x1) / 2;
    this.cz = (def.z0 + def.z1) / 2;
    const mk = (id: number): Box => ({
      id,
      enabled: true,
      mark: 0,
      minX: 0,
      minY: def.floorY,
      minZ: 0,
      maxX: 0,
      maxY: def.floorY + def.height,
      maxZ: 0,
      kind: 'door',
      style: 0,
      mat: 'doorWood',
    });
    this.leafA = mk(idA);
    this.leafB = mk(idB);
    this.layout();
  }

  private layout(): void {
    const d = this.def;
    const s = this.open;
    if (d.slide === 'x') {
      const w = (d.x1 - d.x0) / 2;
      const zc = this.cz;
      this.leafA.minX = d.x0 - s * w;
      this.leafA.maxX = d.x0 + w - s * w;
      this.leafB.minX = d.x1 - w + s * w;
      this.leafB.maxX = d.x1 + s * w;
      for (const l of [this.leafA, this.leafB]) {
        l.minZ = zc - LEAF_THICK / 2;
        l.maxZ = zc + LEAF_THICK / 2;
      }
    } else {
      const w = (d.z1 - d.z0) / 2;
      const xc = this.cx;
      this.leafA.minZ = d.z0 - s * w;
      this.leafA.maxZ = d.z0 + w - s * w;
      this.leafB.minZ = d.z1 - w + s * w;
      this.leafB.maxZ = d.z1 + s * w;
      for (const l of [this.leafA, this.leafB]) {
        l.minX = xc - LEAF_THICK / 2;
        l.maxX = xc + LEAF_THICK / 2;
      }
    }
  }

  /** Advance the door. `near` = an alive actor is inside the trigger radius. */
  update(dt: number, near: boolean): void {
    const before = this.open;
    if (near) this.hold = DOOR_HOLD;
    else this.hold = Math.max(0, this.hold - dt);
    const target = this.hold > 0 ? 1 : 0;
    if (this.open < target) this.open = Math.min(1, this.open + DOOR_SPEED * dt);
    else if (this.open > target) this.open = Math.max(0, this.open - DOOR_SPEED * dt);
    this.moved = this.open !== before;
    if (this.moved) this.layout();
  }

  forceOpen(v: number): void {
    this.open = v;
    this.hold = v > 0 ? DOOR_HOLD : 0;
    this.layout();
  }
}

/**
 * Collision world: static boxes in a 2D spatial hash, a few ramps, and dynamic door leaves.
 * Everything the simulation needs to know about geometry goes through here.
 */
export class World {
  readonly map: MapData;
  readonly boxes: Box[] = [];
  readonly dyn: Box[] = [];
  readonly ramps: Ramp[] = [];
  readonly doors: Door[] = [];
  readonly width: number;
  readonly depth: number;
  private gx: number;
  private gz: number;
  private cells: Box[][];
  private stamp = 1;
  private scratch: Box[] = [];

  constructor(map: MapData) {
    this.map = map;
    this.width = map.width;
    this.depth = map.depth;
    this.gx = Math.ceil(map.width / CELL);
    this.gz = Math.ceil(map.depth / CELL);
    this.cells = Array.from({ length: this.gx * this.gz }, () => []);
    let id = 1;
    for (const def of map.boxes) {
      const box: Box = { ...def, id: id++, enabled: true, mark: 0 };
      this.boxes.push(box);
      this.insert(box);
    }
    for (const r of map.ramps) {
      const len = r.axis === 'x' ? r.x1 - r.x0 : r.z1 - r.z0;
      this.ramps.push({ ...r, id: id++, slope: (r.hTo - r.hFrom) / len });
    }
    for (const d of map.doors) {
      const door = new Door(d, id++, id++);
      this.doors.push(door);
      this.dyn.push(door.leafA, door.leafB);
    }
  }

  private insert(b: Box): void {
    const x0 = clamp(Math.floor(b.minX / CELL), 0, this.gx - 1);
    const x1 = clamp(Math.floor((b.maxX - 1e-6) / CELL), 0, this.gx - 1);
    const z0 = clamp(Math.floor(b.minZ / CELL), 0, this.gz - 1);
    const z1 = clamp(Math.floor((b.maxZ - 1e-6) / CELL), 0, this.gz - 1);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.cells[z * this.gx + x].push(b);
  }

  /** Collect static + dynamic boxes whose cells overlap the query square. `out` is cleared. */
  boxesNear(x: number, z: number, r: number, out: Box[]): Box[] {
    out.length = 0;
    const st = ++this.stamp;
    const x0 = clamp(Math.floor((x - r) / CELL), 0, this.gx - 1);
    const x1 = clamp(Math.floor((x + r) / CELL), 0, this.gx - 1);
    const z0 = clamp(Math.floor((z - r) / CELL), 0, this.gz - 1);
    const z1 = clamp(Math.floor((z + r) / CELL), 0, this.gz - 1);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.cells[cz * this.gx + cx];
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b.mark !== st) {
            b.mark = st;
            out.push(b);
          }
        }
      }
    }
    for (const b of this.dyn) {
      if (b.enabled) out.push(b);
    }
    return out;
  }

  // ------------------------------------------------------------------ terrain queries

  /** Height of the walkable base terrain (floors + ramps, ignoring props). NaN if solid / outside. */
  terrainHeight(x: number, z: number): number {
    for (const r of this.ramps) {
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return this.rampHeight(r, x, z);
    }
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    if (ix < 0 || iz < 0 || ix >= this.map.cols || iz >= this.map.rows) return NaN;
    return this.map.terrain[iz * this.map.cols + ix];
  }

  rampHeight(r: Ramp, x: number, z: number): number {
    const t = r.axis === 'x' ? (x - r.x0) / (r.x1 - r.x0) : (z - r.z0) / (r.z1 - r.z0);
    return r.hFrom + (r.hTo - r.hFrom) * clamp(t, 0, 1);
  }

  /**
   * Highest supporting surface at or below `maxY` under a circular footprint.
   * Returns -Infinity when there is none.
   */
  groundAt(x: number, z: number, r: number, maxY: number): number {
    let best = -Infinity;
    const list = this.boxesNear(x, z, r, this.scratch);
    const r2 = r * r;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.maxY > maxY || b.maxY <= best) continue;
      const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
      const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz <= r2) best = b.maxY;
    }
    for (const rp of this.ramps) {
      if (x >= rp.x0 && x <= rp.x1 && z >= rp.z0 && z <= rp.z1) {
        const h = this.rampHeight(rp, x, z);
        if (h <= maxY && h > best) best = h;
      }
    }
    return best;
  }

  /** Lowest solid surface above `yFrom` under the footprint (roofs, lintels, door leaves). */
  ceilingAt(x: number, z: number, r: number, yFrom: number): number {
    let best = Infinity;
    const list = this.boxesNear(x, z, r, this.scratch);
    const r2 = r * r;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.minY < yFrom - 0.02 || b.minY >= best) continue;
      const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
      const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r2) best = b.minY;
    }
    return best;
  }

  /**
   * Push a circle out of every box that is an obstacle at this level. A box is an
   * obstacle if its top is above feetY+step (can't be stepped on) and its bottom is
   * below the head. Mutates x/z. Returns true if a correction happened.
   */
  resolveCircle(pos: { x: number; z: number }, r: number, feetY: number, height: number, step: number, includeDynamic = true): boolean {
    let pushed = false;
    const list = this.boxesNear(pos.x, pos.z, r + 0.05, this.scratch);
    const stepTop = feetY + step;
    const headY = feetY + height;
    for (let iter = 0; iter < 3; iter++) {
      let any = false;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.maxY <= stepTop || b.minY >= headY) continue;
        if (!includeDynamic && b.kind === 'door') continue;
        const cx = pos.x < b.minX ? b.minX : pos.x > b.maxX ? b.maxX : pos.x;
        const cz = pos.z < b.minZ ? b.minZ : pos.z > b.maxZ ? b.maxZ : pos.z;
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        any = true;
        pushed = true;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const k = (r - d) / d;
          pos.x += dx * k;
          pos.z += dz * k;
        } else {
          // centre is inside the box: leave through the nearest face
          const l = pos.x - b.minX;
          const rt = b.maxX - pos.x;
          const u = pos.z - b.minZ;
          const dn = b.maxZ - pos.z;
          const m = Math.min(l, rt, u, dn);
          if (m === l) pos.x = b.minX - r;
          else if (m === rt) pos.x = b.maxX + r;
          else if (m === u) pos.z = b.minZ - r;
          else pos.z = b.maxZ + r;
        }
      }
      if (!any) break;
    }
    return pushed;
  }

  /** Would a body of this size at (x,z,feetY) overlap an obstacle? (used by nav generation) */
  circleBlocked(x: number, z: number, r: number, feetY: number, height: number, step: number, includeDynamic: boolean): boolean {
    const list = this.boxesNear(x, z, r + 0.05, this.scratch);
    const stepTop = feetY + step;
    const headY = feetY + height;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.maxY <= stepTop || b.minY >= headY) continue;
      if (!includeDynamic && b.kind === 'door') continue;
      const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
      const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ doors

  updateDoors(dt: number, actors: readonly { x: number; y: number; z: number }[]): void {
    for (const door of this.doors) {
      let near = false;
      const rr = door.def.triggerRadius * door.def.triggerRadius;
      for (const a of actors) {
        const dx = a.x - door.cx;
        const dz = a.z - door.cz;
        if (dx * dx + dz * dz < rr && Math.abs(a.y - door.def.floorY) < 3) {
          near = true;
          break;
        }
      }
      door.update(dt, near);
    }
  }

  openAllDoors(): void {
    for (const d of this.doors) d.forceOpen(1);
  }

  closeAllDoors(): void {
    for (const d of this.doors) d.forceOpen(0);
  }

  // ------------------------------------------------------------------ raycasts

  /**
   * Closest hit along a normalised ray within [0,maxT]. Fills `out` and returns true on hit.
   * Uses a 2D grid DDA over static boxes plus brute force over ramps and door leaves.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: RayHit): boolean {
    let best = maxT;
    let hitBox: Box | null = null;
    let hitRamp: Ramp | null = null;
    let nx = 0;
    let ny = 1;
    let nz = 0;

    const test = (b: Box): void => {
      let tmin = 0;
      let tmax = best;
      let ax = -1;
      let sg = 0;
      if (Math.abs(dx) < 1e-12) {
        if (ox < b.minX || ox > b.maxX) return;
      } else {
        const inv = 1 / dx;
        let t1 = (b.minX - ox) * inv;
        let t2 = (b.maxX - ox) * inv;
        let s = -1;
        if (t1 > t2) {
          const tt = t1;
          t1 = t2;
          t2 = tt;
          s = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          ax = 0;
          sg = s;
        }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return;
      }
      if (Math.abs(dy) < 1e-12) {
        if (oy < b.minY || oy > b.maxY) return;
      } else {
        const inv = 1 / dy;
        let t1 = (b.minY - oy) * inv;
        let t2 = (b.maxY - oy) * inv;
        let s = -1;
        if (t1 > t2) {
          const tt = t1;
          t1 = t2;
          t2 = tt;
          s = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          ax = 1;
          sg = s;
        }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return;
      }
      if (Math.abs(dz) < 1e-12) {
        if (oz < b.minZ || oz > b.maxZ) return;
      } else {
        const inv = 1 / dz;
        let t1 = (b.minZ - oz) * inv;
        let t2 = (b.maxZ - oz) * inv;
        let s = -1;
        if (t1 > t2) {
          const tt = t1;
          t1 = t2;
          t2 = tt;
          s = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          ax = 2;
          sg = s;
        }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return;
      }
      if (tmin < best) {
        best = tmin;
        hitBox = b;
        hitRamp = null;
        nx = ax === 0 ? sg : 0;
        ny = ax === 1 ? sg : ax === -1 ? 1 : 0;
        nz = ax === 2 ? sg : 0;
      }
    };

    // static boxes: DDA over the 2D grid
    const st = ++this.stamp;
    let cx = clamp(Math.floor(ox / CELL), 0, this.gx - 1);
    let cz = clamp(Math.floor(oz / CELL), 0, this.gz - 1);
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? CELL / Math.abs(dx) : Infinity;
    const tDeltaZ = dz !== 0 ? CELL / Math.abs(dz) : Infinity;
    let tMaxX = dx > 0 ? ((cx + 1) * CELL - ox) / dx : dx < 0 ? (ox - cx * CELL) / -dx : Infinity;
    let tMaxZ = dz > 0 ? ((cz + 1) * CELL - oz) / dz : dz < 0 ? (oz - cz * CELL) / -dz : Infinity;
    for (let guard = 0; guard < 400; guard++) {
      const list = this.cells[cz * this.gx + cx];
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.mark === st) continue;
        b.mark = st;
        test(b);
      }
      const tNext = Math.min(tMaxX, tMaxZ);
      if (best <= tNext || tNext > maxT) break;
      if (tMaxX < tMaxZ) {
        cx += stepX;
        tMaxX += tDeltaX;
      } else {
        cz += stepZ;
        tMaxZ += tDeltaZ;
      }
      if (cx < 0 || cz < 0 || cx >= this.gx || cz >= this.gz) break;
    }

    for (const b of this.dyn) if (b.enabled) test(b);

    // ramps (sloped planes)
    for (const r of this.ramps) {
      const c0 = r.axis === 'x' ? r.x0 : r.z0;
      const oc = r.axis === 'x' ? ox : oz;
      const dc = r.axis === 'x' ? dx : dz;
      const denom = dy - r.slope * dc;
      if (Math.abs(denom) < 1e-9) continue;
      const t = (r.hFrom + r.slope * (oc - c0) - oy) / denom;
      if (t <= 0 || t >= best) continue;
      const px = ox + dx * t;
      const pz = oz + dz * t;
      if (px < r.x0 || px > r.x1 || pz < r.z0 || pz > r.z1) continue;
      best = t;
      hitBox = null;
      hitRamp = r;
      const inv = 1 / Math.hypot(r.slope, 1);
      nx = r.axis === 'x' ? -r.slope * inv : 0;
      ny = inv;
      nz = r.axis === 'z' ? -r.slope * inv : 0;
    }

    if (hitBox === null && hitRamp === null) return false;
    out.t = best;
    out.nx = nx;
    out.ny = ny;
    out.nz = nz;
    out.box = hitBox;
    out.ramp = hitRamp;
    return true;
  }

  private tmpHit: RayHit = makeRayHit();

  /** Unobstructed straight line between two points? */
  lineClear(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    const inv = 1 / len;
    return !this.raycast(ax, ay, az, dx * inv, dy * inv, dz * inv, len - 0.03, this.tmpHit);
  }
}

export const HEAD_CLEARANCE = PLAYER.height;
