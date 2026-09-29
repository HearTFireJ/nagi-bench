// Bot AI: a per-bot finite state machine on top of a shared team plan.
//
//  wait      freeze time (buy, look around)
//  route     T: follow the assigned approach route toward a bomb site
//  plant     T carrier: stand on a plant spot and hold "use"
//  postplant T: guard the planted bomb from the site's angles
//  fetch     T: pick up a dropped C4
//  hold      CT: stand on an assigned post and sweep angles
//  retake    CT: bomb is planted -> go to the site (one bot is the designated defuser)
//  defuse    CT: stand at the bomb and hold "use"
//  seek      lost / heard an enemy: go check the last known position
//  combat    an enemy is visible: aim (with reaction delay + error), strafe, burst-fire
//
// Vision comes from GameSim.sees() (LOS rays + view cone), movement from NavGrid A*.

import type { Actor } from './actor.ts';
import { startReload, switchSlot, switchToBest } from './combat.ts';
import { CFG } from './config.ts';
import type { BuyItem, GameSim } from './game.ts';
import { CT_POSTS, CT_SETUPS, SITES, T_STRATEGIES, routeById, siteById } from './map.ts';
import type { HoldPost, RouteDef, SiteDef } from './map.ts';
import { DEG, angleDelta, clamp, dirToYaw, dist2D, noise, pick, rand, randRange, shuffle } from './math.ts';
import type { P2 } from './nav.ts';
import { TEAM_RIFLE, WEAPONS } from './weapons.ts';

export type BotState =
  | 'wait'
  | 'idle'
  | 'route'
  | 'plant'
  | 'postplant'
  | 'fetch'
  | 'hold'
  | 'retake'
  | 'defuse'
  | 'seek'
  | 'combat';

interface TeamPlan {
  round: number;
  strategy: string;
  routes: Map<number, RouteDef>;
  posts: Map<number, HoldPost>;
}

const plans = new WeakMap<GameSim, TeamPlan>();

function ensurePlan(sim: GameSim): TeamPlan {
  const existing = plans.get(sim);
  if (existing && existing.round === sim.round) return existing;
  const strat = pick(T_STRATEGIES);
  const routes = new Map<number, RouteDef>();
  const ts = sim.teamActors('T');
  const routeIds = shuffle([...strat.routes]);
  ts.forEach((a, i) => routes.set(a.id, routeById(routeIds[i % routeIds.length])));
  const posts = new Map<number, HoldPost>();
  const setup = shuffle([...pick(CT_SETUPS)]);
  sim.teamActors('CT').forEach((a, i) => {
    const id = setup[i % setup.length];
    posts.set(a.id, CT_POSTS.find((p) => p.id === id) as HoldPost);
  });
  const plan: TeamPlan = { round: sim.round, strategy: strat.id, routes, posts };
  plans.set(sim, plan);
  sim.tStrategy = strat.id;
  return plan;
}

export class BotBrain {
  private sim: GameSim;
  private a: Actor;
  state: BotState = 'wait';

  // personality
  private reaction = randRange(0.22, 0.42);
  private aimSpeed = randRange(240, 380); // deg/s
  private aimErr = randRange(0.7, 1.8); // deg
  private headChance = randRange(0.15, 0.4);
  private investigates = true;
  private reactionScale = 1;
  private aimErrScale = 1;

  // navigation
  private goal: P2 | null = null;
  private path: P2[] | null = null;
  private pathIdx = 0;
  private repathAt = 0;
  private stuckAt = 0;
  private stuckPos: P2 = { x: 0, z: 0 };
  private stuckCount = 0;
  private unstuckUntil = 0;
  private unstuckDir = 1;

  // plan
  private route: RouteDef | null = null;
  private routeIdx = 0;
  private plantSite: SiteDef | null = null;
  private plantSpot: P2 | null = null;
  post: HoldPost | null = null;
  private rotated = false;
  private rotateDelay = randRange(0.5, 3);
  private coverPos: P2 | null = null;
  private guardSpot: P2 | null = null;
  private startDelay = 0;

