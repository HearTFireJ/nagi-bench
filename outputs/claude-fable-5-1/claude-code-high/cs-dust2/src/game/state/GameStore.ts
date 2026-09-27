import type { Team } from '../weapons/WeaponDefs';

export type Phase = 'menu' | 'freeze' | 'live' | 'planted' | 'ended' | 'matchover';

export interface KillfeedEntry {
  id: number;
  killer: string;
  killerTeam: Team;
  victim: string;
  victimTeam: Team;
  weapon: string;
  headshot: boolean;
  time: number;
}

export interface ScoreRow {
  id: number;
  name: string;
  team: Team;
  kills: number;
  deaths: number;
  alive: boolean;
  money: number;
  isPlayer: boolean;
  hasC4: boolean;
}

export interface HudState {
  phase: Phase;
  roundNumber: number;
  roundTimeLeft: number;
  scoreCT: number;
  scoreT: number;
  pistolRound: boolean;
  /** The character currently viewed (player or spectated bot). */
  me: {
    name: string;
    team: Team;
    alive: boolean;
    health: number;
    armor: number;
    helmet: boolean;
    money: number;
    weaponName: string;
    weaponId: string;
    slot: 'primary' | 'secondary' | 'melee';
    ammo: number;
    reserve: number;
    isMelee: boolean;
    reloading: boolean;
    reloadProgress: number;
    hasC4: boolean;
    scoped: boolean;
    spreadDeg: number;
    speed: number;
    weapons: { slot: string; name: string; id: string }[];
  };
  bomb: { state: 'none' | 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded'; timeLeft: number; site: 'A' | 'B' | null };
  plantProgress: number; // 0 when not planting
  defuseProgress: number;
  interactHint: string;
  centerMessage: string;
  centerMessageUntil: number;
  killfeed: KillfeedEntry[];
  spectating: boolean;
  spectateName: string;
  canTakeover: boolean;
  buyMenuOpen: boolean;
  canBuy: boolean;
  scoreboardOpen: boolean;
  pointerLocked: boolean;
  players: ScoreRow[];
  hitMarkerTime: number;
  damageFlashTime: number;
  matchWinner: Team | null;
  fps: number;
  time: number;
}

export const initialHudState: HudState = {
  phase: 'menu',
  roundNumber: 0,
  roundTimeLeft: 0,
  scoreCT: 0,
  scoreT: 0,
  pistolRound: true,
  me: {
    name: '',
    team: 'CT',
    alive: true,
    health: 100,
    armor: 0,
    helmet: false,
    money: 800,
    weaponName: '',
    weaponId: '',
    slot: 'secondary',
    ammo: 0,
    reserve: 0,
    isMelee: false,
    reloading: false,
    reloadProgress: 0,
    hasC4: false,
    scoped: false,
    spreadDeg: 1,
    speed: 0,
    weapons: [],
  },
  bomb: { state: 'none', timeLeft: 0, site: null },
  plantProgress: 0,
  defuseProgress: 0,
  interactHint: '',
  centerMessage: '',
  centerMessageUntil: 0,
  killfeed: [],
  spectating: false,
  spectateName: '',
  canTakeover: false,
  buyMenuOpen: false,
  canBuy: false,
  scoreboardOpen: false,
  pointerLocked: false,
  players: [],
  hitMarkerTime: -10,
  damageFlashTime: -10,
  matchWinner: null,
  fps: 0,
  time: 0,
};

type Listener = () => void;

/** Tiny external store compatible with React's useSyncExternalStore. */
export class GameStore {
  private state: HudState = initialHudState;
  private listeners = new Set<Listener>();

  getSnapshot = (): HudState => this.state;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  set(next: HudState) {
    this.state = next;
    for (const l of this.listeners) l();
  }

  patch(partial: Partial<HudState>) {
    this.set({ ...this.state, ...partial });
  }
}
