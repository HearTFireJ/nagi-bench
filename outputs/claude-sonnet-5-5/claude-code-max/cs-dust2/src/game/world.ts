// The simulation root: owns the level, actors, bomb and round state, and advances everything with a fixed timestep.
// Rendering, audio and the React HUD only ever *read* this object (and subscribe to `events`); they never mutate it,
// except for the human's `input` and the explicit command methods (buy, take over, ...).
import { Emitter } from '../core/emitter';
import { Rng, clamp, dist2D } from '../core/math';
import { BOT_NAMES, DEFAULT_MATCH, ECONOMY, ROUND } from './config';
import type { MatchConfig } from './config';
import { createActor } from './actor';
import { BotBrain } from './ai/brain';
import { canSee } from './ai/perception';
import { planCounterTerrorists, planTerrorists } from './ai/plans';
import { createBomb, dropBomb, updateBomb, updateBombUse } from './bomb';
import { pickupWeapon, updateWeapons } from './combat';
import type { GameEvent, RoundEndReason } from './events';
import { createLevel, resetDoors, updateDoors } from './level';
import type { Level } from './level';
import { applyLoadout, botBuy, buyItem, giveDefaultGear, lossBonus, presetFor, refillAmmo } from './loadout';
import type { BuyItem } from './loadout';
import { floorAt } from './map/build';
import { stepMovement } from './movement';
import { makeInput, otherTeam } from './types';
import type { Actor, DroppedWeapon, SiteId, Team } from './types';
import type { BombState } from './bomb';
import type { NavPoint } from './nav';

export type Phase = 'freeze' | 'live' | 'planted' | 'roundEnd' | 'matchEnd';

export interface RoundState {
  number: number;
  phase: Phase;
  phaseStart: number;
  phaseEnd: number;
  winner: Team | null;
  reason: RoundEndReason | null;
  score: Record<Team, number>;
  lossStreak: Record<Team, number>;
  /** Is the current round a pistol round (default pistols only, purchases locked)? */
  pistol: boolean;
}

const TEAM_SIZE = 5;

export class World {
  readonly level: Level;
  readonly events = new Emitter<GameEvent>();
  readonly rng: Rng;
  readonly cfg: MatchConfig;

  time = 0;
  actors: Actor[] = [];
  brains = new Map<number, BotBrain>();
  playerId = 0;
  controlledId = 0;
  bomb: BombState = createBomb();
  drops: DroppedWeapon[] = [];
  nextDropId = 1;
  round: RoundState;
  tacticNames: Record<Team, string> = { T: '', CT: '' };
  /** T post-plant positions with line of sight to the bomb (computed when it is planted). */
  guardSpots: NavPoint[] = [];
  /** The T bot currently assigned to pick up a dropped bomb (-1 = nobody). */
  bombFetcherId = -1;
  /** Per team: enemy id -> last time any teammate had line of sight (drives the minimap). */
  spotted: Record<Team, Map<number, number>> = { T: new Map(), CT: new Map() };
  private spotTimer = 0;

  constructor(cfg: Partial<MatchConfig> = {}, level?: Level) {
    this.cfg = { ...DEFAULT_MATCH, ...cfg };
    this.level = level ?? createLevel();
    this.rng = new Rng(this.cfg.seed);
    this.round = {
      number: 0,
      phase: 'freeze',
      phaseStart: 0,
      phaseEnd: 0,
      winner: null,
      reason: null,
      score: { T: 0, CT: 0 },
      lossStreak: { T: 0, CT: 0 },
      pistol: this.cfg.pistolRound,
    };
    this.createActors();
    this.startRound();
  }

  get controlled(): Actor {
    return this.actors[this.controlledId];
  }

  get player(): Actor {
    return this.actors[this.playerId];
  }

