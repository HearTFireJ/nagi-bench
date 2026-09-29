import type { Team } from '../map/types.ts';
import type { WeaponModelSpec } from './models.ts';
import { MODEL_AK47, MODEL_AWP, MODEL_DEAGLE, MODEL_GLOCK, MODEL_KNIFE, MODEL_M4A4, MODEL_USP } from './models.ts';

export type WeaponId = string;
export type WeaponSlot = 'primary' | 'secondary' | 'melee';
export type WeaponClass = 'rifle' | 'sniper' | 'pistol' | 'knife';

/** All angles in degrees (cone half-angle of the bullet inaccuracy). */
export interface SpreadSpec {
  stand: number;
  move: number;
  air: number;
  crouchMul: number;
  /** bloom added per shot, decays at `recover` deg/s */
  perShot: number;
  max: number;
  recover: number;
}

/** View punch per shot in degrees; decays exponentially with rate `decay` (1/s). */
export interface RecoilSpec {
  pitch: number;
  yaw: number;
  decay: number;
  /** seconds without firing after which the spray pattern restarts */
  resetTime: number;
}

export interface ScopeSpec {
  /** field of view (deg) per zoom level; right-click cycles through them */
  fovs: number[];
  /** inaccuracy while not scoped (deg) */
  unscopedSpread: number;
  /** move speed multiplier while scoped */
  scopedSpeedMul: number;
}

export interface MeleeSpec {
  slashDamage: number;
  stabDamage: number;
  backstabDamage: number;
  range: number;
  slashInterval: number;
  stabInterval: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  slot: WeaponSlot;
  cls: WeaponClass;
  price: number;
  killReward: number;
  /** base damage to a chest hit at point blank */
  damage: number;
  /** CS "armor ratio": share of damage that bypasses armour = ratio/2 */
  armorRatio: number;
  /** damage multiplier per 12.7 m travelled */
  rangeMod: number;
  maxRange: number;
  fireInterval: number;
  auto: boolean;
  mag: number;
  reserve: number;
  reloadTime: number;
  deployTime: number;
  /** m/s while unscoped, standing */
  moveSpeed: number;
  spread: SpreadSpec;
  recoil: RecoilSpec;
  scope?: ScopeSpec;
  melee?: MeleeSpec;
  /** which synthesised sound set the audio engine uses */
  sound: string;
  silenced?: boolean;
  /** teams that can buy it (undefined = both) */
  team?: Team;
  model: WeaponModelSpec;
}

const U = 0.0254; // Source units -> metres

export const WEAPONS: Record<WeaponId, WeaponDef> = {};

/** Register (or override) a weapon. The whole game reads weapons from this registry. */
export function registerWeapon(def: WeaponDef): WeaponDef {
  WEAPONS[def.id] = def;
  return def;
}

export function getWeapon(id: WeaponId): WeaponDef {
  const w = WEAPONS[id];
  if (!w) throw new Error(`unknown weapon ${id}`);
  return w;
}

registerWeapon({
  id: 'ak47',
  name: 'AK-47',
  slot: 'primary',
  cls: 'rifle',
  price: 2700,
  killReward: 300,
  damage: 40,
  armorRatio: 1.55,
  rangeMod: 0.98,
  maxRange: 200,
  fireInterval: 0.1,
  auto: true,
  mag: 30,
  reserve: 90,
  reloadTime: 2.4,
  deployTime: 0.75,
  moveSpeed: 215 * U,
  spread: { stand: 0.3, move: 3.2, air: 6, crouchMul: 0.7, perShot: 0.45, max: 3.6, recover: 6 },
  // strong vertical kick: the view climbs visibly and the crosshair blooms
  recoil: { pitch: 1.75, yaw: 0.45, decay: 3.2, resetTime: 0.4 },
  sound: 'ak47',
  team: 'T',
  model: MODEL_AK47,
});

registerWeapon({
  id: 'm4a4',
  name: 'M4A4',
  slot: 'primary',
  cls: 'rifle',
  price: 3100,
  killReward: 300,
  // medium damage: 3 body hits unarmoured / 4 armoured, same thresholds as the AK, but lower recoil + faster fire
  damage: 36,
  armorRatio: 1.55,
  rangeMod: 0.99,
  maxRange: 200,
  fireInterval: 0.088,
  auto: true,
  mag: 30,
  reserve: 90,
  reloadTime: 2.6,
  deployTime: 0.7,
  moveSpeed: 225 * U,
  spread: { stand: 0.22, move: 2.6, air: 5, crouchMul: 0.7, perShot: 0.22, max: 2.0, recover: 8 },
  recoil: { pitch: 0.7, yaw: 0.16, decay: 4.5, resetTime: 0.35 },
  sound: 'm4a4',
  team: 'CT',
  model: MODEL_M4A4,
});

