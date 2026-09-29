// Headless verification of the simulation core (no three.js / DOM needed).
//   npm test   ==   node --experimental-strip-types scripts/sim-test.ts
import { buildDust2 } from '../src/core/map/dust2.ts';
import { World, makeRayHit } from '../src/core/physics/world.ts';
import { stepBody } from '../src/core/physics/movement.ts';
import type { Body } from '../src/core/physics/movement.ts';
import { NavGrid } from '../src/core/nav/navgrid.ts';
import { ROUND_PRESETS, TICK_DT } from '../src/core/config.ts';
import { Rng } from '../src/core/math.ts';
import { Game } from '../src/core/game/game.ts';
import { WEAPONS } from '../src/core/weapons/defs.ts';
import { WeaponInstance } from '../src/core/weapons/weaponState.ts';
import { HITBOX_MULT, computeDamage, rawDamage, raycastCharacter } from '../src/core/weapons/damage.ts';
import { currentSpread, hitscan } from '../src/core/game/combat.ts';

let failures = 0;
let passes = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) {
    passes++;
    console.log('  ✓ ' + msg);
  } else {
    failures++;
    console.log('  ✗ FAIL: ' + msg);
  }
}
function section(name: string): void {
  console.log('\n# ' + name);
}

const map = buildDust2();
const world = new World(map);
const t0 = Date.now();
const nav = new NavGrid(world);
console.log(`map: ${map.boxes.length} boxes, ${world.ramps.length} ramps, ${world.doors.length} doors; nav ${nav.cols}x${nav.rows} built in ${Date.now() - t0}ms`);

// ------------------------------------------------------------------ map
section('map regions & connectivity');
const requiredZones = ['tSpawn', 'ctSpawn', 'longA', 'aSite', 'midDoors', 'catwalk', 'bTunnels', 'bSite'];
for (const z of requiredZones) ok(map.zones.some((q) => q.id === z), `zone ${z} exists`);
ok(map.doors.some((d) => d.id === 'midDoors'), 'mid door entity exists');

for (const [name, p] of Object.entries(map.anchors)) {
  ok(nav.isWalkable(p.x, p.z), `anchor ${name} (${p.x},${p.z}) is walkable`);
}
const A = map.anchors;
function pathVia(names: string[]): { len: number; pts: { x: number; z: number }[] } | null {
  let total = 0;
  const all: { x: number; z: number }[] = [];
  for (let i = 0; i < names.length - 1; i++) {
    const p = nav.findPath(A[names[i]].x, A[names[i]].z, A[names[i + 1]].x, A[names[i + 1]].z);
    if (!p) return null;
    total += nav.pathLength(p);
    all.push(...p);
  }
  return { len: total, pts: all };
}
for (const [name, route] of Object.entries(map.routes)) {
  const r = pathVia(route);
  ok(r !== null, `route ${name} connected${r ? ` (${r.len.toFixed(0)} m)` : ''}`);
}
const spawnsConnected = map.spawns.T.every((s) => nav.sameComponent(s.x, s.z, A.A_SITE.x, A.A_SITE.z)) && map.spawns.CT.every((s) => nav.sameComponent(s.x, s.z, A.B_SITE.x, A.B_SITE.z));
ok(spawnsConnected, 'all spawns connected to both sites');
for (const site of ['A', 'B'] as const) {
  const s = map.sites[site];
  for (const q of [...s.plantSpots, ...s.guardSpots, ...s.defendSpots]) {
    if (!nav.isWalkable(q.x, q.z)) ok(false, `site ${site} spot (${q.x},${q.z}) walkable`);
  }
}
ok(true, 'site spots walkable');

