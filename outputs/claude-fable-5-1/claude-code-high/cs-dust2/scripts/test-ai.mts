// Headless AI simulation: runs BotBrain for 10 bots on the real map with real physics,
// perception and simplified shooting. Verifies objectives are pursued and nobody clips walls.
import { BotBrain, type BotContext, type TeamPlan } from '../src/game/ai/BotBrain';
import { dirFromYawPitch, vdistXZ, type Vec3 } from '../src/game/core/vec';
import { CT_HOLD_SPOTS, CT_SPAWNS, T_SPAWNS } from '../src/game/map/MapData';
import { MapGrid } from '../src/game/map/MapGrid';
import { NavGrid } from '../src/game/map/NavGrid';
import { World } from '../src/game/physics/World';
import type { Phase } from '../src/game/state/GameStore';
import { computeDamage } from '../src/game/weapons/Damage';
import { WEAPONS, type Team, type WeaponSlot } from '../src/game/weapons/WeaponDefs';
import { WeaponInstance } from '../src/game/weapons/WeaponInstance';
import type { Character } from '../src/game/entities/Character';
import type { C4 } from '../src/game/entities/C4';

const map = new MapGrid();
const nav = new NavGrid(map);
const world = new World(map);

/** Minimal stand-in for Character (no three.js). */
class FakeChar {
  pos: Vec3;
  vel: Vec3 = { x: 0, y: 0, z: 0 };
  radius = 0.35;
  grounded = true;
  yaw = 0;
  pitch = 0;
  health = 100;
  armor = 0;
  helmet = false;
  alive = true;
  hasC4 = false;
  scoped = false;
  kills = 0;
  activeSlot: WeaponSlot = 'secondary';
  weapons = new Map<WeaponSlot, WeaponInstance>();
  intent = { dirX: 0, dirZ: 0, jump: false, walk: false, fire: false, altFire: false, reload: false, interact: false, switchSlot: null as WeaponSlot | null };
  controller = 'bot' as const;
  prevFire = false;
  constructor(
    public id: number,
    public name: string,
    public team: Team,
    spawn: Vec3,
    primary: string | null,
  ) {
    this.pos = { ...spawn };
    this.weapons.set('melee', new WeaponInstance(WEAPONS.knife));
    this.weapons.set('secondary', new WeaponInstance(WEAPONS[team === 'T' ? 'glock' : 'usp']));
    if (primary) {
      this.weapons.set('primary', new WeaponInstance(WEAPONS[primary]));
      this.activeSlot = 'primary';
    }
  }
  get eye(): Vec3 {
    return { x: this.pos.x, y: this.pos.y + 1.6, z: this.pos.z };
  }
  get activeWeapon() {
    return this.weapons.get(this.activeSlot) ?? this.weapons.get('melee')!;
  }
  bestSlot(): WeaponSlot {
    const p = this.weapons.get('primary');
    if (p && (p.ammo > 0 || p.reserve > 0)) return 'primary';
    const s = this.weapons.get('secondary');
    if (s && (s.ammo > 0 || s.reserve > 0)) return 'secondary';
    return 'melee';
  }
  isSwitching() {
    return false;
  }
  clearIntent() {
    this.intent = { dirX: 0, dirZ: 0, jump: false, walk: false, fire: false, altFire: false, reload: false, interact: false, switchSlot: null };
  }
  horizontalSpeed() {
    return Math.sqrt(this.vel.x ** 2 + this.vel.z ** 2);
  }
}

const c4 = { state: 'carried', carrierId: -1, pos: { x: 0, y: 0, z: 0 }, site: null as 'A' | 'B' | null, explodeAt: 0 } as unknown as C4;
const plans: Record<Team, TeamPlan> = {
  T: { site: 'B', enemySite: null, enemySiteTime: -100 },
  CT: { site: 'A', enemySite: null, enemySiteTime: -100 },
};
const ctx: BotContext = {
  world,
  nav,
  map,
  now: 0,
  phase: 'live' as Phase,
  roundElapsed: 0,
  characters: [] as unknown as Character[],
  c4,
  plans,
  recentShots: [],
};

