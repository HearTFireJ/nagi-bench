import { BotBrain, skillFor } from '../ai/brain.ts';
import { assignTactics, fleeBomb, onBombPlanted } from '../ai/tactics.ts';
import { ECONOMY, PLAYER, ROUND, ROUND_PRESETS, TICK_DT } from '../config.ts';
import type { RoundPreset } from '../config.ts';
import type { Character, UserCmd } from '../entities/character.ts';
import { clearCmd, makeCmd } from '../entities/character.ts';
import { getLevel, zoneAt } from '../level.ts';
import type { Level } from '../level.ts';
import type { MapData, Team, ZoneDef } from '../map/types.ts';
import { Rng, anglesFromDelta } from '../math.ts';
import type { NavGrid } from '../nav/navgrid.ts';
import { stepBody } from '../physics/movement.ts';
import { World } from '../physics/world.ts';
import { computeDamage } from '../weapons/damage.ts';
import type { Hitbox } from '../weapons/damage.ts';
import { getWeapon } from '../weapons/defs.ts';
import { assignBomb, dropBomb, makeBomb, updateBomb } from './bomb.ts';
import type { BombState } from './bomb.ts';
import { switchTo, tickWeapons } from './combat.ts';
import { autoBuy, buy as buyItem, giveWeapon, makeCharacter, refillAmmo, resetLoadout } from './economy.ts';
import type { EndReason, GameEvent, KillEntry, Noise } from './events.ts';

export type Phase = 'freeze' | 'live' | 'planted' | 'roundEnd' | 'matchEnd';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface GameConfig {
  mode: 'pistol' | 'fullbuy';
  playerTeam: Team;
  seed: number;
  difficulty: Difficulty;
  maxRounds: number;
  /** all ten players are bots (headless tests / attract mode) */
  noHuman: boolean;
  /** buy a standard kit for the human automatically at round start (menu can still change it) */
  autoBuyHuman: boolean;
}

export const DEFAULT_CONFIG: GameConfig = {
  mode: 'pistol',
  playerTeam: 'CT',
  seed: 1337,
  difficulty: 'normal',
  maxRounds: ROUND.maxRounds,
  noHuman: false,
  autoBuyHuman: true,
};

const CT_NAMES = ['Ranger', 'Falcon', 'Titan', 'Shield', 'Blaze'];
const T_NAMES = ['Viper', 'Rogue', 'Ghost', 'Raven', 'Hawk'];

/**
 * The simulation. Fixed 60 Hz tick, no rendering. The presentation layers read its state
 * (positions, phase, bomb, ...) and its `events` stream and never mutate it, except through
 * the small input API: `humanCmd`, `look()`, `buy()`, `cycleSpectate()`, `takeover()`.
 */
export class Game {
  readonly cfg: GameConfig;
  readonly rng: Rng;
  readonly level: Level;
  readonly map: MapData;
  readonly nav: NavGrid;
  readonly world: World;
  readonly chars: Character[] = [];

  time = 0;
  phase: Phase = 'freeze';
  phaseTime = 0;
  roundNumber = 0;
  roundTimeLeft: number = ROUND.roundTime;
  freezeLeft: number = ROUND.freezeTime;
  endTimer = 0;
  score: Record<Team, number> = { CT: 0, T: 0 };
  lossStreak: Record<Team, number> = { CT: 0, T: 0 };
  winner: Team | null = null;
  endReason: EndReason | null = null;
  matchWinner: Team | null = null;
  bomb: BombState = makeBomb();
  preset: RoundPreset;

  events: GameEvent[] = [];
  noises: Noise[] = [];
  killfeed: KillEntry[] = [];
  private killSeq = 1;

  /** id of the character the human currently controls (-1 = nobody) */
  playerId = -1;
  /** id being spectated after the human died (-1 = none) */
  spectateId = -1;
  /** input written by the UI layer each frame */
  humanCmd: UserCmd = makeCmd();

  private acc = 0;
  /** interpolation factor of the render frame inside the current tick */
  alpha = 0;
  private spotTimer = 0;
  /** per viewer team: enemy id -> time until which the enemy stays "spotted" on the radar */
  private spotted: Record<Team, Map<number, number>> = { CT: new Map(), T: new Map() };
  private doorWasOpen: boolean[] = [];
  private fleeIssued = false;
  /** last known enemy position reported by each team (radio / shared vision) */
  intel: Record<Team, { x: number; z: number; time: number } | null> = { CT: null, T: null };

