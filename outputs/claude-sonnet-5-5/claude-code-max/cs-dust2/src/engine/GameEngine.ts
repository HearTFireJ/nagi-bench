// The glue between the simulation, three.js, audio, input and React.
//
//   requestAnimationFrame ──► fixed 60 Hz simulation steps (accumulator) ──► interpolated render
//                                   │                                             │
//   input (pointer lock) ──► actor.input        world events ──► audio / VFX / HUD store
//
// React never sits in the hot path: components subscribe to `hud` (throttled immutable snapshots via useSyncExternalStore)
// and to `frame$` / `ui$` for purely imperative per-frame drawing (crosshair, minimap, hit markers).
import { Emitter } from '../core/emitter';
import { DEG2RAD, dist2D, wrapAngle, yawTo } from '../core/math';
import { activeWeaponId } from '../game/actor';
import { MAX_SUBSTEPS, SIM_DT } from '../game/config';
import type { MatchConfig } from '../game/config';
import type { GameEvent } from '../game/events';
import { createLevel } from '../game/level';
import type { Level } from '../game/level';
import type { Actor, Team, WeaponSlot } from '../game/types';
import { getWeapon } from '../game/weapons';
import { World } from '../game/world';
import { Sfx } from '../audio/sfx';
import { InputController } from '../input/controls';
import { BASE_FOV, GameRenderer } from '../render/GameRenderer';
import { Store } from '../state/store';
import { buildHud, stabilize } from './hudBuilder';
import type { HudContext } from './hudBuilder';
import { INITIAL_HUD, REASON_TEXT, buyOptions } from './hudState';
import type { Banner, HudState, KillEntry, Screen } from './hudState';

export interface StartOptions {
  team: Team;
  pistolRound: boolean;
  difficulty: number;
}

export interface Settings {
  sensitivity: number;
  volume: number;
}

/** High-frequency notifications for imperative UI (never routed through React state). */
export type UiEvent =
  | { type: 'hitmarker'; headshot: boolean; killed: boolean }
  | { type: 'damage'; /** radians, 0 = from the front, positive = clockwise */ angle: number; amount: number };

const HUD_INTERVAL_MS = 66;
const TEAM_NAME: Record<Team, string> = { T: '恐怖分子', CT: '反恐精英' };

export class GameEngine {
  readonly hud = new Store<HudState>(INITIAL_HUD);
  readonly frame$ = new Emitter<number>();
  readonly ui$ = new Emitter<UiEvent>();
  readonly level: Level;
  readonly settings: Settings = { sensitivity: 1, volume: 0.7 };

  world: World;
  private readonly renderer: GameRenderer;
  private readonly audio = new Sfx();
  private readonly input: InputController;
  private screen: Screen = 'menu';
  private lastOptions: StartOptions = { team: 'CT', pistolRound: true, difficulty: 0.5 };
  private unsubWorld: (() => void) | null = null;

  private raf = 0;
  private lastTime = 0;
  /** Frame clock in ms (the rAF timestamp): drives HUD throttling, banners and kill-feed ageing. */
  private clockMs = 0;
  private acc = 0;
  private lastHudAt = 0;
  private disposed = false;

  // view / spectating
  viewId = 0;
  private spectateId = -1;
  private spectating = false;

  // transient HUD state
  private killfeed: KillEntry[] = [];
  private killSeq = 1;
  private banner: Banner | null = null;
  private bannerUntil = 0;
  private buyOpen = false;
  private scoreboardOpen = false;