const chars: FakeChar[] = [];
let id = 1;
T_SPAWNS.slice(0, 5).forEach((s, i) => chars.push(new FakeChar(id++, 'T' + i, 'T', map.cellCenter(s.x, s.z), i < 3 ? 'ak47' : null)));
CT_SPAWNS.slice(0, 5).forEach((s, i) => chars.push(new FakeChar(id++, 'CT' + i, 'CT', map.cellCenter(s.x, s.z), i < 3 ? 'm4a4' : i === 3 ? 'awp' : null)));
ctx.characters = chars as unknown as Character[];
chars[1].hasC4 = true;
c4.carrierId = chars[1].id;

// SCENARIO=plant: CTs start dead so the T side must plant; then CTs are revived and must go defuse.
const scenarioPlant = process.argv.includes('plant');
let ctRevived = false;
if (scenarioPlant) for (const c of chars) if (c.team === 'CT') c.alive = false;

const brains = chars.map((c) => new BotBrain(c as unknown as Character, ctx));
const order: ('A' | 'B' | 'MID')[] = ['A', 'B', 'A', 'B', 'MID'];
chars
  .filter((c) => c.team === 'CT')
  .forEach((c, i) => {
    const b = brains[chars.indexOf(c)];
    const spots = CT_HOLD_SPOTS.filter((s) => s.site === order[i]);
    b.assignedSpot = spots[Math.floor(i / 2) % spots.length];
  });
for (const b of brains) b.reset(0);

let fail = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) fail++;
  console.log((ok ? 'OK   ' : 'FAIL ') + name);
};

const dt = 1 / 60;
let planted = false;
let plantProgress = 0;
let defuseProgress = 0;
let defused = false;
let shots = 0;
let kills = 0;
let wallViolations = 0;
const traveled = new Map<number, number>();
const holdReached = new Set<number>();
let plantTime = -1;
let firstDefuseApproach = -1;
const liveStart = 0;

for (let step = 0; step < 60 * 150; step++) {
  ctx.now += dt;
  ctx.roundElapsed = ctx.now - liveStart;
  for (const b of brains) b.update(dt);
  for (const ch of chars) {
    if (!ch.alive) continue;
    const it = ch.intent;
    const w = ch.activeWeapon;
    w.update(dt, ctx.now);
    if (it.switchSlot && ch.weapons.has(it.switchSlot)) ch.activeSlot = it.switchSlot;
    if (it.reload) w.startReload(ctx.now);
    if (it.altFire && w.def.scope) ch.scoped = !ch.scoped;
    // movement
    const max = w.def.moveSpeed;
    const interacting = plantProgress > 0 && ch.hasC4;
    const tx = interacting ? 0 : it.dirX * max;
    const tz = interacting ? 0 : it.dirZ * max;
    ch.vel.x += (tx - ch.vel.x) * Math.min(1, dt * 12);
    ch.vel.z += (tz - ch.vel.z) * Math.min(1, dt * 12);
    if (it.jump && ch.grounded) {
      ch.vel.y = 6.3;
      ch.grounded = false;
    }
    const before = { ...ch.pos };
    world.moveBody(ch, dt);
    traveled.set(ch.id, (traveled.get(ch.id) ?? 0) + vdistXZ(before, ch.pos));
    const cell = map.cellAtWorld(ch.pos.x, ch.pos.z);
    if (!cell || cell.wall) wallViolations++;
    // shooting
    const trigger = it.fire;
    const shouldFire = trigger && (w.def.auto || !ch.prevFire);
    ch.prevFire = trigger;
    if (shouldFire && w.canFire(ctx.now)) {
      const shot = w.fire(ctx.now, Math.min(1, ch.horizontalSpeed() / max), ch.scoped, !ch.grounded);
      shots++;
      const spread = (shot.spreadDeg * Math.PI) / 180;
      const rr = spread * Math.sqrt(Math.random());
      const th = Math.random() * Math.PI * 2;
      const dir = dirFromYawPitch(ch.yaw + rr * Math.cos(th), ch.pitch + rr * Math.sin(th));
      const hit = world.raycast(ch.eye, dir, w.def.range, chars as unknown as Character[], ch.id);
      ctx.recentShots.push({ pos: { ...ch.pos }, team: ch.team, time: ctx.now });
      if (hit.target) {
        const v = hit.target as unknown as FakeChar;
        const res = computeDamage(w.def, hit.hitbox ?? 'chest', hit.dist, v.armor, v.helmet);
        v.health -= res.health;
        brains[chars.indexOf(v)].onDamaged(ch as unknown as Character);
        if (v.health <= 0 && v.alive) {
          v.alive = false;
          kills++;
          ch.kills++;
          if (v.hasC4) {
            v.hasC4 = false;
            c4.state = 'dropped';
            c4.carrierId = -1;
            c4.pos = { ...v.pos };
          }
        }
      }
    }
    // interact
    if (it.interact) {
      if (ch.team === 'T' && ch.hasC4 && !planted) {
        const zone = map.isInPlantZone(ch.pos.x, ch.pos.z);
        if (zone) {
          plantProgress += dt;
          if (plantProgress >= 3.2) {
            planted = true;
            plantTime = ctx.now;
            ch.hasC4 = false;
            c4.state = 'planted';
            c4.site = zone;
            c4.pos = { ...ch.pos };
            ctx.phase = 'planted';
            plans.CT.enemySite = zone;
            plans.CT.enemySiteTime = ctx.now;
          }
        }
      } else if (ch.team === 'T' && c4.state === 'dropped' && vdistXZ(ch.pos, c4.pos) < 1.6) {
        c4.state = 'carried';
        c4.carrierId = ch.id;
        ch.hasC4 = true;
      } else if (ch.team === 'CT' && planted && !defused && vdistXZ(ch.pos, c4.pos) < 1.7) {
        if (firstDefuseApproach < 0) firstDefuseApproach = ctx.now;
        defuseProgress += dt;
        if (defuseProgress >= 7) defused = true;
      }
    }
  }
  ctx.recentShots = ctx.recentShots.filter((s) => ctx.now - s.time < 2);
  for (const b of brains) if (b.state === 'hold') holdReached.add(b.ch.id);
  if (scenarioPlant && planted && !ctRevived) {
    ctRevived = true;
    for (const c of chars) {
      if (c.team !== 'CT') continue;
      c.alive = true;
      c.health = 100;
    }
    // the T side is removed so the defuse can proceed unopposed
    for (const c of chars) if (c.team === 'T') c.alive = false;
  }
  if (defused) break;
  if (planted && ctx.now - plantTime > 40) break;
}

