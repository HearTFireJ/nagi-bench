// Tunables for physics, rounds, the bomb and the economy. Everything is metres / seconds.
import type { Team, WeaponId } from './types';
import { DEFAULT_PISTOL, TEAM_RIFLE } from './weapons';

/** Fixed simulation step. The render loop accumulates real time and runs whole steps, then interpolates. */
export const SIM_DT = 1 / 60;
export const MAX_SUBSTEPS = 6;

export const BODY = {
  /** Half width of the (axis aligned) collision hull. */
  radius: 0.3,
  height: 1.8,
  eyeHeight: 1.62,
  stepHeight: 0.46,
  jumpSpeed: 7.6,
  gravity: 20.3,
  groundAccel: 5.5,
  airAccel: 12,
  airWishCap: 0.76,
  friction: 5.2,
  stopSpeed: 2.0,
  /** Speed multiplier for shift-walk. */
  walkFactor: 0.52,
} as const;

export const ROUND = {
  freezeTime: 5,
  roundTime: 100,
  bombTime: 40,
  plantTime: 3.2,
  defuseTime: 10,
  roundEndTime: 6,
  /** First side to this many round wins takes the match. */
  roundsToWin: 8,
  plantRadius: 8,
  defuseRange: 2.4,
  pickupRange: 1.6,
  /** Blast: lethal inside `killRadius`, linear falloff to `radius`. */
  blastRadius: 26,
  blastKillRadius: 10,
} as const;

/** How the first round of the match is equipped. */
export interface Loadout {
  primary: Record<Team, WeaponId | null>;
  secondary: Record<Team, WeaponId>;
  armor: number;
  helmet: boolean;
  money: number;
}

/**
 * Pistol round: everybody only carries the default pistol, no primary weapon, and armor follows the pistol-round
 * config (no kevlar by default; it can be bought with the $800 start money like in real CS).
 */
export const PISTOL_ROUND: Loadout = {
  primary: { T: null, CT: null },
  secondary: { T: DEFAULT_PISTOL.T, CT: DEFAULT_PISTOL.CT },
  armor: 0,
  helmet: false,
  money: 800,
};

/** "Full buy" style loadout for the non-pistol match start option. */
export const FULL_ROUND: Loadout = {
  primary: { T: TEAM_RIFLE.T, CT: TEAM_RIFLE.CT },
  secondary: { T: DEFAULT_PISTOL.T, CT: DEFAULT_PISTOL.CT },
  armor: 100,
  helmet: true,
  money: 4000,
};

export const ECONOMY = {
  maxMoney: 16000,
  winBonus: 3250,
  lossBonusBase: 1400,
  lossBonusStep: 500,
  lossBonusMax: 3400,
  plantBonus: 300,
  defuseBonus: 300,
};

export interface MatchConfig {
  /** Start with a pistol round (default pistols only, no primary weapons, pistol-round armor). */
  pistolRound: boolean;
  playerTeam: Team;
  seed: number;
  /** Bot difficulty 0..1. */
  difficulty: number;
  /** Every one of the 10 actors is a bot (menu backdrop / headless simulation). */
  allBots: boolean;
}

export const DEFAULT_MATCH: MatchConfig = {
  pistolRound: true,
  playerTeam: 'CT',
  seed: 1337,
  difficulty: 0.5,
  allBots: false,
};

export const BOT_NAMES: Record<Team, string[]> = {
  CT: ['Frost', 'Knox', 'Hawk', 'Echo', 'Rook'],
  T: ['Viper', 'Blaze', 'Ghost', 'Dune', 'Raze'],
};
