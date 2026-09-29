import type { WeaponDef } from './defs.ts';

export type Hitbox = 'head' | 'chest' | 'stomach' | 'arm' | 'leg';

/**
 * Damage multiplier per hit zone, relative to a chest ("body") hit.
 * Headshot = exactly 2x body damage.
 */
export const HITBOX_MULT: Record<Hitbox, number> = {
  head: 2.0,
  chest: 1.0,
  stomach: 1.25,
  arm: 0.8,
  leg: 0.7,
};

export const HITBOX_LABEL: Record<Hitbox, string> = {
  head: '头部',
  chest: '胸部',
  stomach: '腹部',
  arm: '手臂',
  leg: '腿部',
};

/** Zones covered by body armour. Legs are unprotected, the head only with a helmet. */
const ARMORED: Record<Hitbox, boolean> = { head: false, chest: true, stomach: true, arm: true, leg: false };

interface HitboxDef {
  hb: Hitbox;
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Hit zones in the character's local frame (feet at origin, facing -Z, standing height 1.8 m).
 * They match the proportions of the procedural character model.
 */
export const HITBOXES: HitboxDef[] = [
  { hb: 'head', min: [-0.14, 1.48, -0.15], max: [0.14, 1.79, 0.15] },
  { hb: 'chest', min: [-0.25, 1.16, -0.16], max: [0.25, 1.48, 0.16] },
  { hb: 'stomach', min: [-0.22, 0.86, -0.15], max: [0.22, 1.16, 0.15] },
  { hb: 'arm', min: [-0.42, 0.9, -0.14], max: [-0.25, 1.46, 0.14] },
  { hb: 'arm', min: [0.25, 0.9, -0.14], max: [0.42, 1.46, 0.14] },
  { hb: 'leg', min: [-0.23, 0, -0.14], max: [-0.01, 0.86, 0.14] },
  { hb: 'leg', min: [0.01, 0, -0.14], max: [0.23, 0.86, 0.14] },
];

export interface CharacterHit {
  t: number;
  hitbox: Hitbox;
}

const out: CharacterHit = { t: 0, hitbox: 'chest' };

/**
 * Ray vs. a character's hit zones. The ray is transformed into the character's local
 * frame (undoing yaw), so zones follow the body's facing. Crouching squashes the zones
 * vertically. The returned object is reused.
 */
export function raycastCharacter(
  pos: { x: number; y: number; z: number },
  yaw: number,
  crouch: number,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxT: number,
): CharacterHit | null {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const rx = ox - pos.x;
  const rz = oz - pos.z;
  // local = R(-yaw) * world
  const lox = rx * c - rz * s;
  const loz = rx * s + rz * c;
  const loy = oy - pos.y;
  const ldx = dx * c - dz * s;
  const ldz = dx * s + dz * c;
  const ldy = dy;
  const yScale = 1 - 0.22 * crouch;

  let best = maxT;
  let bestHb: Hitbox | null = null;
  for (let i = 0; i < HITBOXES.length; i++) {
    const h = HITBOXES[i];
    const minY = h.min[1] * yScale;
    const maxY = h.max[1] * yScale;
    let tmin = 0;
    let tmax = best;
    // x
    if (Math.abs(ldx) < 1e-12) {
      if (lox < h.min[0] || lox > h.max[0]) continue;
    } else {
      let t1 = (h.min[0] - lox) / ldx;
      let t2 = (h.max[0] - lox) / ldx;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (Math.abs(ldy) < 1e-12) {
      if (loy < minY || loy > maxY) continue;
    } else {
      let t1 = (minY - loy) / ldy;
      let t2 = (maxY - loy) / ldy;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (Math.abs(ldz) < 1e-12) {
      if (loz < h.min[2] || loz > h.max[2]) continue;
    } else {
      let t1 = (h.min[2] - loz) / ldz;
      let t2 = (h.max[2] - loz) / ldz;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (tmin < best) {
      best = tmin;
      bestHb = h.hb;
    }
  }
  if (bestHb === null) return null;
  out.t = best;
  out.hitbox = bestHb;
  return out;
}

export interface DamageResult {
  /** damage dealt to health */
  health: number;
  /** armour points consumed */
  armorLoss: number;
  /** damage before armour */
  raw: number;
}

const RANGE_UNIT = 12.7;

/** Damage before armour: base * zone multiplier * distance falloff. */
export function rawDamage(def: WeaponDef, hitbox: Hitbox, dist: number, extraMul = 1): number {
  const falloff = Math.pow(def.rangeMod, Math.max(0, dist) / RANGE_UNIT);
  return def.damage * HITBOX_MULT[hitbox] * falloff * extraMul;
}

/**
 * Apply the CS armour rule: armour absorbs part of the damage. `armorRatio/2` of the
 * damage still hurts the player, the remainder is soaked by armour at half efficiency.
 */
export function applyArmor(raw: number, armorRatio: number, hitbox: Hitbox, armor: number, helmet: boolean): DamageResult {
  const protectedZone = hitbox === 'head' ? helmet : ARMORED[hitbox];
  if (armor <= 0 || !protectedZone) return { health: raw, armorLoss: 0, raw };
  const ratio = Math.min(1, armorRatio * 0.5);
  let health = raw * ratio;
  let armorLoss = (raw - health) * 0.5;
  if (armorLoss > armor) {
    armorLoss = armor;
    health = raw - armor * 2;
  }
  return { health, armorLoss, raw };
}

export function computeDamage(def: WeaponDef, hitbox: Hitbox, dist: number, armor: number, helmet: boolean, extraMul = 1): DamageResult {
  return applyArmor(rawDamage(def, hitbox, dist, extraMul), def.armorRatio, hitbox, armor, helmet);
}