section('physics: walls / crates / ramps / doors');
function makeBody(x: number, z: number): Body {
  const y = world.terrainHeight(x, z);
  return { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, onGround: true, crouch: 0 };
}
function run(b: Body, ticks: number, wx: number, wz: number, speed = 5.4, jump = false): void {
  for (let i = 0; i < ticks; i++) {
    stepBody(world, b, { wishX: wx, wishZ: wz, wishSpeed: speed, jump, crouch: false }, TICK_DT);
    world.updateDoors(TICK_DT, [b.pos]);
  }
}
// walk into a wall for 5s in each compass direction from many spawn points: never inside a solid
{
  const rng = new Rng(7);
  let bad = 0;
  let samples = 0;
  for (let n = 0; n < 60; n++) {
    const s = rng.pick(rng.next() < 0.5 ? map.spawns.T : map.spawns.CT);
    const b = makeBody(s.x, s.z);
    for (let leg = 0; leg < 12; leg++) {
      const a = rng.range(0, Math.PI * 2);
      const wx = Math.cos(a);
      const wz = Math.sin(a);
      for (let i = 0; i < 90; i++) {
        stepBody(world, b, { wishX: wx, wishZ: wz, wishSpeed: 5.4, jump: rng.chance(0.02), crouch: false }, TICK_DT);
        world.updateDoors(TICK_DT, [b.pos]);
        samples++;
        // inside a wall box = failure
        const list = world.boxesNear(b.pos.x, b.pos.z, 1, []);
        for (const bx of list) {
          if (bx.kind !== 'wall' && bx.kind !== 'door') continue;
          if (b.pos.x > bx.minX + 0.05 && b.pos.x < bx.maxX - 0.05 && b.pos.z > bx.minZ + 0.05 && b.pos.z < bx.maxZ - 0.05 && b.pos.y < bx.maxY - 0.1) bad++;
        }
      }
    }
  }
  ok(bad === 0, `random walking (${samples} steps) never enters a wall/door body (violations: ${bad})`);
}
// speed sanity
{
  const b = makeBody(60, 112);
  run(b, 120, 0, -1);
  const sp = Math.hypot(b.vel.x, b.vel.z);
  ok(Math.abs(sp - 5.4) < 0.2, `reaches run speed (${sp.toFixed(2)} m/s)`);
  run(b, 60, 0, 0, 0);
  ok(Math.hypot(b.vel.x, b.vel.z) < 0.05, 'friction stops the body');
}
// jump onto a 1.2m crate (xbox at 58..62 x 74..78)
{
  const b = makeBody(60, 82);
  // approach north, jump when close
  let onTop = false;
  for (let i = 0; i < 200; i++) {
    const dist = b.pos.z - 78;
    const jump = dist < 1.3 && b.onGround;
    stepBody(world, b, { wishX: 0, wishZ: -1, wishSpeed: 5.4, jump, crouch: false }, TICK_DT);
    if (b.pos.z < 77 && b.pos.y > 1.15 && b.onGround) onTop = true;
  }
  ok(onTop, `player can jump onto the 1.2 m crate (final y=${b.pos.y.toFixed(2)})`);
}
// cannot walk onto a 2.6 m container
{
  const b = makeBody(106, 67);
  let inside = false;
  for (let i = 0; i < 240; i++) {
    stepBody(world, b, { wishX: -1, wishZ: 0, wishSpeed: 5.4, jump: i % 30 === 0, crouch: false }, TICK_DT);
    if (b.pos.x < 101 && b.pos.z > 62 && b.pos.z < 72 && b.pos.y < 3) inside = true;
  }
  ok(!inside && b.pos.x >= 101.35, `container blocks player (x=${b.pos.x.toFixed(2)}, y=${b.pos.y.toFixed(2)})`);
}
// climb the long A ramp on foot
{
  const b = makeBody(102.5, 98);
  run(b, 600, 0, -1);
  ok(Math.abs(b.pos.y - 2.4) < 0.15 && b.pos.z < 46, `walks up the long ramp to A level (y=${b.pos.y.toFixed(2)}, z=${b.pos.z.toFixed(1)})`);
}
// mid door blocks bullets & movement until it opens
{
  world.closeAllDoors();
  const door = world.doors[0];
  const hit = makeRayHit();
  const blocked = world.raycast(60, 1.6, 50, 0, 0, -1, 30, hit);
  ok(blocked && hit.box?.kind === 'door', 'closed mid door blocks a ray');
  const b = makeBody(60, 50);
  for (let i = 0; i < 300; i++) {
    stepBody(world, b, { wishX: 0, wishZ: -1, wishSpeed: 5.4, jump: false, crouch: false }, TICK_DT);
    world.updateDoors(TICK_DT, [b.pos]);
  }
  ok(b.pos.z < 36, `player passes through the mid door (z=${b.pos.z.toFixed(1)}), door open=${door.open.toFixed(2)}`);
  for (let i = 0; i < 240; i++) world.updateDoors(TICK_DT, [{ x: 0, y: 0, z: 0 }]);
  ok(door.open === 0, 'door closes again when nobody is near');
  world.closeAllDoors();
  const b2 = makeBody(60, 44);
  // freeze doors closed: player must not pass
  for (let i = 0; i < 120; i++) stepBody(world, b2, { wishX: 0, wishZ: -1, wishSpeed: 5.4, jump: false, crouch: false }, TICK_DT);
  // leaf is 0.3 thick, centred at z=41, player radius 0.4 -> resting z ~ 41.55
  ok(b2.pos.z > 41.5, `closed door stops the player (z=${b2.pos.z.toFixed(2)})`);
  world.openAllDoors();
}

