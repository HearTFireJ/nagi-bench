// Per-actor hitboxes (head / chest / stomach / arms / legs), oriented by the actor's yaw.
// Local space: origin at the feet, +Y up, actor faces -Z. Sizes match render/characterModel.ts.

import { CFG } from './config.ts';

export type HitGroup = 'head' | 'chest' | 'stomach' | 'arm' | 'leg';

export interface HitboxDef {
  group: HitGroup;
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
}

export const HITBOXES: HitboxDef[] = [
  { group: 'head', cx: 0, cy: 1.6, cz: 0, hx: 0.15, hy: 0.15, hz: 0.15 },
  { group: 'chest', cx: 0, cy: 1.28, cz: 0, hx: 0.25, hy: 0.17, hz: 0.15 },
  { group: 'stomach', cx: 0, cy: 0.99, cz: 0, hx: 0.22, hy: 0.12, hz: 0.14 },
  { group: 'arm', cx: -0.36, cy: 1.15, cz: 0, hx: 0.09, hy: 0.3, hz: 0.11 },
  { group: 'arm', cx: 0.36, cy: 1.15, cz: 0, hx: 0.09, hy: 0.3, hz: 0.11 },
  { group: 'leg', cx: -0.12, cy: 0.43, cz: 0, hx: 0.11, hy: 0.43, hz: 0.13 },
  { group: 'leg', cx: 0.12, cy: 0.43, cz: 0, hx: 0.11, hy: 0.43, hz: 0.13 },
];

export const HIT_MULT: Record<HitGroup, number> = {
  head: CFG.HEAD_MULT,
  chest: CFG.CHEST_MULT,
  stomach: CFG.STOMACH_MULT,
  arm: CFG.ARM_MULT,
  leg: CFG.LEG_MULT,
};

export const HIT_LABEL: Record<HitGroup, string> = {
  head: '头',
  chest: '胸',
  stomach: '腹',
  arm: '手臂',
  leg: '腿',
};

export interface BodyHit {
  t: number;
  group: HitGroup;
}

/** Ray vs the actor's hitboxes. (px,py,pz) = feet position, yaw = facing. */
export function rayHitbox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxT: number,
  px: number,
  py: number,
  pz: number,
  yaw: number,
): BodyHit | null {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // world -> local (inverse of rotation about Y by yaw)
  const rx = ox - px;
  const rz = oz - pz;
  const lox = rx * c - rz * s;
  const loz = rx * s + rz * c;
  const loy = oy - py;
  const ldx = dx * c - dz * s;
  const ldz = dx * s + dz * c;
  const ldy = dy;

  let best: BodyHit | null = null;
  let bestT = maxT;
  for (const b of HITBOXES) {
    const min = [b.cx - b.hx, b.cy - b.hy, b.cz - b.hz];
    const max = [b.cx + b.hx, b.cy + b.hy, b.cz + b.hz];
    const o = [lox, loy, loz];
    const d = [ldx, ldy, ldz];
    let tNear = 0;
    let tFar = bestT;
    let hit = true;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-9) {
        if (o[k] < min[k] || o[k] > max[k]) {
          hit = false;
          break;
        }
      } else {
        let t1 = (min[k] - o[k]) / d[k];
        let t2 = (max[k] - o[k]) / d[k];
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tNear) tNear = t1;
        if (t2 < tFar) tFar = t2;
        if (tNear > tFar) {
          hit = false;
          break;
        }
      }
    }
    if (hit && tNear <= bestT) {
      bestT = tNear;
      best = { t: tNear, group: b.group };
    }
  }
  return best;
}
