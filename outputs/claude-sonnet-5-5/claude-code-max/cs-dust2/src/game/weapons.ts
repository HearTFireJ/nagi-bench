// Data-driven weapon table. Adding a weapon = add an id to `WeaponId` (types.ts), an entry here, a sound profile
// (audio/sfx.ts) and a model spec (render/weaponModels.ts). No gameplay code branches on weapon ids: everything reads
// these numbers, so the "feel" differences (recoil, spread, rate of fire, scope, ...) live entirely in data.
//
// Units: metres, seconds, degrees for angles (converted to radians where used).
import type { Team, WeaponId, WeaponSlot } from './types';

export type WeaponKind = 'rifle' | 'sniper' | 'pistol' | 'knife' | 'bomb';
export type SoundProfile = 'ak' | 'm4' | 'awp' | 'glock' | 'usp' | 'deagle' | 'knife' | 'c4';

export interface SpreadSpec {
  /** Inaccuracy (deg) when standing still. */
  stand: number;
  /** Extra inaccuracy at full run speed. */
  move: number;
  /** Extra inaccuracy while airborne. */
  air: number;
  /** Inaccuracy added per consecutive shot. */
  perShot: number;
  /** Cap for the accumulated per-shot inaccuracy. */
  maxShot: number;
  /** Recovery of the per-shot part, deg/s. */
  recovery: number;
}

export interface RecoilSpec {
  /** View kick upwards per shot (deg). */
  pitch: number;
  /** Random sideways kick range per shot (deg, +/-). */
  yaw: number;
  /** Max accumulated punch (deg). */
  max: number;
  /** Punch recovery, deg/s (plus a proportional term). */
  recovery: number;
}

export interface ScopeSpec {
  /** Vertical FOV per zoom level (deg). */
  fov: [number, number];
  /** Extra inaccuracy (deg) when firing while not scoped. */
  unscopedSpread: number;
  /** Max move speed while scoped (m/s). */
  scopedSpeed: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  slot: WeaponSlot;
  kind: WeaponKind;
  /** Damage to a chest hit; hit zones scale this (see hitboxes.ts). */
  damage: number;
  /** Fraction of damage that still reaches health when the victim has armor. */
  armorRatio: number;
  /** Damage multiplier per 12.7 m of travel. */
  rangeModifier: number;
  range: number;
  /** Seconds between shots. */
  fireInterval: number;
  automatic: boolean;
  magSize: number;
  reserveMax: number;
  reloadTime: number;
  drawTime: number;
  /** Max run speed while this weapon is held (m/s). */
  moveSpeed: number;
  spread: SpreadSpec;
  recoil: RecoilSpec;
  scope?: ScopeSpec;
  price: number;
  killReward: number;
  sound: SoundProfile;
  /** Melee only: stab (secondary attack) damage and interval. */
  stab?: { damage: number; interval: number };
}

