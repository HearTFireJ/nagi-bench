import { angleDelta, clamp, DEG, pick, pitchToward, randRange, vdistXZ, yawToward, type Vec3 } from '../core/vec';
import { CELL, CT_HOLD_SPOTS, PLANT_SPOTS, ROAM_SPOTS, SITE_REGIONS, T_POST_PLANT_SPOTS, T_ROUTES, type HoldSpot } from '../map/MapData';
import type { MapGrid } from '../map/MapGrid';
import type { NavGrid } from '../map/NavGrid';
import type { World } from '../physics/World';
import type { Phase } from '../state/GameStore';
import type { Team } from '../weapons/WeaponDefs';
import type { C4 } from '../entities/C4';
import type { Character } from '../entities/Character';

export interface TeamPlan {
  site: 'A' | 'B';
  /** Site where enemies were last reported, with the report time. */
  enemySite: 'A' | 'B' | null;
  enemySiteTime: number;
}

export interface ShotEvent {
  pos: Vec3;
  team: Team;
  time: number;
}

/** Everything a bot may query about the game. Implemented by Game. */
export interface BotContext {
  world: World;
  nav: NavGrid;
  map: MapGrid;
  now: number;
  phase: Phase;
  /** Seconds since the round went live. */
  roundElapsed: number;
  characters: Character[];
  c4: C4;
  plans: Record<Team, TeamPlan>;
  recentShots: ShotEvent[];
}

type BotState = 'idle' | 'move' | 'hold' | 'combat' | 'hunt' | 'plant' | 'defuse';

const cellToWorld = (c: { x: number; z: number }, map: MapGrid): Vec3 => map.cellCenter(c.x, c.z);

export class BotBrain {
  state: BotState = 'idle';
  private target: Character | null = null;
  private targetFirstSeen = 0;
  private targetLastSeen = 0;
  private lastKnown: Vec3 | null = null;
  private lastKnownTime = -100;
  private path: Vec3[] | null = null;
  private pathIdx = 0;
  private goal: Vec3 | null = null;
  private goalKey = '';
  private nextRepath = 0;
  private nextPerception = 0;
  private stuckCheckAt = 0;
  private stuckPos: Vec3 = { x: 0, y: 0, z: 0 };
  private stuckCount = 0;
  private holdSpot: HoldSpot | null = null;
  private lookAt: Vec3 | null = null;
  private idleLookYaw = 0;
  private nextIdleLook = 0;
  private burstLeft = 0;
  private burstPauseUntil = 0;
  private nextTap = 0;
  private strafeDir = 0;
  private strafeUntil = 0;
  private route: Vec3[] = [];
  private routeIdx = 0;
  private rotateAt = 0;
  private roamGoal: Vec3 | null = null;
  private aimErrorYaw = 0;
  private aimErrorPitch = 0;
  private nextAimJitter = 0;
  private spawnTime = 0;
  assignedSpot: HoldSpot | null = null;
  readonly skill: number;

  constructor(
    readonly ch: Character,
    private readonly ctx: BotContext,
  ) {
    this.skill = randRange(0.55, 0.95);
  }

  /** Called at round start. */
  reset(now: number) {
    this.state = 'idle';
    this.target = null;
    this.lastKnown = null;
    this.path = null;
    this.goal = null;
    this.goalKey = '';
    this.holdSpot = null;
    this.lookAt = null;
    this.route = [];
    this.routeIdx = 0;
    this.roamGoal = null;
    this.stuckCount = 0;
    this.spawnTime = now;
    this.rotateAt = now + randRange(45, 75);
    this.nextRepath = 0;
    const team = this.ch.team;
    const plan = this.ctx.plans[team];
    if (team === 'T') {
      const routes = T_ROUTES[plan.site];
      const r = pick(routes);
      this.route = r.map((c) => cellToWorld(c, this.ctx.map));
    }
  }

  onDamaged(attacker: Character | null) {
    if (attacker && attacker.alive) {
      this.lastKnown = { ...attacker.pos };
      this.lastKnownTime = this.ctx.now;
      if (!this.target) {
        // snap attention toward the attacker
        this.idleLookYaw = yawToward(this.ch.pos, attacker.pos);
        this.lookAt = { ...attacker.pos };
      }
    }
  }

