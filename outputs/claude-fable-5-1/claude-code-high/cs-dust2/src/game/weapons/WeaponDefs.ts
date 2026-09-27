export type WeaponSlot = 'primary' | 'secondary' | 'melee';
export type Team = 'CT' | 'T';
export type WeaponSound = 'ak' | 'm4' | 'awp' | 'glock' | 'usp' | 'deagle' | 'knife';
export type WeaponModelStyle = 'ak' | 'm4' | 'awp' | 'pistol' | 'deagle' | 'knife';

export interface WeaponDef {
  id: string;
  name: string;
  slot: WeaponSlot;
  damage: number;
  /** Fraction of damage that passes through kevlar (CS-style armor penetration). */
  armorPen: number;
  rpm: number;
  magSize: number;
  reserveAmmo: number;
  reloadTime: number;
  auto: boolean;
  /** Base inaccuracy (degrees, standing still). */
  spreadBase: number;
  /** Extra inaccuracy while moving at full speed (degrees). */
  spreadMove: number;
  /** Inaccuracy added per shot (degrees). */
  spreadPerShot: number;
  /** Max accumulated inaccuracy (degrees). */
  spreadMax: number;
  /** Degrees per second of spread recovery. */
  spreadRecovery: number;
  /** View kick per shot (degrees, pitch). */
  kickPitch: number;
  /** Random yaw kick amplitude per shot (degrees). */
  kickYaw: number;
  /** Degrees per second at which the view punch recovers. */
  kickRecovery: number;
  range: number;
  /** Damage falloff fraction per 100m (0 = none). */
  falloff: number;
  scope?: { fov: number; spread: number };
  sound: WeaponSound;
  model: WeaponModelStyle;
  /** Max movement speed with this weapon (m/s). */
  moveSpeed: number;
  price: number;
  killAward: number;
  team?: Team;
  /** Knife only: melee reach. */
  meleeRange?: number;
}

export const HEADSHOT_MULTIPLIER = 2.0;

export const HITBOX_MULTIPLIER: Record<string, number> = {
  head: HEADSHOT_MULTIPLIER,
  chest: 1.0,
  stomach: 1.25,
  arm_l: 1.0,
  arm_r: 1.0,
  leg_l: 0.75,
  leg_r: 0.75,
};

