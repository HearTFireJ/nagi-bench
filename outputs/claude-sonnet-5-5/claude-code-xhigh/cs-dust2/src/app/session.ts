import { AudioEngine } from '../audio/audioEngine.ts';
import { Game } from '../core/game/game.ts';
import type { GameConfig } from '../core/game/game.ts';
import { currentSpread } from '../core/game/combat.ts';
import { listBuyItems } from '../core/game/economy.ts';
import type { GameEvent } from '../core/game/events.ts';
import { wrapPi } from '../core/math.ts';
import { BASE_FOV, GameRenderer } from '../render/gameRenderer.ts';
import { MinimapDrawer } from '../ui/minimapDraw.ts';
import { HudStore, computeHud, emptyHud } from './hudStore.ts';
import type { HudExtras } from './hudStore.ts';
import { InputController } from './input.ts';

/** Per-frame values for imperative (non-React) UI: crosshair, minimap, scope, screen flashes. */
export interface FrameInfo {
  spreadPx: number;
  fov: number;
  moving: boolean;
  whiteout: number;
  time: number;
}

/**
 * Glue between the three layers that must stay in sync:
 *   sim (fixed 60 Hz tick)  ->  renderer (interpolated, every animation frame)  ->  React HUD
 * The HUD only receives a throttled immutable snapshot (10 Hz, deduplicated); anything that
 * needs to update every frame (crosshair gap, minimap) is driven through `onFrame` callbacks
 * that touch the DOM / canvas directly, so React never re-renders at 60 Hz.
 */
export class GameSession {
  readonly game: Game;
  readonly store: HudStore;
  readonly minimap: MinimapDrawer;
  readonly audio = new AudioEngine();
  readonly input: InputController;
  readonly frameInfo: FrameInfo = { spreadPx: 8, fov: BASE_FOV, moving: false, whiteout: 0, time: 0 };
  private renderer: GameRenderer;
  private canvas: HTMLCanvasElement;
  private raf = 0;
  private last = 0;
  private paused = true;
  private started = false;
  private buyOpen = false;
  private showScoreboard = false;
  private hudTimer = 0;
  private extras: HudExtras;
  private frameCbs = new Set<(f: FrameInfo) => void>();
  private disposed = false;
  private resizeObs: ResizeObserver | null = null;
  private onResizeWin = (): void => this.resize();

  constructor(canvas: HTMLCanvasElement, cfg: Partial<GameConfig>) {
    this.canvas = canvas;
    this.game = new Game(cfg);
    this.renderer = new GameRenderer(canvas, this.game);
    this.minimap = new MinimapDrawer(this.game, 220);
    this.store = new HudStore(emptyHud(this.game.cfg.playerTeam));
    this.extras = {
      started: false,
      paused: true,
      buyOpen: false,
      showScoreboard: false,
      hitSeq: 0,
      hitHeadshot: false,
      hitKill: false,
      hurtSeq: 0,
      hurtAngle: 0,
      hurtDamage: 0,
      eventBanner: null,
    };
    this.input = new InputController(canvas, this.game, {
      onLockChange: (locked) => this.onLockChange(locked),
      onGesture: () => this.audio.unlock(),
      onToggleBuy: () => this.toggleBuy(),
      onBuyKey: (n) => this.buyKey(n),
      isBuyOpen: () => this.buyOpen,
      onScoreboard: (show) => {
        this.showScoreboard = show;
        this.pushHud();
      },
      onMute: () => this.audio.setMuted(!this.audio.muted),
      sensitivityScale: () => Math.tan((this.frameInfo.fov * Math.PI) / 360) / Math.tan((BASE_FOV * Math.PI) / 360),
      canLock: () => !this.disposed && this.game.phase !== 'matchEnd',
    });
  }

