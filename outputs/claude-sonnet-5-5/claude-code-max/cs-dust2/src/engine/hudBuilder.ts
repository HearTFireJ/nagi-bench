// Turns the live simulation into a HudState snapshot, and keeps snapshot identity stable when nothing changed
// (so React components only re-render when the data they display really changed).
import { dist2D } from '../core/math';
import { activeWeaponId, activeWeaponState } from '../game/actor';
import { remainingBombTime, siteAt } from '../game/bomb';
import { ROUND } from '../game/config';
import { zoneAt } from '../game/map/build';
import type { World } from '../game/world';
import { getWeapon } from '../game/weapons';
import { shallowEqual } from '../state/store';
import type { Banner, HudState, KillEntry, Screen, ScoreRow, SlotHud } from './hudState';

export interface HudContext {
  screen: Screen;
  viewId: number;
  spectating: boolean;
  canTakeOver: boolean;
  buyOpen: boolean;
  scoreboardOpen: boolean;
  killfeed: KillEntry[];
  banner: Banner | null;
  pointerLocked: boolean;
  fallbackLook: boolean;
}

const EMPTY_ROWS: ScoreRow[] = [];

export const buildHud = (w: World, ctx: HudContext): HudState => {
  const r = w.round;
  const view = w.actors[ctx.viewId];
  const player = w.player;
  const controlled = w.controlled;
  const id = activeWeaponId(view);
  const def = getWeapon(id);
  const ws = activeWeaponState(view);
  const reloading = view.reloadEndsAt > 0;

  const slots: SlotHud[] = [];
  if (view.weapons.primary) slots.push({ slot: 'primary', id: view.weapons.primary.id, name: getWeapon(view.weapons.primary.id).name });
  if (view.weapons.secondary) slots.push({ slot: 'secondary', id: view.weapons.secondary.id, name: getWeapon(view.weapons.secondary.id).name });
  slots.push({ slot: 'melee', id: 'knife', name: getWeapon('knife').name });
  if (view.hasBomb) slots.push({ slot: 'bomb', id: 'c4', name: 'C4' });

  // Contextual prompt / progress bar for the player's own actor.
  let prompt: string | null = null;
  let useProgress = -1;
  let useLabel = '';
  if (view === controlled && view.alive && !ctx.spectating) {
    if (view.useKind === 'plant') {
      useProgress = Math.min(1, view.useProgress / ROUND.plantTime);
      useLabel = '正在安放 C4…';
    } else if (view.useKind === 'defuse') {
      useProgress = Math.min(1, view.useProgress / ROUND.defuseTime);
      useLabel = '正在拆除 C4…';
    } else if (r.phase === 'live' && view.team === 'T' && view.hasBomb && siteAt(w, view.pos.x, view.pos.z)) {
      prompt = '按住 E 安放 C4';
    } else if (view.team === 'CT' && w.bomb.status === 'planted' && dist2D(view.pos.x, view.pos.z, w.bomb.pos.x, w.bomb.pos.z) <= ROUND.defuseRange + 0.8) {
      prompt = '按住 E 拆除 C4';
    } else {
      const drop = w.drops.find((d) => dist2D(view.pos.x, view.pos.z, d.pos.x, d.pos.z) < 1.7);
      if (drop) prompt = '按 E 拾取 ' + getWeapon(drop.weapon.id).name;
      else if (r.phase === 'freeze' && !r.pistol) prompt = '按 B 打开购买菜单';
    }
  }

  const zone = zoneAt(w.level.map, view.pos.x, view.pos.z);

  let scoreboard = EMPTY_ROWS;
  if (ctx.scoreboardOpen || ctx.screen === 'matchEnd') {
    scoreboard = w.actors
      .map((a) => ({
        id: a.id,
        name: a.name,
        team: a.team,
        alive: a.alive,
        kills: a.kills,
        deaths: a.deaths,
        score: a.score,
        money: a.team === player.team ? a.money : -1,
        isPlayer: a.id === w.playerId,
        hasBomb: a.hasBomb && a.team === player.team,
      }))
      .sort((p, q) => (p.team === q.team ? q.score - p.score : p.team === 'T' ? -1 : 1));
  }

  const timeLeft = r.phase === 'roundEnd' || r.phase === 'matchEnd' ? 0 : Math.max(0, Math.ceil(r.phaseEnd - w.time));

  return {
    screen: ctx.screen,
    phase: r.phase,
    round: r.number,
    timeLeft,
    scoreT: r.score.T,
    scoreCT: r.score.CT,
    aliveT: w.aliveCount('T'),
    aliveCT: w.aliveCount('CT'),
    playerTeam: player.team,
    viewTeam: view.team,
    viewId: view.id,
    viewName: view.name,
    spectating: ctx.spectating,
    canTakeOver: ctx.canTakeOver,
    playerAlive: controlled.alive,
    hp: Math.max(0, Math.ceil(view.hp)),
    armor: Math.ceil(view.armor),
    helmet: view.helmet,
    money: view.money,
    weapon: {
      id,
      name: def.name,
      ammo: ws ? ws.ammo : 0,
      reserve: ws ? ws.reserve : 0,
      magSize: def.magSize,
      reloading,
      reloadProgress: reloading && def.reloadTime > 0 ? Math.min(1, Math.max(0, 1 - (view.reloadEndsAt - w.time) / def.reloadTime)) : 0,
      melee: def.magSize === 0,
    },
    slots,
    activeSlot: view.activeSlot,
    hasBomb: view.hasBomb,
    scopeLevel: view.scopeLevel,
    bombStatus: w.bomb.status,
    bombSite: w.bomb.site,
    bombTimeLeft: w.bomb.status === 'planted' ? Math.ceil(remainingBombTime(w)) : 0,
    prompt,
    useProgress,
    useLabel,
    zoneName: zone ? zone.name : '',
    killfeed: ctx.killfeed,
    banner: ctx.banner,
    buyOpen: ctx.buyOpen,
    scoreboardOpen: ctx.scoreboardOpen,
    pistolRound: r.pistol,
    pointerLocked: ctx.pointerLocked,
    fallbackLook: ctx.fallbackLook,
    tacticHint: '',
    matchWinner: r.phase === 'matchEnd' ? r.winner : null,
    roundReason: r.reason,
    scoreboard,
  };
};

const sameValue = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => shallowEqual(x, b[i]));
  return shallowEqual(a, b);
};

/** Reuse the previous snapshot (and its nested objects) whenever values are unchanged. */
export const stabilize = (prev: HudState, next: HudState): HudState => {
  const out: Record<string, unknown> = {};
  const p = prev as unknown as Record<string, unknown>;
  const n = next as unknown as Record<string, unknown>;
  let changed = false;
  for (const key of Object.keys(n)) {
    const nv = n[key];
    const pv = p[key];
    if (typeof nv === 'object' && nv !== null && sameValue(pv, nv)) {
      out[key] = pv;
    } else {
      out[key] = nv;
      if (!Object.is(pv, nv)) changed = true;
    }
  }
  return changed ? (out as unknown as HudState) : prev;
};
