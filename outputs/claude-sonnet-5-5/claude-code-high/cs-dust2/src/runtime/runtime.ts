// GameRuntime: glues the pieces together and owns the frame loop.
//
//   requestAnimationFrame
//     -> apply human input to the human actor
//     -> fixed 60 Hz physics/AI steps of GameSim   (deterministic, renderer-agnostic)
//     -> drain SimEvents -> audio / effects / HUD counters
//     -> GameRenderer.render(sim, alpha)           (interpolated between the last two steps)
//     -> publish an immutable HudState to the store at ~20 Hz (React re-renders from that only)

import { currentSpread } from '../sim/combat.ts';
import { CFG, ROUND_MODES } from '../sim/config.ts';
import type { RoundMode } from '../sim/config.ts';
import { BUY_ITEMS, GameSim } from '../sim/game.ts';
import type { BuyItem } from '../sim/game.ts';
import { zoneName, siteAt } from '../sim/map.ts';
import type { Team } from '../sim/map.ts';
import { DEG, angleDelta, clamp, dirToYaw } from '../sim/math.ts';
import type { SimEvent } from '../sim/types.ts';
import { SLOT_ORDER, TEAM_RIFLE, WEAPONS } from '../sim/weapons.ts';
import type { WeaponSlot } from '../sim/weapons.ts';
import { BASE_FOV, GameRenderer } from '../render/renderer.ts';
import { AudioEngine } from './audio.ts';
import { hudStore, initialHud } from './store.ts';
import type { BuyRow, HudState, ScoreRow } from './store.ts';

export interface StartOptions {
  team: Team;
  mode: RoundMode;
  winRounds: number;
}

const SENSITIVITY = 0.0022;
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyR', 'KeyQ', 'KeyB', 'KeyF',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Tab', 'Escape',
]);

export class GameRuntime {
  canvas: HTMLCanvasElement | null = null;
  renderer: GameRenderer | null = null;
  readonly audio = new AudioEngine();
  sim: GameSim | null = null;

  private keys = new Set<string>();
  private mouse = [false, false, false];
  private raf = 0;
  private last = 0;
  private acc = 0;
  private fps = 60;
  private hudAcc = 0;
  private pendingReload = false;
  private locked = false;
  private wasLocked = false;
  private paused = false;
  private screen: HudState['screen'] = 'menu';
  private startOpts: StartOptions = { team: 'CT', mode: 'pistol', winRounds: CFG.WIN_ROUNDS };

  private buyOpen = false;
  private buyNote = '';
  private showScoreboard = false;
  private banner: { text: string; sub: string; kind: 'info' | 'ct' | 't'; until: number } | null = null;
  private hitSeq = 0;
  private hitHead = false;
  private dmgSeq = 0;
  private dmgAngle = 0;
  private lastMoveStep = 0;

