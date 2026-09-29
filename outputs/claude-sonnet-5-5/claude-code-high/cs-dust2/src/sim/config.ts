// Central tuning constants. Units: meters / seconds / degrees (where noted).

export const CFG = {
  TICK: 1 / 60,

  // body / movement
  GRAVITY: 16,
  JUMP_V: 6.0,
  STEP_H: 0.5,
  RADIUS: 0.4,
  HEIGHT: 1.8,
  EYE: 1.62,
  RUN_SPEED: 5.4,
  WALK_MULT: 0.5,
  GROUND_ACCEL: 55,
  AIR_ACCEL: 9,
  STEP_DIST: 2.3, // meters between footstep sounds when running

  // round
  FREEZE_TIME: 9,
  ROUND_TIME: 115,
  BOMB_TIME: 40,
  PLANT_TIME: 3.2,
  DEFUSE_TIME: 10,
  DEFUSE_KIT_TIME: 5,
  DEFUSE_RANGE: 2.0,
  ROUND_END_TIME: 5.5,
  BOMB_RADIUS: 24,
  BOMB_MAX_DAMAGE: 500,
  WIN_ROUNDS: 8,

  // economy
  MAX_MONEY: 16000,
  WIN_REWARD: 3250,
  LOSS_BASE: 1400,
  LOSS_STEP: 500,
  LOSS_MAX: 3400,
  PLANT_REWARD: 800,
  DEFUSE_REWARD: 300,
  KEVLAR_PRICE: 650,
  HELMET_ONLY_PRICE: 350,
  KEVLAR_HELMET_PRICE: 1000,
  KIT_PRICE: 400,

  // hit multipliers (chest == 1.0 is the "body" baseline; head is exactly 2x body)
  HEAD_MULT: 2.0,
  CHEST_MULT: 1.0,
  STOMACH_MULT: 1.1,
  ARM_MULT: 0.8,
  LEG_MULT: 0.7,
  ARMOR_ABSORB: 0.5, // fraction of the absorbed damage that wears down armor

  // perception
  VIEW_HALF_FOV: 70 * (Math.PI / 180),
  VIEW_RANGE: 90,
} as const;

export type RoundMode = 'pistol' | 'full';

/** Loadout rules for the opening round of a match. */
export const ROUND_MODES: Record<
  RoundMode,
  { label: string; startMoney: number; armor: number; helmet: boolean; primaryAllowed: boolean; desc: string }
> = {
  pistol: {
    label: '手枪局',
    startMoney: 800,
    armor: 0,
    helmet: false,
    primaryAllowed: false,
    desc: '标准 CS 第一回合：全员默认手枪 + 刀，$800，无主武器、无护甲（可购买防弹衣 / 沙鹰）',
  },
  full: {
    label: '全装局',
    startMoney: 10000,
    armor: 100,
    helmet: true,
    primaryAllowed: true,
    desc: '开局 $10000 且自带护甲头盔：可以直接买 AK-47 / M4A4 / AWP 体验全部武器',
  },
};
