import * as THREE from 'three';
import { BotBrain, type BotContext, type ShotEvent, type TeamPlan } from './ai/BotBrain';
import { AudioEngine } from './audio/AudioEngine';
import { Input } from './core/Input';
import { clamp, DEG, dirFromYawPitch, forwardFromYaw, pick, randRange, rightFromYaw, vdistXZ, yawToward, type Vec3 } from './core/vec';
import { C4, C4_EXPLOSION_RADIUS, C4_MAX_DAMAGE, DEFUSE_TIME, PLANT_TIME } from './entities/C4';
import { Character, EYE_HEIGHT } from './entities/Character';
import { CT_HOLD_SPOTS, CT_SPAWNS, T_SPAWNS } from './map/MapData';
import { getMapGrid, type MapGrid } from './map/MapGrid';
import { NavGrid } from './map/NavGrid';
import { JUMP_VELOCITY, World, type HitboxName } from './physics/World';
import { Effects } from './render/Effects';
import { buildMapScene, type BuiltMap } from './render/MapBuilder';
import { ViewModel } from './render/ViewModel';
import { GameStore, type HudState, type KillfeedEntry, type Phase, type ScoreRow } from './state/GameStore';
import type { MinimapData, MinimapEntity } from './state/MinimapData';
import { computeDamage } from './weapons/Damage';
import { BUY_ITEMS, DEFAULT_PISTOL, TEAM_RIFLE, WEAPONS, type Team, type WeaponSlot } from './weapons/WeaponDefs';
import type { WeaponInstance } from './weapons/WeaponInstance';

const FIXED_DT = 1 / 60;
const FREEZE_TIME = 6;
const ROUND_TIME = 115;
const ROUND_END_TIME = 5;
const BUY_TIME = 12;
const ROUNDS_TO_WIN = 13;
const BASE_FOV = 75;
const MOUSE_SENS = 0.0022;

const CT_NAMES = ['Seal', 'GIGN', 'SAS', 'GSG-9', 'FBI', 'SWAT'];
const T_NAMES = ['Phoenix', 'Elite', 'Leet', 'Balkan', 'Pirate', 'Anarch'];

interface PendingSound {
  time: number;
  name: 'reload_end';
  pos: Vec3;
  ch: Character;
}

/**
 * The game engine: owns the three.js scene, the fixed-step simulation, all entities,
 * round logic and the bridge to the React HUD (GameStore).
 */