  // combat
  private target: Actor | null = null;
  private targetSeenAt = -10;
  private reactUntil = 0;
  private aimHead = false;
  private lastKnown: P2 | null = null;
  private lastKnownAt = -10;
  private strafeDir = 1;
  private strafeUntil = 0;
  private burstLeft = 0;
  private burstPauseUntil = 0;
  private lastShotSeen = -10;
  private noiseYaw = 0;
  private noisePitch = 0;
  private noiseUntil = 0;

  // senses
  private heardAt = -10;
  private heardPos: P2 | null = null;
  private lookOverrideUntil = 0;
  private lookPos: P2 | null = null;
  private scanAt = 0;
  private scanIdx = 0;
  private scanYaw = 0;

  private thinkAt = 0;
  private buyAt = 0;
  private bought = false;
  private seekUntil = 0;

  constructor(sim: GameSim, actor: Actor) {
    this.sim = sim;
    this.a = actor;
  }

  resetForRound(): void {
    const sim = this.sim;
    const a = this.a;
    const plan = ensurePlan(sim);
    this.state = 'wait';
    this.goal = null;
    this.path = null;
    this.target = null;
    this.lastKnown = null;
    this.heardPos = null;
    this.heardAt = -10;
    this.burstLeft = 0;
    this.coverPos = null;
    this.guardSpot = null;
    this.lookPos = null;
    this.lookOverrideUntil = 0;
    this.route = null;
    this.routeIdx = 0;
    this.plantSite = null;
    this.plantSpot = null;
    this.post = null;
    this.rotated = false;
    this.rotateDelay = randRange(0.5, 3.5);
    this.bought = false;
    this.buyAt = sim.t + randRange(0.4, 4);
    this.startDelay = randRange(0, 4.5);
    this.investigates = rand() < 0.55;
    this.thinkAt = 0;
    this.stuckCount = 0;
    this.stuckAt = 0;
    this.stuckPos = { x: a.pos.x, z: a.pos.z };
    // defenders' advantage: CTs hold angles, so they react a bit faster and aim tighter
    const ct = a.team === 'CT';
    this.reactionScale = ct ? 0.8 : 1;
    this.aimErrScale = ct ? 0.8 : 1;
    if (a.team === 'T') {
      this.route = plan.routes.get(a.id) ?? null;
      if (this.route) this.plantSite = siteById(this.route.site);
    } else {
      this.post = plan.posts.get(a.id) ?? null;
    }
    this.scanYaw = a.yaw;
  }

  // ---- sensory hooks -------------------------------------------------------------------
  hear(x: number, z: number): void {
    if (this.target) return;
    this.heardAt = this.sim.t;
    this.heardPos = { x, z };
    if (this.sim.t > this.lookOverrideUntil) {
      this.lookPos = { x, z };
      this.lookOverrideUntil = this.sim.t + 1.2;
    }
  }

  /** A teammate spotted an enemy at (x,z): face that way (no investigation). */
  callout(x: number, z: number): void {
    if (this.target || this.sim.t < this.lookOverrideUntil) return;
    this.lookPos = { x, z };
    this.lookOverrideUntil = this.sim.t + 1.6;
  }

  onDamaged(attacker: Actor): void {
    const sim = this.sim;
    this.heardAt = sim.t;
    this.heardPos = { x: attacker.pos.x, z: attacker.pos.z };
    if (!this.target) {
      this.lastKnown = { x: attacker.pos.x, z: attacker.pos.z };
      this.lastKnownAt = sim.t;
      this.lookPos = { x: attacker.pos.x, z: attacker.pos.z };
      this.lookOverrideUntil = sim.t + 1.5;
    }
  }