  constructor(container: HTMLElement) {
    this.level = createLevel();
    this.renderer = new GameRenderer(container, this.level);
    this.input = new InputController(container, {
      onLockChange: (locked) => this.onLockChange(locked),
      onLockError: () => undefined,
      onBuyToggle: () => this.toggleBuy(),
      onBuyKey: (n) => this.buyKey(n),
      onScoreboard: (down) => {
        this.scoreboardOpen = down;
        this.publishHud(true);
      },
      onTakeOver: () => this.takeOver(),
      onSpectateNext: (dir) => this.cycleSpectate(dir),
      onAnyGesture: () => this.audio.unlock(),
    });
    this.world = new World({ allBots: true, difficulty: 0.6, pistolRound: false, seed: (Math.random() * 1e9) | 0 }, this.level);
    this.attachWorld(this.world);
    this.lastTime = performance.now();
    this.clockMs = this.lastTime;
    this.raf = requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Lifecycle / commands (called from React)
  // ------------------------------------------------------------------------------------------------------------------

  /** Start a match from the menu. Must run inside a click handler (pointer lock + audio need a user gesture). */
  startMatch(opts: StartOptions, settings?: Partial<Settings>): void {
    this.lastOptions = opts;
    if (settings) this.applySettings(settings);
    const cfg: Partial<MatchConfig> = {
      playerTeam: opts.team,
      pistolRound: opts.pistolRound,
      difficulty: opts.difficulty,
      seed: (Math.random() * 1e9) | 0,
      allBots: false,
    };
    this.attachWorld(new World(cfg, this.level));
    // Wait for the pointer lock before the simulation starts: 'paused' until onLockChange(true) flips us to 'playing'.
    // If the browser refuses the lock the pause overlay stays up and the next click retries.
    this.screen = 'paused';
    this.input.enabled = true;
    this.input.requestLock();
  }

  restartMatch(): void {
    this.startMatch(this.lastOptions);
  }

  returnToMenu(): void {
    this.input.enabled = false;
    this.input.releaseLock();
    this.screen = 'menu';
    this.buyOpen = false;
    this.input.buyOpen = false;
    this.attachWorld(new World({ allBots: true, difficulty: 0.6, pistolRound: false, seed: (Math.random() * 1e9) | 0 }, this.level));
    this.publishHud(true);
  }

  /** Resume after the pointer lock was lost (ESC / alt-tab). Needs a click. */
  resume(): void {
    this.input.requestLock();
  }

  applySettings(s: Partial<Settings>): void {
    Object.assign(this.settings, s);
    this.input.sensitivity = this.settings.sensitivity;
    this.audio.setVolume(this.settings.volume);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unsubWorld?.();
    this.input.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    this.frame$.clear();
    this.ui$.clear();
  }

  // ------------------------------------------------------------------------------------------------------------------
  // World binding
  // ------------------------------------------------------------------------------------------------------------------

  private attachWorld(world: World): void {
    this.unsubWorld?.();
    this.world = world;
    this.renderer.setWorld(world);
    this.killfeed = [];
    this.banner = null;
    this.spectateId = -1;
    this.spectating = false;
    this.buyOpen = false;
    this.input.buyOpen = false;
    this.viewId = world.controlledId;
    this.unsubWorld = world.events.on((e) => this.onWorldEvent(e));
    this.setRoundBanner();
    this.acc = 0;
  }

  private setRoundBanner(): void {
    const w = this.world;
    const r = w.round;
    const title = '第 ' + r.number + ' 回合';
    const sub = r.pistol ? '手枪局 · 全员仅持默认手枪，无主武器，不可购买' : '按 B 购买装备';
    this.banner = { kind: 'info', title, sub };
    this.bannerUntil = this.clockMs + (r.phaseEnd - w.time) * 1000;
  }

  private onWorldEvent(e: GameEvent): void {
    const w = this.world;
    if (this.screen === 'playing' || this.screen === 'paused' || this.screen === 'matchEnd') this.audio.handle(e, w, this.viewId);
    const now = this.clockMs;
    switch (e.type) {
      case 'kill': {
        const killer = w.actors[e.killerId];
        const mine = e.killerId === w.controlledId || e.victimId === w.controlledId || e.killerId === this.viewId || e.victimId === this.viewId;
        const entry: KillEntry = {
          id: this.killSeq++,
          killer: killer.name,
          victim: e.victimName,
          weapon: getWeapon(e.weapon).name,
          weaponId: e.weapon,
          headshot: e.headshot,
          killerTeam: e.killerTeam,
          victimTeam: e.victimTeam,
          mine,
          at: now,
        };
        this.killfeed = [...this.killfeed.slice(-5), entry];
        break;
      }
      case 'hit': {
        if (e.attackerId === this.viewId && w.actors[e.victimId].team !== w.actors[this.viewId].team) {
          this.ui$.emit({ type: 'hitmarker', headshot: e.zone === 'head', killed: e.killed });
        }
        if (e.victimId === this.viewId) {
          const v = w.actors[this.viewId];
          const atk = w.actors[e.attackerId];
          const rel = wrapAngle(yawTo(v.pos.x, v.pos.z, atk.pos.x, atk.pos.z) - v.yaw);
          // Yaw grows counter-clockwise; screen angles are clockwise.
          this.ui$.emit({ type: 'damage', angle: -rel, amount: e.damage });
        }
        break;
      }
      case 'roundStart':
        this.setRoundBanner();
        this.buyOpen = false;
        this.input.buyOpen = false;
        this.spectateId = -1;
        break;
      case 'freezeEnd':
        this.banner = null;
        this.buyOpen = false;
        this.input.buyOpen = false;
        break;
      case 'bombPlanted':
        this.banner = { kind: 'info', title: 'C4 已安放', sub: (e.site === 'A' ? 'A点' : 'B点') + ' · 40 秒后引爆', };
        this.bannerUntil = now + 3200;
        break;
      case 'roundEnd': {
        const mine = w.player.team === e.winner;
        this.banner = {
          kind: mine ? 'win' : 'lose',
          title: TEAM_NAME[e.winner] + '获胜',
          sub: REASON_TEXT[e.reason],
        };
        this.bannerUntil = now + 5600;
        break;
      }
      case 'matchEnd': {
        this.screen = 'matchEnd';
        this.input.enabled = false;
        this.input.releaseLock();
        break;
      }
      default:
        break;
    }
    if (e.type !== 'footstep' && e.type !== 'shot' && e.type !== 'bombBeep') this.publishHud(true);
  }

  private onLockChange(locked: boolean): void {
    if (this.screen === 'playing' && !locked) {
      this.screen = 'paused';
      this.scoreboardOpen = false;
    } else if (this.screen === 'paused' && locked) {
      this.screen = 'playing';
    }
    this.publishHud(true);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Buy menu / spectating
  // ------------------------------------------------------------------------------------------------------------------

  private toggleBuy(): void {
    const w = this.world;
    if (this.screen !== 'playing' || !w.controlled.alive) return;
    if (w.round.phase !== 'freeze' || w.round.pistol) {
      this.buyOpen = false;
    } else {
      this.buyOpen = !this.buyOpen;
    }
    this.input.buyOpen = this.buyOpen;
    this.publishHud(true);
  }

  private buyKey(n: number): void {
    const w = this.world;
    const opt = buyOptions(w.controlled.team).find((o) => o.key === n);
    if (opt) w.buy(w.controlledId, opt.item);
    this.publishHud(true);
  }

  /** Buy from the on-screen menu with the mouse (only possible when the pointer is unlocked). */
  buyItem(key: number): void {
    this.buyKey(key);
  }

  private aliveMates(): Actor[] {
    const w = this.world;
    return w.actors.filter((a) => a.alive && a.team === w.player.team && a.id !== w.controlledId);
  }

  private cycleSpectate(dir: 1 | -1): void {
    if (this.world.controlled.alive) return;
    const mates = this.aliveMates();
    if (mates.length === 0) return;
    const i = mates.findIndex((a) => a.id === this.spectateId);
    const next = mates[(i + dir + mates.length) % mates.length];
    this.spectateId = next.id;
  }

  private takeOver(): void {
    const w = this.world;
    if (this.screen !== 'playing' || w.controlled.alive || !this.spectating) return;
    if (w.takeOver(this.spectateId)) {
      this.spectateId = -1;
      this.spectating = false;
      this.viewId = w.controlledId;
      this.publishHud(true);
    }
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Frame loop
  // ------------------------------------------------------------------------------------------------------------------

  private readonly frame = (t: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (t - this.lastTime) / 1000));
    this.lastTime = t;
    this.clockMs = t;
    const w = this.world;
    const running = this.screen === 'menu' || this.screen === 'playing';

    if (this.screen === 'playing') {
      this.updateView();
      const controlled = w.controlled;
      const fovScale = Math.tan((this.renderer.currentFov * DEG2RAD) / 2) / Math.tan((BASE_FOV * DEG2RAD) / 2);
      this.input.applyTo(controlled, fovScale, this.ownedSlots(controlled));
      const click = this.input.takeSpectateClick();
      if (click !== 0 && !controlled.alive) this.cycleSpectate(click);
    } else if (this.screen === 'menu') {
      this.viewId = w.controlledId;
    }

    if (running) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < MAX_SUBSTEPS) {
        w.step(SIM_DT);
        this.acc -= SIM_DT;
        steps++;
      }
      if (steps === MAX_SUBSTEPS) this.acc = 0;
    }
    const alpha = running ? this.acc / SIM_DT : 1;

