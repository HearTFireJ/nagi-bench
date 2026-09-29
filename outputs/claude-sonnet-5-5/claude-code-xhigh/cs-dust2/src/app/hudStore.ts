import type { Game, Phase } from '../core/game/game.ts';
import { defuseDuration, siteAt } from '../core/game/bomb.ts';
import { listBuyItems, canBuy } from '../core/game/economy.ts';
import type { EndReason } from '../core/game/events.ts';
import type { Team } from '../core/map/types.ts';
import { ROUND } from '../core/config.ts';
import { getWeapon } from '../core/weapons/defs.ts';
import type { WeaponSlot } from '../core/weapons/defs.ts';

export interface HudKill {
  id: number;
  killer: string;
  killerTeam: Team;
  victim: string;
  victimTeam: Team;
  weapon: string;
  headshot: boolean;
  involvesPlayer: boolean;
}

export interface HudBuyItem {
  key: number;
  id: string;
  name: string;
  price: number;
  category: string;
  owned: boolean;
  affordable: boolean;
  enabled: boolean;
}

export interface HudScoreRow {
  id: number;
  name: string;
  team: Team;
  kills: number;
  deaths: number;
  score: number;
  money: number;
  alive: boolean;
  isPlayer: boolean;
  hasBomb: boolean;
}

export interface HudState {
  started: boolean;
  paused: boolean;
  phase: Phase;
  round: number;
  winScore: number;
  timeLabel: string;
  timeLow: boolean;
  bombPlanted: boolean;
  bombLeft: number;
  bombSite: 'A' | 'B' | null;
  ct: number;
  t: number;
  scoreCT: number;
  scoreT: number;
  playerTeam: Team;
  alive: boolean;
  health: number;
  armor: number;
  helmet: boolean;
  kit: boolean;
  money: number;
  hasBomb: boolean;
  weapon: { id: string; name: string; slot: WeaponSlot; mag: number; reserve: number; ammoless: boolean; reloading: boolean; reloadPct: number; scoped: boolean };
  slots: { slot: WeaponSlot; key: number; name: string; active: boolean }[];
  killfeed: HudKill[];
  banner: { text: string; sub: string; tone: 'ct' | 't' | 'neutral' } | null;
  prompt: string | null;
  progress: { label: string; pct: number } | null;
  scope: number;
  zone: string;
  spectating: { name: string; id: number; team: Team } | null;
  canTakeover: boolean;
  buyOpen: boolean;
  buyAllowed: boolean;
  buyItems: HudBuyItem[];
  scoreboard: HudScoreRow[];
  showScoreboard: boolean;
  matchOver: { winner: Team; text: string } | null;
  hitSeq: number;
  hitHeadshot: boolean;
  hitKill: boolean;
  hurtSeq: number;
  hurtAngle: number;
  hurtDamage: number;
  bombSpotted: boolean;
}

export function emptyHud(playerTeam: Team): HudState {
  return {
    started: false,
    paused: true,
    phase: 'freeze',
    round: 1,
    winScore: 8,
    timeLabel: '0:00',
    timeLow: false,
    bombPlanted: false,
    bombLeft: 0,
    bombSite: null,
    ct: 5,
    t: 5,
    scoreCT: 0,
    scoreT: 0,
    playerTeam,
    alive: true,
    health: 100,
    armor: 0,
    helmet: false,
    kit: false,
    money: 0,
    hasBomb: false,
    weapon: { id: '', name: '', slot: 'secondary', mag: 0, reserve: 0, ammoless: false, reloading: false, reloadPct: 0, scoped: false },
    slots: [],
    killfeed: [],
    banner: null,
    prompt: null,
    progress: null,
    scope: 0,
    zone: '',
    spectating: null,
    canTakeover: false,
    buyOpen: false,
    buyAllowed: false,
    buyItems: [],
    scoreboard: [],
    showScoreboard: false,
    matchOver: null,
    hitSeq: 0,
    hitHeadshot: false,
    hitKill: false,
    hurtSeq: 0,
    hurtAngle: 0,
    hurtDamage: 0,
    bombSpotted: false,
  };
}

/** Minimal external store for React (`useSyncExternalStore`). Snapshots only change when the content does. */
export class HudStore {
  private state: HudState;
  private json = '';
  private listeners = new Set<() => void>();

