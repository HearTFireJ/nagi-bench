// GameSim: the authoritative, renderer-agnostic game state machine.
//   rounds (freeze -> live -> roundEnd), economy + buying, C4 (carry / drop / plant / defuse /
//   explode), kills + killfeed, doors, visibility ("who can see whom"), spectating / takeover.
// It is advanced with fixed 1/60 s steps by the runtime (or by scripts/headless-sim.ts) and
// communicates outward exclusively through `events` and readable public state.

import { Actor, emptyInput } from './actor.ts';
import { BotBrain } from './ai.ts';
import { switchSlot, updateWeapon } from './combat.ts';
import { CFG, ROUND_MODES } from './config.ts';
import type { RoundMode } from './config.ts';
import { HIT_LABEL } from './hitbox.ts';
import { DOORS, SPAWNS, siteAt } from './map.ts';
import type { DoorDef, SiteDef, Team } from './map.ts';
import { clamp, dist2D, pick, shuffle, yawToDir } from './math.ts';
import type { Vec3 } from './math.ts';
import { stepMovement } from './movement.ts';
import { NavGrid } from './nav.ts';
import type { KillfeedEntry, RoundEndReason, RoundPhase, SimEvent } from './types.ts';
import { TEAM_RIFLE, WEAPONS } from './weapons.ts';
import type { WeaponId } from './weapons.ts';
import { World } from './world.ts';

export interface SimOptions {
  mode: RoundMode;
  playerTeam: Team;
  winRounds: number;
  /** false = 10 bots, no human (headless test / attract mode) */
  withHuman: boolean;
}

export interface BombState {
  state: 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded';
  carrierId: number;
  pos: Vec3;
  timeLeft: number;
  site: 'A' | 'B' | null;
  planterId: number;
  defuserId: number;
  beepIn: number;
}

export interface DoorState {
  def: DoorDef;
  /** 0 closed .. 1 open */
  open: number;
  target: number;
  lastNear: number;
}

export interface RoundResult {
  winner: Team;
  reason: RoundEndReason;
  text: string;
}

export const BUY_ITEMS = ['deagle', 'rifle', 'awp', 'kevlar', 'kevlar_helmet', 'kit'] as const;
export type BuyItem = (typeof BUY_ITEMS)[number];

const CT_NAMES = ['Nova', 'Kai', 'Vic', 'Rex', 'Ash'];
const T_NAMES = ['Ivan', 'Zed', 'Mako', 'Rhea', 'Jax'];

const REASON_TEXT: Record<RoundEndReason, string> = {
  ct_eliminated: '恐怖分子获胜 · 反恐精英全部阵亡',
  t_eliminated: '反恐精英获胜 · 恐怖分子全部阵亡',
  bomb_exploded: '恐怖分子获胜 · C4 已引爆',
  bomb_defused: '反恐精英获胜 · C4 已被拆除',
  time: '反恐精英获胜 · 回合时间耗尽',
};

export class GameSim {
  readonly opts: SimOptions;
  readonly world: World;
  readonly nav: NavGrid;
  readonly actors: Actor[] = [];
  readonly doors: DoorState[] = [];
  readonly brains = new Map<number, BotBrain>();
  events: SimEvent[] = [];
  killfeed: KillfeedEntry[] = [];

  t = 0;
  phase: RoundPhase = 'idle';
  phaseEndsAt = 0;
  roundEndsAt = 0;
  round = 0;
  score: Record<Team, number> = { CT: 0, T: 0 };
  lossStreak: Record<Team, number> = { CT: 0, T: 0 };
  roundResult: RoundResult | null = null;
  matchWinner: Team | null = null;
  bomb: BombState = {
    state: 'carried',
    carrierId: -1,
    pos: { x: 0, y: 0, z: 0 },
    timeLeft: 0,
    site: null,
    planterId: -1,
    defuserId: -1,
    beepIn: 0,
  };
  bombWasPlanted = false;

  humanId = -1;
  homeId = -1;
  spectateId = -1;
  /** team-level AI coordination state (see ai.ts) */
  tStrategy = '';
  /** last site where CTs spotted a terrorist (drives CT rotations) */
  ctAlert: { site: 'A' | 'B'; at: number } | null = null;
  fetcherId = -1;
  defuserPickId = -1;

  private seen = new Map<number, number>();
  private spot: Record<Team, number[]> = { CT: [], T: [] };
  private visAcc = 0;
  private coordAcc = 0;
  private feedSeq = 1;