// ------------------------------------------------------------------ nav
section('navigation');
{
  const p = nav.findPath(A.T_SPAWN.x, A.T_SPAWN.z, A.A_SITE.x, A.A_SITE.z);
  ok(p !== null && p.length > 2, 'A* T spawn -> A site');
  // follow the path with the physics body and make sure we arrive without getting stuck
  if (p) {
    const b = makeBody(A.T_SPAWN.x, A.T_SPAWN.z);
    let wp = 1;
    let ticks = 0;
    while (wp < p.length && ticks < 60 * 60) {
      const tx = p[wp].x - b.pos.x;
      const tz = p[wp].z - b.pos.z;
      const d = Math.hypot(tx, tz);
      if (d < 0.5) {
        wp++;
        continue;
      }
      stepBody(world, b, { wishX: tx / d, wishZ: tz / d, wishSpeed: 5.4, jump: false, crouch: false }, TICK_DT);
      world.updateDoors(TICK_DT, [b.pos]);
      ticks++;
    }
    ok(wp >= p.length, `physics body follows the smoothed path to A site in ${(ticks / 60).toFixed(1)} s (${nav.pathLength(p).toFixed(0)} m)`);
  }
  // all pairs of anchors connected
  let allConn = true;
  const names = Object.keys(A);
  for (const a of names) for (const c of names) if (!nav.sameComponent(A[a].x, A[a].z, A[c].x, A[c].z)) allConn = false;
  ok(allConn, 'every anchor reaches every other anchor');
  // path timing
  const s = Date.now();
  for (let i = 0; i < 20; i++) nav.findPath(A.T_SPAWN.x, A.T_SPAWN.z, A.B_SITE.x, A.B_SITE.z);
  console.log(`  (avg A* T spawn -> B site: ${((Date.now() - s) / 20).toFixed(1)} ms)`);
}

// ================================================================== weapons
section('weapons: data, hitboxes, damage, armour');
{
  for (const id of ['ak47', 'm4a4', 'awp', 'glock', 'usp', 'deagle', 'knife']) ok(!!WEAPONS[id], `weapon ${id} registered`);
  const w = WEAPONS;
  ok(w.glock.damage < w.deagle.damage && w.usp.damage < w.deagle.damage, 'pistol damage < Deagle damage');
  ok(w.deagle.damage < w.m4a4.damage && w.deagle.damage < w.ak47.damage, 'Deagle damage < rifle damage (between pistols and rifles)');
  ok(w.glock.damage < w.m4a4.damage && w.usp.damage < w.m4a4.damage, 'pistols weaker than rifles');
  ok(w.deagle.mag < w.glock.mag && w.deagle.mag < w.usp.mag, `Deagle has the smallest pistol magazine (${w.deagle.mag})`);
  ok(w.ak47.damage > w.m4a4.damage, 'AK-47 out-damages the M4A4');
  ok(w.ak47.recoil.pitch > w.m4a4.recoil.pitch * 1.8, `AK recoil (${w.ak47.recoil.pitch}) is much harsher than M4 (${w.m4a4.recoil.pitch})`);
  ok(w.ak47.spread.perShot > w.m4a4.spread.perShot, 'AK crosshair blooms faster than M4');
  ok(w.m4a4.fireInterval < w.ak47.fireInterval, 'M4A4 fires faster than the AK');
  ok(w.awp.fireInterval > 1.2 && !w.awp.auto, `AWP is a slow bolt action (${w.awp.fireInterval}s)`);
  ok(!!w.awp.scope && w.awp.scope.fovs.length >= 1 && w.awp.scope.fovs[0] < 60, 'AWP has a scope with a narrowed FOV');
  ok(w.knife.slot === 'melee' && !!w.knife.melee, 'knife is the melee slot');
  ok(w.ak47.slot === 'primary' && w.glock.slot === 'secondary', 'primary / secondary / melee slots defined');
  ok(!!w.ak47.model.parts.length && !!w.usp.model.parts.length && !!w.knife.model.parts.length, 'every weapon has a procedural model spec');

  for (const id of ['ak47', 'm4a4', 'awp', 'glock', 'usp', 'deagle']) {
    const d = w[id];
    const head = rawDamage(d, 'head', 0);
    const chest = rawDamage(d, 'chest', 0);
    ok(Math.abs(head - 2 * chest) < 1e-9, `${id}: headshot (${head}) = 2 x body (${chest})`);
  }
  ok(new Set(Object.values(HITBOX_MULT)).size === 5, 'five hit zones with five different multipliers');
  ok(HITBOX_MULT.head > HITBOX_MULT.stomach && HITBOX_MULT.stomach > HITBOX_MULT.chest - 1e-9 && HITBOX_MULT.leg < HITBOX_MULT.chest && HITBOX_MULT.arm < HITBOX_MULT.chest, 'zone ordering head > stomach >= chest > arm, leg');

  // armour
  const nk = computeDamage(w.ak47, 'chest', 0, 0, false);
  const ak = computeDamage(w.ak47, 'chest', 0, 100, false);
  ok(ak.health < nk.health && ak.armorLoss > 0, `armour reduces AK chest damage ${nk.health.toFixed(1)} -> ${ak.health.toFixed(1)} and is consumed (${ak.armorLoss.toFixed(1)})`);
  const legArm = computeDamage(w.ak47, 'leg', 0, 100, true);
  ok(legArm.armorLoss === 0, 'legs are not protected by armour');
  const headNoHelmet = computeDamage(w.ak47, 'head', 0, 100, false);
  const headHelmet = computeDamage(w.ak47, 'head', 0, 100, true);
  ok(headHelmet.health < headNoHelmet.health, 'helmet protects the head only if worn');
  for (const zone of ['head', 'chest', 'stomach', 'arm', 'leg'] as const) {
    ok(computeDamage(w.awp, zone, 0, 0, false).health >= 100, `AWP kills with a ${zone} hit (no armour)`);
    ok(computeDamage(w.awp, zone, 0, 100, true).health >= 100, `AWP kills with a ${zone} hit (armoured)`);
  }
  ok(computeDamage(w.ak47, 'chest', 0, 0, false).health * 3 >= 100 && computeDamage(w.glock, 'chest', 0, 0, false).health * 3 < 100, 'AK kills in 3 chest shots, Glock cannot');

  // hitbox raycasts (character standing at origin facing -Z, ray from the front)
  const P = { x: 0, y: 0, z: 0 };
  const shoot = (y: number, x = 0) => raycastCharacter(P, 0, 0, x, y, -10, 0, 0, 1, 20)?.hitbox ?? null;
  ok(shoot(1.65) === 'head', 'ray at y=1.65 hits the head');
  ok(shoot(1.3) === 'chest', 'ray at y=1.3 hits the chest');
  ok(shoot(1.0) === 'stomach', 'ray at y=1.0 hits the stomach');
  ok(shoot(0.4, 0.12) === 'leg', 'ray at y=0.4 hits a leg');
  ok(shoot(1.2, 0.35) === 'arm', 'ray at x=0.35 hits an arm');
  ok(shoot(2.2) === null, 'ray above the head misses');
  // rotation: character yawed 90 degrees, ray from +X side hits its chest
  const side = raycastCharacter(P, Math.PI / 2, 0, -10, 1.3, 0, 1, 0, 0, 20);
  ok(side?.hitbox === 'chest' || side?.hitbox === 'arm', 'hit zones rotate with the body yaw');
}