  // ---- main tick ------------------------------------------------------------------------------
  update(dt: number): void {
    const a = this.a;
    const sim = this.sim;
    const inp = a.input;
    inp.fire = false;
    inp.altFire = false;
    inp.use = false;
    inp.reload = false;
    inp.jump = false;
    inp.walk = false;
    inp.wishX = 0;
    inp.wishZ = 0;

    if (sim.t >= this.thinkAt) {
      this.thinkAt = sim.t + 0.1 + rand() * 0.06;
      this.think();
    }

    switch (this.state) {
      case 'wait':
        this.tickWait(dt);
        break;
      case 'idle':
        this.tickLook(dt, false);
        break;
      case 'combat':
        this.tickCombat(dt);
        break;
      case 'plant':
        this.tickPlant(dt);
        break;
      case 'defuse':
        this.tickDefuse(dt);
        break;
      default:
        this.tickTravel(dt);
        break;
    }
  }

  // ---- decision making (≈ 8 Hz) -----------------------------------------------------------------
  private think(): void {
    const sim = this.sim;
    const a = this.a;
    const t = sim.t;

    if (sim.phase === 'freeze') {
      this.state = 'wait';
      this.doBuy();
      return;
    }
    if (sim.phase !== 'live') {
      this.state = 'idle';
      this.target = null;
      return;
    }
    if (!this.bought) this.bought = true;
    if (a.weapon.def.slot === 'melee' || (a.weapons.primary && a.slot !== 'primary' && a.weapons.primary.ammo + a.weapons.primary.reserve > 0 && !this.target)) {
      switchToBest(sim, a);
    }

    this.acquireTarget();
    if (this.target) {
      this.state = 'combat';
      return;
    }

    // idle reload
    const w = a.weapon;
    if (w.def.magSize > 0 && w.ammo < w.def.magSize * 0.35 && w.reserve > 0) startReload(sim, a);

    const bomb = sim.bomb;
    const isT = a.team === 'T';

    // lost sight of somebody: go check
    if (this.lastKnown && t - this.lastKnownAt < 4 && (this.investigates || a.hasBomb === false) && this.state === 'combat') {
      this.state = 'seek';
      this.seekUntil = t + 4.5;
      this.setGoal(this.lastKnown.x, this.lastKnown.z);
      return;
    }
    if (this.state === 'seek' && t < this.seekUntil && this.goal) {
      if (dist2D(a.pos.x, a.pos.z, this.goal.x, this.goal.z) > 2) return;
      this.lastKnown = null;
    }

    if (isT) {
      if (bomb.state === 'dropped' && sim.fetcherId === a.id) {
        this.state = 'fetch';
        this.setGoal(bomb.pos.x, bomb.pos.z);
        return;
      }
      if (bomb.state === 'planted') {
        // defuser detected: rush the bomb
        const d = bomb.defuserId >= 0 ? sim.actors[bomb.defuserId] : null;
        if (d && d.alive && dist2D(a.pos.x, a.pos.z, bomb.pos.x, bomb.pos.z) < 45 && this.investigates) {
          this.state = 'seek';
          this.seekUntil = t + 3;
          this.setGoal(bomb.pos.x, bomb.pos.z);
          return;
        }
        this.state = 'postplant';
        if (!this.guardSpot) {
          const site = bomb.site ? siteById(bomb.site) : SITES[0];
          this.guardSpot = { ...pick(site.guardSpots) };
        }
        this.setGoal(this.guardSpot.x, this.guardSpot.z, 1.2);
        return;
      }
      if (a.hasBomb) {
        this.thinkCarrier();
        return;
      }
      this.thinkTRoute();
      return;
    }

    // CT
    if (bomb.state === 'planted') {
      const pos = bomb.pos;
      if (sim.defuserPickId === a.id) {
        const d = dist2D(a.pos.x, a.pos.z, pos.x, pos.z);
        this.state = d <= CFG.DEFUSE_RANGE - 0.5 ? 'defuse' : 'retake';
        this.setGoal(pos.x, pos.z, 1.2);
      } else {
        this.state = 'retake';
        if (!this.coverPos) {
          const dx = a.pos.x - pos.x;
          const dz = a.pos.z - pos.z;
          const l = Math.hypot(dx, dz) || 1;
          const dist = randRange(6, 10);
          const c = sim.nav.snap(pos.x + (dx / l) * dist, pos.z + (dz / l) * dist);
          this.coverPos = c ?? { x: pos.x, z: pos.z };
        }
        this.setGoal(this.coverPos.x, this.coverPos.z, 1.5);
      }
      return;
    }
    this.coverPos = null;
    this.maybeRotate();
    // heard something: investigate for a bit
    if (this.investigates && this.heardPos && t - this.heardAt < 3 && sim.round > 0) {
      const d = dist2D(a.pos.x, a.pos.z, this.heardPos.x, this.heardPos.z);
      if (d > 6 && d < 40) {
        this.state = 'seek';
        this.seekUntil = t + 5;
        this.setGoal(this.heardPos.x, this.heardPos.z);
        this.heardPos = null;
        return;
      }
    }
    this.state = 'hold';
    if (this.post) this.setGoal(this.post.x, this.post.z, 0.9);
  }

