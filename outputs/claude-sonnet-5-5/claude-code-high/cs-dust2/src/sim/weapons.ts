// Data-driven weapon table. Adding a weapon = adding one entry here (+ a model builder in
// render/weaponModels.ts and, optionally, a synth voice in runtime/audio.ts).

import type { Team } from './map.ts';

export type WeaponSlot = 'primary' | 'secondary' | 'melee';
export type WeaponId = 'ak47' | 'm4a4' | 'awp' | 'glock' | 'usp' | 'deagle' | 'knife';
export type SoundId = 'ak' | 'm4' | 'awp' | 'glock' | 'usp' | 'deagle' | 'knife';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  slot: WeaponSlot;
  /** damage to a chest hit ("body" baseline); head = 2x, see CFG */
  damage: number;
  /** fraction of damage that reaches health when armored (rest is absorbed by armor) */
  armorPen: number;
  /** per 12.7 m damage retention */
  rangeMod: number;
  fireInterval: number;
  auto: boolean;
  magSize: number;
  reserve: number;
  reloadTime: number;
  drawTime: number;
  /** movement speed multiplier */
  moveSpeed: number;
  price: number;
  killReward: number;
  teams: Team[];
  /** inaccuracy cone half-angle in degrees */
  spread: {
    stand: number;
    move: number;
    air: number;
    /** added per shot, decays at `recover` deg/s */
    perShot: number;
    max: number;
    recover: number;
  };
  /** view-punch per shot (degrees) */
  recoil: {
    pitch: number;
    yaw: number;
    /** linear recovery deg/s */
    recover: number;
    /** proportional recovery 1/s */
    recoverExp: number;
    max: number;
  };
  scope?: {
    /** vertical fov for zoom levels 1 and 2 */
    fov: [number, number];
    /** extra spread (deg) while un-scoped */
    unscopedSpread: number;
    /** speed multiplier while scoped */
    scopedMove: number;
  };
  melee?: {
    range: number;
    altDamage: number;
    altInterval: number;
  };
  sound: SoundId;
  desc: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  ak47: {
    id: 'ak47',
    name: 'AK-47',
    slot: 'primary',
    damage: 45,
    armorPen: 0.775,
    rangeMod: 0.98,
    fireInterval: 0.1,
    auto: true,
    magSize: 30,
    reserve: 90,
    reloadTime: 2.4,
    drawTime: 0.9,
    moveSpeed: 0.88,
    price: 2700,
    killReward: 300,
    teams: ['T'],
    spread: { stand: 0.3, move: 3.2, air: 5, perShot: 0.5, max: 4.5, recover: 6 },
    recoil: { pitch: 1.7, yaw: 0.55, recover: 3, recoverExp: 1.2, max: 22 },
    sound: 'ak',
    desc: '高伤害，后坐力剧烈',
  },
  m4a4: {
    id: 'm4a4',
    name: 'M4A4',
    slot: 'primary',
    damage: 33,
    armorPen: 0.7,
    rangeMod: 0.97,
    fireInterval: 0.08,
    auto: true,
    magSize: 30,
    reserve: 90,
    reloadTime: 3.1,
    drawTime: 0.9,
    moveSpeed: 0.9,
    price: 3100,
    killReward: 300,
    teams: ['CT'],
    spread: { stand: 0.25, move: 2.4, air: 4.5, perShot: 0.2, max: 2.4, recover: 8 },
    recoil: { pitch: 0.75, yaw: 0.28, recover: 3.5, recoverExp: 1.6, max: 10 },
    sound: 'm4',
    desc: '中等伤害，后坐力低，射速高',
  },
  awp: {
    id: 'awp',
    name: 'AWP',
    slot: 'primary',
    damage: 250,
    armorPen: 0.95,
    rangeMod: 0.99,
    fireInterval: 1.45,
    auto: false,
    magSize: 10,
    reserve: 30,
    reloadTime: 3.7,
    drawTime: 1.3,
    moveSpeed: 0.8,
    price: 4750,
    killReward: 100,
    teams: ['CT', 'T'],
    spread: { stand: 0.0, move: 5.5, air: 8, perShot: 0, max: 0, recover: 10 },
    recoil: { pitch: 5, yaw: 0, recover: 8, recoverExp: 3, max: 8 },
    scope: { fov: [26, 9], unscopedSpread: 6.0, scopedMove: 0.5 },
    sound: 'awp',
    desc: '单发致命，射速极低，右键开镜',
  },
  glock: {
    id: 'glock',
    name: 'Glock-18',
    slot: 'secondary',
    damage: 20,
    armorPen: 0.47,
    rangeMod: 0.85,
    fireInterval: 0.14,
    auto: false,
    magSize: 20,
    reserve: 120,
    reloadTime: 2.2,
    drawTime: 0.6,
    moveSpeed: 0.96,
    price: 200,
    killReward: 300,
    teams: ['T'],
    spread: { stand: 0.45, move: 2.4, air: 4, perShot: 0.55, max: 3, recover: 7 },
    recoil: { pitch: 0.9, yaw: 0.25, recover: 9, recoverExp: 3, max: 6 },
    sound: 'glock',
    desc: 'T 阵营默认手枪',
  },
  usp: {
    id: 'usp',
    name: 'USP-S',
    slot: 'secondary',
    damage: 25,
    armorPen: 0.505,
    rangeMod: 0.79,
    fireInterval: 0.16,
    auto: false,
    magSize: 12,
    reserve: 24,
    reloadTime: 2.2,
    drawTime: 0.6,
    moveSpeed: 0.96,
    price: 200,
    killReward: 300,
    teams: ['CT'],
    spread: { stand: 0.3, move: 2.2, air: 4, perShot: 0.6, max: 3, recover: 7 },
    recoil: { pitch: 1.0, yaw: 0.2, recover: 9, recoverExp: 3, max: 6 },
    sound: 'usp',
    desc: 'CT 阵营默认手枪（消音）',
  },
  deagle: {
    id: 'deagle',
    name: 'Desert Eagle',
    slot: 'secondary',
    damage: 30,
    armorPen: 0.93,
    rangeMod: 0.81,
    fireInterval: 0.225,
    auto: false,
    magSize: 7,
    reserve: 35,
    reloadTime: 2.2,
    drawTime: 0.7,
    moveSpeed: 0.95,
    price: 700,
    killReward: 300,
    teams: ['CT', 'T'],
    spread: { stand: 0.5, move: 5, air: 7, perShot: 1.6, max: 6, recover: 6 },
    recoil: { pitch: 3.6, yaw: 0.6, recover: 11, recoverExp: 3, max: 10 },
    sound: 'deagle',
    desc: '伤害介于手枪与步枪之间，弹匣仅 7 发',
  },
  knife: {
    id: 'knife',
    name: '匕首',
    slot: 'melee',
    damage: 40,
    armorPen: 0.85,
    rangeMod: 1,
    fireInterval: 0.5,
    auto: true,
    magSize: 0,
    reserve: 0,
    reloadTime: 0,
    drawTime: 0.5,
    moveSpeed: 1.0,
    price: 0,
    killReward: 1500,
    teams: ['CT', 'T'],
    spread: { stand: 0, move: 0, air: 0, perShot: 0, max: 0, recover: 1 },
    recoil: { pitch: 0, yaw: 0, recover: 1, recoverExp: 1, max: 0 },
    melee: { range: 2.0, altDamage: 65, altInterval: 1.0 },
    sound: 'knife',
    desc: '左键斩击 / 右键重刺',
  },
};

export const DEFAULT_SECONDARY: Record<Team, WeaponId> = { CT: 'usp', T: 'glock' };
export const TEAM_RIFLE: Record<Team, WeaponId> = { CT: 'm4a4', T: 'ak47' };

export const SLOT_ORDER: WeaponSlot[] = ['primary', 'secondary', 'melee'];

export interface WeaponState {
  def: WeaponDef;
  ammo: number;
  reserve: number;
}

export function createWeaponState(id: WeaponId): WeaponState {
  const def = WEAPONS[id];
  return { def, ammo: def.magSize, reserve: def.reserve };
}