section('pistol round & loadouts');
{
  const g = new Game({ noHuman: true, seed: 3, mode: 'pistol' });
  ok(g.chars.length === 10 && g.aliveCount('CT') === 5 && g.aliveCount('T') === 5, 'ten players: 5 CT vs 5 T');
  ok(g.chars.every((c) => c.primary === null), 'pistol round: nobody has a primary weapon');
  ok(g.chars.filter((c) => c.team === 'T').every((c) => c.secondary.def.id === 'glock') && g.chars.filter((c) => c.team === 'CT').every((c) => c.secondary.def.id === 'usp'), 'T start with Glock, CT with USP');
  ok(g.chars.every((c) => c.armor === ROUND_PRESETS.pistol.armor && c.helmet === ROUND_PRESETS.pistol.helmet), `pistol round armour follows the preset (armor=${ROUND_PRESETS.pistol.armor}, helmet=${ROUND_PRESETS.pistol.helmet})`);
  ok(g.chars.every((c) => c.money === ROUND_PRESETS.pistol.startMoney), 'pistol round start money');
  ok(g.chars.every((c) => c.weapon.def.slot === 'secondary'), 'everybody holds the pistol');
  const f = new Game({ noHuman: true, seed: 3, mode: 'fullbuy' });
  ok(f.chars.every((c) => c.primary !== null && c.armor === 100 && c.helmet), 'full-buy preset: primary + kevlar + helmet');
  ok(f.chars.some((c) => c.primary?.def.id === 'awp'), 'full-buy preset hands out AWPs');
  const h = new Game({ seed: 3, mode: 'pistol', playerTeam: 'T' });
  ok(h.human?.team === 'T' && h.human.isHuman && h.chars.filter((c) => c.isHuman).length === 1, 'exactly one human, on the chosen team');
  ok(h.chars.filter((c) => c.hasBomb).length === 1 && h.chars.find((c) => c.hasBomb)?.team === 'T', 'exactly one T carries the C4');
}

