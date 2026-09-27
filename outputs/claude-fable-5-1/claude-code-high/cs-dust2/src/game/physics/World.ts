import { aabbNormalAt, rayAABB, v3, type AABB, type Vec3 } from '../core/vec';
import { CELL } from '../map/MapData';
import { STEP_HEIGHT, type MapGrid } from '../map/MapGrid';

export const GRAVITY = 18;
export const JUMP_VELOCITY = 6.3;

export interface HitboxDef {
  name: HitboxName;
  center: Vec3; // local space (feet origin, forward -Z)
  size: Vec3;
}

export type HitboxName = 'head' | 'chest' | 'stomach' | 'arm_l' | 'arm_r' | 'leg_l' | 'leg_r';

export const HITBOXES: HitboxDef[] = [
  { name: 'head', center: v3(0, 1.58, 0), size: v3(0.28, 0.28, 0.28) },
  { name: 'chest', center: v3(0, 1.26, 0), size: v3(0.52, 0.36, 0.32) },
  { name: 'stomach', center: v3(0, 0.98, 0), size: v3(0.48, 0.22, 0.3) },
  { name: 'arm_l', center: v3(-0.36, 1.2, -0.12), size: v3(0.18, 0.5, 0.45) },
  { name: 'arm_r', center: v3(0.36, 1.2, -0.12), size: v3(0.18, 0.5, 0.45) },
  { name: 'leg_l', center: v3(-0.14, 0.43, 0), size: v3(0.24, 0.86, 0.28) },
  { name: 'leg_r', center: v3(0.14, 0.43, 0), size: v3(0.24, 0.86, 0.28) },
];

/** Anything with a hittable humanoid body. */
export interface HitTarget {
  id: number;
  pos: Vec3; // feet
  yaw: number;
  alive: boolean;
}

export interface RayHit {
  dist: number;
  point: Vec3;
  normal: Vec3;
  target: HitTarget | null;
  hitbox: HitboxName | null;
}

export interface BodyState {
  pos: Vec3; // feet position
  vel: Vec3;
  radius: number;
  grounded: boolean;
}

export class World {
  constructor(public readonly map: MapGrid) {}

  groundHeight(x: number, z: number): number {
    return this.map.groundHeight(x, z);
  }

  /**
   * Integrate a body with gravity, resolve collisions against blocking cells and
   * snap it to the ground. Horizontal velocity is applied by the caller.
   */
  moveBody(b: BodyState, dt: number) {
    const feetBefore = b.pos.y;
    // Horizontal move
    b.pos.x += b.vel.x * dt;
    b.pos.z += b.vel.z * dt;
    this.resolveHorizontal(b, feetBefore);

    // Vertical
    b.vel.y -= GRAVITY * dt;
    b.pos.y += b.vel.y * dt;
    const gh = this.sampleGround(b.pos.x, b.pos.z, feetBefore + STEP_HEIGHT, b.radius * 0.55);
    if (b.pos.y <= gh) {
      b.pos.y = gh;
      if (b.vel.y < 0) b.vel.y = 0;
      b.grounded = true;
    } else if (b.grounded && b.pos.y - gh <= STEP_HEIGHT && b.vel.y <= 0) {
      // walking down a small step / along a ramp: stick to the ground
      b.pos.y = gh;
      b.vel.y = 0;
      b.grounded = true;
    } else {
      b.grounded = false;
    }
  }

  /** Highest reachable ground surface under a small footprint. */
  sampleGround(x: number, z: number, maxReach: number, r: number): number {
    let best = -Infinity;
    const offs: [number, number][] = [
      [0, 0],
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ];
    for (const [ox, oz] of offs) {
      const c = this.map.cellAtWorld(x + ox, z + oz);
      if (!c || c.wall) continue;
      const h = c.ramp ? this.map.groundHeight(x + ox, z + oz) : c.h;
      if (h <= maxReach && h > best) best = h;
    }
    if (best === -Infinity) {
      // fully inside blocking cells (should not happen) — fall back to the center cell
      best = this.map.groundHeight(x, z);
    }
    return best;
  }

  private resolveHorizontal(b: BodyState, feetY: number) {
    const r = b.radius;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const cx0 = Math.floor((b.pos.x - r) / CELL);
      const cx1 = Math.floor((b.pos.x + r) / CELL);
      const cz0 = Math.floor((b.pos.z - r) / CELL);
      const cz1 = Math.floor((b.pos.z + r) / CELL);
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const c = this.map.cell(cx, cz);
          if (!this.map.isBlocking(c, feetY)) continue;
          const minX = cx * CELL;
          const maxX = minX + CELL;
          const minZ = cz * CELL;
          const maxZ = minZ + CELL;
          const px = Math.max(minX, Math.min(b.pos.x, maxX));
          const pz = Math.max(minZ, Math.min(b.pos.z, maxZ));
          let dx = b.pos.x - px;
          let dz = b.pos.z - pz;
          let d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 < 1e-8) {
            // center is inside the cell: push out along the smallest penetration axis
            const pen = [
              { d: b.pos.x - minX, nx: -1, nz: 0 },
              { d: maxX - b.pos.x, nx: 1, nz: 0 },
              { d: b.pos.z - minZ, nx: 0, nz: -1 },
              { d: maxZ - b.pos.z, nx: 0, nz: 1 },
            ].sort((a, bb) => a.d - bb.d)[0];
            b.pos.x += pen.nx * (pen.d + r);
            b.pos.z += pen.nz * (pen.d + r);
            moved = true;
            continue;
          }
          const d = Math.sqrt(d2);
          dx /= d;
          dz /= d;
          const push = r - d;
          b.pos.x += dx * push;
          b.pos.z += dz * push;
          // remove velocity into the wall
          const vn = b.vel.x * dx + b.vel.z * dz;
          if (vn < 0) {
            b.vel.x -= dx * vn;
            b.vel.z -= dz * vn;
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
    // Keep inside world bounds
    const lim = this.map.worldSize;
    if (b.pos.x < r) b.pos.x = r;
    if (b.pos.z < r) b.pos.z = r;
    if (b.pos.x > lim - r) b.pos.x = lim - r;
    if (b.pos.z > lim - r) b.pos.z = lim - r;
  }