export const WEAPONS: Record<string, WeaponDef> = {
  ak47: {
    id: 'ak47',
    name: 'AK-47',
    slot: 'primary',
    damage: 36,
    armorPen: 0.775,
    rpm: 600,
    magSize: 30,
    reserveAmmo: 90,
    reloadTime: 2.5,
    auto: true,
    spreadBase: 0.45,
    spreadMove: 5.5,
    spreadPerShot: 0.75,
    spreadMax: 7.5,
    spreadRecovery: 9,
    kickPitch: 1.9,
    kickYaw: 0.9,
    kickRecovery: 14,
    range: 200,
    falloff: 0,
    sound: 'ak',
    model: 'ak',
    moveSpeed: 5.0,
    price: 2700,
    killAward: 300,
    team: 'T',
  },
  m4a4: {
    id: 'm4a4',
    name: 'M4A4',
    slot: 'primary',
    damage: 33,
    armorPen: 0.7,
    rpm: 666,
    magSize: 30,
    reserveAmmo: 90,
    reloadTime: 3.1,
    auto: true,
    spreadBase: 0.35,
    spreadMove: 5.0,
    spreadPerShot: 0.42,
    spreadMax: 5.0,
    spreadRecovery: 11,
    kickPitch: 1.05,
    kickYaw: 0.45,
    kickRecovery: 16,
    range: 200,
    falloff: 0,
    sound: 'm4',
    model: 'm4',
    moveSpeed: 5.2,
    price: 3100,
    killAward: 300,
    team: 'CT',
  },
  awp: {
    id: 'awp',
    name: 'AWP',
    slot: 'primary',
    damage: 115,
    armorPen: 0.975,
    rpm: 41,
    magSize: 5,
    reserveAmmo: 30,
    reloadTime: 3.7,
    auto: false,
    spreadBase: 6.0,
    spreadMove: 8.0,
    spreadPerShot: 2.0,
    spreadMax: 10,
    spreadRecovery: 6,
    kickPitch: 7.0,
    kickYaw: 1.5,
    kickRecovery: 10,
    range: 400,
    falloff: 0,
    scope: { fov: 11, spread: 0.02 },
    sound: 'awp',
    model: 'awp',
    moveSpeed: 4.3,
    price: 4750,
    killAward: 100,
  },
  glock: {
    id: 'glock',
    name: 'Glock-18',
    slot: 'secondary',
    damage: 28,
    armorPen: 0.47,
    rpm: 400,
    magSize: 20,
    reserveAmmo: 120,
    reloadTime: 2.2,
    auto: false,
    spreadBase: 0.9,
    spreadMove: 3.0,
    spreadPerShot: 0.8,
    spreadMax: 5,
    spreadRecovery: 8,
    kickPitch: 1.3,
    kickYaw: 0.5,
    kickRecovery: 14,
    range: 120,
    falloff: 0.15,
    sound: 'glock',
    model: 'pistol',
    moveSpeed: 5.4,
    price: 200,
    killAward: 300,
    team: 'T',
  },
  usp: {
    id: 'usp',
    name: 'USP-S',
    slot: 'secondary',
    damage: 35,
    armorPen: 0.505,
    rpm: 352,
    magSize: 12,
    reserveAmmo: 24,
    reloadTime: 2.2,
    auto: false,
    spreadBase: 0.7,
    spreadMove: 2.8,
    spreadPerShot: 0.7,
    spreadMax: 4.5,
    spreadRecovery: 8,
    kickPitch: 1.5,
    kickYaw: 0.5,
    kickRecovery: 14,
    range: 120,
    falloff: 0.15,
    sound: 'usp',
    model: 'pistol',
    moveSpeed: 5.4,
    price: 200,
    killAward: 300,
    team: 'CT',
  },
  deagle: {
    id: 'deagle',
    name: 'Desert Eagle',
    slot: 'secondary',
    damage: 53,
    armorPen: 0.932,
    rpm: 267,
    magSize: 7,
    reserveAmmo: 35,
    reloadTime: 2.2,
    auto: false,
    spreadBase: 1.1,
    spreadMove: 4.5,
    spreadPerShot: 2.2,
    spreadMax: 8,
    spreadRecovery: 5,
    kickPitch: 3.8,
    kickYaw: 1.2,
    kickRecovery: 9,
    range: 150,
    falloff: 0.1,
    sound: 'deagle',
    model: 'deagle',
    moveSpeed: 5.3,
    price: 700,
    killAward: 300,
  },
  knife: {
    id: 'knife',
    name: 'Knife',
    slot: 'melee',
    damage: 40,
    armorPen: 0.85,
    rpm: 110,
    magSize: 0,
    reserveAmmo: 0,
    reloadTime: 0,
    auto: true,
    spreadBase: 0,
    spreadMove: 0,
    spreadPerShot: 0,
    spreadMax: 0,
    spreadRecovery: 0,
    kickPitch: 0,
    kickYaw: 0,
    kickRecovery: 0,
    range: 1.9,
    falloff: 0,
    sound: 'knife',
    model: 'knife',
    moveSpeed: 5.6,
    price: 0,
    killAward: 1500,
    meleeRange: 1.9,
  },
};

export const DEFAULT_PISTOL: Record<Team, string> = { T: 'glock', CT: 'usp' };
export const TEAM_RIFLE: Record<Team, string> = { T: 'ak47', CT: 'm4a4' };

export interface BuyItem {
  id: string;
  name: string;
  price: number;
  kind: 'weapon' | 'armor';
  key: string;
  team?: Team;
}

export const BUY_ITEMS: BuyItem[] = [
  { id: 'ak47', name: 'AK-47', price: 2700, kind: 'weapon', key: '1', team: 'T' },
  { id: 'm4a4', name: 'M4A4', price: 3100, kind: 'weapon', key: '1', team: 'CT' },
  { id: 'awp', name: 'AWP', price: 4750, kind: 'weapon', key: '2' },
  { id: 'deagle', name: 'Desert Eagle', price: 700, kind: 'weapon', key: '3' },
  { id: 'kevlar', name: 'Kevlar Vest', price: 650, kind: 'armor', key: '4' },
  { id: 'kevlar_helmet', name: 'Kevlar + Helmet', price: 1000, kind: 'armor', key: '5' },
];
