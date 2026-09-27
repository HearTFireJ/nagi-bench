import type { HitboxName } from '../physics/World';
import { HITBOX_MULTIPLIER, type WeaponDef } from './WeaponDefs';

export interface DamageResult {
  health: number;
  armor: number;
  headshot: boolean;
}

/**
 * CS-style damage model: hitbox multiplier, distance falloff, then kevlar reduction
 * on protected regions (helmet protects the head, kevlar protects torso and arms).
 */
export function computeDamage(def: WeaponDef, hitbox: HitboxName, distance: number, armor: number, helmet: boolean): DamageResult {
  const mult = HITBOX_MULTIPLIER[hitbox] ?? 1;
  let dmg = def.damage * mult;
  if (def.falloff > 0) dmg *= Math.max(0.4, 1 - def.falloff * (distance / 100));
  const headshot = hitbox === 'head';
  let armorLoss = 0;
  const protectedRegion = headshot ? helmet : hitbox !== 'leg_l' && hitbox !== 'leg_r';
  if (armor > 0 && protectedRegion) {
    const reduced = dmg * def.armorPen;
    armorLoss = Math.min(armor, Math.max(1, Math.round((dmg - reduced) * 0.5)));
    dmg = reduced;
  }
  return { health: Math.max(1, Math.round(dmg)), armor: armorLoss, headshot };
}
