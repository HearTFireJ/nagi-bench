// Bot brain: a finite state machine (freeze / hold / travel / engage / search / plant / defuse / cover / fetch / guard)
// driven by perception (vision + hearing), the team plan and the bomb state. It only writes into `actor.input` and the
// view angles, i.e. exactly what a human player controls, so bots obey the same physics and weapon rules.
import { angleDiff, clamp, dist2D, yawTo } from '../../core/math';
import { activeWeaponId, activeWeaponState, bestSlot } from '../actor';
import { siteAt } from '../bomb';
import { eyePosition } from '../combat';
import { ROUND } from '../config';
import { getWeapon } from '../weapons';
import type { NavPoint } from '../nav';
import type { Actor } from '../types';
import type { World } from '../world';
import { FOV_COS, FOV_COS_SCOPED, findVisibleEnemy } from './perception';
import { PLANT_ANCHOR, POST_PLANT } from './plans';
import type { BotPlan, HoldSpot } from './plans';
import { PathFollower, makeMoveCmd } from './steer';
import type { MoveCmd } from './steer';

export type BotState = 'freeze' | 'hold' | 'travel' | 'engage' | 'search' | 'plant' | 'defuse' | 'cover' | 'fetch' | 'guard' | 'stage' | 'dead';

/** Where CTs regroup before a retake, per site. */
const STAGE_ANCHOR = { A: 'CT_RAMP', B: 'B_DOORS_CT' } as const;
/** CTs farther than this from the bomb stage first; closer ones go straight in. */
const STAGE_DISTANCE = 22;
/** Stop waiting for teammates when the bomb has this long left. */
const STAGE_DEADLINE = 24;

/** Anchor lookup (positions are snapped to walkable nav cells when paths are planned). */
export const anchorOf = (w: World, name: string): { x: number; z: number } => {
  const p = w.level.map.anchors[name];
  if (!p) throw new Error('Unknown anchor ' + name);
  return p;
};

export class BotBrain {
  readonly id: number;
  skill: number;
  state: BotState = 'freeze';
  plan: BotPlan | null = null;
  readonly follower = new PathFollower();

  // perception / memory
  target = -1;
  private targetSeenAt = -99;
  private reactionUntil = 0;
  private lastSeen: NavPoint | null = null;
  private lastSeenAt = -99;
  private alert: NavPoint | null = null;
  private alertAt = -99;
  private nextThink = 0;

  // navigation bookkeeping
  private routeIdx = 0;
  private goalKey = '';
  private guardSpot: HoldSpot | null = null;
  private carryTo: string | null = null;
  private repathAt = 0;
  /** Seconds spent waiting for the group this round (capped so a stuck teammate never stalls the push). */
  private waited = 0;
  /** CT retake: true once the group has assembled and may push the bomb. */
  private stageGo = false;

  // aiming / combat
  private aimHead = false;
  private jitterX = 0;
  private jitterY = 0;
  private jitterZ = 0;
  private nextAimRoll = 0;
  private strafeDir = 1;
  private nextStrafe = 0;
  private burstUntil = 0;
  private pauseUntil = 0;
  private nextClick = 0;

  // look control
  private lookYaw = 0;
  private lookPitch = 0;
  private scanPhase = 0;

  private readonly cmd: MoveCmd = makeMoveCmd();

  constructor(id: number, skill: number) {
    this.id = id;
    this.skill = skill;
  }

  /** New round: forget everything and take the new plan. */
  reset(plan: BotPlan, a: Actor): void {
    this.plan = plan;
    this.state = 'freeze';
    this.target = -1;
    this.targetSeenAt = -99;
    this.lastSeen = null;
    this.alert = null;
    this.routeIdx = 0;
    this.goalKey = '';
    this.guardSpot = null;
    this.carryTo = null;
    this.waited = 0;
    this.stageGo = false;
    this.follower.clear();
    this.lookYaw = a.yaw;
    this.lookPitch = 0;
    this.nextThink = 0;
    this.burstUntil = 0;
    this.pauseUntil = 0;
  }