  start(): void {
    this.input.attach();
    this.resize();
    window.addEventListener('resize', this.onResizeWin);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(this.canvas);
    }
    this.last = performance.now();
    this.pushHud();
    this.raf = requestAnimationFrame(this.frame);
    // handy for poking at the sim from the browser console
    Object.assign(window, { __dust2: this });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResizeWin);
    this.resizeObs?.disconnect();
    this.input.detach();
    this.audio.dispose();
    this.renderer.dispose();
    this.frameCbs.clear();
  }

  onFrame(cb: (f: FrameInfo) => void): () => void {
    this.frameCbs.add(cb);
    return () => {
      this.frameCbs.delete(cb);
    };
  }

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.resize(w, h);
  }

  // ------------------------------------------------------------------ UI actions

  /** Click-to-play: lock the pointer, which un-pauses the game. */
  resume(): void {
    this.audio.unlock();
    this.input.requestLock();
  }

  private onLockChange(locked: boolean): void {
    this.paused = !locked;
    if (locked) this.started = true;
    if (!locked) this.buyOpen = false;
    this.pushHud();
  }

  private toggleBuy(): void {
    const me = this.game.human;
    if (!me || !me.alive) return;
    const allowed = this.game.phase === 'freeze' || (this.game.phase === 'live' && this.game.phaseTime < 15);
    this.buyOpen = allowed ? !this.buyOpen : false;
    this.pushHud();
  }

  private buyKey(n: number): boolean {
    const me = this.game.human;
    if (!me) return false;
    const item = listBuyItems(me.team)[n - 1];
    if (!item) return false;
    this.game.buy(item.id);
    this.pushHud();
    return true;
  }

  buy(itemId: string): void {
    this.game.buy(itemId);
    this.pushHud();
  }

  setBuyOpen(v: boolean): void {
    this.buyOpen = v;
    this.pushHud();
  }

  takeover(): void {
    this.game.takeover(this.game.spectateId);
    this.pushHud();
  }

  cycleSpectate(dir: 1 | -1): void {
    this.game.cycleSpectate(dir);
    this.pushHud();
  }

  get isPaused(): boolean {
    return this.paused;
  }

  // ------------------------------------------------------------------ main loop

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const g = this.game;

    let events: GameEvent[] = [];
    if (!this.paused) {
      this.input.applyTo(g, true);
      const ticks = g.advance(dt);
      this.input.afterAdvance(ticks);
      events = g.drainEvents();
      if (events.length) this.processEvents(events);
      this.renderer.handleEvents(events);
    } else {
      this.input.applyTo(g, false);
    }

    this.renderer.render(this.paused ? 0 : dt, g.alpha);

    // audio (listener = camera)
    const v = this.renderer.viewInfo;
    this.audio.setListener(v.x, v.y, v.z, v.yaw, v.pitch);
    if (events.length) this.audio.handle(events, g, { x: v.x, y: v.y, z: v.z });

    // per-frame info for the imperative UI
    const fi = this.frameInfo;
    const me = g.viewChar;
    fi.fov = v.fov;
    fi.time = g.time;
    fi.whiteout = this.renderer.whiteout;
    if (me && me.alive) {
      const deg = currentSpread(me, me.weapon);
      fi.spreadPx = (deg * this.canvas.clientHeight) / Math.max(10, v.fov);
      fi.moving = me.speed2D > 1;
    }
    for (const cb of this.frameCbs) cb(fi);

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.pushHud();
    }
  };

  private processEvents(events: GameEvent[]): void {
    const g = this.game;
    const human = g.human;
    const x = this.extras;
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          if (human && e.attacker === human.id) {
            x.hitSeq++;
            x.hitHeadshot = e.headshot;
            x.hitKill = e.killed;
          }
          if (human && e.victim === human.id) {
            x.hurtSeq++;
            x.hurtDamage = e.damage;
            x.hurtAngle = wrapPi(human.lastHurtDir - human.yaw);
          }
          break;
        }
        case 'planted':
          x.eventBanner = { text: 'C4 已安放', sub: `${e.site}点 · 40 秒后爆炸`, tone: 't', until: g.time + 4 };
          this.buyOpen = false;
          break;
        case 'defused':
          x.eventBanner = { text: 'C4 已拆除', sub: '', tone: 'ct', until: g.time + 3 };
          break;
        case 'takeover':
          x.eventBanner = { text: '已接管队友', sub: g.chars[e.to].name, tone: 'neutral', until: g.time + 2 };
          break;
        case 'roundStart':
          this.buyOpen = false;
          x.eventBanner = null;
          break;
        case 'freezeEnd':
          this.buyOpen = false;
          break;
        default:
          break;
      }
    }
    this.pushHud();
  }

  private pushHud(): void {
    const x = this.extras;
    x.started = this.started;
    x.paused = this.paused;
    x.buyOpen = this.buyOpen;
    x.showScoreboard = this.showScoreboard;
    this.store.set(computeHud(this.game, x));
  }
}