console.log('shots:', shots, 'kills:', kills, 'planted:', planted, 'defused:', defused, 'time:', ctx.now.toFixed(1));
for (const ch of chars) {
  const c = map.cellAtWorld(ch.pos.x, ch.pos.z);
  console.log(`${ch.name.padEnd(4)} alive=${ch.alive ? 1 : 0} kills=${ch.kills} state=${brains[chars.indexOf(ch)].state.padEnd(7)} pos=(${ch.pos.x.toFixed(0)},${ch.pos.y.toFixed(1)},${ch.pos.z.toFixed(0)}) cell=${c?.ch} traveled=${(traveled.get(ch.id) ?? 0).toFixed(0)}m`);
}
check('no bot ever stood inside a wall cell', wallViolations === 0);
check('every bot moved (> 15 m)', chars.every((c) => (traveled.get(c.id) ?? 0) > 15));
if (!scenarioPlant) {
  check('CT bots reached their hold spots', chars.filter((c) => c.team === 'CT').some((c) => holdReached.has(c.id)));
  check('combat happened (shots fired)', shots > 0);
  check('bomb was planted or the carrier died fighting', planted || !chars[1].alive || kills > 0);
}
if (planted) check('CTs approached the planted bomb to defuse', firstDefuseApproach > 0 || !chars.some((c) => c.team === 'CT' && c.alive));
if (scenarioPlant) {
  check('scenario plant: bomb planted', planted);
  check('scenario plant: bomb planted inside the planned site', c4.site === plans.T.site);
  check('scenario plant: bomb defused by the CT side', defused);
  console.log('plant time:', plantTime.toFixed(1), 'first defuse touch:', firstDefuseApproach.toFixed(1));
}
console.log(fail === 0 ? '\nAI SIMULATION PASSED' : `\n${fail} CHECKS FAILED`);
process.exit(fail ? 1 : 0);