  update(dt: number) {
    const ch = this.ch;
    const now = this.ctx.now;
    ch.clearIntent();
    if (!ch.alive) return;
    if (this.ctx.phase === 'ended' || this.ctx.phase === 'matchover') {
      this.state = 'idle';
      return;
    }

    if (now >= this.nextPerception) {
      this.nextPerception = now + 0.1;
      this.perceive();
      this.listen();
    }
    this.manageWeapon();

    if (this.target) {
      this.combat(dt);
      return;
    }
    // Lost the target recently → hunt
    if (this.lastKnown && now - this.lastKnownTime < 7 && this.ctx.phase !== 'freeze') {
      this.state = 'hunt';
      this.moveTo(this.lastKnown, 'hunt', dt, 1.2);
      if (vdistXZ(ch.pos, this.lastKnown) < 2.5) {
        this.lastKnown = null;
        this.state = 'idle';
      }
      return;
    }
    this.objective(dt);
  }

  // ---------------------------------------------------------------------------
  // Perception
  // ---------------------------------------------------------------------------

  private canSee(other: Character): boolean {
    const ch = this.ch;
    const d = vdistXZ(ch.pos, other.pos);
    if (d > 85) return false;
    const yawTo = yawToward(ch.pos, other.pos);
    const ang = Math.abs(angleDelta(ch.yaw, yawTo));
    // 130° field of view, wider when very close
    if (ang > (d < 3 ? Math.PI : 65 * DEG)) return false;
    const eye = ch.eye;
    const head = { x: other.pos.x, y: other.pos.y + 1.58, z: other.pos.z };
    if (this.ctx.world.lineOfSight(eye, head)) return true;
    const chest = { x: other.pos.x, y: other.pos.y + 1.2, z: other.pos.z };
    return this.ctx.world.lineOfSight(eye, chest);
  }

  private perceive() {
    const ch = this.ch;
    const now = this.ctx.now;
    let best: Character | null = null;
    let bestD = Infinity;
    for (const o of this.ctx.characters) {
      if (!o.alive || o.team === ch.team) continue;
      if (!this.canSee(o)) continue;
      const d = vdistXZ(ch.pos, o.pos);
      // prefer the current target unless another is much closer
      const score = o === this.target ? d * 0.6 : d;
      if (score < bestD) {
        bestD = score;
        best = o;
      }
    }
    if (best) {
      if (best !== this.target) {
        this.target = best;
        this.targetFirstSeen = now;
        this.burstLeft = 0;
        this.aimErrorYaw = randRange(-1, 1) * 4 * DEG * (1.2 - this.skill);
        this.aimErrorPitch = randRange(-1, 1) * 2.5 * DEG * (1.2 - this.skill);
      }
      this.targetLastSeen = now;
      this.lastKnown = { ...best.pos };
      this.lastKnownTime = now;
      this.reportEnemy(best.pos);
    } else if (this.target) {
      // lose target after a short memory window
      if (now - this.targetLastSeen > 0.6) {
        this.target = null;
        this.state = 'hunt';
      }
    }
  }

  private reportEnemy(pos: Vec3) {
    const plan = this.ctx.plans[this.ch.team];
    for (const site of ['A', 'B'] as const) {
      const r = SITE_REGIONS[site];
      const cx = pos.x / CELL;
      const cz = pos.z / CELL;
      if (cx >= r.x0 && cx <= r.x1 + 1 && cz >= r.z0 && cz <= r.z1 + 1) {
        plan.enemySite = site;
        plan.enemySiteTime = this.ctx.now;
      }
    }
  }