  constructor(cfg: Partial<GameConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
    this.rng = new Rng(this.cfg.seed);
    this.level = getLevel();
    this.map = this.level.map;
    this.nav = this.level.nav;
    this.world = new World(this.map);
    this.preset = ROUND_PRESETS[this.cfg.mode];
    this.doorWasOpen = this.world.doors.map(() => false);

    const skill = this.cfg.difficulty;
    let id = 0;
    for (const team of ['CT', 'T'] as const) {
      const names = team === 'CT' ? CT_NAMES : T_NAMES;
      for (let i = 0; i < 5; i++) {
        const ch = makeCharacter(id++, names[i], team);
        ch.brain = new BotBrain(this, ch, skillFor(skill, this.rng, team === 'CT'));
        this.chars.push(ch);
      }
    }
    if (!this.cfg.noHuman) {
      const human = this.chars.find((c) => c.team === this.cfg.playerTeam) as Character;
      human.isHuman = true;
      human.name = '玩家';
      this.playerId = human.id;
    }
    for (const c of this.chars) c.money = this.preset.startMoney;
    this.startRound();
  }

  // ------------------------------------------------------------------ public helpers

  get human(): Character | null {
    return this.playerId >= 0 ? this.chars[this.playerId] : null;
  }

  /** Character whose eyes the camera should use. */
  get viewChar(): Character | null {
    const h = this.human;
    if (h && h.alive) return h;
    if (this.spectateId >= 0 && this.chars[this.spectateId].alive) return this.chars[this.spectateId];
    return h;
  }

  /** seconds of live round time elapsed (0 during freeze) */
  get roundElapsed(): number {
    return this.phase === 'freeze' ? 0 : ROUND.roundTime - this.roundTimeLeft;
  }

  get winScore(): number {
    return Math.ceil(this.cfg.maxRounds / 2);
  }

  aliveCount(team: Team): number {
    let n = 0;
    for (const c of this.chars) if (c.alive && c.team === team) n++;
    return n;
  }

  zoneOf(x: number, z: number): ZoneDef | null {
    return zoneAt(this.level, x, z);
  }