    const viewActor = w.actors[this.viewId];
    this.renderer.update({ actorId: this.viewId, mode: this.screen === 'menu' ? 'orbit' : 'first' }, alpha, dt);
    this.renderer.render();
    this.audio.setListener(viewActor.pos.x, viewActor.pos.y + 1.6, viewActor.pos.z, viewActor.yaw);

    if (this.banner && this.clockMs > this.bannerUntil && this.world.round.phase !== 'roundEnd') this.banner = null;
    if (this.clockMs - this.lastHudAt >= HUD_INTERVAL_MS) this.publishHud(false);
    this.frame$.emit(dt);
  };

  /** Decide whose eyes we use: the player's own actor, a spectated teammate, or the death cam. */
  private updateView(): void {
    const w = this.world;
    const controlled = w.controlled;
    if (controlled.alive) {
      this.viewId = controlled.id;
      this.spectating = false;
      this.spectateId = -1;
      return;
    }
    const mates = this.aliveMates();
    if (mates.length === 0) {
      this.viewId = controlled.id; // death cam on our own body
      this.spectating = false;
      return;
    }
    if (!mates.some((a) => a.id === this.spectateId)) this.spectateId = mates[0].id;
    this.viewId = this.spectateId;
    this.spectating = true;
  }

  private ownedSlots(a: Actor): WeaponSlot[] {
    const slots: WeaponSlot[] = [];
    if (a.weapons.primary) slots.push('primary');
    if (a.weapons.secondary) slots.push('secondary');
    slots.push('melee');
    if (a.hasBomb) slots.push('bomb');
    return slots;
  }

  private publishHud(force: boolean): void {
    if (this.disposed) return;
    const now = this.clockMs;
    if (!force && now - this.lastHudAt < HUD_INTERVAL_MS) return;
    this.lastHudAt = now;
    // Drop faded kill-feed entries.
    if (this.killfeed.length > 0 && now - this.killfeed[0].at > 8000) this.killfeed = this.killfeed.filter((k) => now - k.at <= 8000);
    const w = this.world;
    const ctx: HudContext = {
      screen: this.screen,
      viewId: this.viewId,
      spectating: this.spectating,
      canTakeOver: this.spectating && !w.controlled.alive && w.round.phase !== 'roundEnd' && w.round.phase !== 'matchEnd',
      buyOpen: this.buyOpen && w.round.phase === 'freeze',
      scoreboardOpen: this.scoreboardOpen,
      killfeed: this.killfeed,
      banner: this.banner,
      pointerLocked: this.input.locked,
      fallbackLook: this.input.fallback,
    };
    this.hud.set(stabilize(this.hud.get(), buildHud(w, ctx)));
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Read-only accessors for imperative UI
  // ------------------------------------------------------------------------------------------------------------------

  get currentFov(): number {
    return this.renderer.currentFov;
  }

  get viewActor(): Actor {
    return this.world.actors[this.viewId];
  }

  /** Is `enemy` visible to the viewer's team right now (for the minimap)? */
  isEnemyVisible(enemy: Actor): boolean {
    const v = this.viewActor;
    return this.world.isSpotted(v.team, enemy.id);
  }

  distanceToViewer(x: number, z: number): number {
    const v = this.viewActor;
    return dist2D(v.pos.x, v.pos.z, x, z);
  }

  get activeWeaponName(): string {
    return getWeapon(activeWeaponId(this.viewActor)).name;
  }
}
