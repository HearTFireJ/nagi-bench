import type { Game, Difficulty } from '../game/game.ts';
import type { Character } from '../entities/character.ts';
import type { Rng, Vec2 } from '../math.ts';
import { DEG, anglesFromDelta, clamp, wrapPi } from '../math.ts';
import type { SiteId } from '../game/events.ts';
import { rotationPlan } from './tactics.ts';

/**
 * Bot brain: a two-layer finite state machine.
 *
 *   objective layer  idle -> travel -> hold -> (plant | defuse | pickup)   driven by the team plan
 *   reactive layer   engage (enemy in sight) -> search (lost sight / heard noise) -> back to objective
 *
 * Every tick the brain writes a `UserCmd` (the same interface the human uses) and smooth
 * view angles, so bots obey exactly the same movement, recoil and weapon rules as the player.
 */
export type BotState = 'idle' | 'travel' | 'hold' | 'engage' | 'search' | 'plant' | 'defuse' | 'pickup' | 'dead';

export interface PlanStep {
  x: number;
  z: number;
  /** seconds to hold position (and watch) after arriving; 0 = keep going */
  hold: number;
  /** wait here until this many seconds of live round time have passed (team "execute" timing) */
  waitUntil?: number;
  /** after the bomb is planted: wait here until the fuse has this many seconds left (group retake) */
  waitBombLeft?: number;
  action?: 'plant';
  site?: SiteId;
  /** optional point to face while holding */
  look?: Vec2;
}

export interface BotSkill {
  /** seconds from spotting an enemy to the first shot */
  reaction: number;
  /** max view turn speed, deg/s */
  aimSpeed: number;
  /** random aim error, degrees (scaled by distance) */
  aimError: number;
  /** 0..1 how much of the recoil the bot compensates */
  recoilControl: number;
  /** chance to aim at the head */
  headBias: number;
  hearChance: number;
}

export function skillFor(d: Difficulty, rng: Rng, defender = false): BotSkill {
  const base: BotSkill =
    d === 'easy'
      ? { reaction: 0.6, aimSpeed: 230, aimError: 3.2, recoilControl: 0.3, headBias: 0.08, hearChance: 0.5 }
      : d === 'hard'
        ? { reaction: 0.26, aimSpeed: 640, aimError: 0.9, recoilControl: 0.78, headBias: 0.34, hearChance: 0.9 }
        : { reaction: 0.4, aimSpeed: 400, aimError: 1.8, recoilControl: 0.55, headBias: 0.2, hearChance: 0.7 };
  const j = () => 0.85 + rng.next() * 0.3;
  // defenders know their angles: pre-aimed, so slightly quicker and tighter
  const edge = defender ? 0.72 : 1;
  return {
    reaction: base.reaction * j() * edge,
    aimSpeed: base.aimSpeed * j(),
    aimError: base.aimError * j() * edge,
    recoilControl: clamp(base.recoilControl * j(), 0, 0.95),
    headBias: base.headBias * j(),
    hearChance: base.hearChance,
  };
}

/** Behaviour switches (kept in one place so the AI can be tuned / A-B tested headlessly). */
export const TUNING = {
  /** defenders leave their post to chase noises / attackers */
  ctChase: false,
  /** all defenders (not just the mid player) rotate to the other bombsite after a radio contact call */
  ctRotate: false,
};

const MAX_SIGHT = 150;
const HALF_FOV_COS = Math.cos(85 * DEG);

export class BotBrain {
  readonly game: Game;
  readonly ch: Character;
  skill: BotSkill;

  state: BotState = 'idle';
  stateTime = 0;
  role = '';

  plan: PlanStep[] = [];
  planIdx = 0;
  patrol: PlanStep[] = [];
  patrolIdx = 0;
  holdLeft = 0;

  // navigation
  private path: Vec2[] = [];
  private pathIdx = 0;
  private pathGoal: Vec2 | null = null;
  private repathAt = 0;
  private stuckTimer = 0;
  private stuckCheckAt = 0;
  private stuckX = 0;
  private stuckZ = 0;
  private unstickLeft = 0;
  private unstickDir = 1;