  /** CT rotation: enemies spotted at the other site -> some idle CTs move over. */
  private maybeRotate(): void {
    const sim = this.sim;
    const al = sim.ctAlert;
    if (!al || !this.post || this.rotated || this.post.site === al.site) return;
    if (sim.t - al.at > 14 || sim.t < al.at + this.rotateDelay) return;
    let already = 0;
    for (const a of sim.actors) {
      if (!a.alive || a.team !== 'CT' || a.id === this.a.id) continue;
      const br = sim.brains.get(a.id);
      if (br && br.post && br.post.site === al.site) already++;
    }
    if (already >= 3) return;
    const options = CT_POSTS.filter((p) => p.site === al.site);
    if (options.length === 0) return;
    this.post = pick(options);
    this.rotated = true;
  }

  private thinkCarrier(): void {
    const a = this.a;
    const sim = this.sim;
    const t = sim.t;
    if (!this.plantSite) {
      // picked the bomb up mid-round: nearest site
      let best = Infinity;
      for (const s of SITES) {
        const d = dist2D(a.pos.x, a.pos.z, s.center.x, s.center.z);
        if (d < best) {
          best = d;
          this.plantSite = s;
        }
      }
      this.route = null;
      this.routeIdx = 0;
    }
    if (this.route && this.routeIdx < this.route.points.length) {
      this.thinkTRoute();
      return;
    }
    if (!this.plantSpot) this.plantSpot = { ...pick((this.plantSite as SiteDef).plantSpots) };
    const d = dist2D(a.pos.x, a.pos.z, this.plantSpot.x, this.plantSpot.z);
    if (t < this.startDelay) return;
    this.state = d < 1.3 ? 'plant' : 'route';
    this.setGoal(this.plantSpot.x, this.plantSpot.z, 0.6);
  }

  private thinkTRoute(): void {
    const a = this.a;
    const sim = this.sim;
    if (sim.t - (sim.roundEndsAt - CFG.ROUND_TIME) < this.startDelay) {
      this.state = 'route';
      this.goal = null;
      return;
    }
    if (this.route && this.routeIdx < this.route.points.length) {
      const p = this.route.points[this.routeIdx];
      if (dist2D(a.pos.x, a.pos.z, p.x, p.z) < 3) this.routeIdx++;
      if (this.routeIdx < this.route.points.length) {
        const q = this.route.points[this.routeIdx];
        this.state = 'route';
        this.setGoal(q.x, q.z, 1.5);
        return;
      }
    }
    // route finished, no bomb: guard the site
    const site = this.plantSite ?? SITES[0];
    if (!this.guardSpot) this.guardSpot = { ...pick(site.guardSpots) };
    this.state = 'postplant';
    this.setGoal(this.guardSpot.x, this.guardSpot.z, 1.2);
  }