// ================================================================== combat in the sim
section('firing: ammo, reload, recoil, spread');
function liveGame(seed = 5, mode: 'pistol' | 'fullbuy' = 'fullbuy', team: 'CT' | 'T' = 'T'): Game {
  const g = new Game({ seed, mode, playerTeam: team });
  while (g.phase === 'freeze') g.step(TICK_DT);
  return g;
}
{
  const g = liveGame(5, 'fullbuy', 'T');
  const me = g.human as NonNullable<typeof g.human>;
  for (const c of g.chars) if (c !== me) c.alive = false;
  g.bomb.state = 'dropped';
  const keepAlive = () => {
    // pretend a CT lives so the round never ends during the test
    if (g.phase !== 'live') g.phase = 'live';
  };
  me.pos.x = 60;
  me.pos.z = 110;
  me.pos.y = 0;
  me.yaw = 0;
  me.pitch = 0;
  me.primary = new WeaponInstance(WEAPONS.ak47);
  me.activeSlot = 'primary';
  me.primary.deployEnd = 0;
  const w = me.primary;
  ok(w.mag === 30, 'AK starts with 30 in the magazine');
  g.humanCmd.fire = true;
  let shots = 0;
  let pitchPeak = 0;
  for (let i = 0; i < 90; i++) {
    g.step(TICK_DT);
    keepAlive();
    for (const e of g.drainEvents()) if (e.type === 'shot') shots++;
    pitchPeak = Math.max(pitchPeak, me.punchPitch);
  }
  g.humanCmd.fire = false;
  ok(shots === 15 && w.mag === 15, `full auto at 600rpm: ${shots} shots in 1.5 s, ammo ${w.mag}/30 (counter decrements per shot)`);
  ok(pitchPeak > 4, `AK spray lifts the view ${pitchPeak.toFixed(1)} degrees`);
  ok(currentSpread(me, w) > WEAPONS.ak47.spread.stand + 0.5, `crosshair spread bloomed (${currentSpread(me, w).toFixed(2)} deg)`);
  for (let i = 0; i < 120; i++) {
    g.step(TICK_DT);
    keepAlive();
  }
  ok(me.punchPitch < 0.3, 'view punch recovers when not firing');
  // reload
  g.humanCmd.reload = true;
  g.step(TICK_DT);
  ok(me.reloading, 'R starts a reload');
  for (let i = 0; i < 60 * 3; i++) {
    g.step(TICK_DT);
    keepAlive();
  }
  ok(w.mag === 30 && w.reserve === 75, `reload refills the magazine from reserve (mag ${w.mag}, reserve ${w.reserve})`);
  // M4 vs AK view kick
  const kick = (id: string): number => {
    const gg = liveGame(9, 'fullbuy', 'T');
    const m = gg.human as NonNullable<typeof gg.human>;
    for (const c of gg.chars) if (c !== m) c.alive = false;
    gg.bomb.state = 'dropped';
    m.pos.x = 60;
    m.pos.z = 110;
    m.yaw = 0;
    m.primary = new WeaponInstance(WEAPONS[id]);
    m.activeSlot = 'primary';
    m.primary.deployEnd = 0;
    gg.humanCmd.fire = true;
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      gg.step(TICK_DT);
      gg.phase = 'live';
      gg.drainEvents();
      peak = Math.max(peak, m.punchPitch);
    }
    return peak;
  };
  const kAk = kick('ak47');
  const kM4 = kick('m4a4');
  ok(kAk > kM4 * 1.5, `AK view kick ${kAk.toFixed(1)} deg vs M4 ${kM4.toFixed(1)} deg`);
}

section('hitscan against characters & walls');
{
  const g = liveGame(6, 'fullbuy', 'T');
  const me = g.human as NonNullable<typeof g.human>;
  const victim = g.chars.find((c) => c.team === 'CT') as NonNullable<typeof me>;
  for (const c of g.chars) if (c !== me && c !== victim) c.alive = false;
  g.bomb.state = 'dropped';
  // open ground in mid: shooter at z=90, victim at z=80 facing the shooter (no crates on x=54)
  me.pos.x = 54;
  me.pos.z = 90;
  me.pos.y = 0;
  me.yaw = 0;
  me.pitch = 0;
  victim.pos.x = 54;
  victim.pos.z = 80;
  victim.pos.y = 0;
  victim.yaw = Math.PI;
  victim.brain = null;
  victim.armor = 0;
  victim.helmet = false;
  me.primary = new WeaponInstance(WEAPONS.awp);
  me.activeSlot = 'primary';
  me.primary.deployEnd = 0;
  me.pitch = Math.atan2(1.62 - 1.6 + 0.02, 10);
  me.scope = 1;
  g.humanCmd.fire = true;
  const events: string[] = [];
  g.step(TICK_DT);
  for (const e of g.drainEvents()) if (e.type === 'hit') events.push(`${e.hitbox}:${e.damage}${e.killed ? ':killed' : ''}`);
  g.humanCmd.fire = false;
  ok(events.length === 1 && events[0].endsWith(':killed'), `AWP one-shot kill (${events.join(',')}) and victim is dead: ${!victim.alive}`);
  ok(g.killfeed.length >= 1 && g.killfeed[g.killfeed.length - 1].weapon === 'awp', 'killfeed entry produced');
  // world occlusion: a shot at the door behind walls does not reach an enemy
  const hitInfo = hitscan(g, me, 54, 1.6, 90, 0, 0, 1, 100);
  ok(hitInfo.world && hitInfo.t < 40, 'bullets stop at walls');
}