  // perception / combat
  target: Character | null = null;
  targetVisible = false;
  lastSeen: { x: number; y: number; z: number } | null = null;
  lastSeenTime = -99;
  private visible: Character[] = [];
  private perceiveAt = 0;
  private reactionLeft = 0;
  private aimNoiseYaw = 0;
  private aimNoisePitch = 0;
  private aimNoiseTimer = 0;
  private aimHead = false;
  private aimRoll = 0;
  private crouchHold = false;
  private strafeDir = 1;
  private strafeTimer = 0;
  private stopTimer = 0;
  private burstCount = 0;
  private burstPause = 0;
  private lastMag = 0;
  private stillTime = 0;
  private scopeCooldown = 0;
  private lastNoiseCheck = 0;
  private noiseCooldown = 0;
  private intelCheckAt = 0;
  private rotatedUntil = 0;

  // search
  private searchPos: Vec2 | null = null;
  private searchLeft = 0;
  private searchLookYaw = 0;

  // hold / watch
  private watchYaw = 0;
  private watchPhase = 0;
  private lookAtYaw: number | null = null;
  private bombRoleAt = 0;
  private isDefuserCached = false;
  private isPickerCached = false;

  constructor(game: Game, ch: Character, skill: BotSkill) {
    this.game = game;
    this.ch = ch;
    this.skill = skill;
  }

  /** New round: forget everything. Tactics assigns a plan right afterwards. */
  reset(): void {
    this.state = 'idle';
    this.stateTime = 0;
    this.plan = [];
    this.planIdx = 0;
    this.patrol = [];
    this.patrolIdx = 0;
    this.holdLeft = 0;
    this.path = [];
    this.pathGoal = null;
    this.target = null;
    this.targetVisible = false;
    this.lastSeen = null;
    this.lastSeenTime = -99;
    this.visible = [];
    this.reactionLeft = 0;
    this.burstCount = 0;
    this.burstPause = 0;
    this.stuckTimer = 0;
    this.unstickLeft = 0;
    this.searchPos = null;
    this.noiseCooldown = 0;
    this.lastNoiseCheck = this.game.time;
    this.stopTimer = 0;
    this.lookAtYaw = null;
    this.perceiveAt = this.game.time + this.game.rng.next() * 0.1;
    this.lastMag = this.ch.weapon.mag;
  }

  setPlan(plan: PlanStep[], patrol: PlanStep[] = []): void {
    this.plan = plan;
    this.planIdx = 0;
    this.patrol = patrol;
    this.patrolIdx = 0;
    this.path = [];
    this.pathGoal = null;
    if (this.state !== 'engage' && this.state !== 'plant') this.enter('travel');
  }

  private enter(s: BotState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
    if (s === 'travel' || s === 'search' || s === 'pickup' || s === 'defuse') this.pathGoal = null;
  }

  /** Called by the game when this bot takes damage. */
  onDamaged(attacker: Character): void {
    if (!attacker.alive) return;
    const g = this.game;
    if (this.state === 'engage' && this.targetVisible) return;
    this.target = attacker;
    this.lastSeen = { x: attacker.pos.x, y: attacker.pos.y, z: attacker.pos.z };
    this.lastSeenTime = g.time;
    if (this.ch.team === 'CT' && !TUNING.ctChase && g.bomb.state !== 'planted' && this.state !== 'plant' && this.state !== 'defuse') {
      // defenders don't run at whoever shot them: they turn to the threat and hold the angle
      this.watchYaw = anglesFromDelta(attacker.pos.x - this.ch.pos.x, 0, attacker.pos.z - this.ch.pos.z).yaw;
      this.holdLeft = Math.max(this.holdLeft, 4);
      this.enter('hold');
      return;
    }
    this.searchPos = { x: attacker.pos.x, z: attacker.pos.z };
    this.searchLeft = 5;
    this.searchLookYaw = anglesFromDelta(attacker.pos.x - this.ch.pos.x, 0, attacker.pos.z - this.ch.pos.z).yaw;
    if (this.state !== 'plant' || !this.ch.hasBomb) this.enter('search');
  }

  // ================================================================== main tick