  /** Bots don't waste ammo on targets their current weapon can't reasonably hit. */
  private engageRange(): number {
    const def = this.a.weapon.def;
    if (def.scope) return 95;
    if (def.slot === 'melee') return 3;
    if (def.slot === 'secondary') return 32;
    return 62;
  }

  private acquireTarget(): void {
    const sim = this.sim;
    const a = this.a;
    const t = sim.t;
    let best: Actor | null = null;
    let bestD = Infinity;
    for (const e of sim.actors) {
      if (!e.alive || e.team === a.team) continue;
      if (!sim.sees(a, e)) continue;
      let d = dist2D(a.pos.x, a.pos.z, e.pos.x, e.pos.z);
      if (d > this.engageRange()) continue;
      if (this.target && e.id === this.target.id) d *= 0.75;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best) {
      if (!this.target || this.target.id !== best.id) {
        const fresh = !this.target || !this.target.alive;
        this.target = best;
        this.aimHead = rand() < this.headChance;
        if (fresh && t - this.targetSeenAt > 0.6) this.reactUntil = t + this.reaction * this.reactionScale * randRange(0.8, 1.3);
        this.burstLeft = 0;
      }
      this.targetSeenAt = t;
      this.lastKnown = { x: best.pos.x, z: best.pos.z };
      this.lastKnownAt = t;
    } else if (this.target && (!this.target.alive || t - this.targetSeenAt > 0.55)) {
      this.target = null;
    }
  }

  // ---- doing (each tick) ---------------------------------------------------------------------------
  private setGoal(x: number, z: number, arrive = 1): void {
    const moved = !this.goal || Math.abs(this.goal.x - x) > 1.2 || Math.abs(this.goal.z - z) > 1.2;
    this.goal = { x, z };
    this.arrive = arrive;
    if (moved) {
      this.path = null;
      this.repathAt = 0;
    }
  }
  private arrive = 1;

  private tickWait(dt: number): void {
    this.tickLook(dt, false);
  }

  private tickTravel(dt: number): void {
    const a = this.a;
    const sim = this.sim;
    const moving = this.followPath(dt);
    const d = this.goal ? dist2D(a.pos.x, a.pos.z, this.goal.x, this.goal.z) : 0;
    if (
      (this.state === 'hold' || this.state === 'postplant' || this.state === 'retake') &&
      this.goal &&
      d < 7
    ) {
      a.input.walk = d < 4;
    }
    this.tickLook(dt, moving);
    void sim;
  }

  private tickPlant(dt: number): void {
    const a = this.a;
    a.input.use = true;
    a.input.wishX = 0;
    a.input.wishZ = 0;
    // planting happens on the spot; keep facing down-range
    if (this.plantSpot && dist2D(a.pos.x, a.pos.z, this.plantSpot.x, this.plantSpot.z) > 1.9) {
      this.state = 'route';
    }
    this.tickLook(dt, false);
  }

