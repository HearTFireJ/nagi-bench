// The immutable snapshot the React HUD renders. It is produced ~15x per second from the simulation and only replaces
// the previous snapshot when something actually changed (nested objects keep their identity when equal).
import type { Phase } from '../game/world';
import type { RoundEndReason } from '../game/events';
import type { BuyItem } from '../game/loadout';
import type { SiteId, Team, WeaponId, WeaponSlot } from '../game/types';
import { DEFAULT_PISTOL, TEAM_RIFLE, getWeapon } from '../game/weapons';
import { KEVLAR_HELMET_PRICE, KEVLAR_PRICE } from '../game/weapons';

export type Screen = 'menu' | 'playing' | 'paused' | 'matchEnd';

export interface KillEntry {
  id: number;
  killer: string;
  victim: string;
  weapon: string;
  weaponId: WeaponId;
  headshot: boolean;
  killerTeam: Team;
  victimTeam: Team;
  /** The viewed player was the killer or the victim. */
  mine: boolean;
  /** Wall-clock ms when it was added (the UI fades entries out). */
  at: number;
}

export interface WeaponHud {
  id: WeaponId;
  name: string;
  ammo: number;
  reserve: number;
  magSize: number;
  reloading: boolean;
  /** 0..1 while reloading. */
  reloadProgress: number;
  melee: boolean;
}

export interface SlotHud {
  slot: WeaponSlot;
  id: WeaponId;
  name: string;
}

export interface Banner {
  kind: 'win' | 'lose' | 'info';
  title: string;
  sub: string;
}

export interface ScoreRow {
  id: number;
  name: string;
  team: Team;
  alive: boolean;
  kills: number;
  deaths: number;
  score: number;
  /** Only shown for the viewer's own team. */
  money: number;
  isPlayer: boolean;
  hasBomb: boolean;
}

export interface HudState {
  screen: Screen;
  phase: Phase;
  round: number;
  /** Seconds left in the current phase (rounded up). */
  timeLeft: number;
  scoreT: number;
  scoreCT: number;
  aliveT: number;
  aliveCT: number;
  playerTeam: Team;
  viewTeam: Team;
  viewId: number;
  viewName: string;
  /** Watching a teammate because the player is dead. */
  spectating: boolean;
  canTakeOver: boolean;
  playerAlive: boolean;
  hp: number;
  armor: number;
  helmet: boolean;
  money: number;
  weapon: WeaponHud;
  slots: SlotHud[];
  activeSlot: WeaponSlot;
  hasBomb: boolean;
  scopeLevel: 0 | 1 | 2;
  bombStatus: 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded';
  bombSite: SiteId | null;
  bombTimeLeft: number;
  /** Text hint such as "Hold E to plant". */
  prompt: string | null;
  /** Progress of the plant / defuse action (0..1) or -1 when idle. */
  useProgress: number;
  useLabel: string;
  zoneName: string;
  killfeed: KillEntry[];
  banner: Banner | null;
  buyOpen: boolean;
  scoreboardOpen: boolean;
  pistolRound: boolean;
  pointerLocked: boolean;
  fallbackLook: boolean;
  tacticHint: string;
  matchWinner: Team | null;
  roundReason: RoundEndReason | null;
  /** Filled only while the scoreboard is open / at match end (keeps the snapshot cheap otherwise). */
  scoreboard: ScoreRow[];
}

export const INITIAL_HUD: HudState = {
  screen: 'menu',
  phase: 'freeze',
  round: 1,
  timeLeft: 0,
  scoreT: 0,
  scoreCT: 0,
  aliveT: 5,
  aliveCT: 5,
  playerTeam: 'CT',
  viewTeam: 'CT',
  viewId: 0,
  viewName: '',
  spectating: false,
  canTakeOver: false,
  playerAlive: true,
  hp: 100,
  armor: 0,
  helmet: false,
  money: 0,
  weapon: { id: 'usp', name: 'USP-S', ammo: 12, reserve: 24, magSize: 12, reloading: false, reloadProgress: 0, melee: false },
  slots: [],
  activeSlot: 'secondary',
  hasBomb: false,
  scopeLevel: 0,
  bombStatus: 'carried',
  bombSite: null,
  bombTimeLeft: 0,
  prompt: null,
  useProgress: -1,
  useLabel: '',
  zoneName: '',
  killfeed: [],
  banner: null,
  buyOpen: false,
  scoreboardOpen: false,
  pistolRound: false,
  pointerLocked: false,
  fallbackLook: false,
  tacticHint: '',
  matchWinner: null,
  roundReason: null,
  scoreboard: [],
};

export interface BuyOption {
  key: number;
  item: BuyItem;
  label: string;
  price: number;
}

/** Keyboard buy menu (press B in freeze time, then the number). Rifle / pistol depend on the team. */
export const buyOptions = (team: Team): BuyOption[] => [
  { key: 1, item: 'kevlar', label: '防弹衣', price: KEVLAR_PRICE },
  { key: 2, item: 'kevlar_helmet', label: '防弹衣 + 头盔', price: KEVLAR_HELMET_PRICE },
  { key: 3, item: 'deagle', label: getWeapon('deagle').name, price: getWeapon('deagle').price },
  { key: 4, item: TEAM_RIFLE[team], label: getWeapon(TEAM_RIFLE[team]).name, price: getWeapon(TEAM_RIFLE[team]).price },
  { key: 5, item: 'awp', label: getWeapon('awp').name, price: getWeapon('awp').price },
  { key: 6, item: DEFAULT_PISTOL[team], label: getWeapon(DEFAULT_PISTOL[team]).name, price: getWeapon(DEFAULT_PISTOL[team]).price },
];

export const REASON_TEXT: Record<RoundEndReason, string> = {
  elimination: '全歼敌方',
  bomb_exploded: 'C4 已引爆',
  bomb_defused: 'C4 已拆除',
  time: '回合时间耗尽',
};
