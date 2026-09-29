// Global gameplay constants (SI units: metres / seconds / degrees where noted).

export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

export const PLAYER = {
  radius: 0.4,
  height: 1.8,
  crouchHeight: 1.4,
  eyeHeight: 1.62,
  crouchEyeHeight: 1.22,
  stepHeight: 0.55,
  jumpSpeed: 7.3,
  gravity: 20.3,
  friction: 5.2,
  accel: 5.5,
  airAccel: 12,
  airWishCap: 0.75,
  stopSpeed: 2.0,
  walkFactor: 0.52,
  crouchFactor: 0.34,
  groundProbeRadius: 0.3,
  maxHealth: 100,
} as const;

export const ROUND = {
  freezeTime: 6,
  roundTime: 115,
  bombTime: 40,
  plantTime: 3.2,
  defuseTime: 10,
  defuseTimeKit: 5,
  roundEndTime: 5,
  bombUseRadius: 1.9,
  bombPickupRadius: 1.3,
  maxRounds: 15,
  buyTime: 15,
  startMoney: 800,
  maxMoney: 16000,
} as const;

export const ECONOMY = {
  winElimination: 3250,
  winBomb: 3500,
  winDefuse: 3500,
  winTime: 3250,
  lossBase: 1400,
  lossStep: 500,
  lossMax: 3400,
  plantBonus: 300,
  defuseBonus: 300,
  kevlar: 650,
  kevlarHelmet: 1000,
  defuseKit: 400,
} as const;

/** Armour preset per round type. */
export interface RoundPreset {
  id: 'pistol' | 'fullbuy';
  label: string;
  armor: number;
  helmet: boolean;
  primary: boolean;
  startMoney: number;
}

export const ROUND_PRESETS: Record<RoundPreset['id'], RoundPreset> = {
  // Standard CS pistol round: default pistol + knife only, no armour (bought later with $800).
  pistol: { id: 'pistol', label: '手枪局', armor: 0, helmet: false, primary: false, startMoney: 800 },
  fullbuy: { id: 'fullbuy', label: '全装局', armor: 100, helmet: true, primary: true, startMoney: 16000 },
};