  emit(e: GameEvent): void {
    this.events.push(e);
    if (this.events.length > 4000) this.events.splice(0, 2000);
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  emitNoise(src: Character, radius: number, kind: Noise['kind']): void {
    this.noises.push({ x: src.pos.x, y: src.pos.y, z: src.pos.z, radius, team: src.team, time: this.time, kind, source: src.id });
  }

  /** A bot of `team` saw an enemy here: share it with the team. */
  reportContact(team: Team, x: number, z: number): void {
    this.intel[team] = { x, z, time: this.time };
  }

  isSpotted(enemy: Character, viewer: Team): boolean {
    const until = this.spotted[viewer].get(enemy.id);
    return until !== undefined && until > this.time;
  }

  /** Mouse look for the human (alive) - applied instantly, not on the fixed tick. */
  look(dYaw: number, dPitch: number): void {
    const h = this.human;
    if (!h || !h.alive) return;
    h.yaw += dYaw;
    h.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, h.pitch + dPitch));
  }

  buy(item: string): boolean {
    const h = this.human;
    return h ? buyItem(this, h, item) : false;
  }

  /** Spectate the next / previous living teammate after dying. */
  cycleSpectate(dir: 1 | -1 = 1): void {
    const h = this.human;
    if (!h || h.alive) return;
    let pool = this.chars.filter((c) => c.alive && c.team === h.team);
    if (pool.length === 0) pool = this.chars.filter((c) => c.alive);
    if (pool.length === 0) {
      this.spectateId = -1;
      return;
    }
    const cur = pool.findIndex((c) => c.id === this.spectateId);
    const next = pool[(cur + dir + pool.length * 2) % pool.length];
    this.spectateId = next.id;
  }

  /** Take over a living teammate bot after dying. */
  takeover(id: number): boolean {
    const h = this.human;
    const t = this.chars[id];
    if (!h || h.alive || !t || !t.alive || t.team !== h.team || t.isHuman) return false;
    h.isHuman = false;
    t.isHuman = true;
    t.cmd = makeCmd();
    this.playerId = t.id;
    this.spectateId = -1;
    this.emit({ type: 'takeover', from: h.id, to: t.id });
    return true;
  }

  // ------------------------------------------------------------------ time stepping

  /** Advance by a render-frame delta using fixed ticks. Returns number of ticks executed. */
  advance(frameDt: number): number {
    this.acc += Math.min(frameDt, 0.1);
    let n = 0;
    while (this.acc >= TICK_DT) {
      this.step(TICK_DT);
      this.acc -= TICK_DT;
      n++;
    }
    this.alpha = this.acc / TICK_DT;
    return n;
  }

  step(dt: number): void {
    this.time += dt;
    this.phaseTime += dt;
    for (const c of this.chars) {
      c.prevPos.x = c.pos.x;
      c.prevPos.y = c.pos.y;
      c.prevPos.z = c.pos.z;
    }

    switch (this.phase) {
      case 'freeze':
        this.freezeLeft -= dt;
        if (this.freezeLeft <= 0) {
          this.phase = 'live';
          this.phaseTime = 0;
          this.emit({ type: 'freezeEnd' });
        }
        break;
      case 'live':
        this.roundTimeLeft -= dt;
        break;
      case 'roundEnd':
        this.endTimer -= dt;
        if (this.endTimer <= 0) {
          if (this.matchWinner) {
            this.phase = 'matchEnd';
            this.emit({ type: 'matchEnd', winner: this.matchWinner });
          } else this.startRound();
        }
        break;
      default:
        break;
    }

    // doors react to anyone alive nearby
    const actors: { x: number; y: number; z: number }[] = [];
    for (const c of this.chars) if (c.alive) actors.push(c.pos);
    this.world.updateDoors(dt, actors);
    for (let i = 0; i < this.world.doors.length; i++) {
      const d = this.world.doors[i];
      const isOpen = d.open > 0.02;
      if (isOpen !== this.doorWasOpen[i]) {
        this.doorWasOpen[i] = isOpen;
        this.emit({ type: 'doorMove', id: d.def.id, opening: isOpen, x: d.cx, z: d.cz });
      }
    }

    const canMove = this.phase !== 'freeze';
    const canShoot = this.phase === 'live' || this.phase === 'planted';
    for (const c of this.chars) if (c.alive) this.stepChar(c, dt, canMove, canShoot);
    this.separate();

    updateBomb(this, dt);
    if (this.bomb.state === 'planted' && this.bomb.timeLeft < 9 && !this.fleeIssued) {
      this.fleeIssued = true;
      fleeBomb(this);
    }
    if (this.phase === 'live' || this.phase === 'planted') this.checkWin();

    this.spotTimer -= dt;
    if (this.spotTimer <= 0) {
      this.spotTimer = 0.2;
      this.updateSpotting();
    }
    // forget old noises
    if (this.noises.length && this.time - this.noises[0].time > 2) {
      this.noises = this.noises.filter((n) => this.time - n.time <= 2);
    }
  }

  private stepChar(c: Character, dt: number, canMove: boolean, canShoot: boolean): void {
    const cmd = c.cmd;
    if (c.isHuman) {
      const h = this.humanCmd;
      cmd.forward = h.forward;
      cmd.strafe = h.strafe;
      cmd.jump = h.jump;
      cmd.crouch = h.crouch;
      cmd.walk = h.walk;
      cmd.fire = h.fire;
      cmd.fire2 = h.fire2;
      cmd.reload = h.reload;
      cmd.use = h.use;
      cmd.slot = h.slot;
      // one-shot inputs are consumed by the tick
      h.slot = null;
      h.reload = false;
    } else {
      clearCmd(cmd);
      if (c.brain) c.brain.think(dt);
    }
    if (!canMove) {
      cmd.forward = 0;
      cmd.strafe = 0;
      cmd.jump = false;
    }
    if (this.phase === 'roundEnd' || this.phase === 'matchEnd') {
      cmd.fire = false;
      cmd.fire2 = false;
      cmd.use = false;
    }

    // ---- movement
    const w = c.weapon.def;
    let maxSpeed = w.moveSpeed;
    if (cmd.walk) maxSpeed *= PLAYER.walkFactor;
    if (c.crouch > 0) maxSpeed *= 1 - (1 - PLAYER.crouchFactor) * c.crouch;
    if (c.scope > 0 && w.scope) maxSpeed *= w.scope.scopedSpeedMul;
    const fx = -Math.sin(c.yaw);
    const fz = -Math.cos(c.yaw);
    const rx = Math.cos(c.yaw);
    const rz = -Math.sin(c.yaw);
    let wx = fx * cmd.forward + rx * cmd.strafe;
    let wz = fz * cmd.forward + rz * cmd.strafe;
    const len = Math.hypot(wx, wz);
    let wishSpeed = 0;
    if (len > 0.001) {
      wishSpeed = maxSpeed * Math.min(1, len);
      wx /= len;
      wz /= len;
    }
    const r = stepBody(this.world, c, { wishX: wx, wishZ: wz, wishSpeed, jump: cmd.jump, crouch: cmd.crouch }, dt);
    c.speed2D = Math.hypot(c.vel.x, c.vel.z);
    c.walking = cmd.walk;
    if (r.jumped) this.emit({ type: 'jump', id: c.id, x: c.pos.x, y: c.pos.y, z: c.pos.z });
    if (r.landed && r.impact > 3) this.emit({ type: 'land', id: c.id, impact: r.impact, x: c.pos.x, y: c.pos.y, z: c.pos.z });

    // ---- footsteps (walking / crouching is silent)
    if (c.onGround && !cmd.walk && c.crouch < 0.5 && c.speed2D > 2.6) {
      c.stepAccum += c.speed2D * dt;
      if (c.stepAccum >= 2.1) {
        c.stepAccum = 0;
        this.emit({ type: 'footstep', id: c.id, x: c.pos.x, y: c.pos.y, z: c.pos.z });
        this.emitNoise(c, 24, 'step');
      }
    } else if (c.speed2D < 1) c.stepAccum = 0;

    // ---- weapons
    tickWeapons(this, c, dt, canShoot);
  }

  /** Characters are soft bodies: overlapping ones are pushed apart, then re-clamped to the walls. */
  private separate(): void {
    const cs = this.chars;
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j];
        if (!b.alive || Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const min = PLAYER.radius * 1.7;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        let nx: number;
        let nz: number;
        if (d < 1e-4) {
          nx = 1;
          nz = 0;
        } else {
          nx = dx / d;
          nz = dz / d;
        }
        const push = (min - d) * 0.5;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        b.pos.x += nx * push;
        b.pos.z += nz * push;
        this.world.resolveCircle(a.pos, PLAYER.radius, a.pos.y, PLAYER.height, PLAYER.stepHeight);
        this.world.resolveCircle(b.pos, PLAYER.radius, b.pos.y, PLAYER.height, PLAYER.stepHeight);
      }
    }
  }

  private updateSpotting(): void {
    for (const viewer of ['CT', 'T'] as const) {
      for (const e of this.chars) {
        if (!e.alive || e.team === viewer) continue;
        for (const f of this.chars) {
          if (!f.alive || f.team !== viewer) continue;
          const dx = e.pos.x - f.pos.x;
          const dz = e.pos.z - f.pos.z;
          if (dx * dx + dz * dz > 140 * 140) continue;
          // must be in front of the teammate (~130 degree cone)
          const cosA = (dx * -Math.sin(f.yaw) + dz * -Math.cos(f.yaw)) / Math.max(1e-6, Math.hypot(dx, dz));
          if (cosA < 0.42 && dx * dx + dz * dz > 4) continue;
          if (this.world.lineClear(f.pos.x, f.eyeY, f.pos.z, e.pos.x, e.pos.y + 1.3, e.pos.z)) {
            this.spotted[viewer].set(e.id, this.time + 1.2);
            break;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ damage & death

  applyDamage(attacker: Character, victim: Character, weaponId: string, hitbox: Hitbox, dist: number, extraMul: number, x: number, y: number, z: number): void {
    const def = getWeapon(weaponId);
    const res = computeDamage(def, hitbox, dist, victim.armor, victim.helmet, extraMul);
    this.applyDamageRaw(attacker, victim, weaponId, hitbox, res.health, res.armorLoss, x, y, z);
  }

  applyDamageRaw(attacker: Character | null, victim: Character, weaponId: string, hitbox: Hitbox, health: number, armorLoss: number, x: number, y: number, z: number): void {
    if (!victim.alive || (this.phase !== 'live' && this.phase !== 'planted')) return;
    const dmg = Math.max(1, Math.round(health));
    const armorTaken = Math.min(victim.armor, Math.round(armorLoss));
    victim.armor = Math.max(0, victim.armor - armorTaken);
    victim.health -= dmg;
    victim.lastHurtTime = this.time;
    if (attacker) {
      victim.lastHurtDir = anglesFromDelta(attacker.pos.x - victim.pos.x, 0, attacker.pos.z - victim.pos.z).yaw;
      victim.brain?.onDamaged(attacker);
    }
    const killed = victim.health <= 0;
    this.emit({ type: 'hit', attacker: attacker ? attacker.id : -1, victim: victim.id, damage: dmg, armorLoss: armorTaken, hitbox, headshot: hitbox === 'head', killed, weapon: weaponId, x, y, z });
    if (killed) this.kill(attacker, victim, weaponId, hitbox === 'head');
  }

  /** Non-weapon damage (C4 explosion). */
  applyEnvironmentDamage(victim: Character, dmg: number): void {
    if (!victim.alive) return;
    const armorTaken = Math.min(victim.armor, Math.round(dmg * 0.25));
    victim.armor -= armorTaken;
    victim.health -= Math.round(dmg * 0.8);
    if (victim.health <= 0) this.kill(null, victim, 'c4', false);
  }

  private kill(attacker: Character | null, victim: Character, weaponId: string, headshot: boolean): void {
    victim.health = 0;
    victim.alive = false;
    victim.deathTime = this.time;
    victim.deaths++;
    victim.scope = 0;
    victim.reloadEnd = -1;
    victim.plantProgress = 0;
    victim.defuseProgress = 0;
    clearCmd(victim.cmd);
    dropBomb(this, victim);
    let killerName = 'C4';
    let killerTeam: Team = 'T';
    if (attacker) {
      killerName = attacker.name;
      killerTeam = attacker.team;
      if (attacker.team !== victim.team) {
        attacker.kills++;
        attacker.score += 2;
        const reward = weaponId === 'c4' ? 0 : getWeapon(weaponId).killReward;
        attacker.money = Math.min(ROUND.maxMoney, attacker.money + reward);
      }
    }
    const entry: KillEntry = {
      id: this.killSeq++,
      time: this.time,
      killer: killerName,
      killerTeam,
      victim: victim.name,
      victimTeam: victim.team,
      weapon: weaponId,
      headshot,
      involvesPlayer: (!!attacker && attacker.id === this.playerId) || victim.id === this.playerId,
    };
    this.killfeed.push(entry);
    if (this.killfeed.length > 8) this.killfeed.shift();
    this.emit({ type: 'kill', killer: attacker ? attacker.id : -1, victim: victim.id, weapon: weaponId, headshot, killerTeam, victimTeam: victim.team, killerName, victimName: victim.name });
    if (victim.id === this.playerId) {
      this.spectateId = -1;
      this.cycleSpectate(1);
    }
  }

  // ------------------------------------------------------------------ round flow

  private checkWin(): void {
    const ct = this.aliveCount('CT');
    const t = this.aliveCount('T');
    if (ct === 0) this.endRound('T', 'elimination');
    else if (t === 0 && this.bomb.state !== 'planted') this.endRound('CT', 'elimination');
    else if (this.phase === 'live' && this.roundTimeLeft <= 0) this.endRound('CT', 'time');
  }

  endRound(winner: Team, reason: EndReason): void {
    if (this.phase === 'roundEnd' || this.phase === 'matchEnd') return;
    this.phase = 'roundEnd';
    this.phaseTime = 0;
    this.endTimer = ROUND.roundEndTime;
    this.winner = winner;
    this.endReason = reason;
    this.score[winner]++;

    const loser: Team = winner === 'CT' ? 'T' : 'CT';
    const winReward = reason === 'bomb_exploded' ? ECONOMY.winBomb : reason === 'bomb_defused' ? ECONOMY.winDefuse : reason === 'time' ? ECONOMY.winTime : ECONOMY.winElimination;
    const lossReward = Math.min(ECONOMY.lossMax, ECONOMY.lossBase + ECONOMY.lossStep * this.lossStreak[loser]);
    const plantedLoss = loser === 'T' && this.bomb.state === 'planted' ? 800 : 0;
    for (const c of this.chars) {
      const add = c.team === winner ? winReward : lossReward + plantedLoss;
      c.money = Math.min(ROUND.maxMoney, c.money + add);
    }
    this.lossStreak[winner] = Math.max(0, this.lossStreak[winner] - 1);
    this.lossStreak[loser] = Math.min(4, this.lossStreak[loser] + 1);
    if (this.score[winner] >= this.winScore) this.matchWinner = winner;
    this.emit({ type: 'roundEnd', winner, reason });
  }

  onBombPlanted(): void {
    onBombPlanted(this);
  }

  /** Reset the map for a new round: spawn everybody, hand out the bomb, buy, plan. */
  startRound(): void {
    this.roundNumber++;
    this.phase = 'freeze';
    this.phaseTime = 0;
    this.freezeLeft = ROUND.freezeTime;
    this.roundTimeLeft = ROUND.roundTime;
    this.winner = null;
    this.endReason = null;
    this.noises = [];
    this.fleeIssued = false;
    this.intel = { CT: null, T: null };
    this.spotted.CT.clear();
    this.spotted.T.clear();
    this.world.closeAllDoors();
    this.doorWasOpen = this.world.doors.map(() => false);
    this.spectateId = -1;

    const first = this.roundNumber === 1;
    const pistolKit = ROUND_PRESETS.pistol;
    for (const team of ['CT', 'T'] as const) {
      const order = this.rng.shuffle([0, 1, 2, 3, 4]);
      const spawns = this.map.spawns[team];
      const members = this.chars.filter((c) => c.team === team);
      members.forEach((c, i) => {
        const wasAlive = c.alive;
        const sp = spawns[order[i]];
        c.pos.x = sp.x;
        c.pos.z = sp.z;
        c.pos.y = this.world.terrainHeight(sp.x, sp.z);
        c.prevPos.x = c.pos.x;
        c.prevPos.y = c.pos.y;
        c.prevPos.z = c.pos.z;
        c.vel.x = c.vel.y = c.vel.z = 0;
        c.onGround = true;
        c.crouch = 0;
        c.yaw = sp.yaw;
        c.pitch = 0;
        c.punchPitch = 0;
        c.punchYaw = 0;
        c.health = 100;
        c.alive = true;
        c.reloadEnd = -1;
        c.scope = 0;
        c.plantProgress = 0;
        c.defuseProgress = 0;
        c.lastHurtTime = -99;
        c.lastShotTime = -99;
        c.deathTime = -1;
        c.stepAccum = 0;
        c.speed2D = 0;
        clearCmd(c.cmd);
        c.prevFire = c.prevFire2 = c.prevReload = false;
        if (first) {
          resetLoadout(c, this.preset, this.time);
          c.money = this.preset.startMoney;
        } else if (!wasAlive) {
          resetLoadout(c, pistolKit, this.time);
        }
        refillAmmo(c);
        const w = c.weapon;
        w.deployEnd = this.time;
        if (c.activeSlot === 'melee' || (c.primary && c.activeSlot !== 'primary')) {
          c.activeSlot = c.primary ? 'primary' : 'secondary';
          c.weapon.deployEnd = this.time;
        }
      });
    }

    // full-buy preset: one AWP per team, the rest get the standard rifle from the preset
    if (first && this.preset.primary) {
      for (const team of ['CT', 'T'] as const) {
        const bots = this.chars.filter((c) => c.team === team && !c.isHuman);
        if (bots.length) giveWeapon(this.rng.pick(bots), 'awp', this.time);
      }
    }

    // economy: bots always shop after the pistol round; the human only if auto-buy is on
    const shop = !(first && !this.preset.primary);
    if (shop) {
      for (const c of this.chars) {
        if (c.isHuman && !this.cfg.autoBuyHuman) continue;
        this.phase = 'freeze';
        autoBuy(this, c);
        if (c.primary) {
          c.activeSlot = 'primary';
          c.primary.deployEnd = this.time;
        }
      }
    }

    assignBomb(this);
    for (const c of this.chars) {
      if (c.brain) c.brain.reset();
    }
    assignTactics(this);
    this.emit({ type: 'roundStart', round: this.roundNumber });
  }

  /** Force a weapon switch for the human from UI code (e.g. buy menu). */
  equip(slot: 'primary' | 'secondary' | 'melee'): void {
    const h = this.human;
    if (h && h.alive) switchTo(this, h, slot);
  }
}
