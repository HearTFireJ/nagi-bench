// Hitbox layout (actor-local space: origin at the feet, +X right, +Y up, -Z forward) and the damage model.
import type { HitZone, WeaponId } from './types';
import { getWeapon } from './weapons';

export interface HitboxDef {
  zone: HitZone;
  /** Centre in actor-local space. */
  cx: number;
  cy: number;
  cz: number;
  /** Half extents. */
  hx: number;
  hy: number;
  hz: number;
}

const box = (zone: HitZone, cx: number, cy: number, cz: number, w: number, h: number, d: number): HitboxDef => ({
  zone,
  cx,
  cy,
  cz,
  hx: w / 2,
  hy: h / 2,
  hz: d / 2,
});

// Slightly generous boxes (a few cm larger than the visible body parts) so hits feel fair.
export const HITBOXES: readonly HitboxDef[] = [
  box('head', 0, 1.64, 0, 0.3, 0.3, 0.3),
  box('chest', 0, 1.3, 0, 0.5, 0.36, 0.3),
  box('stomach', 0, 1.0, 0, 0.44, 0.28, 0.28),
  box('arm', -0.33, 1.2, 0, 0.16, 0.62, 0.2),
  box('arm', 0.33, 1.2, 0, 0.16, 0.62, 0.2),
  box('leg', -0.12, 0.43, 0, 0.24, 0.86, 0.24),
  box('leg', 0.12, 0.43, 0, 0.24, 0.86, 0.24),
];

/**
 * Damage multiplier per hit zone (relative to a chest hit = 1.0).
 * A headshot is exactly twice a body (chest) shot; every zone has a different value.
 */
export const ZONE_MULTIPLIER: Record<HitZone, number> = {
  head: 2.0,
  chest: 1.0,
  stomach: 0.9,
  arm: 0.7,
  leg: 0.55,
};

export const ZONE_LABEL: Record<HitZone, string> = {
  head: '头',
  chest: '胸',
  stomach: '腹',
  arm: '手臂',
  leg: '腿',
};

/** Does armor protect this zone? (Head only with a helmet, legs never.) */
export const zoneArmored = (zone: HitZone, helmet: boolean): boolean => {
  if (zone === 'leg') return false;
  if (zone === 'head') return helmet;
  return true;
};

export interface DamageResult {
  /** Damage removed from health. */
  health: number;
  /** Damage absorbed by armor. */
  armor: number;
  /** Raw damage before armor (after zone + range scaling). */
  raw: number;
}

/**
 * Full damage pipeline: base damage -> hit zone multiplier -> range falloff -> armor absorption (CS-style).
 * `armor` is the victim's current armor points.
 */
export const computeDamage = (
  weapon: WeaponId,
  zone: HitZone,
  distance: number,
  armor: number,
  helmet: boolean,
  baseOverride?: number,
): DamageResult => {
  const def = getWeapon(weapon);
  const base = baseOverride ?? def.damage;
  const falloff = Math.pow(def.rangeModifier, distance / 12.7);
  const raw = base * ZONE_MULTIPLIER[zone] * falloff;
  if (armor > 0 && zoneArmored(zone, helmet)) {
    let health = raw * def.armorRatio;
    let armorDmg = (raw - health) * 0.5;
    if (armorDmg > armor) {
      // Armor breaks: the part it could not absorb goes to health.
      health += (armorDmg - armor) * 2;
      armorDmg = armor;
    }
    return { health, armor: armorDmg, raw };
  }
  return { health: raw, armor: 0, raw };
};