registerWeapon({
  id: 'awp',
  name: 'AWP',
  slot: 'primary',
  cls: 'sniper',
  price: 4750,
  killReward: 100,
  // 150 base: even a leg shot (x0.7) is lethal -> "one shot, one kill"
  damage: 150,
  armorRatio: 1.95,
  rangeMod: 0.99,
  maxRange: 300,
  fireInterval: 1.47,
  auto: false,
  mag: 10,
  reserve: 30,
  reloadTime: 3.4,
  deployTime: 1.1,
  moveSpeed: 200 * U,
  spread: { stand: 0.02, move: 5.5, air: 9, crouchMul: 0.6, perShot: 0, max: 0, recover: 10 },
  recoil: { pitch: 3.4, yaw: 0.3, decay: 3.5, resetTime: 0.5 },
  scope: { fovs: [40, 12], unscopedSpread: 6.5, scopedSpeedMul: 0.5 },
  sound: 'awp',
  model: MODEL_AWP,
});

registerWeapon({
  id: 'glock',
  name: 'Glock-18',
  slot: 'secondary',
  cls: 'pistol',
  price: 0,
  killReward: 300,
  damage: 18,
  armorRatio: 0.94,
  rangeMod: 0.85,
  maxRange: 120,
  fireInterval: 0.13,
  auto: false,
  mag: 20,
  reserve: 120,
  reloadTime: 2.2,
  deployTime: 0.4,
  moveSpeed: 240 * U,
  spread: { stand: 0.5, move: 2.4, air: 4.5, crouchMul: 0.7, perShot: 0.9, max: 3.0, recover: 8 },
  recoil: { pitch: 0.85, yaw: 0.2, decay: 6, resetTime: 0.3 },
  sound: 'glock',
  team: 'T',
  model: MODEL_GLOCK,
});

registerWeapon({
  id: 'usp',
  name: 'USP-S',
  slot: 'secondary',
  cls: 'pistol',
  price: 0,
  killReward: 300,
  damage: 21,
  armorRatio: 1.0,
  rangeMod: 0.85,
  maxRange: 120,
  fireInterval: 0.14,
  auto: false,
  mag: 12,
  reserve: 60,
  reloadTime: 2.2,
  deployTime: 0.4,
  moveSpeed: 240 * U,
  spread: { stand: 0.4, move: 2.2, air: 4.5, crouchMul: 0.7, perShot: 0.85, max: 2.6, recover: 8 },
  recoil: { pitch: 0.75, yaw: 0.15, decay: 6, resetTime: 0.3 },
  sound: 'usp',
  silenced: true,
  team: 'CT',
  model: MODEL_USP,
});

registerWeapon({
  id: 'deagle',
  name: 'Desert Eagle',
  slot: 'secondary',
  cls: 'pistol',
  price: 700,
  killReward: 300,
  // between the pistols (16/20) and the rifles (32/42); small 7-round magazine
  damage: 28,
  armorRatio: 1.86,
  rangeMod: 0.81,
  maxRange: 160,
  fireInterval: 0.225,
  auto: false,
  mag: 7,
  reserve: 35,
  reloadTime: 2.2,
  deployTime: 0.5,
  moveSpeed: 230 * U,
  spread: { stand: 0.45, move: 3.4, air: 6, crouchMul: 0.7, perShot: 2.2, max: 5, recover: 6 },
  recoil: { pitch: 2.9, yaw: 0.5, decay: 5, resetTime: 0.4 },
  sound: 'deagle',
  model: MODEL_DEAGLE,
});

registerWeapon({
  id: 'knife',
  name: '匕首',
  slot: 'melee',
  cls: 'knife',
  price: 0,
  killReward: 1500,
  damage: 40,
  armorRatio: 1.7,
  rangeMod: 1,
  maxRange: 1.9,
  fireInterval: 0.45,
  auto: true,
  mag: 0,
  reserve: 0,
  reloadTime: 0,
  deployTime: 0.5,
  moveSpeed: 250 * U,
  spread: { stand: 0, move: 0, air: 0, crouchMul: 1, perShot: 0, max: 0, recover: 1 },
  recoil: { pitch: 0, yaw: 0, decay: 5, resetTime: 0.3 },
  melee: { slashDamage: 40, stabDamage: 65, backstabDamage: 180, range: 1.9, slashInterval: 0.45, stabInterval: 1.0 },
  sound: 'knife',
  model: MODEL_KNIFE,
});

export const DEFAULT_SECONDARY: Record<Team, WeaponId> = { T: 'glock', CT: 'usp' };
export const DEFAULT_PRIMARY: Record<Team, WeaponId> = { T: 'ak47', CT: 'm4a4' };
