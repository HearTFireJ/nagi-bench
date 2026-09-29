// Tiny external store, consumed by React through useSyncExternalStore.
// The game loop (outside React) publishes immutable HUD snapshots at ~20 Hz and on discrete
// events; React never sits in the per-frame path.

import { useSyncExternalStore } from 'react';
import type { RoundMode } from '../sim/config.ts';
import type { Team } from '../sim/map.ts';
import type { KillfeedEntry, RoundPhase } from '../sim/types.ts';

export class Store<T> {
  private state: T;
  private listeners = new Set<() => void>();

  constructor(initial: T) {
    this.state = initial;
  }

  get = (): T => this.state;

  set(next: T): void {
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export interface HudSlot {
  slot: 'primary' | 'secondary' | 'melee';
  key: string;
  name: string;
  active: boolean;
}

export interface BuyRow {
  key: string;
  id: string;
  name: string;
  desc: string;
  price: number;
  owned: boolean;
  affordable: boolean;
  available: boolean;
}

export interface ScoreRow {
  id: number;
  name: string;
  team: Team;
  alive: boolean;
  kills: number;
  deaths: number;
  money: number;
  isYou: boolean;
  hasBomb: boolean;
}

export interface HudState {
  screen: 'menu' | 'playing' | 'matchEnd';
  paused: boolean;
  phase: RoundPhase;
  clock: string;
  round: number;
  winRounds: number;
  score: Record<Team, number>;
  alive: Record<Team, number>;
  playerTeam: Team;
  mode: RoundMode;

  dead: boolean;
  spectating: boolean;
  viewName: string;
  canTakeover: boolean;

  hp: number;
  armor: number;
  helmet: boolean;
  kit: boolean;
  money: number;

  weaponName: string;
  weaponId: string;
  ammo: number;
  reserve: number;
  magSize: number;
  reloading: boolean;
  reloadProgress: number;
  isMelee: boolean;
  slots: HudSlot[];

  scopeLevel: number;
  spreadPx: number;
  showCrosshair: boolean;

  hasBomb: boolean;
  planting: number;
  defusing: number;
  canPlant: boolean;
  canDefuse: boolean;
  bombState: string;
  bombClock: string;
  bombSite: string;
  zone: string;

  killfeed: KillfeedEntry[];
  banner: { text: string; sub: string; kind: 'info' | 'ct' | 't' } | null;
  hitSeq: number;
  hitHead: boolean;
  dmgSeq: number;
  dmgAngle: number;

  buyOpen: boolean;
  buyRows: BuyRow[];
  buyNote: string;
  showScoreboard: boolean;
  scoreboard: ScoreRow[];
  matchWinner: Team | null;
  simTime: number;
  fps: number;
  strategyHint: string;
}

export const initialHud: HudState = {
  screen: 'menu',
  paused: false,
  phase: 'idle',
  clock: '0:00',
  round: 0,
  winRounds: 8,
  score: { CT: 0, T: 0 },
  alive: { CT: 5, T: 5 },
  playerTeam: 'CT',
  mode: 'pistol',
  dead: false,
  spectating: false,
  viewName: '',
  canTakeover: false,
  hp: 100,
  armor: 0,
  helmet: false,
  kit: false,
  money: 0,
  weaponName: '',
  weaponId: '',
  ammo: 0,
  reserve: 0,
  magSize: 0,
  reloading: false,
  reloadProgress: 0,
  isMelee: false,
  slots: [],
  scopeLevel: 0,
  spreadPx: 0,
  showCrosshair: true,
  hasBomb: false,
  planting: 0,
  defusing: 0,
  canPlant: false,
  canDefuse: false,
  bombState: 'carried',
  bombClock: '',
  bombSite: '',
  zone: '',
  killfeed: [],
  banner: null,
  hitSeq: 0,
  hitHead: false,
  dmgSeq: 0,
  dmgAngle: 0,
  buyOpen: false,
  buyRows: [],
  buyNote: '',
  showScoreboard: false,
  scoreboard: [],
  matchWinner: null,
  simTime: 0,
  fps: 0,
  strategyHint: '',
};

export const hudStore = new Store<HudState>(initialHud);
