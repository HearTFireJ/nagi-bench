// Bot vision: field-of-view cone + line-of-sight ray casts against the collision world (walls and closed doors block sight).
import { eyePosition } from '../combat';
import type { World } from '../world';
import type { Actor } from '../types';

const eye = { x: 0, y: 0, z: 0 };
const pt = { x: 0, y: 0, z: 0 };

/** Horizontal half-FOV cosine for normal vision (about +/-65 degrees) and while scoped. */
export const FOV_COS = 0.42;
export const FOV_COS_SCOPED = 0.9;
/** Enemies this close are noticed regardless of facing (footsteps / peripheral vision). */
const PROXIMITY = 5;
export const SIGHT_RANGE = 75;

/** Can `viewer` see any part (head / chest / legs) of `target` right now? */
export const canSee = (w: World, viewer: Actor, target: Actor, fovCos: number): boolean => {
  eyePosition(viewer, eye);
  const dx = target.pos.x - viewer.pos.x;
  const dz = target.pos.z - viewer.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > SIGHT_RANGE) return false;
  if (d > PROXIMITY) {
    const fx = -Math.sin(viewer.yaw);
    const fz = -Math.cos(viewer.yaw);
    if ((dx * fx + dz * fz) / d < fovCos) return false;
  }
  const cw = w.level.cw;
  pt.x = target.pos.x;
  pt.z = target.pos.z;
  // Head, chest, legs: any unobstructed sample counts (peeking a shoulder or a foot is enough to be spotted).
  pt.y = target.pos.y + 1.58;
  if (cw.lineClear(eye, pt, eye.y, pt.y)) return true;
  pt.y = target.pos.y + 1.1;
  if (cw.lineClear(eye, pt, eye.y, pt.y)) return true;
  pt.y = target.pos.y + 0.4;
  return cw.lineClear(eye, pt, eye.y, pt.y);
};

/** Nearest visible enemy of `viewer`, or null. */
export const findVisibleEnemy = (w: World, viewer: Actor, fovCos: number): Actor | null => {
  let best: Actor | null = null;
  let bestD = Infinity;
  for (const e of w.actors) {
    if (!e.alive || e.team === viewer.team) continue;
    const d = Math.hypot(e.pos.x - viewer.pos.x, e.pos.z - viewer.pos.z);
    if (d >= bestD) continue;
    if (canSee(w, viewer, e, fovCos)) {
      best = e;
      bestD = d;
    }
  }
  return best;
};