  think(dt: number): void {
    const ch = this.ch;
    const g = this.game;
    if (!ch.alive) {
      this.state = 'dead';
      return;
    }
    this.stateTime += dt;
    this.noiseCooldown -= dt;
    this.scopeCooldown -= dt;

    if (g.phase === 'freeze') {
      // wait at the spawn, looking towards the first waypoint
      const first = this.plan[0];
      if (first) this.faceYaw(anglesFromDelta(first.x - ch.pos.x, 0, first.z - ch.pos.z).yaw, dt, 200);
      ch.pitch += (0 - ch.pitch) * Math.min(1, 6 * dt);
      return;
    }
    if (g.phase === 'roundEnd' || g.phase === 'matchEnd') {
      ch.pitch += (0 - ch.pitch) * Math.min(1, 6 * dt);
      return;
    }

    if (g.time >= this.perceiveAt) {
      this.perceive();
      this.perceiveAt = g.time + 0.09 + this.game.rng.next() * 0.05;
    }
    this.listen();

    // ---- reactive layer
    const threat = this.target !== null && this.target.alive && this.targetVisible;
    if (threat) {
      if (this.state !== 'engage') this.enter('engage');
    } else if (this.state === 'engage') {
      if (g.time - this.lastSeenTime > 0.55 && this.lastSeen) {
        this.searchPos = { x: this.lastSeen.x, z: this.lastSeen.z };
        this.searchLeft = 4.5;
        this.searchLookYaw = ch.yaw;
        this.enter('search');
      } else if (!this.lastSeen) this.enter('travel');
    }

    // ---- objective overrides (bomb, radio)
    if (this.state !== 'engage') {
      this.bombOverrides();
      this.checkIntel();
    }

    switch (this.state) {
      case 'idle':
        this.enter('travel');
        break;
      case 'travel':
        this.doTravel(dt);
        break;
      case 'hold':
        this.doHold(dt);
        break;
      case 'engage':
        this.doEngage(dt);
        break;
      case 'search':
        this.doSearch(dt);
        break;
      case 'plant':
        this.doPlant(dt);
        break;
      case 'defuse':
        this.doDefuse(dt);
        break;
      case 'pickup':
        this.doPickup(dt);
        break;
      default:
        break;
    }

    if (this.state !== 'engage') this.housekeeping();
    if (this.unstickLeft > 0) {
      this.unstickLeft -= dt;
      ch.cmd.strafe = this.unstickDir;
      ch.cmd.forward = ch.cmd.forward === 0 ? 0.6 : ch.cmd.forward;
      ch.cmd.jump = Math.floor(this.unstickLeft * 5) % 2 === 0;
    }
  }

  // ================================================================== perception