// ================================================================== bomb & rounds
section('C4: carry, drop, pickup, plant, defuse, explode');
function isolate(g: Game, keep: number[]): void {
  for (const c of g.chars) if (!keep.includes(c.id)) c.alive = false;
}
{
  // --- drop on death + pickup by teammate
  const g = liveGame(11, 'fullbuy', 'CT');
  const carrier = g.chars.find((c) => c.hasBomb) as NonNullable<typeof g.human>;
  const mate = g.chars.find((c) => c.team === 'T' && c !== carrier) as NonNullable<typeof carrier>;
  ok(g.bomb.state === 'carried' && g.bomb.carrier === carrier.id, 'round starts with a T carrying the bomb');
  carrier.pos.x = 60;
  carrier.pos.z = 116;
  g.applyDamageRaw(mate, carrier, 'ak47', 'chest', 500, 0, 0, 0, 0); // teammate kill is fine for the test
  ok(!carrier.alive && g.bomb.state === 'dropped' && !carrier.hasBomb, 'C4 drops when the carrier dies');
  const dropPos = { ...g.bomb.pos };
  mate.pos.x = dropPos.x + 0.5;
  mate.pos.z = dropPos.z;
  mate.pos.y = dropPos.y;
  g.step(TICK_DT);
  ok(g.bomb.state === 'carried' && g.bomb.carrier === mate.id && mate.hasBomb, 'another T picks the bomb up');
}
{
  // --- plant by holding use inside a site, then defuse
  const g = liveGame(12, 'fullbuy', 'T');
  const me = g.human as NonNullable<typeof g.human>;
  const ct = g.chars.find((c) => c.team === 'CT') as NonNullable<typeof me>;
  const tOther = g.chars.find((c) => c.team === 'T' && c !== me) as NonNullable<typeof me>;
  // make the human the carrier
  for (const c of g.chars) c.hasBomb = false;
  me.hasBomb = true;
  g.bomb.carrier = me.id;
  g.bomb.state = 'carried';
  isolate(g, [me.id, ct.id, tOther.id]);
  // park the others far away so nothing interferes
  ct.pos.x = 54;
  ct.pos.z = 16;
  ct.brain = null;
  tOther.pos.x = 60;
  tOther.pos.z = 116;
  tOther.brain = null;
  me.pos.x = 102;
  me.pos.z = 27;
  me.pos.y = 2.4;
  me.vel.x = me.vel.z = 0;
  g.humanCmd.use = true;
  let plantedSite = '';
  let started = false;
  for (let i = 0; i < 60 * 4; i++) {
    g.step(TICK_DT);
    for (const e of g.drainEvents()) {
      if (e.type === 'plantStart') started = true;
      if (e.type === 'planted') plantedSite = e.site;
    }
  }
  g.humanCmd.use = false;
  ok(started && plantedSite === 'A' && g.bomb.state === 'planted' && g.phase === 'planted', `holding E in the A site plants the C4 (site ${plantedSite})`);
  ok(Math.abs(g.bomb.timeLeft - (40 - (4 - 3.2))) < 1.2, `fuse is counting down (${g.bomb.timeLeft.toFixed(1)} s left)`);
  // planting outside a site must fail
  const g2 = liveGame(12, 'fullbuy', 'T');
  const me2 = g2.human as NonNullable<typeof g2.human>;
  for (const c of g2.chars) c.hasBomb = false;
  me2.hasBomb = true;
  g2.bomb.carrier = me2.id;
  me2.pos.x = 60;
  me2.pos.z = 116;
  me2.vel.x = me2.vel.z = 0;
  g2.humanCmd.use = true;
  for (let i = 0; i < 60 * 5; i++) {
    g2.step(TICK_DT);
    g2.drainEvents();
  }
  ok(g2.bomb.state === 'carried', 'cannot plant outside A/B');
  // --- defuse: CT stands at the bomb holding use
  ct.pos.x = g.bomb.pos.x + 1;
  ct.pos.z = g.bomb.pos.z;
  ct.pos.y = g.bomb.pos.y;
  ct.vel.x = ct.vel.z = 0;
  ct.alive = true;
  tOther.alive = false;
  me.alive = false;
  ct.cmd.use = true;
  // the CT is not human and has no brain -> drive its cmd directly by making it human? use humanCmd
  ct.isHuman = true;
  me.isHuman = false;
  g.playerId = ct.id;
  g.humanCmd.use = true;
  let defused = false;
  let winner = '';
  for (let i = 0; i < 60 * 11 && !defused; i++) {
    g.step(TICK_DT);
    for (const e of g.drainEvents()) {
      if (e.type === 'defused') defused = true;
      if (e.type === 'roundEnd') winner = e.winner + ':' + e.reason;
    }
  }
  ok(defused && winner === 'CT:bomb_defused', `CT holding E for 10 s defuses the bomb -> round result ${winner}`);
}
{
  // --- defuse interrupted (release use) resets progress
  const g = liveGame(13, 'fullbuy', 'CT');
  const me = g.human as NonNullable<typeof g.human>;
  const t = g.chars.find((c) => c.team === 'T') as NonNullable<typeof me>;
  isolate(g, [me.id, t.id]);
  t.brain = null;
  t.pos.x = 60;
  t.pos.z = 116;
  g.bomb.state = 'planted';
  g.bomb.site = 'A';
  g.bomb.timeLeft = 30;
  g.bomb.pos = { x: 100, y: 2.4, z: 26 };
  g.phase = 'planted';
  me.pos.x = 101;
  me.pos.z = 26;
  me.pos.y = 2.4;
  me.vel.x = me.vel.z = 0;
  g.humanCmd.use = true;
  for (let i = 0; i < 60 * 4; i++) g.step(TICK_DT);
  const before = me.defuseProgress;
  g.humanCmd.use = false;
  g.step(TICK_DT);
  ok(before > 3 && me.defuseProgress === 0, `releasing E cancels the defuse (progress ${before.toFixed(1)} -> ${me.defuseProgress})`);
  // explosion when the fuse runs out
  g.bomb.timeLeft = 0.05;
  let exploded = false;
  let res = '';
  for (let i = 0; i < 20; i++) {
    g.step(TICK_DT);
    for (const e of g.drainEvents()) {
      if (e.type === 'exploded') exploded = true;
      if (e.type === 'roundEnd') res = e.winner + ':' + e.reason;
    }
  }
  ok(exploded && res === 'T:bomb_exploded', `C4 explosion gives the round to the Ts (${res})`);
  ok(!me.alive, 'the CT next to the bomb died in the blast');
}
section('round outcomes');
{
  // T wipes CT
  const g = liveGame(20, 'fullbuy', 'CT');
  for (const c of g.chars) if (c.team === 'CT') g.applyDamageRaw(null, c, 'ak47', 'chest', 999, 0, 0, 0, 0);
  g.step(TICK_DT);
  ok(g.phase === 'roundEnd' && g.winner === 'T' && g.endReason === 'elimination', 'all CT dead -> T win');
  // CT wipes T, no plant
  const g2 = liveGame(21, 'fullbuy', 'CT');
  for (const c of g2.chars) if (c.team === 'T') g2.applyDamageRaw(null, c, 'ak47', 'chest', 999, 0, 0, 0, 0);
  g2.step(TICK_DT);
  ok(g2.phase === 'roundEnd' && g2.winner === 'CT' && g2.endReason === 'elimination', 'all T dead (no plant) -> CT win');
  // T dead but bomb planted: round continues
  const g3 = liveGame(22, 'fullbuy', 'CT');
  g3.bomb.state = 'planted';
  g3.bomb.site = 'A';
  g3.bomb.timeLeft = 30;
  g3.bomb.pos = { x: 100, y: 2.4, z: 26 };
  g3.phase = 'planted';
  for (const c of g3.chars) if (c.team === 'T') g3.applyDamageRaw(null, c, 'ak47', 'chest', 999, 0, 0, 0, 0);
  g3.step(TICK_DT);
  ok(g3.phase === 'planted', 'all T dead after the plant: round continues (CT must defuse)');
  // time out
  const g4 = liveGame(23, 'fullbuy', 'CT');
  g4.roundTimeLeft = 0.01;
  g4.step(TICK_DT);
  g4.step(TICK_DT);
  ok(g4.phase === 'roundEnd' && g4.winner === 'CT' && g4.endReason === 'time', 'time runs out without a plant -> CT win');
  // next round starts, scores and economy update
  for (let i = 0; i < 60 * 6; i++) g4.step(TICK_DT);
  ok(g4.roundNumber === 2 && g4.phase === 'freeze' && g4.score.CT === 1, 'next round begins after the end-of-round pause; scoreboard updated');
  ok(g4.chars.every((c) => c.alive), 'everyone respawns');
}
section('spectate & takeover');
{
  const g = liveGame(30, 'fullbuy', 'CT');
  const me = g.human as NonNullable<typeof g.human>;
  const t = g.chars.find((c) => c.team === 'T') as NonNullable<typeof me>;
  g.applyDamageRaw(t, me, 'ak47', 'head', 999, 0, 0, 0, 0);
  ok(!me.alive && g.spectateId >= 0 && g.chars[g.spectateId].team === 'CT' && g.chars[g.spectateId].alive, 'dead player spectates a living teammate');
  const first = g.spectateId;
  g.cycleSpectate(1);
  ok(g.spectateId !== first, 'spectate target can be cycled');
  const target = g.spectateId;
  ok(g.takeover(target) && g.human?.id === target && g.chars[target].isHuman && !me.isHuman, 'player takes over a living bot teammate');
  ok(g.viewChar?.id === target, 'camera follows the new body');
}