  /** Called by the world for gunshots / footsteps / callouts from teammates. */
  hear(w: World, x: number, z: number): void {
    this.alert = { x: x + (w.rng.next() - 0.5) * 3, z: z + (w.rng.next() - 0.5) * 3 };
    this.alertAt = w.time;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Main update
  // ------------------------------------------------------------------------------------------------------------------

  update(w: World, a: Actor, dt: number): void {
    const inp = a.input;
    inp.forward = 0;
    inp.strafe = 0;
    inp.jump = false;
    inp.walk = false;
    inp.fire = false;
    inp.use = false;
    if (!a.alive) {
      this.state = 'dead';
      return;
    }
    const phase = w.round.phase;
    if (phase === 'freeze') {
      this.state = 'freeze';
      const first = this.plan?.hold?.look ?? this.firstRouteAnchor();
      const p = anchorOf(w, first);
      this.lookYaw = yawTo(a.pos.x, a.pos.z, p.x, p.z);
      this.lookPitch = 0;
      this.applyLook(a, dt, 2.5);
      return;
    }
    if (phase !== 'live' && phase !== 'planted') return;

    const t = w.time;
    if (t >= this.nextThink) {
      this.nextThink = t + 0.1 + w.rng.next() * 0.06;
      this.perceive(w, a);
    }

    this.chooseState(w, a);
    switch (this.state) {
      case 'engage':
        this.doEngage(w, a, dt);
        break;
      case 'plant':
        this.doPlant(a, dt);
        break;
      case 'defuse':
        this.doDefuse(w, a, dt);
        break;
      case 'cover':
        this.doCover(w, a, dt);
        break;
      case 'stage':
        this.doStage(w, a, dt);
        break;
      case 'fetch':
        this.doFetch(w, a, dt);
        break;
      case 'search':
        this.doSearch(w, a, dt);
        break;
      case 'guard':
        this.doGuard(w, a, dt);
        break;
      case 'hold':
        this.doHold(w, a, dt);
        break;
      default:
        this.doTravel(w, a, dt);
        break;
    }
    this.manageWeapon(w, a);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Perception & state selection
  // ------------------------------------------------------------------------------------------------------------------

  private perceive(w: World, a: Actor): void {
    const t = w.time;
    const enemy = findVisibleEnemy(w, a, a.scopeLevel > 0 ? FOV_COS_SCOPED : FOV_COS);
    if (enemy) {
      if (this.target !== enemy.id) {
        const quick = t - this.targetSeenAt < 1.2;
        this.target = enemy.id;
        this.reactionUntil = t + (quick ? 0.1 : 0.42 - 0.28 * this.skill + w.rng.next() * 0.14);
        this.nextAimRoll = 0;
      } else if (t - this.targetSeenAt > 0.8) {
        this.reactionUntil = t + 0.12;
      }
      this.targetSeenAt = t;
      this.lastSeen = { x: enemy.pos.x, z: enemy.pos.z };
      this.lastSeenAt = t;
      w.alertTeam(a.team, enemy.pos.x, enemy.pos.z, a.id);
    } else if (this.target >= 0) {
      const e = w.actors[this.target];
      if (!e.alive || t - this.targetSeenAt > 0.5) this.target = -1;
    }
  }

  private routeFinished(): boolean {
    const plan = this.plan;
    if (!plan || this.carryTo) return !plan;
    return this.routeIdx >= plan.route.length;
  }

  private chooseState(w: World, a: Actor): void {
    const t = w.time;
    const bomb = w.bomb;
    if (this.target >= 0 && t - this.targetSeenAt < 0.5) {
      this.state = 'engage';
      return;
    }
    const plan = this.plan;
    if (a.team === 'T') {
      const carrying = a.hasBomb && bomb.status === 'carried' && bomb.carrierId === a.id;
      if (carrying && w.round.phase === 'live') {
        if (siteAt(w, a.pos.x, a.pos.z)) {
          this.state = 'plant';
          return;
        }
        // Route done (or plan changed) but not on a site yet: walk to the plant spot.
        if (!this.carryTo && plan && this.routeIdx >= plan.route.length) this.carryTo = PLANT_ANCHOR[plan.site ?? 'A'];
      }
      if (bomb.status === 'dropped' && w.round.phase === 'live' && w.bombFetcherId === a.id) {
        this.state = 'fetch';
        return;
      }
      if (bomb.status === 'planted') {
        this.state = 'guard';
        return;
      }
      this.state = this.routeFinished() ? 'guard' : 'travel';
      return;
    }
    // Counter-terrorists
    if (bomb.status === 'planted') {
      const other = bomb.defuserId >= 0 && bomb.defuserId !== a.id ? w.actors[bomb.defuserId] : null;
      if (other && other.alive && other.useKind === 'defuse') this.state = 'cover';
      else if (this.shouldStage(w, a)) this.state = 'stage';
      else this.state = 'defuse';
      return;
    }
    if (this.lastSeen && t - this.lastSeenAt < 4.5 && this.holdDistance(w, a) < 40) {
      this.state = 'search';
      return;
    }
    if (this.alert && t - this.alertAt < 3 && this.holdDistance(w, a) < 24) {
      this.state = 'search';
      return;
    }
    this.state = this.routeFinished() ? 'hold' : 'travel';
  }

  /** Far from a planted bomb: regroup at the staging point until a teammate arrives (or time is running out). */
  private shouldStage(w: World, a: Actor): boolean {
    if (this.stageGo) return false;
    const b = w.bomb;
    if (b.explodeAt - w.time <= STAGE_DEADLINE) {
      this.stageGo = true;
      return false;
    }
    if (dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z) <= STAGE_DISTANCE) return false;
    const stage = anchorOf(w, STAGE_ANCHOR[b.site ?? 'A']);
    let ready = 0;
    let alive = 0;
    for (const o of w.actors) {
      if (!o.alive || o.team !== 'CT') continue;
      alive++;
      if (dist2D(o.pos.x, o.pos.z, stage.x, stage.z) < 9) ready++;
    }
    if (ready >= Math.min(2, alive)) {
      this.stageGo = true;
      return false;
    }
    return true;
  }

  private doStage(w: World, a: Actor, dt: number): void {
    const b = w.bomb;
    const stage = anchorOf(w, STAGE_ANCHOR[b.site ?? 'A']);
    if (dist2D(a.pos.x, a.pos.z, stage.x, stage.z) > 3) {
      if (this.goTo(w, a, 'stage', stage.x, stage.z)) this.followPath(w, a, dt, 1);
      return;
    }
    this.scanPhase += dt;
    this.lookYaw = yawTo(a.pos.x, a.pos.z, b.pos.x, b.pos.z) + Math.sin(this.scanPhase * 0.8 + this.id) * 0.3;
    this.lookPitch = 0;
    this.applyLook(a, dt, 3);
  }

  private holdDistance(w: World, a: Actor): number {
    const hold = this.plan?.hold;
    if (!hold) return 0;
    const p = anchorOf(w, hold.anchor);
    return dist2D(a.pos.x, a.pos.z, p.x, p.z);
  }

  private firstRouteAnchor(): string {
    return this.plan && this.plan.route.length > 0 ? this.plan.route[0] : 'CT_SPAWN';
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Movement helpers
  // ------------------------------------------------------------------------------------------------------------------

  /** Path toward a position; re-plans only when the destination key changed (or the follower lost its path). */
  private goTo(w: World, a: Actor, key: string, x: number, z: number): boolean {
    if (this.goalKey === key && (this.follower.active || this.follower.done)) return true;
    if (this.goalKey === key && w.time < this.repathAt) return false;
    this.repathAt = w.time + 0.4;
    this.goalKey = key;
    return this.follower.setGoal(w, a, x, z);
  }

  private followPath(w: World, a: Actor, dt: number, speed: number): void {
    this.follower.update(w, a, dt, this.cmd);
    if (this.cmd.moving) {
      this.applyMove(a, this.cmd.dx, this.cmd.dz, speed);
      if (this.cmd.jump) a.input.jump = true;
      this.lookYaw = Math.atan2(-this.cmd.dx, -this.cmd.dz);
      this.lookPitch = 0;
      // Contact nearby (gunfire / a teammate's callout): keep the crosshair on it while moving so we can trade kills.
      if (this.alert && w.time - this.alertAt < 1.6 && dist2D(a.pos.x, a.pos.z, this.alert.x, this.alert.z) < 45) {
        this.lookYaw = yawTo(a.pos.x, a.pos.z, this.alert.x, this.alert.z);
      }
    }
    this.applyLook(a, dt, 3.2 + 4 * this.skill);
  }

  private applyMove(a: Actor, dx: number, dz: number, speed: number): void {
    const sy = Math.sin(a.yaw);
    const cy = Math.cos(a.yaw);
    a.input.forward = (dx * -sy + dz * -cy) * speed;
    a.input.strafe = (dx * cy + dz * -sy) * speed;
  }

  private applyLook(a: Actor, dt: number, rate: number): void {
    const step = rate * dt;
    a.yaw += clamp(angleDiff(a.yaw, this.lookYaw), -step, step);
    a.pitch = clamp(a.pitch + clamp(this.lookPitch - a.pitch, -step, step), -1.4, 1.4);
  }

  private advanceRoute(plan: BotPlan): void {
    if (this.carryTo) {
      this.carryTo = null;
      this.routeIdx = plan.route.length;
    } else {
      this.routeIdx++;
    }
    this.goalKey = '';
    this.follower.clear();
  }

  // ------------------------------------------------------------------------------------------------------------------
  // States
  // ------------------------------------------------------------------------------------------------------------------

  private doTravel(w: World, a: Actor, dt: number): void {
    const plan = this.plan;
    if (!plan) return;
    const name = this.carryTo ?? plan.route[this.routeIdx];
    if (name === undefined) return;
    const p = anchorOf(w, name);
    if (!this.goTo(w, a, name, p.x, p.z)) {
      // Unreachable: skip this waypoint once the retry window passed.
      if (!this.follower.goal && w.time >= this.repathAt) this.advanceRoute(plan);
      return;
    }
    if (this.paceFactor(w, a, p, dt) === 0) {
      // Waiting for the group: stand still (and do NOT run the path follower, its stuck detector would read this as
      // "commanded to move but not moving" and make the bot jump on the spot).
      this.applyLook(a, dt, 2.5);
      return;
    }
    this.followPath(w, a, dt, 1);
    if (this.follower.done) this.advanceRoute(plan);
  }

  /**
   * T groups move together: wait (briefly) instead of running far ahead of teammates on the same route,
   * so the push arrives as a group rather than trickling in one by one.
   */
  private paceFactor(w: World, a: Actor, goal: { x: number; z: number }, dt: number): number {
    const plan = this.plan;
    if (!plan || a.team !== 'T' || plan.lurker || this.carryTo || this.waited > 6) return 1;
    const myD = dist2D(a.pos.x, a.pos.z, goal.x, goal.z);
    let behind = 0;
    for (const other of w.brains.values()) {
      if (other === this || !other.plan || other.plan.routeName !== plan.routeName || other.state === 'engage') continue;
      const o = w.actors[other.id];
      if (!o.alive || other.routeIdx > this.routeIdx) continue;
      const d = other.routeIdx < this.routeIdx ? dist2D(a.pos.x, a.pos.z, o.pos.x, o.pos.z) : dist2D(o.pos.x, o.pos.z, goal.x, goal.z) - myD;
      if (d > behind) behind = d;
    }
    if (behind > 9) {
      this.waited += dt;
      return 0;
    }
    return 1;
  }

  private doHold(w: World, a: Actor, dt: number): void {
    const plan = this.plan;
    this.scanPhase += dt;
    if (this.alert && w.time - this.alertAt < 2.5) {
      this.lookYaw = yawTo(a.pos.x, a.pos.z, this.alert.x, this.alert.z);
    } else if (plan?.hold) {
      const p = anchorOf(w, plan.hold.look);
      this.lookYaw = yawTo(a.pos.x, a.pos.z, p.x, p.z) + Math.sin(this.scanPhase * 0.7 + this.id) * 0.22;
    }
    this.lookPitch = 0;
    this.applyLook(a, dt, 2.2 + 2 * this.skill);
    // Pushed off the spot (or the door / a teammate moved us): walk back.
    if (plan?.hold) {
      const p = anchorOf(w, plan.hold.anchor);
      if (dist2D(a.pos.x, a.pos.z, p.x, p.z) > 3.2) {
        this.routeIdx = 0;
        this.goalKey = '';
      }
    }
  }

  private doSearch(w: World, a: Actor, dt: number): void {
    const t = w.time;
    let tx: number;
    let tz: number;
    if (this.lastSeen && t - this.lastSeenAt < 4.5) {
      tx = this.lastSeen.x;
      tz = this.lastSeen.z;
    } else if (this.alert) {
      tx = this.alert.x;
      tz = this.alert.z;
    } else {
      return;
    }
    const d = dist2D(a.pos.x, a.pos.z, tx, tz);
    if (d < 2.5) {
      // Nothing here: forget it and walk back to the plan.
      this.lastSeen = null;
      this.alert = null;
      this.goalKey = '';
      this.follower.clear();
      this.routeIdx = 0;
      return;
    }
    const key = 'search:' + Math.round(tx) + ',' + Math.round(tz);
    if (this.goTo(w, a, key, tx, tz)) {
      a.input.walk = d < 8 && this.skill > 0.4; // sneak the last few metres
      this.followPath(w, a, dt, 1);
    }
  }

  private doFetch(w: World, a: Actor, dt: number): void {
    const b = w.bomb;
    if (a.hasBomb) {
      // Picked it up: continue to the planned site.
      const site = this.plan?.site ?? (dist2D(a.pos.x, a.pos.z, 87, 19) < dist2D(a.pos.x, a.pos.z, 20, 19) ? 'A' : 'B');
      this.carryTo = PLANT_ANCHOR[site];
      this.goalKey = '';
      this.follower.clear();
      return;
    }
    if (this.goTo(w, a, 'bomb', b.pos.x, b.pos.z)) this.followPath(w, a, dt, 1);
  }

  private doPlant(a: Actor, dt: number): void {
    // Stand still and hold the plant key.
    if (a.activeSlot !== 'bomb' && a.hasBomb) a.input.switchTo = 'bomb';
    a.input.use = true;
    this.lookPitch = -0.15;
    this.applyLook(a, dt, 2);
  }

  private doDefuse(w: World, a: Actor, dt: number): void {
    const b = w.bomb;
    const d = dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z);
    if (d <= ROUND.defuseRange * 0.85) {
      a.input.use = true;
      this.lookYaw = yawTo(a.pos.x, a.pos.z, b.pos.x, b.pos.z);
      this.lookPitch = -0.5;
      this.applyLook(a, dt, 6);
      return;
    }
    if (this.goTo(w, a, 'bomb', b.pos.x, b.pos.z)) this.followPath(w, a, dt, 1);
  }

  private doCover(w: World, a: Actor, dt: number): void {
    const b = w.bomb;
    if (dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z) > 9) {
      if (this.goTo(w, a, 'cover', b.pos.x, b.pos.z)) this.followPath(w, a, dt, 1);
      return;
    }
    this.scanPhase += dt;
    const spots = POST_PLANT[b.site ?? 'A'];
    const spot = spots[(this.id + Math.floor(this.scanPhase / 2.5)) % spots.length];
    const p = anchorOf(w, spot.anchor);
    this.lookYaw = yawTo(a.pos.x, a.pos.z, p.x, p.z);
    this.lookPitch = 0;
    this.applyLook(a, dt, 3);
  }