  constructor(initial: HudState) {
    this.state = initial;
    this.json = JSON.stringify(initial);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): HudState => this.state;

  set(next: HudState): void {
    const j = JSON.stringify(next);
    if (j === this.json) return;
    this.json = j;
    this.state = next;
    for (const l of this.listeners) l();
  }
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const END_TEXT: Record<EndReason, string> = {
  elimination: '全歼敌方',
  bomb_exploded: 'C4 已引爆',
  bomb_defused: 'C4 已拆除',
  time: '时间耗尽',
};

export interface HudExtras {
  started: boolean;
  paused: boolean;
  buyOpen: boolean;
  showScoreboard: boolean;
  hitSeq: number;
  hitHeadshot: boolean;
  hitKill: boolean;
  hurtSeq: number;
  hurtAngle: number;
  hurtDamage: number;
  /** transient banner set by events (e.g. bomb planted) */
  eventBanner: { text: string; sub: string; tone: 'ct' | 't' | 'neutral'; until: number } | null;
}

/** Build the HUD snapshot from the sim state (pure: no side effects on the game). */
export function computeHud(game: Game, x: HudExtras): HudState {
  const human = game.human;
  const view = game.viewChar;
  const me = human;
  const team: Team = me ? me.team : game.cfg.playerTeam;
  const w = me ? me.weapon : null;
  const def = w ? w.def : getWeapon('knife');
  const inFreeze = game.phase === 'freeze';

  let timeLabel: string;
  let timeLow = false;
  if (game.phase === 'freeze') timeLabel = formatClock(game.freezeLeft);
  else if (game.phase === 'planted') {
    timeLabel = formatClock(game.bomb.timeLeft);
    timeLow = game.bomb.timeLeft < 10;
  } else {
    timeLabel = formatClock(game.roundTimeLeft);
    timeLow = game.roundTimeLeft < 15 && game.phase === 'live';
  }

  // ---- prompt / progress
  let prompt: string | null = null;
  let progress: HudState['progress'] = null;
  const b = game.bomb;
  if (me && me.alive) {
    if (me.hasBomb && game.phase === 'live') {
      const site = siteAt(game, me.pos.x, me.pos.z);
      if (me.plantProgress > 0) progress = { label: '安放 C4', pct: Math.min(1, me.plantProgress / ROUND.plantTime) };
      else if (site) prompt = `站定并按住 E 安放 C4（${site}点）`;
    }
    if (me.team === 'CT' && b.state === 'planted') {
      const d = Math.hypot(me.pos.x - b.pos.x, me.pos.z - b.pos.z);
      if (me.defuseProgress > 0) progress = { label: '拆除 C4', pct: Math.min(1, me.defuseProgress / defuseDuration(me)) };
      else if (d < ROUND.bombUseRadius + 1.5) prompt = '按住 E 拆除 C4' + (me.defuseKit ? '（拆弹器）' : '');
    }
    if (me.team === 'T' && b.state === 'dropped' && !me.hasBomb) {
      const d = Math.hypot(me.pos.x - b.pos.x, me.pos.z - b.pos.z);
      if (d < 8) prompt = '靠近 C4 以拾取';
    }
    if (!prompt && !progress && inFreeze) prompt = '按 B 打开购买菜单';
  }

  // ---- banner
  let banner: HudState['banner'] = null;
  if (game.phase === 'roundEnd' && game.winner && game.endReason) {
    banner = {
      text: game.winner === 'CT' ? '反恐精英胜利' : '恐怖分子胜利',
      sub: END_TEXT[game.endReason],
      tone: game.winner === 'CT' ? 'ct' : 't',
    };
  } else if (x.eventBanner && x.eventBanner.until > game.time) {
    banner = { text: x.eventBanner.text, sub: x.eventBanner.sub, tone: x.eventBanner.tone };
  } else if (inFreeze) {
    banner = { text: `第 ${game.roundNumber} 回合`, sub: game.roundNumber === 1 ? game.preset.label : `冻结时间 ${Math.ceil(game.freezeLeft)}`, tone: 'neutral' };
  }

  // ---- buy menu
  const buyAllowed = !!me && me.alive && (game.phase === 'freeze' || (game.phase === 'live' && game.phaseTime < ROUND.buyTime));
  const buyItems: HudBuyItem[] = [];
  if (me) {
    listBuyItems(me.team).forEach((it, i) => {
      const c = canBuy(game, me, it.id);
      buyItems.push({
        key: i + 1,
        id: it.id,
        name: it.name,
        price: it.price,
        category: it.category,
        owned: c.reason === '已持有' || c.reason.startsWith('已有'),
        affordable: me.money >= it.price,
        enabled: c.ok,
      });
    });
  }

  const slots: HudState['slots'] = [];
  if (me) {
    const list: [WeaponSlot, number][] = [
      ['primary', 1],
      ['secondary', 2],
      ['melee', 3],
    ];
    for (const [slot, key] of list) {
      const inst = me.slotWeapon(slot);
      if (inst) slots.push({ slot, key, name: inst.def.name, active: me.activeSlot === slot });
    }
  }

  const scoreboard: HudScoreRow[] = game.chars
    .map((c) => ({ id: c.id, name: c.name, team: c.team, kills: c.kills, deaths: c.deaths, score: c.score, money: c.money, alive: c.alive, isPlayer: c.id === game.playerId, hasBomb: c.hasBomb }))
    .sort((a, b2) => b2.score - a.score);

  const spectating = me && !me.alive && view && view.id !== me.id ? { name: view.name, id: view.id, team: view.team } : null;
  const reloadPct = me && me.reloading && w ? Math.min(1, Math.max(0, 1 - (me.reloadEnd - game.time) / Math.max(0.1, w.def.reloadTime))) : 0;

  return {
    started: x.started,
    paused: x.paused,
    phase: game.phase,
    round: game.roundNumber,
    winScore: game.winScore,
    timeLabel,
    timeLow,
    bombPlanted: b.state === 'planted',
    bombLeft: b.state === 'planted' ? Math.max(0, b.timeLeft) : 0,
    bombSite: b.state === 'planted' ? b.site : null,
    ct: game.aliveCount('CT'),
    t: game.aliveCount('T'),
    scoreCT: game.score.CT,
    scoreT: game.score.T,
    playerTeam: team,
    alive: !!me && me.alive,
    health: me ? Math.max(0, Math.round(me.health)) : 0,
    armor: me ? Math.round(me.armor) : 0,
    helmet: !!me && me.helmet,
    kit: !!me && me.defuseKit,
    money: me ? me.money : 0,
    hasBomb: !!me && me.hasBomb,
    weapon: {
      id: def.id,
      name: def.name,
      slot: def.slot,
      mag: w ? w.mag : 0,
      reserve: w ? w.reserve : 0,
      ammoless: def.mag <= 0,
      reloading: !!me && me.reloading,
      reloadPct,
      scoped: !!me && me.scope > 0,
    },
    slots,
    killfeed: game.killfeed
      .filter((k) => game.time - k.time < 6)
      .map((k) => ({ id: k.id, killer: k.killer, killerTeam: k.killerTeam, victim: k.victim, victimTeam: k.victimTeam, weapon: k.weapon === 'c4' ? 'C4' : getWeapon(k.weapon).name, headshot: k.headshot, involvesPlayer: k.involvesPlayer })),
    banner,
    prompt,
    progress,
    scope: view && view.alive ? view.scope : 0,
    zone: view ? (game.zoneOf(view.pos.x, view.pos.z)?.name ?? '') : '',
    spectating,
    canTakeover: !!spectating,
    buyOpen: x.buyOpen && buyAllowed,
    buyAllowed,
    buyItems,
    scoreboard,
    showScoreboard: x.showScoreboard || game.phase === 'matchEnd',
    matchOver: game.phase === 'matchEnd' && game.matchWinner ? { winner: game.matchWinner, text: game.matchWinner === team ? '胜利！' : '失败' } : null,
    hitSeq: x.hitSeq,
    hitHeadshot: x.hitHeadshot,
    hitKill: x.hitKill,
    hurtSeq: x.hurtSeq,
    hurtAngle: x.hurtAngle,
    hurtDamage: x.hurtDamage,
    bombSpotted: b.state === 'dropped' || b.state === 'planted',
  };
}