// ================================================================== whole matches
section('bot matches (headless, 10 bots)');
{
  let nan = 0;
  let inWall = 0;
  let planted = 0;
  let defused = 0;
  let exploded = 0;
  let kills = 0;
  let roundsDone = 0;
  const reasons = new Set<string>();
  for (let seed = 1; seed <= 6; seed++) {
    const g = new Game({ noHuman: true, seed: seed * 101, mode: seed % 2 ? 'pistol' : 'fullbuy', maxRounds: 30 });
    let guard = 0;
    while (g.roundNumber <= 5 && guard++ < 60 * 60 * 30) {
      g.step(TICK_DT);
      for (const e of g.drainEvents()) {
        if (e.type === 'planted') planted++;
        else if (e.type === 'defused') defused++;
        else if (e.type === 'exploded') exploded++;
        else if (e.type === 'kill') kills++;
        else if (e.type === 'roundEnd') {
          roundsDone++;
          reasons.add(e.reason);
        }
      }
      for (const c of g.chars) {
        if (!c.alive) continue;
        if (!Number.isFinite(c.pos.x + c.pos.y + c.pos.z + c.yaw + c.pitch + c.health)) nan++;
        for (const bx of g.world.boxesNear(c.pos.x, c.pos.z, 1, [])) {
          if (bx.kind !== 'wall') continue;
          if (c.pos.x > bx.minX + 0.05 && c.pos.x < bx.maxX - 0.05 && c.pos.z > bx.minZ + 0.05 && c.pos.z < bx.maxZ - 0.05 && c.pos.y < bx.maxY - 0.1) inWall++;
        }
      }
    }
  }
  ok(nan === 0, 'no NaN in any bot state');
  ok(inWall === 0, `no bot ever inside a wall (${inWall} violations)`);
  ok(roundsDone >= 25, `matches progress through rounds (${roundsDone} rounds finished)`);
  ok(kills > 50, `bots fight each other (${kills} kills)`);
  ok(planted > 3, `bots plant the C4 (${planted} plants)`);
  ok(defused + exploded > 1, `planted bombs get resolved: ${defused} defused, ${exploded} exploded`);
  ok(reasons.size >= 3, `varied round endings: ${[...reasons].join(', ')}`);
}
{
  // bots must not stand still forever: sample movement during the walk phase
  const g = new Game({ noHuman: true, seed: 77, mode: 'fullbuy' });
  while (g.phase === 'freeze') g.step(TICK_DT);
  const start = g.chars.map((c) => ({ x: c.pos.x, z: c.pos.z }));
  for (let i = 0; i < 60 * 12; i++) g.step(TICK_DT);
  const moved = g.chars.filter((c, i) => Math.hypot(c.pos.x - start[i].x, c.pos.z - start[i].z) > 8).length;
  ok(moved >= 8, `bots patrol / advance on their own (${moved}/10 moved > 8 m in 12 s)`);
}
{
  // vision is blocked by walls: two bots on opposite sides of the mid door / wall cannot see each other
  const g = new Game({ noHuman: true, seed: 5 });
  while (g.phase === 'freeze') g.step(TICK_DT);
  const a = g.chars.find((c) => c.team === 'CT') as NonNullable<typeof g.human>;
  const b = g.chars.find((c) => c.team === 'T') as NonNullable<typeof a>;
  ok(!g.world.lineClear(a.pos.x, a.eyeY, a.pos.z, b.pos.x, b.eyeY, b.pos.z), 'line of sight between the two spawns is blocked by geometry');
  ok(g.world.lineClear(60, 1.6, 90, 60, 1.6, 84), 'open ground is visible');
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