  private doGuard(w: World, a: Actor, dt: number): void {
    const b = w.bomb;
    const site = b.site ?? this.plan?.site ?? 'A';
    // After the plant: hold a spot that has line of sight to the bomb so any defuser gets shot.
    if (b.status === 'planted' && w.guardSpots.length > 0) {
      const spot = w.guardSpots[this.id % w.guardSpots.length];
      if (b.defuserId >= 0 && dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z) < 40 && dist2D(a.pos.x, a.pos.z, spot.x, spot.z) < 3) {
        // Stay put: the spot already covers the bomb, the defuser is in our sights.
        this.lookYaw = yawTo(a.pos.x, a.pos.z, b.pos.x, b.pos.z);
        this.lookPitch = -0.1;
        this.applyLook(a, dt, 5);
        return;
      }
      if (dist2D(a.pos.x, a.pos.z, spot.x, spot.z) > 1.5) {
        if (this.goTo(w, a, 'pp:' + Math.round(spot.x) + ',' + Math.round(spot.z), spot.x, spot.z)) this.followPath(w, a, dt, 1);
        return;
      }
      this.scanPhase += dt;
      this.lookYaw = yawTo(a.pos.x, a.pos.z, b.pos.x, b.pos.z) + Math.sin(this.scanPhase * 0.5 + this.id) * 0.35;
      this.lookPitch = -0.05;
      this.applyLook(a, dt, 3);
      return;
    }
    if (!this.guardSpot) {
      const spots = POST_PLANT[site];
      this.guardSpot = spots[this.id % spots.length];
    }
    // A defuser is at the bomb: go and stop them.
    if (b.status === 'planted' && b.defuserId >= 0 && dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z) < 40) {
      if (this.goTo(w, a, 'bomb', b.pos.x, b.pos.z)) this.followPath(w, a, dt, 1);
      return;
    }
    const p = anchorOf(w, this.guardSpot.anchor);
    if (dist2D(a.pos.x, a.pos.z, p.x, p.z) > 2.5) {
      if (this.goTo(w, a, 'guard:' + this.guardSpot.anchor, p.x, p.z)) this.followPath(w, a, dt, 1);
      return;
    }
    this.scanPhase += dt;
    const look = anchorOf(w, this.guardSpot.look);
    this.lookYaw = yawTo(a.pos.x, a.pos.z, look.x, look.z) + Math.sin(this.scanPhase * 0.6 + this.id) * 0.2;
    this.lookPitch = 0;
    this.applyLook(a, dt, 2.5);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Combat
  // ------------------------------------------------------------------------------------------------------------------

  private doEngage(w: World, a: Actor, dt: number): void {
    const e = w.actors[this.target];
    const t = w.time;
    const rng = w.rng;
    const eye = eyePosition(a);
    const def = getWeapon(activeWeaponId(a));
    const dist = Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z);

    // Re-roll head / chest preference and aim noise a few times per second.
    if (t >= this.nextAimRoll) {
      this.nextAimRoll = t + 0.35;
      this.aimHead = rng.chance(0.12 + 0.4 * this.skill);
      const err = (1.15 - this.skill) * 0.09 * (1 + dist / 22);
      this.jitterX = rng.gauss() * err;
      this.jitterY = rng.gauss() * err * 0.7;
      this.jitterZ = rng.gauss() * err;
    }
    const dx = e.pos.x + this.jitterX - eye.x;
    const dz = e.pos.z + this.jitterZ - eye.z;
    const dy = e.pos.y + (this.aimHead ? 1.6 : 1.2) + this.jitterY - eye.y;
    const yawT = Math.atan2(-dx, -dz);
    const pitchT = Math.atan2(dy, Math.hypot(dx, dz));
    const comp = 0.65 + 0.3 * this.skill; // how well recoil is compensated
    this.lookYaw = yawT - a.punchYaw * comp;
    this.lookPitch = pitchT - a.punchPitch * comp;
    this.applyLook(a, dt, 4.5 + 8 * this.skill);

    const tol = Math.atan2(0.3, Math.max(dist, 1)) + 0.006;
    const aligned = Math.abs(angleDiff(a.yaw + a.punchYaw, yawT)) < tol && Math.abs(a.pitch + a.punchPitch - pitchT) < tol * 1.3;
    const ready = aligned && t >= this.reactionUntil;

    let shooting = false;
    if (def.kind === 'sniper') {
      const close = dist < 9;
      if (!close && a.scopeLevel === 0 && t >= a.drawEndsAt && a.reloadEndsAt === 0) a.input.scopeToggle = true;
      const steady = Math.hypot(a.vel.x, a.vel.z) < 1.4;
      if (ready && (a.scopeLevel > 0 || close) && steady) {
        a.input.fire = !a.triggerWasDown;
        shooting = true;
      }
    } else if (def.kind === 'rifle') {
      if (ready) {
        if (t >= this.burstUntil && t >= this.pauseUntil) {
          // Burst length in bullets: shorter at range, and capped by how hard the weapon kicks (AK ~5, M4 ~12).
          const far = dist > 30;
          const mid = dist > 14;
          const want = far ? 2 + rng.int(2) : mid ? 3 + rng.int(3) : 5 + rng.int(5);
          const cap = Math.max(3, Math.floor(7 / Math.max(def.recoil.pitch, 0.3)));
          const shots = Math.min(want, cap);
          this.burstUntil = t + shots * def.fireInterval;
          // Let the view kick settle a little between bursts.
          this.pauseUntil = this.burstUntil + (far ? 0.28 : 0.14) + def.recoil.pitch * 0.1 + rng.next() * 0.2 * (1.2 - this.skill);
        }
        if (t < this.burstUntil) {
          a.input.fire = true;
          shooting = true;
        }
      }
    } else if (def.kind === 'pistol') {
      if (ready && t >= this.nextClick) {
        a.input.fire = !a.triggerWasDown;
        if (a.input.fire) {
          this.nextClick = t + def.fireInterval + 0.03 + rng.next() * 0.16 * (1.3 - this.skill);
          shooting = true;
        }
      }
    } else if (def.kind === 'knife') {
      if (dist < 2.2) a.input.fire = true;
      else this.moveToward(a, e.pos.x - a.pos.x, e.pos.z - a.pos.z, 1);
      return;
    }

    // Stand still while shooting (accuracy), strafe in between; snipers plant their feet.
    const still = shooting || (def.kind === 'sniper' && a.scopeLevel > 0) || dist > 45;
    if (!still) {
      if (t >= this.nextStrafe) {
        this.nextStrafe = t + 0.35 + rng.next() * 0.7;
        this.strafeDir = rng.chance(0.5) ? 1 : -1;
      }
      const toEx = e.pos.x - a.pos.x;
      const toEz = e.pos.z - a.pos.z;
      const len = Math.max(Math.hypot(toEx, toEz), 1e-6);
      this.moveToward(a, (-toEz / len) * this.strafeDir, (toEx / len) * this.strafeDir, 0.85);
    }
    if (this.follower.active) this.follower.clear();
    this.goalKey = '';
  }

  private moveToward(a: Actor, dx: number, dz: number, speed: number): void {
    const l = Math.hypot(dx, dz);
    if (l < 1e-6) return;
    this.applyMove(a, dx / l, dz / l, speed);
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Inventory / weapon handling
  // ------------------------------------------------------------------------------------------------------------------

  private manageWeapon(w: World, a: Actor): void {
    const inp = a.input;
    const ws = activeWeaponState(a);
    const engaged = this.state === 'engage';
    if (this.state !== 'plant' && (a.activeSlot === 'bomb' || a.activeSlot === 'melee')) inp.switchTo = bestSlot(a);
    if (!ws) return;
    const def = getWeapon(ws.id);
    if (def.magSize > 0) {
      if (ws.ammo === 0 && ws.reserve === 0 && a.weapons.secondary && a.activeSlot === 'primary') inp.switchTo = 'secondary';
      else if (!engaged && ws.ammo < def.magSize * 0.4 && ws.reserve > 0 && a.reloadEndsAt === 0) inp.reload = true;
    }
    // Snipers scope in while holding, and out while travelling.
    if (def.scope && !engaged) {
      const wantScope = this.state === 'hold' || this.state === 'guard';
      if (wantScope && a.scopeLevel === 0 && a.reloadEndsAt === 0 && w.time >= a.drawEndsAt) inp.scopeToggle = true;
      else if (!wantScope && a.scopeLevel > 0) inp.scopeToggle = true;
    }
  }
}