  private tickDefuse(dt: number): void {
    const a = this.a;
    const b = this.sim.bomb;
    if (b.state !== 'planted') return;
    const d = dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z);
    if (d > 1.3) {
      this.followPath(dt);
    }
    a.input.use = d <= CFG.DEFUSE_RANGE - 0.3;
    if (a.input.use) {
      a.input.wishX = 0;
      a.input.wishZ = 0;
    }
    // look at the bomb
    this.turnToward(dirToYaw(b.pos.x - a.pos.x, b.pos.z - a.pos.z), -0.6, dt, 240);
  }

  /** Walk along the A* path toward `goal`. Returns true while actually moving. */
  private followPath(dt: number): boolean {
    const a = this.a;
    const sim = this.sim;
    const t = sim.t;
    const goal = this.goal;
    if (!goal) return false;
    const dGoal = dist2D(a.pos.x, a.pos.z, goal.x, goal.z);
    if (dGoal < this.arrive) return false;

    if (!this.path || t >= this.repathAt) {
      const p = sim.nav.findPath(a.pos.x, a.pos.z, goal.x, goal.z);
      this.path = p ?? [{ x: goal.x, z: goal.z }];
      this.pathIdx = 0;
      this.repathAt = t + 3 + rand() * 1.5;
    }
    let wp = this.path[this.pathIdx];
    while (wp && dist2D(a.pos.x, a.pos.z, wp.x, wp.z) < 0.55 && this.pathIdx < this.path.length - 1) {
      this.pathIdx++;
      wp = this.path[this.pathIdx];
    }
    if (!wp) return false;
    let dx = wp.x - a.pos.x;
    let dz = wp.z - a.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;

    // stuck handling
    if (t >= this.stuckAt) {
      const moved = dist2D(a.pos.x, a.pos.z, this.stuckPos.x, this.stuckPos.z);
      this.stuckAt = t + 0.7;
      this.stuckPos = { x: a.pos.x, z: a.pos.z };
      if (moved < 0.3 && sim.phase === 'live') {
        this.stuckCount++;
        this.repathAt = 0;
        this.unstuckUntil = t + 0.5;
        this.unstuckDir = rand() < 0.5 ? -1 : 1;
        if (this.stuckCount >= 4) {
          this.stuckCount = 0;
          const s = sim.nav.snap(a.pos.x + randRange(-2, 2), a.pos.z + randRange(-2, 2));
          if (s) {
            a.pos.x = s.x;
            a.pos.z = s.z;
          }
        }
      } else this.stuckCount = Math.max(0, this.stuckCount - 1);
    }
    if (t < this.unstuckUntil) {
      const px = -dz * this.unstuckDir;
      const pz = dx * this.unstuckDir;
      dx = dx * 0.5 + px;
      dz = dz * 0.5 + pz;
    }

    // soft separation from other actors
    for (const o of sim.actors) {
      if (o === a || !o.alive) continue;
      const ox = a.pos.x - o.pos.x;
      const oz = a.pos.z - o.pos.z;
      const od = Math.hypot(ox, oz);
      if (od < 1.3 && od > 0.001) {
        dx += (ox / od) * (1.3 - od) * 0.8;
        dz += (oz / od) * (1.3 - od) * 0.8;
      }
    }
    const nl = Math.hypot(dx, dz) || 1;
    a.input.wishX = dx / nl;
    a.input.wishZ = dz / nl;
    void dt;
    return true;
  }

  private tickLook(dt: number, moving: boolean): void {
    const a = this.a;
    const sim = this.sim;
    const t = sim.t;
    let yaw = a.yaw;
    let rate = 200;
    if (t < this.lookOverrideUntil && this.lookPos) {
      yaw = dirToYaw(this.lookPos.x - a.pos.x, this.lookPos.z - a.pos.z);
      rate = 380;
    } else if (moving && (a.input.wishX !== 0 || a.input.wishZ !== 0)) {
      yaw = dirToYaw(a.input.wishX, a.input.wishZ);
      // glance along interesting angles now and then while travelling
      rate = 260;
    } else {
      if (t >= this.scanAt) {
        const looks = this.currentLooks();
        if (looks.length > 0) {
          // hold the main angle most of the time, glance at the others briefly
          const main = rand() < 0.65 || looks.length === 1;
          const l = main ? looks[0] : looks[1 + (this.scanIdx++ % (looks.length - 1))];
          this.scanYaw = dirToYaw(l.x - a.pos.x, l.z - a.pos.z) + randRange(-0.12, 0.12);
          this.scanAt = t + (main ? randRange(2, 4) : randRange(0.7, 1.4));
        } else {
          this.scanYaw = a.yaw + randRange(-1, 1);
          this.scanAt = t + randRange(1.2, 3);
        }
      }
      yaw = this.scanYaw;
      rate = 160;
    }
    this.turnToward(yaw, 0, dt, rate);
  }

  private currentLooks(): P2[] {
    if (this.post) return this.post.looks;
    const site = this.plantSite ?? (this.sim.bomb.site ? siteById(this.sim.bomb.site) : null);
    if (site) return site.entrances;
    return [];
  }

  private turnToward(yaw: number, pitchTarget: number, dt: number, rateDeg: number): void {
    const a = this.a;
    const err = angleDelta(a.yaw, yaw);
    const maxStep = rateDeg * DEG * dt;
    a.yaw += clamp(err * 9 * dt, -maxStep, maxStep);
    const perr = pitchTarget - a.pitch;
    a.pitch += clamp(perr * 7 * dt, -maxStep, maxStep);
  }

  // ---- combat ----------------------------------------------------------------------------------------
  private tickCombat(dt: number): void {
    const a = this.a;
    const sim = this.sim;
    const tgt = this.target;
    if (!tgt || !tgt.alive) return;
    const t = sim.t;
    const inp = a.input;
    const w = a.weapon;
    const def = w.def;

    const dx = tgt.pos.x - a.pos.x;
    const dz = tgt.pos.z - a.pos.z;
    const dist = Math.hypot(dx, dz);
    const aimY = tgt.pos.y + (this.aimHead && dist < 40 ? 1.56 : 1.22);
    const dy = aimY - a.eyeY;

    if (t >= this.noiseUntil) {
      this.noiseUntil = t + 0.3;
      this.noiseYaw = noise() * this.aimErr * this.aimErrScale;
      this.noisePitch = noise() * this.aimErr * this.aimErrScale * 0.8;
    }
    // lead a strafing target a little
    const lead = Math.min(0.12, dist / 220);
    const lx = tgt.vel.x * lead;
    const lz = tgt.vel.z * lead;
    const yawT = dirToYaw(dx + lx, dz + lz) + this.noiseYaw * DEG;
    const pitchT = Math.atan2(dy, dist) + this.noisePitch * DEG;
    const comp = 0.8;
    const wantYaw = yawT - a.punchYaw * DEG * comp;
    const wantPitch = pitchT - a.punchPitch * DEG * comp;

    const errYaw = angleDelta(a.yaw, wantYaw);
    const errPitch = wantPitch - a.pitch;
    const maxStep = this.aimSpeed * DEG * dt;
    a.yaw += clamp(errYaw * 11 * dt, -maxStep, maxStep);
    a.pitch += clamp(errPitch * 11 * dt, -maxStep, maxStep);

    const angErr = Math.hypot(errYaw * Math.cos(a.pitch), errPitch) / DEG;
    const thresh = clamp((Math.atan2(0.2, Math.max(dist, 1)) / DEG) * 1.4, 0.7, 5);
    const aligned = angErr < thresh;
    const ready = t >= this.reactUntil && sim.sees(a, tgt);

    // weapon choice
    if (def.slot !== 'melee' && w.ammo <= 0 && w.reserve <= 0) {
      if (a.weapons.secondary && a.slot !== 'secondary') switchSlot(sim, a, 'secondary');
      else if (a.slot !== 'melee') switchSlot(sim, a, 'melee');
    }
    if (def.slot === 'melee' && dist > 3 && a.weapons.secondary) switchSlot(sim, a, a.weapons.primary ? 'primary' : 'secondary');

    let wantFire = false;
    if (def.scope) {
      if (a.scopeLevel === 0 && dist > 9 && a.reloadLeft <= 0 && a.drawLeft <= 0) {
        inp.altFire = !a.altHeld; // one-click scope
      }
      wantFire = ready && aligned && (a.scopeLevel > 0 || dist < 9) && a.speed < 1.2;
    } else if (def.slot === 'melee') {
      wantFire = dist < 2.2 && aligned;
      if (dist > 1.3) {
        inp.wishX = dx / (dist || 1);
        inp.wishZ = dz / (dist || 1);
      }
    } else {
      wantFire = ready && aligned;
    }

    if (wantFire) {
      if (def.auto && def.slot !== 'melee') {
        if (this.burstLeft <= 0 && t >= this.burstPauseUntil) {
          this.burstLeft = dist < 10 ? 6 + Math.floor(rand() * 8) : dist < 25 ? 3 + Math.floor(rand() * 5) : 2 + Math.floor(rand() * 3);
        }
        if (this.burstLeft > 0) {
          inp.fire = true;
          if (a.lastShotAt !== this.lastShotSeen) {
            this.lastShotSeen = a.lastShotAt;
            this.burstLeft--;
            if (this.burstLeft <= 0) this.burstPauseUntil = t + randRange(0.18, 0.5) * (dist > 20 ? 1.6 : 1);
          }
        }
      } else {
        // semi-auto / melee: press only after release
        inp.fire = !a.triggerHeld;
      }
    } else {
      this.burstLeft = 0;
    }

    // movement while fighting
    if (def.slot !== 'melee') {
      const shooting = wantFire && (dist > 12 || def.scope !== undefined);
      if (!shooting && dist < 26 && !def.scope) {
        if (t >= this.strafeUntil) {
          this.strafeUntil = t + randRange(0.45, 1.3);
          this.strafeDir = rand() < 0.5 ? -1 : 1;
        }
        const nx = -dz / (dist || 1);
        const nz = dx / (dist || 1);
        inp.wishX = nx * this.strafeDir * 0.9;
        inp.wishZ = nz * this.strafeDir * 0.9;
        // don't strafe into walls: fall back to standing still
        const px = a.pos.x + inp.wishX * 0.9;
        const pz = a.pos.z + inp.wishZ * 0.9;
        if (sim.world.circleBlocked(px, pz, CFG.RADIUS + 0.05, a.pos.y)) {
          this.strafeDir = -this.strafeDir;
          this.strafeUntil = t + 0.4;
          inp.wishX = 0;
          inp.wishZ = 0;
        }
      }
    }
  }

  // ---- buying ------------------------------------------------------------------------------------------------
  private doBuy(): void {
    const sim = this.sim;
    const a = this.a;
    if (this.bought || sim.t < this.buyAt) return;
    this.bought = true;
    const buy = (item: BuyItem): boolean => sim.buy(a, item) === null;
    const rifle = WEAPONS[TEAM_RIFLE[a.team]];
    const hasAwp = sim.teamActors(a.team).some((m) => m.weapons.primary?.def.id === 'awp');
    const wantAwp = !hasAwp && a.money >= WEAPONS.awp.price + 1000 && rand() < 0.3;
    if (!a.weapons.primary) {
      if (wantAwp) buy('awp');
      else if (a.money >= rifle.price) buy('rifle');
    }
    if (a.armor < 100 && a.money >= CFG.KEVLAR_HELMET_PRICE) buy('kevlar_helmet');
    else if (a.armor < 100 && a.money >= CFG.KEVLAR_PRICE) buy('kevlar');
    else if (a.armor >= 100 && !a.helmet && a.money >= CFG.HELMET_ONLY_PRICE) buy('kevlar_helmet');
    if (a.team === 'CT' && !a.kit && a.money >= CFG.KIT_PRICE + (sim.opts.mode === 'pistol' && sim.round === 1 ? 999 : 0)) buy('kit');
    if (!a.weapons.primary && a.weapons.secondary?.def.id !== 'deagle' && a.money >= WEAPONS.deagle.price && rand() < 0.5) buy('deagle');
    switchToBest(sim, a);
  }
}

