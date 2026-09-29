// Path following with stuck detection: turns a nav path into a desired movement direction each tick.
import { dist2D } from '../../core/math';
import { BODY } from '../config';
import type { NavPoint } from '../nav';
import type { World } from '../world';
import type { Actor } from '../types';

export interface MoveCmd {
  dx: number;
  dz: number;
  moving: boolean;
  jump: boolean;
}

export const makeMoveCmd = (): MoveCmd => ({ dx: 0, dz: 0, moving: false, jump: false });

export class PathFollower {
  path: NavPoint[] = [];
  idx = 0;
  goal: NavPoint | null = null;
  private sampleAt = 0;
  private sampleX = 0;
  private sampleZ = 0;
  private commanded = 0;
  private stuckTime = 0;
  /** Diagnostics for the headless test: how often we had to rescue a bot. */
  jumps = 0;
  repaths = 0;
  teleports = 0;

  clear(): void {
    this.path = [];
    this.idx = 0;
    this.goal = null;
    this.stuckTime = 0;
  }

  get done(): boolean {
    return this.goal !== null && this.idx >= this.path.length;
  }

  get active(): boolean {
    return this.goal !== null && this.idx < this.path.length;
  }

  /** Plan a route to (x,z). Returns false when the destination is unreachable. */
  setGoal(w: World, a: Actor, x: number, z: number): boolean {
    const path = w.level.nav.findPath(a.pos.x, a.pos.z, x, z);
    if (!path) {
      this.clear();
      return false;
    }
    this.path = path;
    this.idx = 0;
    this.goal = { x, z };
    this.sampleAt = w.time;
    this.sampleX = a.pos.x;
    this.sampleZ = a.pos.z;
    this.commanded = 0;
    this.stuckTime = 0;
    return true;
  }

  /**
   * Local avoidance: if a short step toward the waypoint would hit something (a crate corner the body is pressed
   * against, a pillar edge, ...), steer along the first free direction instead of grinding into the obstacle.
   * Low steps are ignored (the movement code climbs them), like the nav grid does.
   */
  private avoidObstacle(w: World, a: Actor, out: MoveCmd): void {
    const cw = w.level.cw;
    const r = BODY.radius + 0.01;
    const y0 = a.pos.y + BODY.stepHeight + 0.02;
    const y1 = a.pos.y + BODY.height;
    const free = (ux: number, uz: number): boolean => {
      const px = a.pos.x + ux * 0.28;
      const pz = a.pos.z + uz * 0.28;
      return cw.isClear(px - r, y0, pz - r, px + r, y1, pz + r);
    };
    if (free(out.dx, out.dz)) return;
    const base = Math.atan2(out.dz, out.dx);
    // Prefer the side that keeps us closest to the original heading.
    const offsets = [0.6, -0.6, 1.2, -1.2, 1.75, -1.75];
    for (const off of offsets) {
      const ux = Math.cos(base + off);
      const uz = Math.sin(base + off);
      if (free(ux, uz)) {
        out.dx = ux;
        out.dz = uz;
        return;
      }
    }
  }

  /** Remaining path length from the actor's position. */
  remaining(a: Actor): number {
    let len = 0;
    let x = a.pos.x;
    let z = a.pos.z;
    for (let i = this.idx; i < this.path.length; i++) {
      len += dist2D(x, z, this.path[i].x, this.path[i].z);
      x = this.path[i].x;
      z = this.path[i].z;
    }
    return len;
  }

  /** Compute this tick's desired movement direction; fills `out`. */
  update(w: World, a: Actor, dt: number, out: MoveCmd): void {
    out.moving = false;
    out.jump = false;
    out.dx = 0;
    out.dz = 0;
    if (this.idx >= this.path.length) return;

    // Advance past reached waypoints.
    while (this.idx < this.path.length) {
      const p = this.path[this.idx];
      const last = this.idx === this.path.length - 1;
      if (dist2D(a.pos.x, a.pos.z, p.x, p.z) < (last ? 0.5 : 0.7)) this.idx++;
      else break;
    }
    if (this.idx >= this.path.length) return;

    const p = this.path[this.idx];
    const dx = p.x - a.pos.x;
    const dz = p.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    out.dx = dx / d;
    out.dz = dz / d;
    out.moving = true;
    this.commanded += dt;
    this.avoidObstacle(w, a, out);

    // Stuck detection: sample progress twice a second.
    if (w.time - this.sampleAt >= 0.5) {
      const moved = dist2D(a.pos.x, a.pos.z, this.sampleX, this.sampleZ);
      if (this.commanded > 0.35 && moved < 0.35) this.stuckTime += w.time - this.sampleAt;
      else this.stuckTime = 0;
      this.sampleAt = w.time;
      this.sampleX = a.pos.x;
      this.sampleZ = a.pos.z;
      this.commanded = 0;
    }
    if (this.stuckTime >= 0.5) {
      out.jump = true;
      this.jumps++;
    }
    if (this.stuckTime >= 1.2 && this.goal) {
      // Re-plan from where we really are, via a random nearby waypoint to break symmetric deadlocks.
      this.repaths++;
      const goal = this.goal;
      const near = w.level.nav.randomNear(a.pos.x, a.pos.z, 3, () => w.rng.next());
      const first = w.level.nav.findPath(a.pos.x, a.pos.z, near.x, near.z);
      const rest = w.level.nav.findPath(near.x, near.z, goal.x, goal.z);
      if (first && rest) this.path = first.concat(rest);
      else this.setGoal(w, a, goal.x, goal.z);
      this.idx = 0;
      this.stuckTime = 0.6;
    }
    if (this.stuckTime >= 4) {
      // Last resort: put the bot on the nearest walkable cell.
      const c = w.level.nav.nearestWalkable(a.pos.x, a.pos.z, 24);
      if (c >= 0) {
        const pt = w.level.nav.cellCenter(c, { x: 0, z: 0 });
        a.pos.x = pt.x;
        a.pos.z = pt.z;
        a.pos.y = w.level.nav.height[c];
        a.vel.x = a.vel.z = a.vel.y = 0;
        this.teleports++;
      }
      this.stuckTime = 0;
    }
  }
}