  private listen() {
    if (this.target) return;
    const ch = this.ch;
    const now = this.ctx.now;
    for (const s of this.ctx.recentShots) {
      if (s.team === ch.team || now - s.time > 1.5) continue;
      const d = vdistXZ(ch.pos, s.pos);
      if (d < 35) {
        if (!this.lastKnown || now - this.lastKnownTime > 1) {
          this.lastKnown = { ...s.pos };
          this.lastKnownTime = now;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Weapon management
  // ---------------------------------------------------------------------------

  private manageWeapon() {
    const ch = this.ch;
    const now = this.ctx.now;
    const w = ch.activeWeapon;
    // Prefer primary, fall back to secondary, then knife
    const best = ch.bestSlot();
    if (best !== ch.activeSlot && !w.isReloading(now)) {
      const cur = ch.activeWeapon;
      if (cur.isMelee || (cur.ammo === 0 && cur.reserve === 0) || (best === 'primary' && !this.target)) ch.intent.switchSlot = best;
    }
    if (w.needsReload() && !w.isReloading(now)) ch.intent.reload = true;
    // Top up when safe
    if (!this.target && !w.isMelee && w.ammo < w.def.magSize * 0.4 && w.reserve > 0 && !w.isReloading(now)) ch.intent.reload = true;
  }

  // ---------------------------------------------------------------------------
  // Combat
  // ---------------------------------------------------------------------------

  private combat(dt: number) {
    const ch = this.ch;
    const t = this.target!;
    const now = this.ctx.now;
    this.state = 'combat';
    const dist = vdistXZ(ch.pos, t.pos);
    const w = ch.activeWeapon;
    const def = w.def;

    // Aim point: chest, better bots aim at the head at closer range
    const aimHead = this.skill > 0.75 && dist < 25 && Math.random() < 0.6;
    const aimPos = { x: t.pos.x, y: t.pos.y + (aimHead ? 1.5 : 1.15), z: t.pos.z };
    // Lead slightly for moving targets
    aimPos.x += t.vel.x * dist * 0.004;
    aimPos.z += t.vel.z * dist * 0.004;

    // Aim error shrinks while tracking
    const trackTime = now - this.targetFirstSeen;
    if (now >= this.nextAimJitter) {
      this.nextAimJitter = now + 0.25;
      const e = (1.15 - this.skill) * Math.max(0.25, 1 - trackTime * 0.6);
      this.aimErrorYaw = randRange(-1, 1) * 3 * DEG * e * Math.min(2, dist / 15 + 0.4);
      this.aimErrorPitch = randRange(-1, 1) * 1.8 * DEG * e;
    }
    const turnRate = (260 + 260 * this.skill) * DEG;
    const err = this.aimToward(aimPos, dt, turnRate, this.aimErrorYaw, this.aimErrorPitch);

    // Scope for AWP when engaging
    if (def.scope && !ch.scoped && dist > 8 && w.canFire(now)) ch.intent.altFire = true;
    if (def.scope && ch.scoped && dist <= 6) ch.intent.altFire = true;

    const reaction = 0.15 + (1 - this.skill) * 0.45;
    const canShoot = trackTime > reaction && err < (def.scope ? 1.5 : 4.5) * DEG && !w.isReloading(now) && !ch.isSwitching(now);
    if (w.isMelee) {
      // Rush the enemy with the knife
      this.moveDirect(t.pos);
      if (dist < 1.6 && canShoot) ch.intent.fire = true;
      return;
    }
    if (canShoot) {
      if (def.auto) {
        if (now >= this.burstPauseUntil) {
          if (this.burstLeft <= 0) {
            this.burstLeft = dist > 30 ? Math.round(randRange(2, 4)) : Math.round(randRange(4, 9));
          }
          ch.intent.fire = true;
          this.burstLeft -= dt * def.rpm / 60;
          if (this.burstLeft <= 0) this.burstPauseUntil = now + randRange(0.2, 0.45);
        }
      } else if (now >= this.nextTap && w.canFire(now)) {
        ch.intent.fire = true;
        this.nextTap = now + Math.max(60 / def.rpm, def.scope ? 1.4 : 0.22 + (1 - this.skill) * 0.2);
      }
    }

    // Movement in combat
    if (w.isReloading(now)) {
      // fall back a little while reloading
      const back = yawToward(t.pos, ch.pos);
      ch.intent.dirX = -Math.sin(back) * 0.7;
      ch.intent.dirZ = -Math.cos(back) * 0.7;
      return;
    }
    if (def.scope || (dist > 22 && def.slot === 'primary')) {
      // hold still for accuracy
      return;
    }
    if (now > this.strafeUntil) {
      this.strafeDir = Math.random() < 0.35 ? 0 : Math.random() < 0.5 ? -1 : 1;
      this.strafeUntil = now + randRange(0.3, 0.9);
    }
    if (this.strafeDir !== 0) {
      // strafe perpendicular to the target
      const yawTo = yawToward(ch.pos, t.pos);
      const rx = Math.cos(yawTo) * this.strafeDir;
      const rz = -Math.sin(yawTo) * this.strafeDir;
      ch.intent.dirX = rx * 0.8;
      ch.intent.dirZ = rz * 0.8;
    }
    if (dist > 40 && def.slot === 'secondary') this.moveDirect(t.pos, 0.6);
  }

  /** Turn toward a point with limited angular speed. Returns remaining angular error (rad). */
  private aimToward(p: Vec3, dt: number, turnRate: number, errYaw: number, errPitch: number): number {
    const ch = this.ch;
    const eye = ch.eye;
    const wantYaw = yawToward(eye, p) + errYaw;
    const wantPitch = clamp(pitchToward(eye, p) + errPitch, -80 * DEG, 80 * DEG);
    const dy = angleDelta(ch.yaw, wantYaw);
    const dp = wantPitch - ch.pitch;
    const maxStep = turnRate * dt;
    ch.yaw += clamp(dy, -maxStep, maxStep);
    ch.pitch += clamp(dp, -maxStep, maxStep);
    return Math.sqrt(dy * dy + dp * dp);
  }

  private moveDirect(p: Vec3, speed = 1) {
    const ch = this.ch;
    const dx = p.x - ch.pos.x;
    const dz = p.z - ch.pos.z;
    const l = Math.sqrt(dx * dx + dz * dz);
    if (l < 0.05) return;
    ch.intent.dirX = (dx / l) * speed;
    ch.intent.dirZ = (dz / l) * speed;
  }

  // ---------------------------------------------------------------------------
  // Objectives
  // ---------------------------------------------------------------------------

  private objective(dt: number) {
    const ch = this.ch;
    const now = this.ctx.now;
    if (this.ctx.phase === 'freeze') {
      this.state = 'idle';
      this.idleLook(dt);
      return;
    }
    if (ch.team === 'T') this.objectiveT(dt);
    else this.objectiveCT(dt);
    void now;
  }

  private objectiveT(dt: number) {
    const ch = this.ch;
    const ctx = this.ctx;
    const now = ctx.now;
    const plan = ctx.plans.T;
    const c4 = ctx.c4;

    if (ctx.phase === 'planted') {
      // Defend the bomb from a post-plant spot near the planted site
      const site = c4.site ?? plan.site;
      if (!this.holdSpot || this.holdSpot.site !== site) this.holdSpot = this.pickSpot(T_POST_PLANT_SPOTS, site);
      this.holdAt(this.holdSpot, dt);
      return;
    }

    // Pick up a dropped bomb if we're the closest T
    if (c4.state === 'dropped') {
      let closest: Character | null = null;
      let cd = Infinity;
      for (const o of ctx.characters) {
        if (!o.alive || o.team !== 'T') continue;
        const d = vdistXZ(o.pos, c4.pos);
        if (d < cd) {
          cd = d;
          closest = o;
        }
      }
      if (closest === ch) {
        this.state = 'move';
        this.moveTo(c4.pos, 'pickup', dt, 1.0);
        if (vdistXZ(ch.pos, c4.pos) < 1.3) ch.intent.interact = true;
        return;
      }
    }

    if (ch.hasC4) {
      // Follow the route, then go plant
      const zone = ctx.map.isInPlantZone(ch.pos.x, ch.pos.z);
      if (zone === plan.site) {
        this.state = 'plant';
        ch.intent.interact = true;
        this.idleLook(dt, true);
        return;
      }
      if (this.followRoute(dt)) return;
      const spot = cellToWorld(PLANT_SPOTS[plan.site][ch.id % PLANT_SPOTS[plan.site].length], ctx.map);
      this.state = 'move';
      this.moveTo(spot, 'plant' + plan.site, dt, 1.0);
      return;
    }

    // No bomb: escort toward the site, then cover the planter from a post-plant spot
    if (this.followRoute(dt)) return;
    const carrier = ctx.characters.find((o) => o.alive && o.hasC4);
    const late = ctx.roundElapsed > 75;
    if (late && !carrier) {
      this.roam(dt);
      return;
    }
    if (!this.holdSpot || this.holdSpot.site !== plan.site) this.holdSpot = this.pickSpot(T_POST_PLANT_SPOTS, plan.site);
    if (late && Math.random() < 0.002) this.holdSpot = this.pickSpot(T_POST_PLANT_SPOTS, plan.site);
    this.holdAt(this.holdSpot, dt);
    void now;
  }

  private objectiveCT(dt: number) {
    const ch = this.ch;
    const ctx = this.ctx;
    const now = ctx.now;
    const plan = ctx.plans.CT;
    const c4 = ctx.c4;

    if (ctx.phase === 'planted' && c4.state === 'planted') {
      const d = vdistXZ(ch.pos, c4.pos);
      // If a teammate is already on the bomb, cover from a hold spot at that site instead of crowding it.
      const site = c4.site ?? 'A';
      const someoneDefusing = ctx.characters.some((o) => o !== ch && o.alive && o.team === 'CT' && vdistXZ(o.pos, c4.pos) < 1.4);
      if (someoneDefusing && d > 1.4) {
        if (!this.holdSpot || this.holdSpot.site !== site) this.holdSpot = this.pickSpot(CT_HOLD_SPOTS, site);
        this.holdAt(this.holdSpot, dt);
        return;
      }
      if (d < 1.4) {
        this.state = 'defuse';
        ch.intent.interact = true;
        // look around while defusing
        this.idleLook(dt, true);
        return;
      }
      this.state = 'move';
      this.moveTo(c4.pos, 'defuse', dt, 1.0);
      return;
    }

    // Rotate when enemies were reported at a site (with some delay), or late in the round
    let site: 'A' | 'B' | 'MID' | null = this.assignedSpot?.site ?? null;
    if (plan.enemySite && now - plan.enemySiteTime < 30 && now - plan.enemySiteTime > 2 + (1 - this.skill) * 6) {
      // Leave one defender behind: bots with an even id rotate first
      if (this.assignedSpot?.site !== plan.enemySite && (ch.id % 2 === 0 || now - plan.enemySiteTime > 12)) site = plan.enemySite;
    }
    if (now > this.rotateAt && ctx.roundElapsed > 40) {
      this.roam(dt);
      return;
    }
    if (!this.holdSpot || (site && this.holdSpot.site !== site)) {
      this.holdSpot = site && site !== this.assignedSpot?.site ? this.pickSpot(CT_HOLD_SPOTS, site) : this.assignedSpot ?? this.pickSpot(CT_HOLD_SPOTS, 'A');
    }
    this.holdAt(this.holdSpot, dt);
  }

  private pickSpot(list: HoldSpot[], site: 'A' | 'B' | 'MID'): HoldSpot {
    const candidates = list.filter((s) => s.site === site);
    return candidates.length ? candidates[(this.ch.id + Math.floor(Math.random() * 2)) % candidates.length] : list[0];
  }

  /** Walk the pre-selected route waypoints. Returns true while still en route. */
  private followRoute(dt: number): boolean {
    if (this.routeIdx >= this.route.length) return false;
    const wp = this.route[this.routeIdx];
    if (vdistXZ(this.ch.pos, wp) < 2.5) {
      this.routeIdx++;
      return this.routeIdx < this.route.length;
    }
    this.state = 'move';
    this.moveTo(wp, 'route' + this.routeIdx, dt, 1.0);
    return true;
  }

  private holdAt(spot: HoldSpot, dt: number) {
    const p = cellToWorld(spot, this.ctx.map);
    const look = cellToWorld({ x: spot.lookX, z: spot.lookZ }, this.ctx.map);
    if (vdistXZ(this.ch.pos, p) > 1.0) {
      this.state = 'move';
      this.moveTo(p, 'hold' + spot.x + ',' + spot.z, dt, 1.0);
      return;
    }
    this.state = 'hold';
    // Face the expected approach with an occasional glance around
    const now = this.ctx.now;
    if (now >= this.nextIdleLook) {
      this.nextIdleLook = now + randRange(1.5, 4);
      this.idleLookYaw = yawToward(this.ch.pos, look) + randRange(-0.5, 0.5);
    }
    this.turnToYaw(this.idleLookYaw, dt, 200 * DEG);
    this.ch.pitch += (0 - this.ch.pitch) * Math.min(1, dt * 3);
  }

  private roam(dt: number) {
    if (!this.roamGoal || vdistXZ(this.ch.pos, this.roamGoal) < 2) {
      this.roamGoal = cellToWorld(pick(ROAM_SPOTS), this.ctx.map);
    }
    this.state = 'move';
    this.moveTo(this.roamGoal, 'roam', dt, 1.0);
  }

  private idleLook(dt: number, slow = false) {
    const now = this.ctx.now;
    if (now >= this.nextIdleLook) {
      this.nextIdleLook = now + randRange(1.2, 3);
      this.idleLookYaw = this.ch.yaw + randRange(-1.2, 1.2);
    }
    this.turnToYaw(this.idleLookYaw, dt, (slow ? 90 : 150) * DEG);
    this.ch.pitch += (0 - this.ch.pitch) * Math.min(1, dt * 3);
  }

  private turnToYaw(yaw: number, dt: number, rate: number) {
    const d = angleDelta(this.ch.yaw, yaw);
    this.ch.yaw += clamp(d, -rate * dt, rate * dt);
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  /** Pathfind & steer toward a goal. */
  private moveTo(goal: Vec3, key: string, dt: number, speed: number) {
    const ch = this.ch;
    const now = this.ctx.now;
    const needPath = !this.path || key !== this.goalKey || (this.goal && vdistXZ(this.goal, goal) > 1.5) || now >= this.nextRepath;
    if (needPath && now >= this.nextRepath - 1.5) {
      this.path = this.ctx.nav.findPath(ch.pos, goal);
      this.pathIdx = 0;
      this.goal = { ...goal };
      this.goalKey = key;
      this.nextRepath = now + 2.0;
      if (this.path && this.path.length > 1 && vdistXZ(this.path[0], ch.pos) < 0.8) this.pathIdx = 1;
    }
    // stuck detection
    if (now >= this.stuckCheckAt) {
      const moved = vdistXZ(ch.pos, this.stuckPos);
      if (this.stuckCheckAt > 0 && moved < 0.35) {
        this.stuckCount++;
        this.nextRepath = 0;
        this.path = null;
        if (this.stuckCount >= 3) {
          // give up on this goal for a moment: wander to a random nearby spot
          this.stuckCount = 0;
          this.roamGoal = cellToWorld(pick(ROAM_SPOTS), this.ctx.map);
          this.goalKey = '';
        }
        // small random nudge
        ch.intent.dirX = randRange(-1, 1);
        ch.intent.dirZ = randRange(-1, 1);
        if (Math.random() < 0.3) ch.intent.jump = true;
      } else this.stuckCount = Math.max(0, this.stuckCount - 1);
      this.stuckPos = { ...ch.pos };
      this.stuckCheckAt = now + 1.0;
    }
    if (!this.path || this.path.length === 0) {
      this.moveDirect(goal, speed);
      return;
    }
    let wp = this.path[Math.min(this.pathIdx, this.path.length - 1)];
    while (this.pathIdx < this.path.length - 1 && vdistXZ(ch.pos, wp) < 0.7) {
      this.pathIdx++;
      wp = this.path[this.pathIdx];
    }
    const dx = wp.x - ch.pos.x;
    const dz = wp.z - ch.pos.z;
    const l = Math.sqrt(dx * dx + dz * dz);
    if (l > 0.1) {
      ch.intent.dirX = (dx / l) * speed;
      ch.intent.dirZ = (dz / l) * speed;
      // Look where we walk (or at a point of interest)
      const lookTarget = this.lookAt && now - this.lastKnownTime < 3 ? this.lookAt : this.path[Math.min(this.pathIdx + 1, this.path.length - 1)];
      const wantYaw = yawToward(ch.pos, lookTarget.x === ch.pos.x && lookTarget.z === ch.pos.z ? wp : lookTarget);
      this.turnToYaw(wantYaw, dt, 360 * DEG);
      ch.pitch += (0 - ch.pitch) * Math.min(1, dt * 4);
    }
  }
}