  constructor(opts: SimOptions) {
    this.opts = opts;
    this.world = new World();
    this.nav = new NavGrid(this.world);
    for (let i = 0; i < 5; i++) this.actors.push(new Actor(i, CT_NAMES[i], 'CT'));
    for (let i = 0; i < 5; i++) this.actors.push(new Actor(5 + i, T_NAMES[i], 'T'));
    for (const a of this.actors) {
      this.spot.CT[a.id] = -10;
      this.spot.T[a.id] = -10;
    }
    for (const d of DOORS) this.doors.push({ def: d, open: 0, target: 0, lastNear: -10 });
    if (opts.withHuman) {
      this.homeId = opts.playerTeam === 'CT' ? 0 : 5;
      this.humanId = this.homeId;
      this.actors[this.homeId].name = '你';
    }
    for (const a of this.actors) if (a.id !== this.homeId) this.brains.set(a.id, new BotBrain(this, a));
  }

  // ---- basic accessors -------------------------------------------------------
  emit(e: SimEvent): void {
    this.events.push(e);
    if (e.type === 'step') {
      const a = this.actors[e.actorId];
      a.noiseAt = this.t;
      this.makeNoise(a, 13);
    }
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  get human(): Actor | null {
    return this.humanId >= 0 ? this.actors[this.humanId] : null;
  }

  /** The actor whose eyes the camera should use (human, or spectated teammate). */
  get viewActor(): Actor | null {
    const h = this.human;
    if (!h) return this.spectateId >= 0 ? this.actors[this.spectateId] : null;
    if (h.alive) return h;
    if (this.spectateId >= 0 && this.actors[this.spectateId].alive) return this.actors[this.spectateId];
    return h;
  }

  teamActors(team: Team): Actor[] {
    return this.actors.filter((a) => a.team === team);
  }

  aliveCount(team: Team): number {
    let n = 0;
    for (const a of this.actors) if (a.team === team && a.alive) n++;
    return n;
  }

  get roundTimeLeft(): number {
    if (this.phase === 'freeze') return Math.max(0, this.phaseEndsAt - this.t);
    if (this.bomb.state === 'planted') return Math.max(0, this.bomb.timeLeft);
    if (this.phase === 'live') return Math.max(0, this.roundEndsAt - this.t);
    return 0;
  }

  // ---- match / round flow ------------------------------------------------------
  startMatch(): void {
    this.round = 0;
    this.score = { CT: 0, T: 0 };
    this.lossStreak = { CT: 0, T: 0 };
    this.matchWinner = null;
    this.killfeed = [];
    const mode = ROUND_MODES[this.opts.mode];
    for (const a of this.actors) {
      a.money = mode.startMoney;
      a.kills = 0;
      a.deaths = 0;
      a.damageDone = 0;
      a.alive = true;
    }
    this.newRound();
  }

  private newRound(): void {
    this.round++;
    const first = this.round === 1;
    const mode = ROUND_MODES[this.opts.mode];
    this.phase = 'freeze';
    this.phaseEndsAt = this.t + CFG.FREEZE_TIME;
    this.roundResult = null;
    this.bombWasPlanted = false;
    this.spectateId = -1;
    this.fetcherId = -1;
    this.defuserPickId = -1;
    this.ctAlert = null;
    this.seen.clear();

    for (const team of ['CT', 'T'] as Team[]) {
      const spawns = shuffle([...SPAWNS[team]]);
      this.teamActors(team).forEach((a, i) => {
        const s = spawns[i % spawns.length];
        if (first || !a.alive) {
          a.giveDefaultLoadout();
          a.armor = 0;
          a.helmet = false;
          a.kit = false;
          if (first) {
            a.armor = mode.armor;
            a.helmet = mode.helmet;
          }
        }
        a.alive = true;
        a.hp = 100;
        a.pos = { x: s.x, y: 0, z: s.z };
        a.prev = { x: s.x, y: 0, z: s.z };
        a.vel = { x: 0, y: 0, z: 0 };
        a.onGround = true;
        a.yaw = team === 'T' ? 0 : Math.PI;
        a.prevYaw = a.yaw;
        a.pitch = 0;
        a.punchPitch = 0;
        a.punchYaw = 0;
        a.spreadAccum = 0;
        a.sprayCount = 0;
        a.scopeLevel = 0;
        a.reloadLeft = 0;
        a.drawLeft = 0;
        a.nextFireAt = 0;
        a.input = emptyInput();
        a.hasBomb = false;
        a.plantProgress = 0;
        a.defuseProgress = 0;
        a.human = false;
        a.lastHitBy = -1;
        a.slot = a.weapons.primary ? 'primary' : 'secondary';
        // refill mags for a new round (reserve persists)
        for (const w of [a.weapons.primary, a.weapons.secondary]) {
          if (w && w.ammo < w.def.magSize) {
            const take = Math.min(w.def.magSize - w.ammo, w.reserve);
            w.ammo += take;
            w.reserve -= take;
          }
        }
        this.emit({ type: 'spawn', actorId: a.id });
      });
    }
    if (this.homeId >= 0) {
      this.humanId = this.homeId;
      this.actors[this.homeId].human = true;
    }

    for (const d of this.doors) {
      d.open = 0;
      d.target = 0;
      d.lastNear = -10;
      this.world.setDoorActive(d.def.id, true);
    }

    // C4 goes to a random terrorist
    const ts = this.teamActors('T');
    const carrier = pick(ts);
    carrier.hasBomb = true;
    this.bomb = {
      state: 'carried',
      carrierId: carrier.id,
      pos: { ...carrier.pos },
      timeLeft: 0,
      site: null,
      planterId: -1,
      defuserId: -1,
      beepIn: 0,
    };

    for (const b of this.brains.values()) b.resetForRound();
    this.emit({ type: 'freezeStart', round: this.round });
  }

  private endRound(winner: Team, reason: RoundEndReason): void {
    if (this.phase !== 'live') return;
    this.phase = 'roundEnd';
    this.phaseEndsAt = this.t + CFG.ROUND_END_TIME;
    this.score[winner]++;
    const loser: Team = winner === 'CT' ? 'T' : 'CT';
    const lossReward = Math.min(CFG.LOSS_MAX, CFG.LOSS_BASE + CFG.LOSS_STEP * this.lossStreak[loser]);
    this.lossStreak[loser]++;
    this.lossStreak[winner] = 0;
    for (const a of this.actors) {
      if (a.team === winner) a.money = Math.min(CFG.MAX_MONEY, a.money + (reason === 'bomb_exploded' ? 3500 : CFG.WIN_REWARD));
      else {
        let m = lossReward;
        if (a.team === 'T' && this.bombWasPlanted) m += CFG.PLANT_REWARD;
        a.money = Math.min(CFG.MAX_MONEY, a.money + m);
      }
    }
    this.roundResult = { winner, reason, text: REASON_TEXT[reason] };
    this.emit({ type: 'roundEnd', winner, reason });
    for (const a of this.actors) {
      a.plantProgress = 0;
      a.defuseProgress = 0;
    }
  }

  // ---- main step ------------------------------------------------------------------
  update(dt: number): void {
    if (this.phase === 'idle') return;
    this.t += dt;

    if (this.phase === 'freeze' && this.t >= this.phaseEndsAt) {
      this.phase = 'live';
      this.roundEndsAt = this.t + CFG.ROUND_TIME;
      this.emit({ type: 'roundLive' });
    }
    if (this.phase === 'roundEnd' && this.t >= this.phaseEndsAt) {
      if (this.score.CT >= this.opts.winRounds || this.score.T >= this.opts.winRounds) {
        this.phase = 'matchEnd';
        this.matchWinner = this.score.CT >= this.opts.winRounds ? 'CT' : 'T';
        this.emit({ type: 'matchEnd', winner: this.matchWinner });
      } else this.newRound();
    }

    const frozen = this.phase === 'freeze';
    const canAct = this.phase === 'live' || this.phase === 'roundEnd';

    this.coordAcc += dt;
    if (this.coordAcc >= 0.4) {
      this.coordAcc = 0;
      this.updateCoordination();
    }

    for (const a of this.actors) {
      if (!a.alive) continue;
      const brain = this.brains.get(a.id);
      if (brain && !a.human) brain.update(dt);
    }
    this.updateDoors(dt);
    for (const a of this.actors) {
      if (!a.alive) continue;
      stepMovement(a, dt, this.world, (e) => this.emit(e), frozen);
      updateWeapon(this, a, dt, canAct);
    }
    this.separateActors();
    this.updateBomb(dt);

    this.visAcc += dt;
    if (this.visAcc >= 0.08) {
      this.visAcc = 0;
      this.updateVisibility();
    }

    if (this.phase === 'live') this.checkRoundEnd();
    this.updateSpectate();
  }

  private checkRoundEnd(): void {
    const ct = this.aliveCount('CT');
    const tt = this.aliveCount('T');
    if (ct === 0) this.endRound('T', 'ct_eliminated');
    else if (tt === 0 && this.bomb.state !== 'planted') this.endRound('CT', 't_eliminated');
    else if (this.bomb.state !== 'planted' && this.t >= this.roundEndsAt) this.endRound('CT', 'time');
  }

  // ---- doors --------------------------------------------------------------------
  private updateDoors(dt: number): void {
    for (const d of this.doors) {
      let near = false;
      for (const a of this.actors) {
        if (a.alive && dist2D(a.pos.x, a.pos.z, d.def.cx, d.def.cz) < d.def.trigger) {
          near = true;
          break;
        }
      }
      if (near) d.lastNear = this.t;
      const want = this.t - d.lastNear < 0.9 ? 1 : 0;
      if (want !== d.target) {
        d.target = want;
        this.emit({ type: 'door', doorId: d.def.id, opening: want === 1 });
      }
      if (d.open < d.target) d.open = Math.min(d.target, d.open + dt * 3);
      else if (d.open > d.target) d.open = Math.max(d.target, d.open - dt * 2);
      this.world.setDoorActive(d.def.id, d.open < 0.6);
    }
  }

  // ---- actor collisions ------------------------------------------------------------
  private separateActors(): void {
    const list = this.actors;
    const min = CFG.RADIUS * 2;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive || Math.abs(a.pos.y - b.pos.y) > 1.0) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.001;
        const push = Math.min(0.06, (min - d) * 0.5);
        const nx = d2 > 1e-8 ? dx / d : 1;
        const nz = d2 > 1e-8 ? dz / d : 0;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        b.pos.x += nx * push;
        b.pos.z += nz * push;
      }
    }
    for (const a of list) {
      if (!a.alive) continue;
      const p = { x: a.pos.x, z: a.pos.z };
      this.world.resolveCircle(p, CFG.RADIUS, a.pos.y, CFG.HEIGHT, CFG.STEP_H);
      a.pos.x = p.x;
      a.pos.z = p.z;
      if (!this.world.isWalkCell(Math.floor(a.pos.x), Math.floor(a.pos.z))) {
        const s = this.nav.snap(a.pos.x, a.pos.z);
        if (s) {
          a.pos.x = s.x;
          a.pos.z = s.z;
        }
      }
    }
  }

  // ---- visibility -------------------------------------------------------------------
  private computeSight(a: Actor, b: Actor): boolean {
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > CFG.VIEW_RANGE) return false;
    if (dist > 2.5) {
      const f = yawToDir(a.viewYaw);
      const cos = (f.x * dx + f.z * dz) / dist;
      if (cos < Math.cos(CFG.VIEW_HALF_FOV)) return false;
    }
    const ex = a.pos.x;
    const ey = a.eyeY;
    const ez = a.pos.z;
    const w = this.world;
    return (
      w.lineOfSight(ex, ey, ez, b.pos.x, b.pos.y + 1.55, b.pos.z) ||
      w.lineOfSight(ex, ey, ez, b.pos.x, b.pos.y + 1.1, b.pos.z) ||
      w.lineOfSight(ex, ey, ez, b.pos.x, b.pos.y + 0.4, b.pos.z)
    );
  }

  private updateVisibility(): void {
    for (const a of this.actors) {
      if (!a.alive) continue;
      for (const b of this.actors) {
        if (!b.alive || b.team === a.team) continue;
        if (this.computeSight(a, b)) {
          this.seen.set(a.id * 32 + b.id, this.t);
          if (this.t - this.spot[a.team][b.id] > 1.2) this.callout(a, b);
          this.spot[a.team][b.id] = this.t;
          if (a.team === 'CT') this.ctAlert = { site: b.pos.x < 46 ? 'B' : 'A', at: this.t };
        }
      }
    }
  }

  /** Teammates within earshot turn to look where `spotter` just saw `enemy`. */
  private callout(spotter: Actor, enemy: Actor): void {
    for (const m of this.actors) {
      if (!m.alive || m.team !== spotter.team || m === spotter || m.human) continue;
      if (dist2D(m.pos.x, m.pos.z, spotter.pos.x, spotter.pos.z) > 45) continue;
      this.brains.get(m.id)?.callout(enemy.pos.x, enemy.pos.z);
    }
  }

  /** `a` has had a clear line of sight to `b` within the last ~0.25 s. */
  sees(a: Actor, b: Actor): boolean {
    return (this.seen.get(a.id * 32 + b.id) ?? -10) > this.t - 0.25;
  }

  /** Any living member of `team` has seen enemy `b` recently (drives the minimap). */
  spottedBy(team: Team, b: Actor): boolean {
    return b.alive && this.spot[team][b.id] > this.t - 0.9;
  }

  // ---- noise / damage hooks for AI -----------------------------------------------------
  makeNoise(src: Actor, radius: number): void {
    for (const a of this.actors) {
      if (!a.alive || a.team === src.team) continue;
      const b = this.brains.get(a.id);
      if (!b || a.human) continue;
      if (dist2D(a.pos.x, a.pos.z, src.pos.x, src.pos.z) <= radius) b.hear(src.pos.x, src.pos.z);
    }
  }

  onDamaged(victim: Actor, attacker: Actor): void {
    const b = this.brains.get(victim.id);
    if (b && !victim.human) b.onDamaged(attacker);
  }

  // ---- kills ------------------------------------------------------------------------------
  killActor(victim: Actor, killer: Actor | null, weaponId: WeaponId | 'bomb' | 'world', headshot: boolean): void {
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    victim.deaths++;
    victim.diedAt = this.t;
    victim.scopeLevel = 0;
    victim.plantProgress = 0;
    victim.defuseProgress = 0;
    victim.reloadLeft = 0;
    victim.input = emptyInput();
    if (victim.hasBomb) {
      victim.hasBomb = false;
      this.bomb.state = 'dropped';
      this.bomb.carrierId = -1;
      this.bomb.pos = { x: victim.pos.x, y: victim.pos.y, z: victim.pos.z };
      this.emit({ type: 'bombDrop', pos: { ...this.bomb.pos } });
    }
    if (killer && killer !== victim && weaponId !== 'bomb' && weaponId !== 'world') {
      if (killer.team !== victim.team) {
        killer.kills++;
        const reward = WEAPONS[weaponId].killReward;
        killer.money = Math.min(CFG.MAX_MONEY, killer.money + reward);
      }
    }
    const human = this.humanId;
    const entry: KillfeedEntry = {
      id: this.feedSeq++,
      time: this.t,
      killerId: killer ? killer.id : -1,
      killerName: killer ? killer.name : '世界',
      killerTeam: killer ? killer.team : 'world',
      victimId: victim.id,
      victimName: victim.name,
      victimTeam: victim.team,
      weapon: weaponId === 'bomb' ? 'C4' : weaponId === 'world' ? '坠落' : WEAPONS[weaponId].name,
      weaponId,
      headshot,
      involvesHuman: (killer !== null && killer.id === human) || victim.id === human,
    };
    this.killfeed.push(entry);
    if (this.killfeed.length > 12) this.killfeed.shift();
    this.emit({
      type: 'kill',
      killerId: entry.killerId,
      victimId: victim.id,
      weaponId,
      headshot,
      pos: { x: victim.pos.x, y: victim.pos.y + 1, z: victim.pos.z },
    });
  }

  // ---- bomb ------------------------------------------------------------------------------------
  private updateBomb(dt: number): void {
    const b = this.bomb;
    const live = this.phase === 'live';

    if (b.state === 'dropped' && live) {
      for (const a of this.actors) {
        if (!a.alive || a.team !== 'T') continue;
        if (dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z) < 1.3 && Math.abs(a.pos.y - b.pos.y) < 1.5) {
          b.state = 'carried';
          b.carrierId = a.id;
          a.hasBomb = true;
          this.emit({ type: 'bombPickup', actorId: a.id });
          break;
        }
      }
    }
    if (b.state === 'carried') {
      const c = this.actors[b.carrierId];
      if (c) {
        b.pos.x = c.pos.x;
        b.pos.y = c.pos.y;
        b.pos.z = c.pos.z;
      }
    }

    // planting
    for (const a of this.actors) {
      if (!a.alive || !a.hasBomb) continue;
      const site = siteAt(a.pos.x, a.pos.z);
      const ok = live && a.input.use && site !== null && a.onGround && a.speed < 0.8 && b.state === 'carried';
      if (ok && site) {
        if (a.plantProgress === 0) this.emit({ type: 'plantStart', actorId: a.id, pos: { ...a.pos } });
        a.plantProgress += dt;
        if (a.plantProgress >= CFG.PLANT_TIME) this.plantBomb(a, site);
      } else if (a.plantProgress > 0) {
        a.plantProgress = 0;
        this.emit({ type: 'plantCancel', actorId: a.id });
      }
    }

    if (b.state === 'planted') {
      b.timeLeft -= dt;
      b.beepIn -= dt;
      if (b.beepIn <= 0) {
        this.emit({ type: 'bombBeep', pos: { ...b.pos }, urgent: b.timeLeft < 10 });
        b.beepIn = 0.12 + 0.88 * Math.pow(clamp(b.timeLeft / CFG.BOMB_TIME, 0, 1), 1.2);
      }
      this.updateDefuse(dt);
      if (b.state === 'planted' && b.timeLeft <= 0) this.explode();
    }
  }

  private plantBomb(a: Actor, site: SiteDef): void {
    const b = this.bomb;
    a.hasBomb = false;
    a.plantProgress = 0;
    b.state = 'planted';
    b.site = site.id;
    b.pos = { x: a.pos.x, y: a.pos.y, z: a.pos.z };
    b.timeLeft = CFG.BOMB_TIME;
    b.planterId = a.id;
    b.carrierId = -1;
    b.beepIn = 0.5;
    this.bombWasPlanted = true;
    a.money = Math.min(CFG.MAX_MONEY, a.money + 300);
    this.emit({ type: 'bombPlanted', actorId: a.id, site: site.id, pos: { ...b.pos } });
  }

  private updateDefuse(dt: number): void {
    const b = this.bomb;
    let cand: Actor | null = null;
    for (const a of this.actors) {
      if (!a.alive || a.team !== 'CT') continue;
      const ok =
        this.phase === 'live' &&
        a.input.use &&
        a.onGround &&
        a.speed < 0.8 &&
        dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z) <= CFG.DEFUSE_RANGE;
      if (ok) {
        if (!cand || a.id === b.defuserId) cand = a;
      }
    }
    for (const a of this.actors) {
      if (a !== cand && a.defuseProgress > 0) {
        a.defuseProgress = 0;
        this.emit({ type: 'defuseCancel', actorId: a.id });
        if (b.defuserId === a.id) b.defuserId = -1;
      }
    }
    if (!cand) return;
    if (cand.defuseProgress === 0) {
      b.defuserId = cand.id;
      this.emit({ type: 'defuseStart', actorId: cand.id, pos: { ...b.pos } });
    }
    cand.defuseProgress += dt;
    const need = cand.kit ? CFG.DEFUSE_KIT_TIME : CFG.DEFUSE_TIME;
    if (cand.defuseProgress >= need) {
      b.state = 'defused';
      cand.defuseProgress = 0;
      cand.money = Math.min(CFG.MAX_MONEY, cand.money + CFG.DEFUSE_REWARD);
      this.emit({ type: 'bombDefused', actorId: cand.id, pos: { ...b.pos } });
      this.endRound('CT', 'bomb_defused');
    }
  }

  private explode(): void {
    const b = this.bomb;
    b.state = 'exploded';
    this.emit({ type: 'bombExploded', pos: { ...b.pos } });
    for (const a of this.actors) {
      if (!a.alive) continue;
      const d = dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z);
      if (d >= CFG.BOMB_RADIUS) continue;
      const dmg = CFG.BOMB_MAX_DAMAGE * (1 - d / CFG.BOMB_RADIUS);
      a.hp -= dmg;
      this.emit({ type: 'damage', victimId: a.id, fromX: b.pos.x, fromZ: b.pos.z, amount: dmg });
      if (a.hp <= 0) this.killActor(a, this.actors[b.planterId] ?? null, 'bomb', false);
    }
    this.endRound('T', 'bomb_exploded');
  }

  // ---- economy -------------------------------------------------------------------------------------
  itemPrice(a: Actor, item: BuyItem): number {
    switch (item) {
      case 'deagle':
        return WEAPONS.deagle.price;
      case 'rifle':
        return WEAPONS[TEAM_RIFLE[a.team]].price;
      case 'awp':
        return WEAPONS.awp.price;
      case 'kevlar':
        return CFG.KEVLAR_PRICE;
      case 'kevlar_helmet':
        return a.armor >= 100 ? CFG.HELMET_ONLY_PRICE : CFG.KEVLAR_HELMET_PRICE;
      case 'kit':
        return CFG.KIT_PRICE;
    }
  }

  /** Returns null on success or a short error reason. */
  buy(a: Actor, item: BuyItem): string | null {
    if (this.phase !== 'freeze') return '现在不是购买时间';
    if (!a.alive) return '你已阵亡';
    const price = this.itemPrice(a, item);
    if (a.money < price) return '金钱不足';
    switch (item) {
      case 'deagle':
      case 'rifle':
      case 'awp': {
        const id: WeaponId = item === 'rifle' ? TEAM_RIFLE[a.team] : item;
        if (a.hasWeapon(id)) return '已拥有';
        a.giveWeapon(id);
        break;
      }
      case 'kevlar':
        if (a.armor >= 100) return '已拥有';
        a.armor = 100;
        break;
      case 'kevlar_helmet':
        if (a.armor >= 100 && a.helmet) return '已拥有';
        a.armor = 100;
        a.helmet = true;
        break;
      case 'kit':
        if (a.team !== 'CT') return '仅 CT 可购买';
        if (a.kit) return '已拥有';
        a.kit = true;
        break;
    }
    a.money -= price;
    this.emit({ type: 'buy', actorId: a.id, item });
    return null;
  }

  // ---- team coordination (bots) ------------------------------------------------------------------------
  private updateCoordination(): void {
    const b = this.bomb;
    // who fetches a dropped bomb: nearest living T bot
    this.fetcherId = -1;
    if (b.state === 'dropped') {
      let best = Infinity;
      for (const a of this.actors) {
        if (!a.alive || a.team !== 'T' || a.human) continue;
        const d = dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z);
        if (d < best) {
          best = d;
          this.fetcherId = a.id;
        }
      }
    }
    // who defuses: nearest living CT bot
    this.defuserPickId = -1;
    if (b.state === 'planted') {
      let best = Infinity;
      for (const a of this.actors) {
        if (!a.alive || a.team !== 'CT' || a.human) continue;
        const d = dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z) - (a.kit ? 6 : 0) - (a.id === this.defuserPickId ? 4 : 0);
        if (d < best) {
          best = d;
          this.defuserPickId = a.id;
        }
      }
    }
  }

  // ---- spectate / takeover ---------------------------------------------------------------------------------
  private updateSpectate(): void {
    const h = this.human;
    if (!h || h.alive) {
      this.spectateId = -1;
      return;
    }
    const cur = this.spectateId >= 0 ? this.actors[this.spectateId] : null;
    if (cur && cur.alive) return;
    this.cycleSpectate(1);
  }

  spectateCandidates(): Actor[] {
    const h = this.human;
    if (!h) return this.actors.filter((a) => a.alive);
    const mates = this.actors.filter((a) => a.alive && a.team === h.team);
    return mates.length > 0 ? mates : this.actors.filter((a) => a.alive);
  }

  cycleSpectate(dir: number): void {
    const list = this.spectateCandidates();
    if (list.length === 0) {
      this.spectateId = -1;
      return;
    }
    const idx = list.findIndex((a) => a.id === this.spectateId);
    const next = list[(((idx + dir) % list.length) + list.length) % list.length];
    this.spectateId = next.id;
  }

  /** Dead human takes control of the spectated living teammate. */
  takeover(): boolean {
    const h = this.human;
    if (!h || h.alive || this.phase === 'freeze') return false;
    const target = this.spectateId >= 0 ? this.actors[this.spectateId] : null;
    if (!target || !target.alive || target.team !== h.team) return false;
    h.human = false;
    target.human = true;
    target.input = emptyInput();
    this.humanId = target.id;
    this.spectateId = -1;
    return true;
  }

  // ---- human commands (called by the runtime input layer) -------------------------------------------------------
  selectSlot(slot: 'primary' | 'secondary' | 'melee'): void {
    const h = this.human;
    if (h && h.alive) switchSlot(this, h, slot);
  }

  quickSwitch(): void {
    const h = this.human;
    if (h && h.alive) switchSlot(this, h, h.lastSlot);
  }

  describeHit(group: keyof typeof HIT_LABEL): string {
    return HIT_LABEL[group];
  }
}