  // ---- lifecycle ----------------------------------------------------------------------------------
  init(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas) return;
    this.canvas = canvas;
    this.renderer = new GameRenderer(canvas);
    this.onResize();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onLockChange);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    (window as unknown as { __dust2?: unknown }).__dust2 = this;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.canvas?.removeEventListener('mousedown', this.onMouseDown);
    this.renderer?.dispose();
    this.canvas = null;
    this.renderer = null;
  }

  startMatch(opts: StartOptions): void {
    this.startOpts = opts;
    this.audio.unlock();
    const sim = new GameSim({ mode: opts.mode, playerTeam: opts.team, winRounds: opts.winRounds, withHuman: true });
    this.sim = sim;
    this.renderer?.attach(sim);
    sim.startMatch();
    this.screen = 'playing';
    this.acc = 0;
    this.buyOpen = false;
    this.banner = null;
    this.paused = false;
    this.wasLocked = false;
    this.keys.clear();
    this.mouse = [false, false, false];
    this.lockPointer();
    this.publish(true);
  }

  restart(): void {
    this.startMatch(this.startOpts);
  }

  toMenu(): void {
    this.sim = null;
    this.screen = 'menu';
    this.buyOpen = false;
    this.paused = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.publish(true);
  }

  lockPointer(): void {
    const c = this.canvas;
    if (!c) return;
    try {
      const p = c.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } catch {
      /* pointer lock unavailable: mouse-look falls back to raw movement deltas */
    }
  }

  resume(): void {
    this.audio.unlock();
    this.paused = false;
    this.lockPointer();
    this.publish(true);
  }

  // ---- DOM events -------------------------------------------------------------------------------------
  private onResize = (): void => {
    const c = this.canvas;
    if (!c || !this.renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    this.renderer.resize(w, h);
  };

  private onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    if (this.locked) {
      this.wasLocked = true;
      this.paused = false;
    } else if (this.wasLocked && this.screen === 'playing' && this.sim?.phase !== 'matchEnd') {
      this.paused = true;
      this.keys.clear();
      this.mouse = [false, false, false];
    }
    this.publish(true);
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.mouse = [false, false, false];
  };

  private onContextMenu = (e: Event): void => {
    if (this.screen === 'playing') e.preventDefault();
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (this.screen !== 'playing') return;
    this.audio.unlock();
    if (this.paused) return;
    if (!this.locked && !this.wasLocked) this.lockPointer();
    this.mouse[e.button] = true;
    const sim = this.sim;
    if (sim && sim.human && !sim.human.alive) {
      if (e.button === 0) sim.cycleSpectate(1);
      else if (e.button === 2) sim.cycleSpectate(-1);
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.mouse[e.button] = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.screen !== 'playing' || this.paused || !this.sim || !this.renderer) return;
    if (!this.locked && Math.abs(e.movementX) + Math.abs(e.movementY) > 200) return;
    const h = this.sim.human;
    this.renderer.addMouseDelta(e.movementX, e.movementY);
    if (!h || !h.alive) return;
    const fovScale = Math.tan((this.renderer.currentFov * DEG) / 2) / Math.tan((BASE_FOV * DEG) / 2);
    h.yaw -= e.movementX * SENSITIVITY * fovScale;
    h.pitch = clamp(h.pitch - e.movementY * SENSITIVITY * fovScale, -1.5, 1.5);
  };

  private onWheel = (e: WheelEvent): void => {
    const sim = this.sim;
    if (this.screen !== 'playing' || this.paused || !sim || !sim.human || !sim.human.alive) return;
    const h = sim.human;
    const owned = SLOT_ORDER.filter((s) => h.weapons[s]);
    const idx = owned.indexOf(h.slot);
    const next = owned[(idx + (e.deltaY > 0 ? 1 : -1) + owned.length) % owned.length];
    sim.selectSlot(next);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.screen !== 'playing') return;
    if (e.code === 'Tab') {
      e.preventDefault();
      this.showScoreboard = true;
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    const sim = this.sim;
    if (!sim || this.paused) return;
    const h = sim.human;

    if (this.buyOpen && /^Digit[1-9]$/.test(e.code)) {
      this.tryBuy(BUY_ITEMS[Number(e.code.slice(5)) - 1]);
      return;
    }
    switch (e.code) {
      case 'KeyB':
        if (sim.phase === 'freeze' && h?.alive) {
          this.buyOpen = !this.buyOpen;
          this.audio.uiClick();
        }
        break;
      case 'Escape':
        this.buyOpen = false;
        break;
      case 'KeyR':
        this.pendingReload = true;
        break;
      case 'Digit1':
        sim.selectSlot('primary');
        break;
      case 'Digit2':
        sim.selectSlot('secondary');
        break;
      case 'Digit3':
        sim.selectSlot('melee');
        break;
      case 'KeyQ':
        sim.quickSwitch();
        break;
      case 'KeyF':
        if (sim.takeover()) this.setBanner('已接管队友', '你现在控制 ' + (sim.human?.name ?? ''), 'info', 2.5);
        break;
      default:
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    if (e.code === 'Tab') {
      this.showScoreboard = false;
      e.preventDefault();
    }
  };

  tryBuy(item: BuyItem | undefined): void {
    const sim = this.sim;
    const h = sim?.human;
    if (!sim || !h || !item) return;
    const err = sim.buy(h, item);
    this.buyNote = err ?? '购买成功';
    this.publish(true);
  }

  toggleBuy(open: boolean): void {
    this.buyOpen = open;
    this.publish(true);
  }

  private setBanner(text: string, sub: string, kind: 'info' | 'ct' | 't', secs: number): void {
    const t = this.sim ? this.sim.t : 0;
    this.banner = { text, sub, kind, until: t + secs };
  }

  // ---- frame loop -------------------------------------------------------------------------------------------
  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;

    const sim = this.sim;
    const r = this.renderer;
    if (!sim || !r || this.screen === 'menu') {
      if (r) {
        r.renderer.setClearColor(0x14161a);
        r.renderer.clear();
      }
      return;
    }

    if (!this.paused && sim.phase !== 'idle') {
      this.applyHumanInput();
      this.acc += dt;
      let steps = 0;
      while (this.acc >= CFG.TICK && steps < 6) {
        const h = sim.human;
        if (h && steps > 0) h.input.reload = false;
        sim.update(CFG.TICK);
        this.acc -= CFG.TICK;
        steps++;
        this.processEvents(sim);
      }
      if (steps === 6) this.acc = 0;
      if (steps > 0) this.pendingReload = false;
      if (this.buyOpen && sim.phase !== 'freeze') this.buyOpen = false;
    }

    const view = sim.viewActor;
    if (view) this.audio.setListener({ x: view.pos.x, z: view.pos.z, yaw: view.yaw });
    r.render(sim, this.paused ? 1 : this.acc / CFG.TICK, this.paused ? 0 : dt, view);

    this.hudAcc += dt;
    if (this.hudAcc >= 0.05) {
      this.hudAcc = 0;
      this.publish(false);
    }
  };

  private applyHumanInput(): void {
    const sim = this.sim;
    const h = sim?.human;
    if (!sim || !h) return;
    const inp = h.input;
    if (!h.alive) {
      inp.wishX = inp.wishZ = 0;
      inp.fire = inp.altFire = inp.use = inp.jump = inp.reload = inp.walk = false;
      return;
    }
    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const fx = -Math.sin(h.yaw);
    const fz = -Math.cos(h.yaw);
    const rx = Math.cos(h.yaw);
    const rz = -Math.sin(h.yaw);
    inp.wishX = fx * f + rx * s;
    inp.wishZ = fz * f + rz * s;
    inp.fire = this.mouse[0] && !this.buyOpen;
    inp.altFire = this.mouse[2] && !this.buyOpen;
    inp.use = k.has('KeyE');
    inp.jump = k.has('Space');
    inp.walk = k.has('ShiftLeft') || k.has('ShiftRight');
    inp.reload = this.pendingReload;
  }

  // ---- events -> audio / effects / HUD ----------------------------------------------------------------------------------
  private processEvents(sim: GameSim): void {
    const events = sim.drainEvents();
    if (events.length === 0) return;
    const view = sim.viewActor;
    const viewId = view ? view.id : -2;
    const humanTeam = sim.human ? sim.human.team : this.startOpts.team;
    const au = this.audio;
    const actorPos = (id: number): { x: number; z: number } => {
      const a = sim.actors[id];
      return { x: a.pos.x, z: a.pos.z };
    };
    for (const e of events) {
      this.renderer?.handleEvent(e, view);
      this.onEvent(e, sim, viewId, humanTeam, au, actorPos);
    }
  }

  private onEvent(
    e: SimEvent,
    sim: GameSim,
    viewId: number,
    humanTeam: Team,
    au: AudioEngine,
    actorPos: (id: number) => { x: number; z: number },
  ): void {
    switch (e.type) {
      case 'shot': {
        const def = WEAPONS[e.weaponId];
        au.shot(def.sound, actorPos(e.actorId), e.actorId === viewId);
        if (e.weaponId === 'knife' && e.hit === 'actor') au.knifeHit(actorPos(e.actorId));
        if (e.hit === 'world' && e.weaponId !== 'knife') au.wallImpact({ x: e.end.x, z: e.end.z });
        break;
      }
      case 'hit': {
        const victim = sim.actors[e.victimId];
        au.bodyImpact({ x: victim.pos.x, z: victim.pos.z }, e.group === 'head');
        if (e.attackerId === sim.humanId || e.attackerId === viewId) {
          this.hitSeq++;
          this.hitHead = e.group === 'head';
          au.hit(e.group === 'head');
        }
        if (e.victimId === viewId) au.hurt();
        break;
      }
      case 'damage': {
        if (e.victimId === viewId) {
          const v = sim.actors[viewId];
          const rel = angleDelta(v.yaw, dirToYaw(e.fromX - v.pos.x, e.fromZ - v.pos.z));
          this.dmgSeq++;
          this.dmgAngle = (-rel * 180) / Math.PI;
        }
        break;
      }
      case 'kill': {
        if (e.killerId === viewId || e.killerId === sim.humanId) au.kill();
        if (e.victimId === sim.humanId) au.death();
        au.bodyFall({ x: e.pos.x, z: e.pos.z });
        break;
      }
      case 'step':
        au.step({ x: e.pos.x, z: e.pos.z }, e.actorId === viewId);
        break;
      case 'jump':
        au.jump({ x: e.pos.x, z: e.pos.z }, e.actorId === viewId);
        break;
      case 'reloadStart': {
        const def = WEAPONS[e.weaponId];
        au.reload(e.weaponId, def.reloadTime, actorPos(e.actorId), e.actorId === viewId);
        break;
      }
      case 'scope':
        if (e.actorId === viewId) au.scope(e.level);
        break;
      case 'switch':
        au.draw(actorPos(e.actorId), e.actorId === viewId);
        break;
      case 'empty':
        au.dryClick(actorPos(e.actorId));
        break;
      case 'door':
        au.door({ x: sim.doors.find((d) => d.def.id === e.doorId)?.def.cx ?? 0, z: sim.doors.find((d) => d.def.id === e.doorId)?.def.cz ?? 0 }, e.opening);
        break;
      case 'bombPickup':
        au.pickup();
        break;
      case 'bombDrop':
        au.bodyFall({ x: e.pos.x, z: e.pos.z });
        break;
      case 'plantStart':
        au.plantStart({ x: e.pos.x, z: e.pos.z });
        break;
      case 'bombPlanted':
        au.planted();
        this.setBanner('C4 已安放', e.site + '点', 'info', 3);
        break;
      case 'defuseStart':
        au.defuseStart({ x: e.pos.x, z: e.pos.z });
        break;
      case 'bombDefused':
        au.defused();
        break;
      case 'bombBeep':
        au.beep({ x: e.pos.x, z: e.pos.z }, e.urgent);
        break;
      case 'bombExploded':
        au.explosion({ x: e.pos.x, z: e.pos.z });
        break;
      case 'freezeStart':
        this.setBanner('第 ' + e.round + ' 回合', sim.opts.mode === 'pistol' && e.round === 1 ? '手枪局 · 按 B 打开购买菜单' : '按 B 打开购买菜单', 'info', CFG.FREEZE_TIME - 1);
        this.buyOpen = false;
        break;
      case 'roundLive':
        au.roundStart();
        this.banner = null;
        break;
      case 'roundEnd': {
        au.roundEnd(e.winner === humanTeam);
        const text = sim.roundResult?.text ?? '';
        this.setBanner(e.winner === 'CT' ? '反恐精英获胜' : '恐怖分子获胜', text, e.winner === 'CT' ? 'ct' : 't', CFG.ROUND_END_TIME - 0.5);
        break;
      }
      case 'matchEnd':
        this.screen = 'matchEnd';
        if (document.pointerLockElement) document.exitPointerLock();
        break;
      case 'buy':
        if (e.actorId === sim.humanId) au.buy();
        break;
      default:
        break;
    }
  }

  // ---- HUD snapshot ------------------------------------------------------------------------------------------------------
  publish(force: boolean): void {
    const sim = this.sim;
    if (!sim || this.screen === 'menu') {
      hudStore.set({ ...initialHud, screen: 'menu', fps: Math.round(this.fps) });
      return;
    }
    void force;
    const human = sim.human;
    const view = sim.viewActor ?? human;
    const dead = !!human && !human.alive;
    const now = sim.t;

    // clock
    let secs = 0;
    if (sim.phase === 'freeze') secs = sim.phaseEndsAt - now;
    else if (sim.phase === 'live') secs = sim.bomb.state === 'planted' ? Math.max(0, sim.roundEndsAt - now) : sim.roundEndsAt - now;
    secs = Math.max(0, secs);
    const clock = Math.floor(secs / 60) + ':' + String(Math.floor(secs % 60)).padStart(2, '0');

    let bombClock = '';
    if (sim.bomb.state === 'planted') bombClock = Math.max(0, sim.bomb.timeLeft).toFixed(1);

    const w = view?.weapon;
    const def = w?.def;
    const slots = view
      ? SLOT_ORDER.filter((s) => view.weapons[s]).map((s: WeaponSlot) => {
          const ws = view.weapons[s];
          return { slot: s, key: s === 'primary' ? '1' : s === 'secondary' ? '2' : '3', name: ws ? ws.def.name : '', active: view.slot === s };
        })
      : [];

    let spreadPx = 0;
    if (view && def && this.renderer && this.canvas) {
      const deg = currentSpread(view);
      const fov = this.renderer.currentFov * DEG;
      spreadPx = (Math.tan(deg * DEG) / Math.tan(fov / 2)) * (this.canvas.clientHeight / 2);
    }

    const inSite = view && siteAt(view.pos.x, view.pos.z);
    const canPlant = !!view && view.alive && view.hasBomb && !!inSite && sim.phase === 'live';
    const bomb = sim.bomb;
    const canDefuse =
      !!view &&
      view.alive &&
      view.team === 'CT' &&
      bomb.state === 'planted' &&
      Math.hypot(view.pos.x - bomb.pos.x, view.pos.z - bomb.pos.z) <= CFG.DEFUSE_RANGE;
    const defuseNeed = view?.kit ? CFG.DEFUSE_KIT_TIME : CFG.DEFUSE_TIME;

    const buyRows: BuyRow[] = [];
    if (this.buyOpen && human) {
      const names: Record<BuyItem, [string, string]> = {
        deagle: ['Desert Eagle', '重型手枪 · 高伤害 · 7 发弹匣'],
        rifle: [WEAPONS[TEAM_RIFLE[human.team]].name, WEAPONS[TEAM_RIFLE[human.team]].desc],
        awp: ['AWP', WEAPONS.awp.desc],
        kevlar: ['防弹衣', '减免躯干 / 手臂伤害'],
        kevlar_helmet: ['防弹衣 + 头盔', '同时保护头部'],
        kit: ['拆弹器', '拆包时间减半（仅 CT）'],
      };
      BUY_ITEMS.forEach((id, i) => {
        const price = sim.itemPrice(human, id);
        const owned =
          id === 'kevlar' ? human.armor >= 100 : id === 'kevlar_helmet' ? human.armor >= 100 && human.helmet : id === 'kit' ? human.kit : id === 'rifle' ? human.hasWeapon(TEAM_RIFLE[human.team]) : human.hasWeapon(id);
        buyRows.push({
          key: String(i + 1),
          id,
          name: names[id][0],
          desc: names[id][1],
          price,
          owned,
          affordable: human.money >= price,
          available: id !== 'kit' || human.team === 'CT',
        });
      });
    }

    let scoreboard: ScoreRow[] = [];
    if (this.showScoreboard || this.screen === 'matchEnd') {
      scoreboard = sim.actors
        .map((a) => ({
          id: a.id,
          name: a.name,
          team: a.team,
          alive: a.alive,
          kills: a.kills,
          deaths: a.deaths,
          money: a.money,
          isYou: a.id === sim.homeId,
          hasBomb: a.hasBomb && (human ? a.team === human.team : true),
        }))
        .sort((a, b) => b.kills - a.kills);
    }

    const banner = this.banner && this.banner.until > now ? { text: this.banner.text, sub: this.banner.sub, kind: this.banner.kind } : null;
    const showCrosshair = !!view && view.alive && !(def?.scope && view.scopeLevel > 0) && !this.buyOpen;

    const next: HudState = {
      screen: this.screen,
      paused: this.paused,
      phase: sim.phase,
      clock,
      round: sim.round,
      winRounds: sim.opts.winRounds,
      score: { ...sim.score },
      alive: { CT: sim.aliveCount('CT'), T: sim.aliveCount('T') },
      playerTeam: human ? human.team : this.startOpts.team,
      mode: sim.opts.mode,
      dead,
      spectating: dead && !!view && view !== human,
      viewName: view ? view.name : '',
      canTakeover: dead && !!view && view !== human && view.alive && sim.phase !== 'freeze',
      hp: view ? Math.max(0, Math.ceil(view.hp)) : 0,
      armor: view ? view.armor : 0,
      helmet: view ? view.helmet : false,
      kit: view ? view.kit : false,
      money: human ? human.money : 0,
      weaponName: def ? def.name : '',
      weaponId: def ? def.id : '',
      ammo: w ? w.ammo : 0,
      reserve: w ? w.reserve : 0,
      magSize: def ? def.magSize : 0,
      reloading: !!view && view.reloadLeft > 0,
      reloadProgress: view && def && view.reloadLeft > 0 ? 1 - view.reloadLeft / def.reloadTime : 0,
      isMelee: def ? def.slot === 'melee' : false,
      slots,
      scopeLevel: view ? view.scopeLevel : 0,
      spreadPx,
      showCrosshair,
      hasBomb: !!view && view.hasBomb && view.alive,
      planting: view && view.alive ? clamp(view.plantProgress / CFG.PLANT_TIME, 0, 1) : 0,
      defusing: view && view.alive ? clamp(view.defuseProgress / defuseNeed, 0, 1) : 0,
      canPlant,
      canDefuse,
      bombState: bomb.state,
      bombClock,
      bombSite: bomb.site ?? '',
      zone: view ? zoneName(view.pos.x, view.pos.z) : '',
      killfeed: sim.killfeed.filter((k) => now - k.time < 7),
      banner,
      hitSeq: this.hitSeq,
      hitHead: this.hitHead,
      dmgSeq: this.dmgSeq,
      dmgAngle: this.dmgAngle,
      buyOpen: this.buyOpen,
      buyRows,
      buyNote: this.buyNote,
      showScoreboard: this.showScoreboard,
      scoreboard,
      matchWinner: sim.matchWinner,
      simTime: now,
      fps: Math.round(this.fps),
      strategyHint: '',
    };
    hudStore.set(next);
  }

  get modeLabel(): string {
    return ROUND_MODES[this.startOpts.mode].label;
  }
}

export const runtime = new GameRuntime();