const DEFAULT_SPREAD: SpreadSpec = { stand: 0.4, move: 3.5, air: 6, perShot: 0.5, maxShot: 3, recovery: 8 };

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  ak47: {
    id: 'ak47',
    name: 'AK-47',
    slot: 'primary',
    kind: 'rifle',
    // High damage: 3 body shots to kill, and an unarmored headshot (2 x 50) is an instant kill.
    damage: 50,
    armorRatio: 0.775,
    rangeModifier: 0.98,
    range: 120,
    fireInterval: 0.1,
    automatic: true,
    magSize: 30,
    reserveMax: 90,
    reloadTime: 2.5,
    drawTime: 0.75,
    moveSpeed: 5.4,
    // Heavy recoil: large accumulated spread and a strong upward view kick.
    spread: { stand: 0.3, move: 4.5, air: 8, perShot: 0.24, maxShot: 2.8, recovery: 8 },
    recoil: { pitch: 1.35, yaw: 0.55, max: 15, recovery: 9 },
    price: 2700,
    killReward: 300,
    sound: 'ak',
  },
  m4a4: {
    id: 'm4a4',
    name: 'M4A4',
    slot: 'primary',
    kind: 'rifle',
    damage: 36,
    armorRatio: 0.7,
    rangeModifier: 0.97,
    range: 120,
    fireInterval: 0.085,
    automatic: true,
    magSize: 30,
    reserveMax: 90,
    reloadTime: 3.0,
    drawTime: 0.75,
    moveSpeed: 5.6,
    // Low recoil, high rate of fire.
    spread: { stand: 0.22, move: 3.6, air: 7, perShot: 0.12, maxShot: 1.4, recovery: 10 },
    recoil: { pitch: 0.55, yaw: 0.22, max: 6, recovery: 14 },
    price: 3100,
    killReward: 300,
    sound: 'm4',
  },
  awp: {
    id: 'awp',
    name: 'AWP',
    slot: 'primary',
    kind: 'sniper',
    // 200 base damage: a hit to ANY hitbox (even legs at x0.55 = 110) is lethal -> single-shot kill.
    damage: 200,
    armorRatio: 0.95,
    rangeModifier: 0.995,
    range: 300,
    fireInterval: 1.45,
    automatic: false,
    magSize: 10,
    reserveMax: 30,
    reloadTime: 3.6,
    drawTime: 1.0,
    moveSpeed: 5.0,
    spread: { stand: 0.05, move: 5.5, air: 9, perShot: 0, maxShot: 0, recovery: 10 },
    recoil: { pitch: 4.0, yaw: 0.6, max: 8, recovery: 10 },
    scope: { fov: [40, 12], unscopedSpread: 7, scopedSpeed: 3.3 },
    price: 4750,
    killReward: 100,
    sound: 'awp',
  },
  glock: {
    id: 'glock',
    name: 'Glock-18',
    slot: 'secondary',
    kind: 'pistol',
    damage: 22,
    armorRatio: 0.47,
    rangeModifier: 0.85,
    range: 60,
    fireInterval: 0.15,
    automatic: false,
    magSize: 20,
    reserveMax: 120,
    reloadTime: 2.2,
    drawTime: 0.5,
    moveSpeed: 6.1,
    spread: { stand: 0.55, move: 3.8, air: 6, perShot: 1.0, maxShot: 3.2, recovery: 11 },
    recoil: { pitch: 0.85, yaw: 0.3, max: 5, recovery: 13 },
    price: 200,
    killReward: 300,
    sound: 'glock',
  },
  usp: {
    id: 'usp',
    name: 'USP-S',
    slot: 'secondary',
    kind: 'pistol',
    damage: 26,
    armorRatio: 0.505,
    rangeModifier: 0.9,
    range: 70,
    fireInterval: 0.17,
    automatic: false,
    magSize: 12,
    reserveMax: 24,
    reloadTime: 2.3,
    drawTime: 0.5,
    moveSpeed: 6.1,
    spread: { stand: 0.3, move: 3.4, air: 6, perShot: 0.85, maxShot: 2.8, recovery: 11 },
    recoil: { pitch: 0.8, yaw: 0.25, max: 5, recovery: 13 },
    price: 200,
    killReward: 300,
    sound: 'usp',
  },
  deagle: {
    id: 'deagle',
    name: 'Desert Eagle',
    slot: 'secondary',
    kind: 'pistol',
    // Between the pistols (22/26) and the rifles (36/45); tiny magazine, slow, big kick.
    damage: 34,
    armorRatio: 0.93,
    rangeModifier: 0.92,
    range: 90,
    fireInterval: 0.225,
    automatic: false,
    magSize: 7,
    reserveMax: 35,
    reloadTime: 2.2,
    drawTime: 0.6,
    moveSpeed: 5.9,
    spread: { stand: 0.6, move: 4.6, air: 7, perShot: 2.2, maxShot: 6, recovery: 9 },
    recoil: { pitch: 2.6, yaw: 0.5, max: 9, recovery: 9 },
    price: 700,
    killReward: 300,
    sound: 'deagle',
  },
  knife: {
    id: 'knife',
    name: 'Knife',
    slot: 'melee',
    kind: 'knife',
    damage: 40,
    armorRatio: 0.85,
    rangeModifier: 1,
    range: 2.1,
    fireInterval: 0.5,
    automatic: true,
    magSize: 0,
    reserveMax: 0,
    reloadTime: 0,
    drawTime: 0.4,
    moveSpeed: 6.3,
    spread: { ...DEFAULT_SPREAD, stand: 0, move: 0, air: 0, perShot: 0, maxShot: 0 },
    recoil: { pitch: 0, yaw: 0, max: 0, recovery: 10 },
    price: 0,
    killReward: 1500,
    sound: 'knife',
    stab: { damage: 65, interval: 1.1 },
  },
  c4: {
    id: 'c4',
    name: 'C4',
    slot: 'bomb',
    kind: 'bomb',
    damage: 0,
    armorRatio: 1,
    rangeModifier: 1,
    range: 0,
    fireInterval: 0.2,
    automatic: false,
    magSize: 0,
    reserveMax: 0,
    reloadTime: 0,
    drawTime: 0.6,
    moveSpeed: 6.2,
    spread: { ...DEFAULT_SPREAD, stand: 0, move: 0, air: 0, perShot: 0, maxShot: 0 },
    recoil: { pitch: 0, yaw: 0, max: 0, recovery: 10 },
    price: 0,
    killReward: 0,
    sound: 'c4',
  },
};

export const getWeapon = (id: WeaponId): WeaponDef => WEAPONS[id];

/** Default sidearm / team rifle. */
export const DEFAULT_PISTOL: Record<Team, WeaponId> = { T: 'glock', CT: 'usp' };
export const TEAM_RIFLE: Record<Team, WeaponId> = { T: 'ak47', CT: 'm4a4' };

/** Weapons offered in the buy menu, grouped by slot. */
export const BUYABLE: Record<'primary' | 'secondary', WeaponId[]> = {
  primary: ['ak47', 'm4a4', 'awp'],
  secondary: ['glock', 'usp', 'deagle'],
};

export const KEVLAR_PRICE = 650;
export const KEVLAR_HELMET_PRICE = 1000;

/** Which teams may buy a weapon (rifles are team-locked like in CS). */
export const weaponAllowedFor = (id: WeaponId, team: Team): boolean => {
  if (id === 'ak47' || id === 'glock') return team === 'T';
  if (id === 'm4a4' || id === 'usp') return team === 'CT';
  return true;
};