export class Game implements BotContext {
  readonly store = new GameStore();
  readonly map: MapGrid = getMapGrid();
  readonly world: World;
  readonly nav: NavGrid;
  readonly characters: Character[] = [];
  readonly c4 = new C4();
  readonly plans: Record<Team, TeamPlan> = {
    CT: { site: 'A', enemySite: null, enemySiteTime: -100 },
    T: { site: 'A', enemySite: null, enemySiteTime: -100 },
  };
  recentShots: ShotEvent[] = [];
  now = 0;
  phase: Phase = 'menu';
  roundElapsed = 0;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 400);
  private viewModel: ViewModel | null = null;
  private readonly effects = new Effects();
  private readonly input = new Input();
  private readonly audio = new AudioEngine();
  private builtMap: BuiltMap | null = null;
  private readonly sun: THREE.DirectionalLight;

  private player: Character | null = null;
  private viewTarget: Character | null = null;
  private brains = new Map<number, BotBrain>();
  private nextId = 1;

  private roundNumber = 0;
  private scoreCT = 0;
  private scoreT = 0;
  private lossStreak: Record<Team, number> = { CT: 0, T: 0 };
  private phaseEndsAt = 0;
  private liveStart = 0;
  private roundWinner: Team | null = null;
  private matchWinner: Team | null = null;
  private pistolRound = true;
  private playerTeam: Team = 'CT';

  private planter: Character | null = null;
  private plantProgress = 0;
  private defuser: Character | null = null;
  private defuseProgress = 0;
  private nextDefuseSound = 0;
  private deathCamUntil = 0;

  private killfeed: KillfeedEntry[] = [];
  private killfeedId = 1;
  private centerMessage = '';
  private centerMessageUntil = 0;
  private hitMarkerTime = -10;
  private damageFlashTime = -10;
  private buyMenuOpen = false;
  private hudDirty = true;
  private lastHudPublish = -1;
  private pendingSounds: PendingSound[] = [];
  private currentFov = BASE_FOV;
  private lastMouse = { dx: 0, dy: 0 };
  private roundVisitedOnce = false;

  private raf = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private fpsCounter = { frames: 0, last: 0, fps: 0 };
  private disposed = false;
  private readonly tmpV = new THREE.Vector3();

  constructor(private readonly container: HTMLElement) {
    this.world = new World(this.map);
    this.nav = new NavGrid(this.map);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    // Environment
    this.scene.background = this.makeSkyTexture();
    this.scene.fog = new THREE.FogExp2(0xcfc2a5, 0.0032);
    const hemi = new THREE.HemisphereLight(0xdfe9f3, 0x8a7a5a, 0.85);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 1.7);
    this.sun.position.set(110, 120, 40);
    this.sun.target.position.set(64, 0, 64);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -95;
    sc.right = 95;
    sc.top = 95;
    sc.bottom = -95;
    sc.near = 20;
    sc.far = 320;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.builtMap = buildMapScene(this.map);
    this.scene.add(this.builtMap.group);
    this.scene.add(this.effects.group);
    this.scene.add(this.c4.mesh);

    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(64, 30, 64);

    this.input.attach(this.renderer.domElement);
    this.input.onGesture = () => this.audio.resume();
    this.input.onLockChange = (locked) => {
      this.hudDirty = true;
      if (!locked) this.buyMenuOpen = false;
    };

    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.publishHud(true);
  }

  // ---------------------------------------------------------------------------
  // Public API used by React
  // ---------------------------------------------------------------------------

  /** Start a new match with the human on the given team. */
  start(team: Team) {
    this.audio.resume();
    this.playerTeam = team;
    this.setupMatch();
    this.input.requestLock();
  }

  restartMatch() {
    this.start(this.playerTeam);
  }

  resumePointer() {
    this.audio.resume();
    this.input.requestLock();
  }

  setBuyMenu(open: boolean) {
    if (open && !this.canBuy()) return;
    this.buyMenuOpen = open;
    this.hudDirty = true;
  }

  buy(itemId: string) {
    const p = this.player;
    if (!p || !p.alive || !this.canBuy()) return;
    const item = BUY_ITEMS.find((i) => i.id === itemId);
    if (!item) return;
    if (item.team && item.team !== p.team) return;
    if (p.money < item.price) {
      this.showMessage('Not enough money', 1.2);
      return;
    }
    if (item.kind === 'armor') {
      if (item.id === 'kevlar' && p.armor >= 100) return;
      if (item.id === 'kevlar_helmet' && p.armor >= 100 && p.helmet) return;
      p.armor = 100;
      if (item.id === 'kevlar_helmet') p.helmet = true;
    } else {
      if (p.hasWeapon(item.id)) return;
      p.giveWeapon(item.id, this.now);
    }
    p.money -= item.price;
    this.audio.play('buy');
    this.hudDirty = true;
  }

  /** Take control of the currently spectated bot teammate. */
  takeover() {
    const p = this.player;
    const v = this.viewTarget;
    if (!p || !v || v === p || !v.alive || v.team !== p.team) return;
    // swap controllers & names
    const oldBrain = this.brains.get(v.id);
    if (oldBrain) this.brains.delete(v.id);
    v.controller = 'player';
    p.controller = 'bot';
    const pName = p.name;
    p.name = v.name;
    v.name = pName;
    p.model.setName(p.name);
    v.model.setName(v.name);
    const brain = new BotBrain(p, this);
    brain.assignedSpot = oldBrain?.assignedSpot ?? null;
    brain.reset(this.now);
    this.brains.set(p.id, brain);
    v.clearIntent();
    v.prevFire = true;
    this.player = v;
    this.viewTarget = v;
    this.showMessage(`You took over ${v.name === pName ? 'a teammate' : v.name}`, 2);
    this.hudDirty = true;
  }

  spectateNext(dir: 1 | -1) {
    const p = this.player;
    if (!p || p.alive) return;
    const mates = this.characters.filter((c) => c.team === p.team && c.alive && c !== p);
    if (mates.length === 0) return;
    const idx = this.viewTarget ? mates.indexOf(this.viewTarget) : -1;
    const next = mates[(idx + dir + mates.length) % mates.length];
    this.viewTarget = next;
    this.hudDirty = true;
  }

  getMinimapData(): MinimapData {
    const v = this.viewTarget ?? this.player;
    const team: Team = v ? v.team : this.playerTeam;
    const toEntity = (c: Character): MinimapEntity => ({ x: c.pos.x, z: c.pos.z, yaw: c.yaw, alive: c.alive, name: c.name, isViewer: c === v });
    const allies = this.characters.filter((c) => c.team === team && c !== v).map(toEntity);
    const enemies: MinimapData['enemies'] = [];
    const mates = this.characters.filter((c) => c.team === team && c.alive);
    for (const e of this.characters) {
      if (e.team === team || !e.alive) continue;
      let seen = false;
      for (const m of mates) {
        if (vdistXZ(m.pos, e.pos) > 90) continue;
        const ang = Math.abs(((yawToward(m.pos, e.pos) - m.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (ang > 80 * DEG) continue;
        if (this.world.lineOfSight(m.eye, { x: e.pos.x, y: e.pos.y + 1.3, z: e.pos.z })) {
          seen = true;
          break;
        }
      }
      if (seen) enemies.push({ x: e.pos.x, z: e.pos.z, fresh: true });
    }
    let c4: MinimapData['c4'] = null;
    if (this.phase !== 'menu') {
      if (this.c4.state === 'carried') {
        const carrier = this.characters.find((c) => c.id === this.c4.carrierId);
        if (carrier && (carrier.team === team || enemies.some((e) => e.x === carrier.pos.x && e.z === carrier.pos.z))) {
          c4 = { x: carrier.pos.x, z: carrier.pos.z, state: 'carried', carriedByViewerTeam: carrier.team === team };
        }
      } else if (this.c4.state !== 'exploded') {
        c4 = { x: this.c4.pos.x, z: this.c4.pos.z, state: this.c4.state, carriedByViewerTeam: false };
      }
    }
    return { team, viewer: v ? toEntity(v) : null, allies, enemies, c4, time: this.now };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.input.detach();
    for (const c of this.characters) c.model.dispose();
    this.builtMap?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) this.container.removeChild(this.renderer.domElement);
  }

  // ---------------------------------------------------------------------------
  // Match / round setup
  // ---------------------------------------------------------------------------

  private setupMatch() {
    // Remove previous characters
    for (const c of this.characters) {
      this.scene.remove(c.model.group);
      c.model.dispose();
    }
    this.characters.length = 0;
    this.brains.clear();
    this.roundNumber = 0;
    this.scoreCT = 0;
    this.scoreT = 0;
    this.lossStreak = { CT: 0, T: 0 };
    this.matchWinner = null;
    this.killfeed = [];
    this.effects.clear();

    const ctNames = [...CT_NAMES].sort(() => Math.random() - 0.5);
    const tNames = [...T_NAMES].sort(() => Math.random() - 0.5);
    for (const team of ['CT', 'T'] as Team[]) {
      const names = team === 'CT' ? ctNames : tNames;
      for (let i = 0; i < 5; i++) {
        const isPlayer = team === this.playerTeam && i === 0;
        const ch = new Character(this.nextId++, isPlayer ? 'You' : names[i], team, isPlayer ? 'player' : 'bot');
        ch.giveWeapon(DEFAULT_PISTOL[team], 0, true);
        this.characters.push(ch);
        this.scene.add(ch.model.group);
        if (isPlayer) this.player = ch;
        else this.brains.set(ch.id, new BotBrain(ch, this));
      }
    }
    this.viewTarget = this.player;
    this.viewModel = new ViewModel(this.playerTeam);
    this.viewModel.resize(this.camera.aspect);
    this.beginRound();
  }

  private beginRound() {
    this.roundNumber++;
    this.pistolRound = this.roundNumber === 1;
    this.phase = 'freeze';
    this.phaseEndsAt = this.now + FREEZE_TIME;
    this.roundWinner = null;
    this.planter = null;
    this.defuser = null;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.buyMenuOpen = false;
    this.recentShots = [];
    this.effects.clear();
    this.c4.reset();
    this.plans.T = { site: Math.random() < 0.5 ? 'A' : 'B', enemySite: null, enemySiteTime: -100 };
    this.plans.CT = { site: 'A', enemySite: null, enemySiteTime: -100 };

    // Spawn everyone
    const tSpawns = [...T_SPAWNS].sort(() => Math.random() - 0.5);
    const ctSpawns = [...CT_SPAWNS].sort(() => Math.random() - 0.5);
    let ti = 0;
    let ci = 0;
    for (const ch of this.characters) {
      const cell = ch.team === 'T' ? tSpawns[ti++] : ctSpawns[ci++];
      const p = this.map.cellCenter(cell.x, cell.z);
      const yaw = ch.team === 'T' ? 0 : Math.PI; // T look north (-z), CT look south
      const survived = ch.alive && this.roundNumber > 1;
      ch.respawn(p, yaw, this.now);
      this.applyRoundLoadout(ch, survived);
    }
    // Assign CT hold spots: 2 A, 2 B, 1 mid
    const order: ('A' | 'B' | 'MID')[] = ['A', 'B', 'A', 'B', 'MID'];
    const ctBots = this.characters.filter((c) => c.team === 'CT');
    ctBots.forEach((c, i) => {
      const b = this.brains.get(c.id);
      if (!b) return;
      const site = order[i % order.length];
      const spots = CT_HOLD_SPOTS.filter((s) => s.site === site);
      b.assignedSpot = spots[Math.floor(i / 2) % spots.length];
    });
    for (const b of this.brains.values()) b.reset(this.now);

    // Give the bomb to a random T (the player has a fair chance too)
    const ts = this.characters.filter((c) => c.team === 'T');
    const carrier = pick(ts);
    carrier.hasC4 = true;
    this.c4.giveTo(carrier.id);

    if (this.player) this.viewTarget = this.player;
    this.showMessage(this.pistolRound ? 'Pistol round — buy with [B]' : `Round ${this.roundNumber}`, 3);
    this.audio.play('round_start');
    this.hudDirty = true;
    this.roundVisitedOnce = true;
  }

  /** Pistol round: default pistol only, no armor. Otherwise survivors keep gear; bots buy. */
  private applyRoundLoadout(ch: Character, survived: boolean) {
    if (this.pistolRound) {
      ch.removeWeapon('primary');
      ch.giveWeapon(DEFAULT_PISTOL[ch.team], this.now);
      ch.armor = 0;
      ch.helmet = false;
      ch.money = 800;
      if (ch.controller === 'bot' && Math.random() < 0.5 && ch.money >= 650) {
        ch.armor = 100;
        ch.money -= 650;
      }
    } else {
      if (!survived) {
        ch.removeWeapon('primary');
        if (!ch.weapons.has('secondary')) ch.giveWeapon(DEFAULT_PISTOL[ch.team], this.now);
        ch.armor = 0;
        ch.helmet = false;
      }
      if (ch.controller === 'bot') this.botBuy(ch);
    }
    ch.activeSlot = ch.bestSlot();
    ch.switchTime = this.now - 1;
    ch.model.setWeapon(ch.activeWeapon.def.model);
  }

  private botBuy(ch: Character) {
    const rifle = TEAM_RIFLE[ch.team];
    const hasPrimary = ch.weapons.has('primary');
    if (!hasPrimary) {
      if (ch.money >= WEAPONS.awp.price + 1000 && Math.random() < 0.25) {
        ch.giveWeapon('awp', this.now);
        ch.money -= WEAPONS.awp.price;
      } else if (ch.money >= WEAPONS[rifle].price + 650) {
        ch.giveWeapon(rifle, this.now);
        ch.money -= WEAPONS[rifle].price;
      } else if (ch.money >= 1700 && Math.random() < 0.5) {
        ch.giveWeapon('deagle', this.now);
        ch.money -= WEAPONS.deagle.price;
      }
    }
    if (ch.armor < 100) {
      if (ch.money >= 1000) {
        ch.armor = 100;
        ch.helmet = true;
        ch.money -= 1000;
      } else if (ch.money >= 650) {
        ch.armor = 100;
        ch.money -= 650;
      }
    }
  }

  private canBuy(): boolean {
    if (!this.player || !this.player.alive) return false;
    if (this.phase === 'freeze') return true;
    return this.phase === 'live' && this.roundElapsed < BUY_TIME && !!this.map.cellAtWorld(this.player.pos.x, this.player.pos.z)?.spawn;
  }

  private endRound(winner: Team, reason: string) {
    if (this.phase === 'ended' || this.phase === 'matchover') return;
    this.phase = 'ended';
    this.roundWinner = winner;
    this.phaseEndsAt = this.now + ROUND_END_TIME;
    if (winner === 'CT') this.scoreCT++;
    else this.scoreT++;
    this.planter = null;
    this.defuser = null;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    // Money
    const loser: Team = winner === 'CT' ? 'T' : 'CT';
    this.lossStreak[winner] = 0;
    this.lossStreak[loser] = Math.min(4, this.lossStreak[loser] + 1);
    for (const ch of this.characters) {
      if (ch.team === winner) ch.money += 3250;
      else ch.money += 1400 + (this.lossStreak[loser] - 1) * 500;
      if (ch.team === 'T' && (this.c4.state === 'planted' || this.c4.state === 'exploded' || this.c4.state === 'defused')) ch.money += 800;
      ch.money = Math.min(16000, ch.money);
    }
    const playerWon = this.player?.team === winner;
    this.showMessage(`${winner === 'CT' ? 'Counter-Terrorists' : 'Terrorists'} win — ${reason}`, ROUND_END_TIME);
    this.audio.play(playerWon ? 'round_win' : 'round_lose');
    if (this.scoreCT >= ROUNDS_TO_WIN || this.scoreT >= ROUNDS_TO_WIN) {
      this.matchWinner = winner;
      this.phase = 'matchover';
      this.phaseEndsAt = Infinity;
      this.input.releaseLock();
    }
    this.hudDirty = true;
  }

  private showMessage(msg: string, dur: number) {
    this.centerMessage = msg;
    this.centerMessageUntil = this.now + dur;
    this.hudDirty = true;
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  private frame = (t: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dtReal = Math.min(0.25, (t - this.lastFrame) / 1000);
    this.lastFrame = t;
    this.accumulator += dtReal;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 6) {
      this.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === 6) this.accumulator = 0;
    this.render(dtReal);
    // fps
    this.fpsCounter.frames++;
    if (t - this.fpsCounter.last > 1000) {
      this.fpsCounter.fps = this.fpsCounter.frames;
      this.fpsCounter.frames = 0;
      this.fpsCounter.last = t;
    }
    if (this.hudDirty || this.now - this.lastHudPublish > 0.1) this.publishHud(false);
  };

  private step(dt: number) {
    this.now += dt;
    if (this.phase === 'menu') {
      this.processMenuInput();
      return;
    }
    this.roundElapsed = this.phase === 'live' || this.phase === 'planted' ? this.now - this.liveStart : 0;

    // Phase transitions
    if (this.phase === 'freeze' && this.now >= this.phaseEndsAt) {
      this.phase = 'live';
      this.liveStart = this.now;
      this.phaseEndsAt = this.now + ROUND_TIME;
      this.showMessage('GO GO GO', 1.5);
    } else if (this.phase === 'live' && this.now >= this.phaseEndsAt) {
      this.endRound('CT', 'Time ran out');
    } else if (this.phase === 'ended' && this.now >= this.phaseEndsAt) {
      this.beginRound();
    }

    this.processPlayerInput();
    for (const b of this.brains.values()) b.update(dt);

    const bodies: Character[] = [];
    for (const ch of this.characters) {
      if (!ch.alive) continue;
      this.applyMovement(ch, dt);
      this.handleWeapon(ch, dt);
      this.handleInteract(ch, dt);
      bodies.push(ch);
    }
    this.world.separateBodies(bodies);

    this.updateC4();
    this.checkWinConditions();
    this.flushPendingSounds();
    this.recentShots = this.recentShots.filter((s) => this.now - s.time < 2);

    // Spectating
    const p = this.player;
    if (p && !p.alive && this.now > this.deathCamUntil) {
      if (!this.viewTarget || !this.viewTarget.alive || this.viewTarget === p) {
        const mates = this.characters.filter((c) => c.team === p.team && c.alive);
        if (mates.length) {
          this.viewTarget = mates[0];
          this.hudDirty = true;
        }
      }
    }
  }

  private processMenuInput() {
    this.input.takePressed();
    this.input.takeButtonPresses();
    this.input.takeMouse();
  }

  // ---------------------------------------------------------------------------
  // Player input
  // ---------------------------------------------------------------------------

  private processPlayerInput() {
    const p = this.player;
    const pressed = this.input.takePressed();
    const buttons = this.input.takeButtonPresses();
    const mouse = this.input.takeMouse();
    this.lastMouse = { dx: mouse.dx, dy: mouse.dy };
    if (!p) return;

    for (const code of pressed) {
      if (code === 'KeyB') {
        if (this.buyMenuOpen) this.buyMenuOpen = false;
        else if (this.canBuy()) this.buyMenuOpen = true;
        this.hudDirty = true;
      } else if (code === 'Escape') {
        this.buyMenuOpen = false;
      } else if (this.buyMenuOpen && /^Digit[1-6]$/.test(code)) {
        const key = code.replace('Digit', '');
        const item = BUY_ITEMS.find((i) => i.key === key && (!i.team || i.team === p.team));
        if (item) this.buy(item.id);
      } else if (code === 'KeyF' && !p.alive) {
        this.takeover();
      } else if ((code === 'ArrowRight' || code === 'ArrowLeft') && !p.alive) {
        this.spectateNext(code === 'ArrowRight' ? 1 : -1);
      }
    }
    if (!p.alive) {
      if (buttons.includes(0)) this.spectateNext(1);
      // spectated bot keeps its own aim; nothing else to do
      return;
    }
    if (this.matchWinner) return;

    const it = p.intent;
    p.clearIntent();
    // Look
    const w = p.activeWeapon;
    const sens = MOUSE_SENS * (p.scoped && w.def.scope ? w.def.scope.fov / BASE_FOV : 1);
    p.yaw -= mouse.dx * sens;
    p.pitch = clamp(p.pitch - mouse.dy * sens, -89 * DEG, 89 * DEG);

    if (this.buyMenuOpen) return;

    // Movement
    let f = 0;
    let r = 0;
    if (this.input.isDown('KeyW')) f += 1;
    if (this.input.isDown('KeyS')) f -= 1;
    if (this.input.isDown('KeyD')) r += 1;
    if (this.input.isDown('KeyA')) r -= 1;
    if (f !== 0 || r !== 0) {
      const fw = forwardFromYaw(p.yaw);
      const rt = rightFromYaw(p.yaw);
      let dx = fw.x * f + rt.x * r;
      let dz = fw.z * f + rt.z * r;
      const l = Math.sqrt(dx * dx + dz * dz);
      dx /= l;
      dz /= l;
      it.dirX = dx;
      it.dirZ = dz;
    }
    it.jump = this.input.isDown('Space');
    it.walk = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    it.fire = this.input.isButton(0);
    it.interact = this.input.isDown('KeyE');
    for (const code of pressed) {
      if (code === 'Digit1') it.switchSlot = 'primary';
      else if (code === 'Digit2') it.switchSlot = 'secondary';
      else if (code === 'Digit3') it.switchSlot = 'melee';
      else if (code === 'KeyR') it.reload = true;
      else if (code === 'KeyQ') it.switchSlot = this.lastSlotFor(p);
    }
    if (buttons.includes(2)) it.altFire = true;
    if (mouse.wheel !== 0) it.switchSlot = this.cycleSlot(p, mouse.wheel > 0 ? 1 : -1);
  }

  private cycleSlot(p: Character, dir: number): WeaponSlot {
    const order: WeaponSlot[] = ['primary', 'secondary', 'melee'];
    const have = order.filter((s) => p.weapons.has(s));
    const idx = have.indexOf(p.activeSlot);
    return have[(idx + dir + have.length) % have.length];
  }

  private lastSlotFor(p: Character): WeaponSlot {
    if (p.activeSlot === 'melee') return p.weapons.has('primary') ? 'primary' : 'secondary';
    return p.activeSlot === 'primary' ? 'secondary' : p.weapons.has('primary') ? 'primary' : 'melee';
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  private applyMovement(ch: Character, dt: number) {
    const it = ch.intent;
    const frozen = this.phase === 'freeze' || this.phase === 'matchover';
    const interacting = (this.planter === ch || this.defuser === ch) && ch.controller === 'bot';
    let dx = frozen || interacting ? 0 : it.dirX;
    let dz = frozen || interacting ? 0 : it.dirZ;
    const l = Math.sqrt(dx * dx + dz * dz);
    if (l > 1) {
      dx /= l;
      dz /= l;
    }
    const max = ch.maxSpeed();
    const tx = dx * max;
    const tz = dz * max;
    if (ch.grounded) {
      const k = Math.min(1, dt * 12);
      ch.vel.x += (tx - ch.vel.x) * k;
      ch.vel.z += (tz - ch.vel.z) * k;
      if (it.jump && !frozen) {
        ch.vel.y = JUMP_VELOCITY;
        ch.grounded = false;
        if (ch === this.viewTarget) this.audio.play('jump');
      }
    } else {
      const k = Math.min(1, dt * 1.2);
      ch.vel.x += (tx - ch.vel.x) * k;
      ch.vel.z += (tz - ch.vel.z) * k;
    }
    const before = { x: ch.pos.x, z: ch.pos.z };
    const wasGrounded = ch.grounded;
    this.world.moveBody(ch, dt);
    // Footsteps
    const moved = vdistXZ(before, ch.pos);
    if (ch.grounded && ch.horizontalSpeed() > 2.5 && !it.walk) {
      ch.footstepDist += moved;
      if (ch.footstepDist > 2.4) {
        ch.footstepDist = 0;
        this.audio.play('footstep', ch === this.viewTarget ? undefined : ch.pos);
      }
    }
    if (!wasGrounded && ch.grounded) this.audio.play('land', ch === this.viewTarget ? undefined : ch.pos);
  }

  private handleWeapon(ch: Character, dt: number) {
    const it = ch.intent;
    const w = ch.activeWeapon;
    w.update(dt, this.now);
    const canAct = this.phase === 'live' || this.phase === 'planted' || this.phase === 'freeze';

    if (it.switchSlot && it.switchSlot !== ch.activeSlot && ch.weapons.has(it.switchSlot)) {
      if (ch.switchTo(it.switchSlot, this.now)) {
        this.hudDirty = true;
        if (ch === this.viewTarget) this.audio.play('switch');
      }
    }
    if (it.reload && w.startReload(this.now)) {
      this.audio.play('reload_start', ch === this.viewTarget ? undefined : ch.pos);
      this.pendingSounds.push({ time: w.reloadEnd - 0.35, name: 'reload_end', pos: ch.pos, ch });
      ch.scoped = false;
      this.hudDirty = true;
    }
    if (it.altFire && w.def.scope && !w.isReloading(this.now)) {
      ch.scoped = !ch.scoped;
      if (ch === this.viewTarget) this.audio.play('scope');
      this.hudDirty = true;
    }
    const trigger = it.fire && canAct && this.phase !== 'freeze';
    const shouldFire = trigger && (w.def.auto || !ch.prevFire);
    ch.prevFire = trigger;
    if (shouldFire) {
      if (w.canFire(this.now) && !ch.isSwitching(this.now)) this.fireWeapon(ch, w);
      else if (!w.isMelee && w.ammo === 0 && !w.isReloading(this.now) && w.reserve > 0) {
        if (w.startReload(this.now)) {
          this.audio.play('reload_start', ch === this.viewTarget ? undefined : ch.pos);
          this.pendingSounds.push({ time: w.reloadEnd - 0.35, name: 'reload_end', pos: ch.pos, ch });
          ch.scoped = false;
        }
      }
    }
  }

  private fireWeapon(ch: Character, w: WeaponInstance) {
    const def = w.def;
    const moving01 = clamp(ch.horizontalSpeed() / def.moveSpeed, 0, 1);
    const shot = w.fire(this.now, moving01, ch.scoped, !ch.grounded);
    const eye = ch.eye;
    // Effective aim includes the accumulated view punch (recoil) before this shot's kick.
    const aimYaw = ch.yaw + (w.punchYaw - shot.kickYaw) * DEG;
    const aimPitch = ch.pitch + (w.punchPitch - shot.kickPitch) * DEG;
    this.hudDirty = true;

    if (w.isMelee) {
      ch.meleeSwingStart = this.now;
      const dir = dirFromYawPitch(aimYaw, aimPitch);
      const hit = this.world.raycast(eye, dir, def.meleeRange ?? 1.9, this.characters, ch.id);
      this.audio.playGunshot('knife', ch.pos, ch === this.viewTarget);
      if (hit.target) {
        const victim = hit.target as Character;
        const behind = Math.abs(((victim.yaw - ch.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 60 * DEG;
        const dmg = behind ? 180 : def.damage;
        this.applyDamage(victim, ch, def.id, def.name, hit.hitbox ?? 'chest', dmg, hit.point);
        this.audio.play('knife_hit', hit.point);
      }
      return;
    }

    // Cone spread
    const spreadRad = shot.spreadDeg * DEG;
    const rr = spreadRad * Math.sqrt(Math.random()) * (0.6 + Math.random() * 0.4);
    const th = Math.random() * Math.PI * 2;
    const dir = dirFromYawPitch(aimYaw + rr * Math.cos(th), aimPitch + rr * Math.sin(th));
    const hit = this.world.raycast(eye, dir, def.range, this.characters, ch.id);
    const end = hit.point;

    // Tracer origin: viewed character → below-right of the eye; others → model muzzle
    let from: Vec3;
    if (ch === this.viewTarget) {
      const rt = rightFromYaw(ch.yaw);
      const fw = forwardFromYaw(ch.yaw);
      from = { x: eye.x + rt.x * 0.18 + fw.x * 0.6, y: eye.y - 0.16, z: eye.z + rt.z * 0.18 + fw.z * 0.6 };
      this.viewModel?.kick(def.kickPitch / 2);
    } else {
      const m = ch.model.getMuzzleWorld(this.tmpV);
      from = { x: m.x, y: m.y, z: m.z };
    }
    if (hit.dist > 2) this.effects.tracer(from, end, this.now);
    ch.model.fireFlash(this.now);
    this.audio.playGunshot(def.sound, ch.pos, ch === this.viewTarget);
    this.recentShots.push({ pos: { ...ch.pos }, team: ch.team, time: this.now });

    if (hit.target) {
      const victim = hit.target as Character;
      const res = computeDamage(def, hit.hitbox ?? 'chest', hit.dist, victim.armor, victim.helmet);
      this.applyDamage(victim, ch, def.id, def.name, hit.hitbox ?? 'chest', res.health, hit.point, res.armor);
    } else if (hit.dist < def.range) {
      this.effects.impact(hit.point, hit.normal, this.now);
      // bullet whiz when passing close to the viewer
      const v = this.viewTarget;
      if (v && v !== ch) {
        const ve = v.eye;
        const px = ve.x - eye.x;
        const py = ve.y - eye.y;
        const pz = ve.z - eye.z;
        const proj = px * dir.x + py * dir.y + pz * dir.z;
        if (proj > 0 && proj < hit.dist) {
          const cx = px - dir.x * proj;
          const cy = py - dir.y * proj;
          const cz = pz - dir.z * proj;
          if (cx * cx + cy * cy + cz * cz < 2.5) this.audio.play('whiz', { x: eye.x + dir.x * proj, y: ve.y, z: eye.z + dir.z * proj });
        }
      }
    }
  }

  private applyDamage(victim: Character, attacker: Character, weaponId: string, weaponName: string, hitbox: HitboxName, dmg: number, point: Vec3, armorLoss = 0) {
    if (!victim.alive) return;
    victim.health -= dmg;
    victim.armor = Math.max(0, victim.armor - armorLoss);
    victim.lastDamageFrom = attacker.id;
    victim.lastDamageTime = this.now;
    victim.model.hitFlash(this.now);
    this.effects.blood(point, this.now);
    this.brains.get(victim.id)?.onDamaged(attacker);
    if (attacker === this.viewTarget) {
      this.hitMarkerTime = this.now;
      this.audio.play(hitbox === 'head' ? 'headshot' : 'hit');
    }
    if (victim === this.viewTarget) {
      this.damageFlashTime = this.now;
      this.audio.play('hurt');
    }
    // planting / defusing is interrupted by damage only if it kills; keep CS behaviour (no interruption)
    if (victim.health <= 0) this.kill(victim, attacker, weaponId, weaponName, hitbox === 'head');
    this.hudDirty = true;
  }

  private kill(victim: Character, attacker: Character | null, weaponId: string, weaponName: string, headshot: boolean) {
    victim.die(this.now);
    if (attacker && attacker !== victim) {
      if (attacker.team !== victim.team) {
        attacker.kills++;
        attacker.money = Math.min(16000, attacker.money + (WEAPONS[weaponId]?.killAward ?? 300));
      } else attacker.kills--;
      if (attacker === this.player) this.audio.play('kill');
    }
    if (this.planter === victim) {
      this.planter = null;
      this.plantProgress = 0;
    }
    if (this.defuser === victim) {
      this.defuser = null;
      this.defuseProgress = 0;
    }
    if (victim.hasC4) {
      victim.hasC4 = false;
      this.c4.drop(victim.pos);
    }
    this.killfeed.push({
      id: this.killfeedId++,
      killer: attacker ? attacker.name : '',
      killerTeam: attacker ? attacker.team : victim.team,
      victim: victim.name,
      victimTeam: victim.team,
      weapon: weaponName,
      headshot,
      time: this.now,
    });
    if (this.killfeed.length > 6) this.killfeed.shift();
    if (victim === this.player) {
      this.deathCamUntil = this.now + 1.5;
      this.showMessage(attacker && attacker !== victim ? `Killed by ${attacker.name} (${weaponName})` : 'You died', 3);
    }
    this.hudDirty = true;
  }

  private handleInteract(ch: Character, dt: number) {
    const it = ch.intent;
    if (!it.interact) {
      if (this.planter === ch) {
        this.planter = null;
        this.plantProgress = 0;
        this.hudDirty = true;
      }
      if (this.defuser === ch) {
        this.defuser = null;
        this.defuseProgress = 0;
        this.hudDirty = true;
      }
      return;
    }
    const moving = ch.horizontalSpeed() > 0.8 || !ch.grounded;
    if (ch.team === 'T') {
      if (ch.hasC4 && this.phase === 'live') {
        const zone = this.map.isInPlantZone(ch.pos.x, ch.pos.z);
        if (zone && !moving) {
          if (this.planter !== ch) {
            this.planter = ch;
            this.plantProgress = 0;
            this.audio.play('c4_plant_start', ch === this.viewTarget ? undefined : ch.pos);
          }
          this.plantProgress += dt;
          if (this.plantProgress >= PLANT_TIME) {
            ch.hasC4 = false;
            const pos = { x: ch.pos.x, y: this.map.groundHeight(ch.pos.x, ch.pos.z), z: ch.pos.z };
            this.c4.plant(pos, zone, this.now);
            this.phase = 'planted';
            this.phaseEndsAt = Infinity;
            this.planter = null;
            this.plantProgress = 0;
            ch.money = Math.min(16000, ch.money + 300);
            this.plans.CT.enemySite = zone;
            this.plans.CT.enemySiteTime = this.now;
            this.showMessage(`The bomb has been planted at ${zone}`, 3);
            this.audio.play('c4_planted', pos);
          }
          this.hudDirty = true;
        } else if (this.planter === ch) {
          this.planter = null;
          this.plantProgress = 0;
        }
      } else if (this.c4.state === 'dropped' && vdistXZ(ch.pos, this.c4.pos) < 1.6 && Math.abs(ch.pos.y - this.c4.pos.y) < 1.5) {
        this.c4.giveTo(ch.id);
        ch.hasC4 = true;
        if (ch === this.viewTarget) this.audio.play('pickup');
        this.hudDirty = true;
      }
    } else if (this.c4.state === 'planted' && this.phase === 'planted') {
      const near = vdistXZ(ch.pos, this.c4.pos) < 1.7 && Math.abs(ch.pos.y - this.c4.pos.y) < 1.5;
      if (near && !moving) {
        if (this.defuser !== ch) {
          if (this.defuser) return; // someone else is already defusing
          this.defuser = ch;
          this.defuseProgress = 0;
        }
        this.defuseProgress += dt;
        if (this.now >= this.nextDefuseSound) {
          this.nextDefuseSound = this.now + 0.4;
          this.audio.play('c4_defuse', this.c4.pos);
        }
        if (this.defuseProgress >= DEFUSE_TIME) {
          this.c4.setDefused();
          this.defuser = null;
          this.defuseProgress = 0;
          ch.money = Math.min(16000, ch.money + 300);
          this.audio.play('c4_defused');
          this.endRound('CT', 'Bomb defused');
        }
        this.hudDirty = true;
      } else if (this.defuser === ch) {
        this.defuser = null;
        this.defuseProgress = 0;
      }
    }
  }

  private updateC4() {
    if (this.c4.update(this.now)) this.audio.play('c4_beep', this.c4.pos);
    if (this.c4.state === 'planted' && this.now >= this.c4.explodeAt && this.phase === 'planted') {
      const p = this.c4.pos;
      this.c4.setExploded();
      this.effects.explosion(p, this.now);
      this.audio.play('c4_explode', p);
      for (const ch of this.characters) {
        if (!ch.alive) continue;
        const d = vdistXZ(ch.pos, p) + Math.abs(ch.pos.y - p.y) * 0.5;
        if (d < C4_EXPLOSION_RADIUS) {
          const dmg = Math.round(C4_MAX_DAMAGE * (1 - d / C4_EXPLOSION_RADIUS));
          ch.health -= dmg;
          if (ch === this.viewTarget) this.damageFlashTime = this.now;
          if (ch.health <= 0) this.kill(ch, null, 'c4', 'C4', false);
        }
      }
      this.endRound('T', 'Target bombed');
    }
  }

  private checkWinConditions() {
    if (this.phase !== 'live' && this.phase !== 'planted') return;
    const aliveCT = this.characters.some((c) => c.team === 'CT' && c.alive);
    const aliveT = this.characters.some((c) => c.team === 'T' && c.alive);
    if (!aliveCT) {
      this.endRound('T', 'Counter-Terrorists eliminated');
      return;
    }
    if (!aliveT && this.phase === 'live') {
      this.endRound('CT', 'Terrorists eliminated');
    }
  }

  private flushPendingSounds() {
    for (let i = this.pendingSounds.length - 1; i >= 0; i--) {
      const s = this.pendingSounds[i];
      if (this.now >= s.time) {
        if (s.ch.alive) this.audio.play(s.name, s.ch === this.viewTarget ? undefined : s.ch.pos);
        this.pendingSounds.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(dtReal: number) {
    const v = this.viewTarget;
    for (const ch of this.characters) {
      ch.updateModel(dtReal, this.now);
      ch.model.group.visible = ch !== v || !ch.alive;
      ch.model.setNameVisible(!!v && ch.team === v.team && ch !== v && ch.alive);
    }
    this.effects.update(dtReal, this.now);

    if (v) {
      const w = v.activeWeapon;
      const punchPitch = w.punchPitch * DEG;
      const punchYaw = w.punchYaw * DEG;
      const eyeY = v.alive ? v.pos.y + EYE_HEIGHT : v.pos.y + 0.6;
      this.camera.position.set(v.pos.x, eyeY, v.pos.z);
      this.camera.rotation.set(v.pitch + punchPitch, v.yaw + punchYaw, 0, 'YXZ');
      const targetFov = v.scoped && w.def.scope ? w.def.scope.fov : BASE_FOV;
      this.currentFov += (targetFov - this.currentFov) * Math.min(1, dtReal * 18);
      if (Math.abs(this.currentFov - this.camera.fov) > 0.01) {
        this.camera.fov = this.currentFov;
        this.camera.updateProjectionMatrix();
      }
      this.audio.setListener({ x: v.pos.x, y: eyeY, z: v.pos.z }, v.yaw);
      if (this.viewModel) {
        this.viewModel.setWeapon(w.def.model);
        this.viewModel.setTeam(v.team);
        const reloading = w.isReloading(this.now);
        this.viewModel.update(dtReal, {
          moving01: clamp(v.horizontalSpeed() / 5, 0, 1),
          grounded: v.grounded,
          mouseDX: v === this.player ? this.lastMouse.dx : 0,
          mouseDY: v === this.player ? this.lastMouse.dy : 0,
          reloading,
          reloadProgress: reloading ? 1 - (w.reloadEnd - this.now) / w.def.reloadTime : 0,
          scoped: v.scoped,
          switchProgress: v.switchProgress(this.now),
          meleeSwing: w.isMelee && this.now - v.meleeSwingStart < 0.3 ? (this.now - v.meleeSwingStart) / 0.3 : 0,
        });
      }
    } else {
      // menu camera: slow orbit above the map
      const t = this.now * 0.08;
      this.camera.position.set(64 + Math.cos(t) * 50, 45, 64 + Math.sin(t) * 50);
      this.camera.lookAt(64, 0, 64);
    }
    // keep the shadow camera following the view for crisper shadows
    this.sun.position.set(this.camera.position.x + 60, 120, this.camera.position.z + 30);
    this.sun.target.position.set(this.camera.position.x, 0, this.camera.position.z);

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (v && v.alive && this.viewModel && this.phase !== 'menu') {
      this.renderer.clearDepth();
      this.renderer.render(this.viewModel.scene, this.viewModel.camera);
    }
  }

  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewModel?.resize(w / h);
  };

  private makeSkyTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#5f8fc7');
    g.addColorStop(0.55, '#a9c6e3');
    g.addColorStop(1, '#e6d9bf');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }

  // ---------------------------------------------------------------------------
  // HUD bridge
  // ---------------------------------------------------------------------------

  private publishHud(force: boolean) {
    this.hudDirty = false;
    this.lastHudPublish = this.now;
    const v = this.viewTarget;
    const p = this.player;
    const prev = this.store.getSnapshot();
    const w = v?.activeWeapon;
    const reloading = !!(w && v && w.isReloading(this.now));
    const me: HudState['me'] = v
      ? {
          name: v.name,
          team: v.team,
          alive: v.alive,
          health: Math.max(0, Math.round(v.health)),
          armor: Math.round(v.armor),
          helmet: v.helmet,
          money: v.money,
          weaponName: w?.def.name ?? '',
          weaponId: w?.def.id ?? '',
          slot: v.activeSlot,
          ammo: w?.ammo ?? 0,
          reserve: w?.reserve ?? 0,
          isMelee: !!w?.isMelee,
          reloading,
          reloadProgress: reloading && w ? 1 - (w.reloadEnd - this.now) / w.def.reloadTime : 0,
          hasC4: v.hasC4,
          scoped: v.scoped,
          spreadDeg: w ? w.currentSpread(clamp(v.horizontalSpeed() / w.def.moveSpeed, 0, 1), v.scoped, !v.grounded) : 1,
          speed: v.horizontalSpeed(),
          weapons: (['primary', 'secondary', 'melee'] as WeaponSlot[])
            .filter((s) => v.weapons.has(s))
            .map((s) => ({ slot: s, name: v.weapons.get(s)!.def.name, id: v.weapons.get(s)!.def.id })),
        }
      : prev.me;

    let interactHint = '';
    if (v && v.alive && v === p) {
      if (v.team === 'T' && v.hasC4 && this.map.isInPlantZone(v.pos.x, v.pos.z) && this.phase === 'live') interactHint = 'Hold [E] to plant the bomb';
      else if (v.team === 'T' && this.c4.state === 'dropped' && vdistXZ(v.pos, this.c4.pos) < 1.6) interactHint = 'Press [E] to pick up the C4';
      else if (v.team === 'CT' && this.c4.state === 'planted' && vdistXZ(v.pos, this.c4.pos) < 1.7) interactHint = 'Hold [E] to defuse';
    }

    const players: ScoreRow[] = this.characters.map((c) => ({
      id: c.id,
      name: c.name,
      team: c.team,
      kills: c.kills,
      deaths: c.deaths,
      alive: c.alive,
      money: c.money,
      isPlayer: c === p,
      hasC4: c.hasC4,
    }));

    const timeLeft = this.phase === 'freeze' || this.phase === 'live' ? Math.max(0, this.phaseEndsAt - this.now) : 0;
    const state: HudState = {
      phase: this.phase,
      roundNumber: this.roundNumber,
      roundTimeLeft: timeLeft,
      scoreCT: this.scoreCT,
      scoreT: this.scoreT,
      pistolRound: this.pistolRound,
      me,
      bomb: {
        state: this.phase === 'menu' ? 'none' : this.c4.state,
        timeLeft: this.c4.timeLeft(this.now),
        site: this.c4.site,
      },
      plantProgress: this.planter && this.planter === v ? this.plantProgress / PLANT_TIME : 0,
      defuseProgress: this.defuser && this.defuser === v ? this.defuseProgress / DEFUSE_TIME : 0,
      interactHint,
      centerMessage: this.now < this.centerMessageUntil ? this.centerMessage : '',
      centerMessageUntil: this.centerMessageUntil,
      killfeed: this.killfeed.filter((k) => this.now - k.time < 8),
      spectating: !!(p && v && v !== p),
      spectateName: v && v !== p ? v.name : '',
      canTakeover: !!(p && v && v !== p && v.alive && v.team === p.team && !p.alive),
      buyMenuOpen: this.buyMenuOpen,
      canBuy: this.canBuy(),
      scoreboardOpen: this.input.isDown('Tab') || this.phase === 'ended' || this.phase === 'matchover',
      pointerLocked: this.input.locked,
      players,
      hitMarkerTime: this.hitMarkerTime,
      damageFlashTime: this.damageFlashTime,
      matchWinner: this.matchWinner,
      fps: this.fpsCounter.fps,
      time: this.now,
    };
    void force;
    void randRange;
    this.store.set(state);
  }
}