  private perceive(): void {
    const g = this.game;
    const ch = this.ch;
    const eyeY = ch.eyeY;
    const fx = -Math.sin(ch.yaw);
    const fz = -Math.cos(ch.yaw);
    this.visible.length = 0;
    let best: Character | null = null;
    let bestD = Infinity;
    for (const e of g.chars) {
      if (!e.alive || e.team === ch.team) continue;
      const dx = e.pos.x - ch.pos.x;
      const dz = e.pos.z - ch.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > MAX_SIGHT * MAX_SIGHT) continue;
      const dist = Math.sqrt(d2);
      if (dist > 3.5 && (dx * fx + dz * fz) / dist < HALF_FOV_COS) continue;
      const headY = e.pos.y + (e.crouch > 0.5 ? 1.15 : 1.58);
      const chestY = e.pos.y + (e.crouch > 0.5 ? 0.85 : 1.15);
      if (g.world.lineClear(ch.pos.x, eyeY, ch.pos.z, e.pos.x, chestY, e.pos.z) || g.world.lineClear(ch.pos.x, eyeY, ch.pos.z, e.pos.x, headY, e.pos.z)) {
        this.visible.push(e);
        if (dist < bestD) {
          bestD = dist;
          best = e;
        }
      }
    }
    if (!best) {
      this.targetVisible = false;
      return;
    }
    const cur = this.target;
    const curStillVisible = cur !== null && cur.alive && this.visible.includes(cur);
    if (!curStillVisible || (cur !== best && Math.hypot(best.pos.x - ch.pos.x, best.pos.z - ch.pos.z) < 0.6 * Math.hypot((cur as Character).pos.x - ch.pos.x, (cur as Character).pos.z - ch.pos.z))) {
      if (this.target !== best) {
        this.target = best;
        // fresh contact: the bot needs a moment to react
        const fresh = g.time - this.lastSeenTime > 1.5;
        this.reactionLeft = fresh ? this.skill.reaction * (0.8 + this.game.rng.next() * 0.5) : this.skill.reaction * 0.35;
        this.aimRoll = 0;
      }
    }
    this.targetVisible = true;
    const t = this.target as Character;
    this.lastSeen = { x: t.pos.x, y: t.pos.y, z: t.pos.z };
    this.lastSeenTime = g.time;
    g.reportContact(ch.team, t.pos.x, t.pos.z);
  }

  /** Radio: idle defenders rotate towards the bombsite where the team just saw an enemy. */
  private checkIntel(): void {
    const g = this.game;
    const ch = this.ch;
    if (g.time < this.intelCheckAt) return;
    this.intelCheckAt = g.time + 1 + this.game.rng.next() * 0.6;
    // site holders stay put (rotating early got them killed piecemeal); the mid player is the rotator
    if (ch.team !== 'CT' || (!TUNING.ctRotate && this.role !== 'CT:MID') || g.bomb.state === 'planted' || g.time < this.rotatedUntil) return;
    if (this.state !== 'hold' && this.state !== 'travel') return;
    const intel = g.intel.CT;
    if (!intel || g.time - intel.time > 8) return;
    if (Math.hypot(intel.x - ch.pos.x, intel.z - ch.pos.z) < 14) return;
    if (this.game.rng.next() > 0.7) return;
    const r = rotationPlan(g, ch, intel.x, intel.z);
    this.rotatedUntil = g.time + 18;
    if (r) this.setPlan(r.plan, r.patrol);
  }

  private listen(): void {
    const g = this.game;
    const ch = this.ch;
    const last = this.lastNoiseCheck;
    this.lastNoiseCheck = g.time;
    if (this.noiseCooldown > 0 || this.state === 'engage' || this.state === 'plant' || this.state === 'defuse' || ch.hasBomb) return;
    for (let i = g.noises.length - 1; i >= 0; i--) {
      const n = g.noises[i];
      if (n.time <= last) break;
      if (n.team === ch.team) continue;
      const d = Math.hypot(n.x - ch.pos.x, n.z - ch.pos.z);
      if (d > Math.min(n.radius, 48) || d < 1) continue;
      if (this.game.rng.next() > this.skill.hearChance * 0.6) continue;
      // defenders that hold a post turn towards the sound instead of running at it
      if (ch.team === 'CT' && !TUNING.ctChase && g.bomb.state !== 'planted') {
        if (this.state === 'hold') this.watchYaw = anglesFromDelta(n.x - ch.pos.x, 0, n.z - ch.pos.z).yaw;
        this.noiseCooldown = 2;
        return;
      }
      this.searchPos = { x: n.x + (this.game.rng.next() - 0.5) * 3, z: n.z + (this.game.rng.next() - 0.5) * 3 };
      this.searchLeft = 5;
      this.searchLookYaw = anglesFromDelta(n.x - ch.pos.x, 0, n.z - ch.pos.z).yaw;
      this.noiseCooldown = 3.5;
      this.enter('search');
      return;
    }
  }

  // ================================================================== bomb objective

  private bombOverrides(): void {
    const g = this.game;
    const ch = this.ch;
    const b = g.bomb;
    if (g.time >= this.bombRoleAt) {
      this.bombRoleAt = g.time + 0.5;
      this.isPickerCached = false;
      this.isDefuserCached = false;
      if (ch.team === 'T' && b.state === 'dropped' && !ch.hasBomb) {
        let bestD = Math.hypot(ch.pos.x - b.pos.x, ch.pos.z - b.pos.z);
        this.isPickerCached = true;
        for (const c of g.chars) {
          if (c === ch || !c.alive || c.team !== 'T' || c.isHuman) continue;
          const d = Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z);
          if (d < bestD - 0.5 || (Math.abs(d - bestD) <= 0.5 && c.id < ch.id)) {
            this.isPickerCached = false;
            break;
          }
        }
      }
      // the designated defuser only goes for the bomb once the retake group commits (or the site is clear)
      const committed = b.timeLeft <= 27 || g.aliveCount('T') === 0;
      if (ch.team === 'CT' && b.state === 'planted' && committed) {
        const mine = Math.hypot(ch.pos.x - b.pos.x, ch.pos.z - b.pos.z);
        this.isDefuserCached = true;
        for (const c of g.chars) {
          if (c === ch || !c.alive || c.team !== 'CT' || c.isHuman) continue;
          const d = Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z);
          if (d < mine - 0.5 || (Math.abs(d - mine) <= 0.5 && c.id < ch.id)) {
            this.isDefuserCached = false;
            break;
          }
        }
      }
    }
    if (this.isPickerCached && b.state === 'dropped') {
      if (this.state !== 'pickup' && this.state !== 'search') this.enter('pickup');
    } else if (this.state === 'pickup') {
      this.enter('travel');
    }
    if (this.isDefuserCached && b.state === 'planted') {
      if (this.state !== 'defuse' && this.state !== 'search') this.enter('defuse');
    } else if (this.state === 'defuse') {
      this.enter('travel');
    }
  }

  // ================================================================== states

  private currentStep(): PlanStep | null {
    if (this.planIdx < this.plan.length) return this.plan[this.planIdx];
    if (this.patrol.length) return this.patrol[this.patrolIdx % this.patrol.length];
    return null;
  }

  private advanceStep(): void {
    if (this.planIdx < this.plan.length) this.planIdx++;
    else this.patrolIdx++;
    this.pathGoal = null;
  }

  private doTravel(dt: number): void {
    const ch = this.ch;
    const step = this.currentStep();
    if (!step) {
      this.holdLeft = 3;
      this.enter('hold');
      return;
    }
    const last = step.action === 'plant';
    const arrived = this.moveTo(step.x, step.z, last ? 0.5 : step.hold > 0 ? 0.9 : 1.4, dt);
    if (arrived) {
      if (step.action === 'plant') {
        this.enter('plant');
        return;
      }
      let wait = step.waitUntil !== undefined ? step.waitUntil - this.game.roundElapsed : 0;
      if (step.waitBombLeft !== undefined && this.game.bomb.state === 'planted') wait = Math.max(wait, this.game.bomb.timeLeft - step.waitBombLeft);
      if (step.hold > 0 || wait > 0) {
        this.holdLeft = Math.max(wait, step.hold * (0.8 + this.game.rng.next() * 0.4));
        this.watchYaw = step.look ? anglesFromDelta(step.look.x - ch.pos.x, 0, step.look.z - ch.pos.z).yaw : this.defaultWatchYaw();
        this.enter('hold');
      } else this.advanceStep();
    }
  }

  /** When a hold step has no look target, face the side of the map the enemy comes from. */
  private defaultWatchYaw(): number {
    const ch = this.ch;
    const enemyDir = ch.team === 'CT' ? { x: 60, z: 90 } : { x: 60, z: 20 };
    return anglesFromDelta(enemyDir.x - ch.pos.x, 0, enemyDir.z - ch.pos.z).yaw;
  }

  private doHold(dt: number): void {
    const ch = this.ch;
    this.holdLeft -= dt;
    this.watchPhase += dt;
    const sweep = Math.sin(this.watchPhase * 0.7) * 0.5 + Math.sin(this.watchPhase * 0.23) * 0.3;
    this.faceYaw(this.watchYaw + sweep, dt, 160);
    ch.pitch += (-0.02 - ch.pitch) * Math.min(1, 5 * dt);
    this.maybeReload();
    if (this.holdLeft <= 0) this.advanceStep();
    if (this.holdLeft <= 0 || this.currentStep() === null) this.enter('travel');
  }

  private doSearch(dt: number): void {
    if (!this.searchPos) {
      this.enter('travel');
      return;
    }
    this.searchLeft -= dt;
    const arrived = this.moveTo(this.searchPos.x, this.searchPos.z, 1.5, dt);
    if (arrived) {
      // look around for a moment
      this.watchPhase += dt;
      this.faceYaw(this.searchLookYaw + Math.sin(this.watchPhase * 2.2) * 1.1, dt, 260);
      this.searchLeft -= dt * 1.5;
    }
    if (this.searchLeft <= 0) {
      this.searchPos = null;
      this.enter('travel');
    }
  }

  private doPickup(dt: number): void {
    const b = this.game.bomb;
    if (b.state !== 'dropped') {
      this.enter('travel');
      return;
    }
    this.moveTo(b.pos.x, b.pos.z, 0.3, dt);
  }

  private doPlant(dt: number): void {
    const ch = this.ch;
    const g = this.game;
    const b = g.bomb;
    if (!ch.hasBomb || b.state !== 'carried') {
      this.enter('travel');
      return;
    }
    // stand still, look at the floor and hold "use"
    ch.pitch += (-0.55 - ch.pitch) * Math.min(1, 6 * dt);
    if (g.time - this.lastSeenTime < 1.2) {
      // an enemy was just around: keep fighting, plant after it calms down
      this.enter('travel');
      return;
    }
    ch.cmd.use = true;
    ch.cmd.crouch = false;
  }

  private doDefuse(dt: number): void {
    const ch = this.ch;
    const g = this.game;
    const b = g.bomb;
    if (b.state !== 'planted') {
      this.enter('travel');
      return;
    }
    const d = Math.hypot(ch.pos.x - b.pos.x, ch.pos.z - b.pos.z);
    if (d > 1.2) {
      this.moveTo(b.pos.x, b.pos.z, 1.0, dt);
      return;
    }
    ch.cmd.use = true;
    ch.cmd.crouch = true;
    ch.pitch += (-0.7 - ch.pitch) * Math.min(1, 6 * dt);
    this.faceYaw(anglesFromDelta(b.pos.x - ch.pos.x, 0, b.pos.z - ch.pos.z).yaw, dt, 300);
  }

  // ================================================================== combat

  private doEngage(dt: number): void {
    const ch = this.ch;
    const g = this.game;
    const t = this.target as Character;
    const cmd = ch.cmd;
    const w = ch.weapon;
    const def = w.def;

    const dx = t.pos.x - ch.pos.x;
    const dz = t.pos.z - ch.pos.z;
    const dist = Math.hypot(dx, dz);
    this.reactionLeft -= dt;

    // ---- weapon choice: don't fight with an empty gun / a sniper rifle at knife range
    if (!ch.reloading) {
      if (def.mag > 0 && w.mag === 0 && w.reserve === 0 && ch.activeSlot === 'primary') cmd.slot = 'secondary';
      else if (def.scope && dist < 7 && ch.secondary.mag > 0 && ch.activeSlot === 'primary') cmd.slot = 'secondary';
      else if (ch.activeSlot === 'secondary' && ch.primary && ch.primary.mag > 0 && !(ch.primary.def.scope && dist < 9) && ch.secondary.mag < 2) cmd.slot = 'primary';
      else if (ch.activeSlot === 'melee' && dist > 3) cmd.slot = ch.primary ? 'primary' : 'secondary';
    }

    // ---- aiming
    this.aimRoll -= dt;
    if (this.aimRoll <= 0) {
      this.aimRoll = 1.2 + this.game.rng.next();
      this.aimHead = this.game.rng.next() < this.skill.headBias;
      this.crouchHold = this.game.rng.next() < 0.6;
    }
    this.aimNoiseTimer -= dt;
    if (this.aimNoiseTimer <= 0) {
      this.aimNoiseTimer = 0.22;
      const errRad = this.skill.aimError * DEG * (0.6 + Math.min(1.6, dist / 40));
      this.aimNoiseYaw = (this.game.rng.next() + this.game.rng.next() - 1) * errRad;
      this.aimNoisePitch = (this.game.rng.next() + this.game.rng.next() - 1) * errRad * 0.7;
    }
    const heightFactor = t.crouch > 0.5 ? 0.78 : 1;
    const aimY = t.pos.y + (this.aimHead ? 1.6 : 1.2) * heightFactor;
    // lead the target a little
    const lead = Math.min(0.25, dist / 60);
    const ax = t.pos.x + t.vel.x * lead;
    const az = t.pos.z + t.vel.z * lead;
    const want = anglesFromDelta(ax - ch.pos.x, aimY - ch.eyeY, az - ch.pos.z);
    const rc = this.skill.recoilControl;
    const desiredYaw = want.yaw + this.aimNoiseYaw - ch.punchYaw * DEG * rc;
    const desiredPitch = want.pitch + this.aimNoisePitch - ch.punchPitch * DEG * rc;
    this.turnTo(desiredYaw, desiredPitch, dt, this.skill.aimSpeed, 14);

    // angular error of the actual bullet direction against the real target centre
    const errYaw = wrapPi(ch.yaw + ch.punchYaw * DEG - want.yaw) * Math.cos(want.pitch);
    const errPitch = ch.pitch + ch.punchPitch * DEG - want.pitch;
    const err = Math.hypot(errYaw, errPitch);
    const bodyAngle = Math.atan2(0.3, Math.max(2, dist));

    // ---- movement: strafe / counter-strafe, push or hold depending on role
    const accurateWeapon = def.cls === 'rifle' || def.cls === 'sniper';
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeDir = this.game.rng.next() < 0.5 ? -1 : 1;
      this.strafeTimer = 0.4 + this.game.rng.next() * 0.5;
      this.stopTimer = accurateWeapon && dist > 9 ? 0.22 + this.game.rng.next() * 0.25 : 0;
    }
    const maxSp = def.moveSpeed;
    // defenders holding an angle crouch at range: tighter spread and a smaller target
    if (ch.team === 'CT' && this.crouchHold && dist > 14 && !ch.hasBomb) cmd.crouch = true;
    if (def.scope) {
      // snipers plant their feet
      cmd.strafe = 0;
      cmd.forward = 0;
    } else if (this.stopTimer > 0) {
      this.stopTimer -= dt;
      cmd.strafe = 0;
      cmd.forward = 0;
    } else {
      cmd.strafe = this.strafeDir * (dist < 12 ? 1 : 0.85);
      const attacker = ch.team === 'T' && !ch.hasBomb;
      if (def.cls === 'knife') cmd.forward = 1;
      else if (attacker && dist > 28 && ch.health > 45) cmd.forward = 0.7;
      else if (dist < 4.5) cmd.forward = -0.6;
    }
    if (ch.speed2D < 0.05 && cmd.forward === 0 && cmd.strafe === 0) this.stillTime += dt;
    else this.stillTime = 0;

    // ---- trigger
    if (ch.reloading || this.reactionLeft > 0) {
      this.lastMag = w.mag;
      return;
    }
    if (def.cls === 'knife') {
      if (dist < 2.2) cmd.fire = true;
      return;
    }
    const steady = ch.speed2D < 0.4 * maxSp || dist < 7;
    if (def.scope) {
      if (ch.scope === 0 && this.scopeCooldown <= 0 && ch.activeSlot === 'primary' && g.time >= w.deployEnd && !ch.reloading) {
        cmd.fire2 = true;
        this.scopeCooldown = 0.45;
      } else if (ch.scope > 0 && this.stillTime > 0.14 && err < bodyAngle * 1.1) {
        cmd.fire = true;
      }
      this.lastMag = w.mag;
      return;
    }
    if (err > bodyAngle * 1.7 || !steady) {
      this.lastMag = w.mag;
      return;
    }
    if (def.auto) {
      if (w.mag < this.lastMag) this.burstCount += this.lastMag - w.mag;
      this.lastMag = w.mag;
      const burstMax = dist < 10 ? 10 : dist < 26 ? 5 : 3;
      if (this.burstPause > 0) {
        this.burstPause -= dt;
      } else if (this.burstCount >= burstMax) {
        this.burstCount = 0;
        this.burstPause = 0.12 + this.game.rng.next() * (dist < 10 ? 0.15 : 0.4);
      } else cmd.fire = true;
    } else {
      // semi-auto: tap by alternating the trigger, with a human-ish delay
      this.lastMag = w.mag;
      if (!ch.prevFire && g.time >= w.nextFire + (this.game.rng.next() < 0.5 ? 0.02 : 0.08)) cmd.fire = true;
    }
  }

  private maybeReload(): void {
    const ch = this.ch;
    const w = ch.weapon;
    if (w.def.mag > 0 && !ch.reloading && w.mag < w.def.mag * 0.45 && w.reserve > 0) ch.cmd.reload = true;
  }

  /** Small upkeep when not fighting: reload, re-draw the best weapon, scope out. */
  private housekeeping(): void {
    const ch = this.ch;
    this.maybeReload();
    const best = ch.primary && (ch.primary.mag > 0 || ch.primary.reserve > 0) ? 'primary' : 'secondary';
    if (ch.activeSlot !== best && !ch.reloading && this.game.time > ch.weapon.deployEnd) ch.cmd.slot = best;
    if (ch.scope > 0 && this.state !== 'hold') ch.cmd.fire2 = true;
  }

  // ================================================================== movement helpers

  /** Walk towards (x,z) along an A* path. Returns true on arrival. */
  private moveTo(x: number, z: number, arriveR: number, dt: number): boolean {
    const ch = this.ch;
    const g = this.game;
    const dGoal = Math.hypot(x - ch.pos.x, z - ch.pos.z);
    if (dGoal <= arriveR) return true;

    if (!this.pathGoal || Math.hypot(this.pathGoal.x - x, this.pathGoal.z - z) > 1.5 || (this.path.length === 0 && g.time >= this.repathAt)) {
      this.pathGoal = { x, z };
      const p = g.nav.findPath(ch.pos.x, ch.pos.z, x, z);
      this.repathAt = g.time + 1.0;
      if (p && p.length > 1) {
        this.path = p;
        this.pathIdx = 1;
      } else {
        this.path = [];
        this.pathIdx = 0;
      }
    }
    let tx = x;
    let tz = z;
    if (this.path.length > 0) {
      while (this.pathIdx < this.path.length - 1 && Math.hypot(this.path[this.pathIdx].x - ch.pos.x, this.path[this.pathIdx].z - ch.pos.z) < 0.75) this.pathIdx++;
      tx = this.path[this.pathIdx].x;
      tz = this.path[this.pathIdx].z;
    } else {
      // no path (unreachable goal): don't wander into walls, give up on this step soon
      if (this.state === 'travel' && this.stateTime > 2) this.advanceStep();
      return false;
    }
    const dx = tx - ch.pos.x;
    const dz = tz - ch.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const dirX = dx / d;
    const dirZ = dz / d;
    // face the direction of travel (smoothly), then decompose into forward/strafe
    this.faceYaw(Math.atan2(-dirX, -dirZ), dt, 420);
    ch.pitch += (0 - ch.pitch) * Math.min(1, 5 * dt);
    const fx = -Math.sin(ch.yaw);
    const fz = -Math.cos(ch.yaw);
    const rx = Math.cos(ch.yaw);
    const rz = -Math.sin(ch.yaw);
    ch.cmd.forward = dirX * fx + dirZ * fz;
    ch.cmd.strafe = dirX * rx + dirZ * rz;

    // ---- stuck detection
    if (g.time >= this.stuckCheckAt) {
      const moved = Math.hypot(ch.pos.x - this.stuckX, ch.pos.z - this.stuckZ);
      this.stuckX = ch.pos.x;
      this.stuckZ = ch.pos.z;
      this.stuckCheckAt = g.time + 0.5;
      if (moved < 0.35) {
        this.stuckTimer += 0.5;
        if (this.stuckTimer >= 1) {
          this.unstickLeft = 0.5;
          this.unstickDir = this.game.rng.next() < 0.5 ? -1 : 1;
          this.pathGoal = null;
          if (this.stuckTimer >= 3) this.stuckTimer = 0;
        }
      } else this.stuckTimer = 0;
    }
    return false;
  }

  private faceYaw(target: number, dt: number, maxDegPerSec: number): void {
    const ch = this.ch;
    const d = wrapPi(target - ch.yaw);
    const maxStep = maxDegPerSec * DEG * dt;
    ch.yaw = wrapPi(ch.yaw + clamp(d * Math.min(1, 10 * dt), -maxStep, maxStep));
  }

  private turnTo(yaw: number, pitch: number, dt: number, maxDegPerSec: number, gain: number): void {
    const ch = this.ch;
    const maxStep = maxDegPerSec * DEG * dt;
    const k = Math.min(1, gain * dt);
    ch.yaw = wrapPi(ch.yaw + clamp(wrapPi(yaw - ch.yaw) * k, -maxStep, maxStep));
    ch.pitch = clamp(ch.pitch + clamp((pitch - ch.pitch) * k, -maxStep, maxStep), -1.3, 1.3);
  }
}