  emit(e: GameEvent): void {
    this.listenForAI(e);
    this.events.emit(e);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------------------------------------------------------

  private createActors(): void {
    const difficulty = this.cfg.difficulty;
    let id = 0;
    for (const team of ['CT', 'T'] as Team[]) {
      for (let i = 0; i < TEAM_SIZE; i++) {
        const isPlayer = !this.cfg.allBots && team === this.cfg.playerTeam && i === 0;
        const name = isPlayer ? 'You' : BOT_NAMES[team][i % BOT_NAMES[team].length];
        const actor = createActor(id, name, team, !isPlayer);
        this.actors.push(actor);
        if (isPlayer) {
          this.playerId = id;
          this.controlledId = id;
          actor.human = true;
        } else {
          // Attackers get a small handicap in their favour: defenders hold pre-aimed angles, which is a big edge for bots.
          const sideBonus = team === 'T' ? 0.1 : 0;
          const skill = clamp(difficulty + sideBonus + (this.rng.next() - 0.5) * 0.3, 0.1, 0.95);
          this.brains.set(id, new BotBrain(id, skill));
        }
        id++;
      }
    }
  }

  /** Begin the next round: respawn everybody, hand out gear and the bomb, and give bots their plans. */
  startRound(): void {
    const r = this.round;
    r.number++;
    r.phase = 'freeze';
    r.phaseStart = this.time;
    r.phaseEnd = this.time + ROUND.freezeTime;
    r.winner = null;
    r.reason = null;
    r.pistol = r.number === 1 && this.cfg.pistolRound;

    resetDoors(this.level);
    this.drops.length = 0;
    this.bomb = createBomb();
    this.guardSpots = [];
    this.spotted.T.clear();
    this.spotted.CT.clear();

    // Control returns to the player's own slot every round.
    this.controlledId = this.playerId;

    for (const team of ['CT', 'T'] as Team[]) {
      const spawns = this.rng.shuffle(this.level.map.spawns[team].slice());
      const members = this.actors.filter((a) => a.team === team);
      members.forEach((a, i) => this.respawn(a, spawns[i % spawns.length]));
    }
    for (const a of this.actors) a.human = !this.cfg.allBots && a.id === this.playerId;

    this.equipForRound();

    // Bomb goes to a random T (bots preferred so the human is not always the planter).
    const ts = this.actors.filter((a) => a.team === 'T');
    const bots = ts.filter((a) => a.isBot);
    const carrier = bots.length > 0 && !(this.player.team === 'T' && this.rng.chance(0.2)) ? this.rng.pick(bots) : this.rng.pick(ts);
    carrier.hasBomb = true;
    this.bomb.carrierId = carrier.id;
    this.bomb.status = 'carried';

    this.assignPlans(carrier);
    if (!r.pistol || r.number > 1) {
      for (const a of this.actors) if (a.isBot && !a.human) botBuy(this, a);
    }
    this.emit({ type: 'roundStart', round: r.number });
  }

  private respawn(a: Actor, spawn: { x: number; z: number; yaw: number }): void {
    const y = floorAt(this.level.map, spawn.x, spawn.z);
    a.pos.x = a.prevPos.x = spawn.x;
    a.pos.y = a.prevPos.y = Number.isNaN(y) ? 0 : y;
    a.pos.z = a.prevPos.z = spawn.z;
    a.vel.x = a.vel.y = a.vel.z = 0;
    a.yaw = spawn.yaw;
    a.pitch = 0;
    a.onGround = true;
    a.stepAccum = 0;
    a.fallSpeed = 0;
    a.punchPitch = a.punchYaw = 0;
    a.shotSpread = 0;
    a.spread = 0;
    a.scopeLevel = 0;
    a.useKind = null;
    a.useProgress = 0;
    a.reloadEndsAt = 0;
    a.nextFireAt = 0;
    a.drawEndsAt = 0;
    a.triggerWasDown = false;
    a.shotIndex = 0;
    a.hp = 100;
    a.lastHurtAt = -10;
    a.input = makeInput();
  }

  private equipForRound(): void {
    const r = this.round;
    const first = r.number === 1;
    for (const a of this.actors) {
      const wasAlive = a.alive;
      a.alive = true;
      if (first) {
        applyLoadout(a, presetFor(this.cfg.pistolRound));
      } else if (wasAlive) {
        refillAmmo(a);
        a.activeSlot = a.weapons.primary ? 'primary' : 'secondary';
        a.hasBomb = false;
      } else {
        giveDefaultGear(a);
      }
      a.lastSlot = 'melee';
    }
  }

  private assignPlans(carrier: Actor): void {
    const rng = this.rng;
    const ts = this.actors.filter((a) => a.team === 'T' && !a.human);
    const cts = this.actors.filter((a) => a.team === 'CT' && !a.human);
    const tTactic = planTerrorists(rng, ts.length);
    const ctTactic = planCounterTerrorists(rng, cts.length);
    this.tacticNames = { T: tTactic.name, CT: ctTactic.name };
    // The carrier must follow a route that ends at a site (never the mid lurker).
    const plans = tTactic.plans.slice();
    const order = ts.slice();
    rng.shuffle(order);
    const carrierIdx = order.indexOf(carrier);
    if (carrierIdx > 0) {
      const tmp = order[0];
      order[0] = order[carrierIdx];
      order[carrierIdx] = tmp;
    }
    plans.sort((p, q) => Number(p.lurker) - Number(q.lurker));
    order.forEach((a, i) => this.brains.get(a.id)?.reset(plans[i % plans.length], a));
    rng.shuffle(cts).forEach((a, i) => this.brains.get(a.id)?.reset(ctTactic.plans[i % ctTactic.plans.length], a));
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Fixed step
  // ------------------------------------------------------------------------------------------------------------------

  step(dt: number): void {
    this.time += dt;
    const r = this.round;
    for (const a of this.actors) {
      a.prevPos.x = a.pos.x;
      a.prevPos.y = a.pos.y;
      a.prevPos.z = a.pos.z;
    }

    // Bots think before physics so their inputs apply this very tick.
    for (const a of this.actors) {
      if (a.human) continue;
      const brain = this.brains.get(a.id);
      if (brain) brain.update(this, a, dt);
    }

    updateDoors(this.level, this.actors, dt, (door, opening) =>
      this.emit({ type: 'doorMove', doorId: door.def.id, opening, pos: { x: door.def.x, y: door.floorY + 1, z: door.def.z } }),
    );

    const frozen = r.phase === 'freeze' || r.phase === 'matchEnd';
    for (const a of this.actors) {
      if (!a.alive) {
        // Corpses still fall to the floor.
        stepMovement(this.level.cw, a, dt, true, this.noop);
        updateWeapons(this, a, dt, true);
        continue;
      }
      stepMovement(this.level.cw, a, dt, frozen, (e) => this.emit(e));
      updateWeapons(this, a, dt, frozen);
      updateBombUse(this, a, dt);
      this.updatePickups(a);
      if (a.pos.y < -15) this.rescue(a);
    }

    updateBomb(this);
    this.updateBombFetcher();

    // Phase machine.
    if (r.phase === 'freeze' && this.time >= r.phaseEnd) {
      r.phase = 'live';
      r.phaseStart = this.time;
      r.phaseEnd = this.time + ROUND.roundTime;
      this.emit({ type: 'freezeEnd', round: r.number });
    } else if (r.phase === 'live' && this.time >= r.phaseEnd) {
      this.endRound('CT', 'time');
    } else if (r.phase === 'roundEnd' && this.time >= r.phaseEnd) {
      this.startRound();
    }
    if (r.phase === 'live' || r.phase === 'planted') this.checkElimination();

    this.spotTimer -= dt;
    if (this.spotTimer <= 0) {
      this.spotTimer = 0.2;
      this.updateSpotted();
    }
  }

  private readonly noop = (): void => {};

  /**
   * Exactly one T bot is sent to recover a dropped bomb. The assignment is sticky (only re-picked when the fetcher dies):
   * letting every bot decide "am I the nearest?" each tick makes two equidistant bots flip roles forever.
   */
  private updateBombFetcher(): void {
    const b = this.bomb;
    if (b.status !== 'dropped') {
      this.bombFetcherId = -1;
      return;
    }
    const cur = this.bombFetcherId >= 0 ? this.actors[this.bombFetcherId] : null;
    if (cur && cur.alive && cur.team === 'T' && !cur.human) return;
    let best = Infinity;
    let bestId = -1;
    for (const a of this.actors) {
      if (!a.alive || a.team !== 'T' || a.human) continue;
      const d = dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z);
      if (d < best) {
        best = d;
        bestId = a.id;
      }
    }
    this.bombFetcherId = bestId;
  }

  private rescue(a: Actor): void {
    const spawn = this.level.map.spawns[a.team][0];
    a.pos.x = spawn.x;
    a.pos.z = spawn.z;
    a.pos.y = floorAt(this.level.map, spawn.x, spawn.z);
    a.vel.x = a.vel.y = a.vel.z = 0;
  }

  private updatePickups(a: Actor): void {
    if (this.drops.length === 0) return;
    const wantsPick = a.human ? a.input.use && a.useKind === null : !a.weapons.primary;
    if (!wantsPick) return;
    let best: DroppedWeapon | null = null;
    let bestD = 1.7;
    for (const d of this.drops) {
      if (d.ownerId === a.id && this.time - d.at < 1.0) continue;
      const dist = dist2D(a.pos.x, a.pos.z, d.pos.x, d.pos.z);
      if (dist < bestD && Math.abs(a.pos.y - d.pos.y) < 1.5) {
        bestD = dist;
        best = d;
      }
    }
    if (!best) return;
    const slot = best.weapon.id === 'awp' || best.weapon.id === 'ak47' || best.weapon.id === 'm4a4' ? 'primary' : 'secondary';
    // Bots only grab primaries; humans can swap anything (but never take the other team's default pistol by accident).
    if (!a.human && slot !== 'primary') return;
    pickupWeapon(this, a, best);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Round flow
  // ------------------------------------------------------------------------------------------------------------------

  private checkElimination(): void {
    let t = 0;
    let ct = 0;
    for (const a of this.actors) {
      if (!a.alive) continue;
      if (a.team === 'T') t++;
      else ct++;
    }
    const planted = this.bomb.status === 'planted';
    if (ct === 0) this.endRound('T', 'elimination');
    else if (t === 0 && !planted) this.endRound('CT', 'elimination');
  }

  onBombPlanted(_planter: Actor, _site: SiteId): void {
    const r = this.round;
    r.phase = 'planted';
    r.phaseStart = this.time;
    r.phaseEnd = this.bomb.explodeAt;
    this.computeGuardSpots();
  }

  /** Post-plant positions for T: walkable spots 6-22 m from the bomb that can see it, spread around it. */
  private computeGuardSpots(): void {
    const { nav, cw } = this.level;
    const b = this.bomb;
    const cands: NavPoint[] = [];
    for (let dz = -22; dz <= 22; dz += 1.5) {
      for (let dx = -22; dx <= 22; dx += 1.5) {
        const d = Math.hypot(dx, dz);
        if (d < 6 || d > 22) continue;
        const x = b.pos.x + dx;
        const z = b.pos.z + dz;
        const idx = nav.cellIndex(x, z);
        if (idx < 0 || nav.walkable[idx] === 0 || nav.clearance[idx] < 2) continue;
        const eye = { x, y: nav.height[idx] + 1.6, z };
        if (cw.lineClear(eye, { x: b.pos.x, y: b.pos.y + 0.5, z: b.pos.z })) cands.push({ x, z });
      }
    }
    this.rng.shuffle(cands);
    const chosen: NavPoint[] = [];
    for (const c of cands) {
      if (chosen.every((o) => dist2D(o.x, o.z, c.x, c.z) >= 5)) chosen.push(c);
      if (chosen.length >= 5) break;
    }
    this.guardSpots = chosen;
  }

  /** Finish the round: score, economy, and schedule the next round (or end the match). */
  endRound(winner: Team, reason: RoundEndReason): void {
    const r = this.round;
    if (r.phase === 'roundEnd' || r.phase === 'matchEnd') return;
    r.winner = winner;
    r.reason = reason;
    r.score[winner]++;
    const loser = otherTeam(winner);
    r.lossStreak[winner] = 0;
    r.lossStreak[loser]++;
    for (const a of this.actors) {
      const bonus = a.team === winner ? ECONOMY.winBonus : lossBonus(r.lossStreak[loser]);
      a.money = Math.min(ECONOMY.maxMoney, a.money + bonus);
    }
    r.phaseStart = this.time;
    r.phaseEnd = this.time + ROUND.roundEndTime;
    r.phase = 'roundEnd';
    this.emit({ type: 'roundEnd', winner, reason });
    if (r.score[winner] >= ROUND.roundsToWin) {
      r.phase = 'matchEnd';
      this.emit({ type: 'matchEnd', winner });
    }
  }

  bombDropped(carrier: Actor): void {
    dropBomb(this, carrier);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Commands from the UI
  // ------------------------------------------------------------------------------------------------------------------

  buy(actorId: number, item: BuyItem): boolean {
    if (this.round.pistol) return false;
    return buyItem(this, this.actors[actorId], item);
  }

  /** After dying, the player may take over a living teammate bot. */
  takeOver(botId: number): boolean {
    const me = this.controlled;
    const target = this.actors[botId];
    if (!target || me.alive || !target.alive || target.team !== this.player.team || target.human) return false;
    if (this.round.phase === 'roundEnd' || this.round.phase === 'matchEnd') return false;
    me.human = false;
    target.human = true;
    this.controlledId = botId;
    target.input = makeInput();
    return true;
  }

  aliveCount(team: Team): number {
    let n = 0;
    for (const a of this.actors) if (a.alive && a.team === team) n++;
    return n;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // AI hearing & shared intel
  // ------------------------------------------------------------------------------------------------------------------

  alertTeam(team: Team, x: number, z: number, exceptId: number): void {
    for (const a of this.actors) {
      if (!a.alive || a.team !== team || a.id === exceptId || a.human) continue;
      if (dist2D(a.pos.x, a.pos.z, x, z) > 60) continue;
      const brain = this.brains.get(a.id);
      if (brain && brain.state !== 'engage') brain.hear(this, x, z);
    }
  }

  private listenForAI(e: GameEvent): void {
    if (e.type === 'shot' && e.weapon !== 'knife') {
      const shooter = this.actors[e.actorId];
      for (const a of this.actors) {
        if (!a.alive || a.team === shooter.team || a.human) continue;
        if (dist2D(a.pos.x, a.pos.z, shooter.pos.x, shooter.pos.z) > 45) continue;
        const brain = this.brains.get(a.id);
        if (brain && brain.state !== 'engage') brain.hear(this, shooter.pos.x, shooter.pos.z);
      }
    } else if (e.type === 'footstep' && !e.walk) {
      const mover = this.actors[e.actorId];
      for (const a of this.actors) {
        if (!a.alive || a.team === mover.team || a.human) continue;
        if (dist2D(a.pos.x, a.pos.z, e.pos.x, e.pos.z) > 13) continue;
        const brain = this.brains.get(a.id);
        if (brain && brain.state !== 'engage' && brain.state !== 'plant' && brain.state !== 'defuse') brain.hear(this, e.pos.x, e.pos.z);
      }
    }
  }

  private updateSpotted(): void {
    for (const team of ['T', 'CT'] as Team[]) {
      const map = this.spotted[team];
      for (const viewer of this.actors) {
        if (!viewer.alive || viewer.team !== team) continue;
        for (const enemy of this.actors) {
          if (!enemy.alive || enemy.team === team) continue;
          if (canSee(this, viewer, enemy, -1)) map.set(enemy.id, this.time);
        }
      }
    }
  }

  /** Enemies of `team` that a teammate saw within the last `window` seconds. */
  isSpotted(team: Team, enemyId: number, window = 1.2): boolean {
    const t = this.spotted[team].get(enemyId);
    return t !== undefined && this.time - t <= window;
  }
}