  /** Push overlapping bodies apart (soft). */
  separateBodies(bodies: BodyState[]) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        if (Math.abs(a.pos.y - b.pos.y) > 1.6) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const minD = a.radius + b.radius;
        if (d2 >= minD * minD || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (minD - d) * 0.5;
        const nx = dx / d;
        const nz = dz / d;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        b.pos.x += nx * push;
        b.pos.z += nz * push;
      }
    }
  }

  /** Ray against static map geometry only. Returns distance or -1. */
  raycastMap(o: Vec3, d: Vec3, maxDist: number): { dist: number; box: AABB | null } {
    let best = maxDist;
    let bestBox: AABB | null = null;
    // ground plane y=0
    if (d.y < -1e-9 && o.y > 0) {
      const t = -o.y / d.y;
      if (t < best) {
        best = t;
        bestBox = null;
      }
    }
    for (const col of this.map.colliders) {
      const t = rayAABB(o, d, col.box, best);
      if (t >= 0 && t < best) {
        best = t;
        bestBox = col.box;
      }
    }
    return { dist: best < maxDist ? best : -1, box: bestBox };
  }

  /** Straight line visibility between two points (map only). */
  lineOfSight(a: Vec3, b: Vec3): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return true;
    const d = { x: dx / len, y: dy / len, z: dz / len };
    return this.raycastMap(a, d, len - 0.01).dist < 0;
  }

  /** Ray against hitboxes of one target. Returns distance & hitbox or null. */
  raycastTarget(o: Vec3, d: Vec3, maxDist: number, t: HitTarget): { dist: number; hitbox: HitboxName } | null {
    // transform ray into target-local space (rotate by -yaw around Y)
    const cos = Math.cos(-t.yaw);
    const sin = Math.sin(-t.yaw);
    const ox = o.x - t.pos.x;
    const oy = o.y - t.pos.y;
    const oz = o.z - t.pos.z;
    const lo = { x: ox * cos + oz * sin, y: oy, z: -ox * sin + oz * cos };
    const ld = { x: d.x * cos + d.z * sin, y: d.y, z: -d.x * sin + d.z * cos };
    let best = maxDist;
    let bestBox: HitboxName | null = null;
    for (const hb of HITBOXES) {
      const box: AABB = {
        min: { x: hb.center.x - hb.size.x / 2, y: hb.center.y - hb.size.y / 2, z: hb.center.z - hb.size.z / 2 },
        max: { x: hb.center.x + hb.size.x / 2, y: hb.center.y + hb.size.y / 2, z: hb.center.z + hb.size.z / 2 },
      };
      const dist = rayAABB(lo, ld, box, best);
      if (dist >= 0 && dist < best) {
        best = dist;
        bestBox = hb.name;
      }
    }
    return bestBox ? { dist: best, hitbox: bestBox } : null;
  }

  /** Full bullet ray: map + all targets except `ignore`. */
  raycast(o: Vec3, d: Vec3, maxDist: number, targets: Iterable<HitTarget>, ignoreId: number): RayHit {
    const m = this.raycastMap(o, d, maxDist);
    let best = m.dist >= 0 ? m.dist : maxDist;
    let hitBox = m.box;
    let target: HitTarget | null = null;
    let hitbox: HitboxName | null = null;
    for (const t of targets) {
      if (!t.alive || t.id === ignoreId) continue;
      // cheap reject: distance from ray to target center
      const cx = t.pos.x - o.x;
      const cy = t.pos.y + 0.9 - o.y;
      const cz = t.pos.z - o.z;
      const proj = cx * d.x + cy * d.y + cz * d.z;
      if (proj < -1 || proj > best + 1) continue;
      const px = cx - d.x * proj;
      const py = cy - d.y * proj;
      const pz = cz - d.z * proj;
      if (px * px + py * py + pz * pz > 1.6 * 1.6) continue;
      const r = this.raycastTarget(o, d, best, t);
      if (r && r.dist < best) {
        best = r.dist;
        target = t;
        hitbox = r.hitbox;
        hitBox = null;
      }
    }
    const point = { x: o.x + d.x * best, y: o.y + d.y * best, z: o.z + d.z * best };
    let normal = { x: -d.x, y: -d.y, z: -d.z };
    if (!target && hitBox) normal = aabbNormalAt(point, hitBox);
    else if (!target && m.dist >= 0) normal = v3(0, 1, 0);
    return { dist: best, point, normal, target, hitbox };
  }
}
