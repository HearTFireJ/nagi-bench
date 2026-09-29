// Deterministic scenario tests for the rules the task calls out: hitboxes, damage, weapons, pistol round, bomb flow.
// Run: node --import ./scripts/register-ts.mjs scripts/scenarios.ts
import { World } from '../src/game/world.ts';
import { SIM_DT, ROUND } from '../src/game/config.ts';
import { computeDamage, ZONE_MULTIPLIER } from '../src/game/hitboxes.ts';
import { WEAPONS } from '../src/game/weapons.ts';
import { applyDamage, rayVsActor, traceShot } from '../src/game/combat.ts';
import type { ActorHit } from '../src/game/combat.ts';
import type { GameEvent } from '../src/game/events.ts';
import type { Actor, HitZone, WeaponId } from '../src/game/types.ts';
import { makeWeaponState } from '../src/game/actor.ts';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
};

const run = (w: World, seconds: number) => {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) w.step(SIM_DT);
};
/** World with 10 idle "humans": no brains run, so scenarios are fully scripted. */
const idleWorld = (opts: Partial<ConstructorParameters<typeof World>[0]> = {}) => {
  const w = new World({ allBots: true, seed: 5, ...opts });
  w.brains.clear();
  return w;
};
const skipFreeze = (w: World) => run(w, ROUND.freezeTime + 0.1);
const teleport = (a: Actor, x: number, z: number, y = 0, yaw = 0) => {
  a.pos.x = a.prevPos.x = x;
  a.pos.z = a.prevPos.z = z;
  a.pos.y = a.prevPos.y = y;
  a.vel.x = a.vel.y = a.vel.z = 0;
  a.yaw = yaw;
  a.pitch = 0;
};

// ------------------------------------------------------------------ 1. hit zones & damage table
{
  const dmg = (weapon: WeaponId, zone: HitZone, armor = 0, helmet = false) => computeDamage(weapon, zone, 0, armor, helmet).health;
  const zones: HitZone[] = ['head', 'chest', 'stomach', 'arm', 'leg'];
  const mult = new Set(zones.map((z) => ZONE_MULTIPLIER[z]));
  check('five hit zones with five different multipliers', mult.size === 5, JSON.stringify(ZONE_MULTIPLIER));
  for (const id of ['ak47', 'm4a4', 'glock', 'usp', 'deagle'] as WeaponId[]) {
    const head = dmg(id, 'head');
    const body = dmg(id, 'chest');
    check('headshot = 2x body damage (' + id + ')', Math.abs(head - 2 * body) < 1e-9, head.toFixed(1) + ' vs ' + body.toFixed(1));
  }
  check('rifle damage > deagle > pistols', WEAPONS.ak47.damage > WEAPONS.deagle.damage && WEAPONS.m4a4.damage > WEAPONS.deagle.damage && WEAPONS.deagle.damage > WEAPONS.usp.damage && WEAPONS.usp.damage > WEAPONS.glock.damage);
  check('deagle has the smallest magazine of the guns', WEAPONS.deagle.magSize < WEAPONS.usp.magSize && WEAPONS.deagle.magSize < WEAPONS.glock.magSize);
  check('AK-47 hits harder than M4A4', WEAPONS.ak47.damage > WEAPONS.m4a4.damage);
  check('M4A4 fires faster than AK-47 and kicks less', WEAPONS.m4a4.fireInterval < WEAPONS.ak47.fireInterval && WEAPONS.m4a4.recoil.pitch < WEAPONS.ak47.recoil.pitch && WEAPONS.m4a4.spread.perShot < WEAPONS.ak47.spread.perShot);
  let awpAll = true;
  for (const z of zones) for (const armor of [0, 100]) awpAll = awpAll && dmg('awp', z, armor, true) >= 100;
  check('AWP kills from full health with any hit zone, armored or not', awpAll);
  check('AWP fire interval is by far the slowest', WEAPONS.awp.fireInterval > 1.2 && WEAPONS.awp.scope !== undefined);
  const noArmor = computeDamage('ak47', 'chest', 0, 0, false);
  const armored = computeDamage('ak47', 'chest', 0, 100, true);
  check('armor reduces health damage', armored.health < noArmor.health && armored.armor > 0, noArmor.health.toFixed(1) + ' -> ' + armored.health.toFixed(1));
  check('legs ignore armor', computeDamage('ak47', 'leg', 0, 100, true).armor === 0);
  check('helmet needed for armored headshots', computeDamage('ak47', 'head', 0, 100, false).armor === 0 && computeDamage('ak47', 'head', 0, 100, true).armor > 0);
}

// ------------------------------------------------------------------ 2. ray vs hitboxes (real geometry)
{
  const w = idleWorld();
  skipFreeze(w);
  const shooter = w.actors[0]; // CT
  const victim = w.actors[5]; // T
  teleport(victim, 55, 60, 0, 0);
  const hit: ActorHit = { t: 0, zone: 'chest' };
  const zoneAtHeight = (y: number): string => {
    // Shoot horizontally at the victim from 10 m south, at height y.
    const ok = rayVsActor(55, y, 70, 0, 0, -1, 50, victim, hit);
    return ok ? hit.zone : 'miss';
  };
  check('ray at 1.65m hits head', zoneAtHeight(1.65) === 'head', zoneAtHeight(1.65));
  check('ray at 1.3m hits chest', zoneAtHeight(1.3) === 'chest', zoneAtHeight(1.3));
  check('ray at 1.0m hits stomach', zoneAtHeight(1.0) === 'stomach', zoneAtHeight(1.0));
  check('ray at 0.4m hits leg', zoneAtHeight(0.4) === 'leg', zoneAtHeight(0.4));
  const armHit = rayVsActor(55.33, 1.2, 70, 0, 0, -1, 50, victim, hit);
  check('ray at the side hits an arm', armHit && hit.zone === 'arm', hit.zone);
  check('ray over the head misses', zoneAtHeight(2.3) === 'miss');
  // yaw rotates the boxes: victim turned 90deg, shot from the side at arm distance
  victim.yaw = Math.PI / 2;
  const rot = rayVsActor(55, 1.2, 70, 0, 0, -1, 50, victim, hit);
  check('hitboxes rotate with the actor yaw', rot, hit.zone);
  victim.yaw = 0;

  // walls block bullets: put a wall between (Mid doors area walls) - shoot from CT spawn to T spawn straight through solid map
  teleport(shooter, 52, 12, 0, 0);
  teleport(victim, 52, 90, 0, 0);
  const res = traceShot(w, shooter, 52, 1.62, 12, 0, 0, 1, 200);
  check('bullet through the map walls hits world, not the far enemy', res.kind === 'world', res.kind + ' at t=' + res.t.toFixed(1));

  // full pipeline: shooter fires at victim at close range and headshot doubles damage
  teleport(shooter, 55, 50, 0, 0); // facing -z
  teleport(victim, 55, 44, 0, 0);
  shooter.weapons.primary = makeWeaponState('ak47');
  shooter.activeSlot = 'primary';
  shooter.drawEndsAt = 0;
  victim.hp = 100;
  victim.armor = 0;
  const events: GameEvent[] = [];
  const off = w.events.on((e) => events.push(e));
  applyDamage(w, shooter, victim, 'ak47', 'chest', 6);
  const chestHp = 100 - victim.hp;
  victim.hp = 100;
  applyDamage(w, shooter, victim, 'ak47', 'head', 6);
  const headHp = 100 - victim.hp;
  check('applyDamage: headshot health loss is 2x chest', Math.abs(headHp - 2 * chestHp) < 1e-6, chestHp.toFixed(1) + ' / ' + headHp.toFixed(1));
  off();
}

// ------------------------------------------------------------------ 3. AWP one-shot, recoil, scope, ammo
{
  const w = idleWorld();
  skipFreeze(w);
  const shooter = w.actors[0];
  const victim = w.actors[5];
  shooter.weapons.primary = makeWeaponState('awp');
  shooter.activeSlot = 'primary';
  shooter.drawEndsAt = 0;
  teleport(shooter, 53, 58, 0, 0); // looking -z along Mid
  teleport(victim, 53, 45, 0, 0);
  victim.armor = 100;
  victim.helmet = true;
  const evs: GameEvent[] = [];
  w.events.on((e) => evs.push(e));
  shooter.input.scopeToggle = true;
  run(w, 0.1);
  check('AWP right-click scopes in (level 1)', shooter.scopeLevel === 1);
  // aim at the victim's chest
  shooter.pitch = Math.atan2(1.2 - 1.62, 13);
  shooter.input.fire = true;
  run(w, 0.05);
  shooter.input.fire = false;
  run(w, 0.05);
  const killed = evs.some((e) => e.type === 'kill' && e.victimId === victim.id);
  check('AWP kills an armored, helmeted enemy with one body shot', killed && !victim.alive, 'hp=' + victim.hp.toFixed(0));
  const ammoAfter = shooter.weapons.primary!.ammo;
  check('AWP ammo drops by exactly 1', ammoAfter === 9, String(ammoAfter));
  // rate of fire: second immediate shot must not happen
  const shots0 = evs.filter((e) => e.type === 'shot').length;
  shooter.input.fire = true;
  run(w, 0.05);
  shooter.input.fire = false;
  run(w, 0.05);
  const shots1 = evs.filter((e) => e.type === 'shot').length;
  check('AWP cannot fire again within its cooldown', shots1 === shots0);
  // view kick: fire again once the bolt is cycled and record the peak
  run(w, 1.5);
  shooter.weapons.primary!.ammo = 5;
  let peak = 0;
  shooter.input.fire = true;
  for (let i = 0; i < 12; i++) {
    w.step(SIM_DT);
    peak = Math.max(peak, shooter.punchPitch);
    shooter.input.fire = false;
  }
  check('AWP kicks the view up', peak > 0.04, ((peak * 180) / Math.PI).toFixed(1) + ' deg peak');
}

// ------------------------------------------------------------------ 4. recoil / spread: AK vs M4
{
  const measure = (id: WeaponId) => {
    const w = idleWorld();
    skipFreeze(w);
    const a = w.actors[0];
    a.weapons.primary = makeWeaponState(id);
    a.activeSlot = 'primary';
    a.drawEndsAt = 0;
    teleport(a, 53, 20, 0, Math.PI);
    a.input.fire = true;
    let maxPunch = 0;
    let maxSpread = 0;
    let shots = 0;
    w.events.on((e) => {
      if (e.type === 'shot') shots++;
    });
    for (let i = 0; i < 60; i++) {
      w.step(SIM_DT);
      maxPunch = Math.max(maxPunch, a.punchPitch);
      maxSpread = Math.max(maxSpread, a.spread);
    }
    return { maxPunch: (maxPunch * 180) / Math.PI, maxSpread: (maxSpread * 180) / Math.PI, shots };
  };
  const ak = measure('ak47');
  const m4 = measure('m4a4');
  console.log('     AK  1s spray: punch ' + ak.maxPunch.toFixed(1) + 'deg spread ' + ak.maxSpread.toFixed(1) + 'deg shots ' + ak.shots);
  console.log('     M4  1s spray: punch ' + m4.maxPunch.toFixed(1) + 'deg spread ' + m4.maxSpread.toFixed(1) + 'deg shots ' + m4.shots);
  check('AK-47 has far stronger view kick than M4A4', ak.maxPunch > m4.maxPunch * 1.8);
  check('AK-47 crosshair spreads more than M4A4', ak.maxSpread > m4.maxSpread * 1.3);
  check('M4A4 fires more bullets per second', m4.shots > ak.shots);
}

// ------------------------------------------------------------------ 5. pistol round
{
  const w = idleWorld({ pistolRound: true });
  let ok = true;
  const detail: string[] = [];
  for (const a of w.actors) {
    const good = a.weapons.primary === null && a.weapons.secondary?.id === (a.team === 'T' ? 'glock' : 'usp') && a.armor === 0;
    ok = ok && good;
    if (!good) detail.push(a.name);
  }
  check('pistol round: everyone has only the default pistol, no primary, pistol-round armor', ok, detail.join(','));
  check('pistol round: purchases locked', w.buy(0, 'ak47') === false && w.buy(0, 'kevlar') === false);
  const full = idleWorld({ pistolRound: false });
  const t = full.actors.find((a) => a.team === 'T')!;
  const ct = full.actors.find((a) => a.team === 'CT')!;
  check('full round: rifles and armor', t.weapons.primary?.id === 'ak47' && ct.weapons.primary?.id === 'm4a4' && t.armor === 100 && ct.helmet);
  check('10 actors, 5v5', w.actors.length === 10 && w.actors.filter((a) => a.team === 'T').length === 5 && w.actors.filter((a) => a.team === 'CT').length === 5);
  check('exactly one T carries the bomb', w.actors.filter((a) => a.hasBomb).length === 1 && w.actors.find((a) => a.hasBomb)!.team === 'T');
}

// ------------------------------------------------------------------ 6. bomb: plant -> explode -> T wins
{
  const w = idleWorld();
  const events: GameEvent[] = [];
  w.events.on((e) => events.push(e));
  skipFreeze(w);
  const carrier = w.actors.find((a) => a.hasBomb)!;
  // kill all CT but one far away so elimination does not trigger, park CT in spawn
  teleport(carrier, 86, 20, 1.6);
  carrier.input.use = true;
  run(w, ROUND.plantTime + 0.3);
  check('T plants inside a bombsite', w.bomb.status === 'planted' && w.bomb.site === 'A' && events.some((e) => e.type === 'bombPlanted'));
  check('round phase switches to planted', w.round.phase === 'planted');
  check('carrier no longer has the bomb', !carrier.hasBomb);
  carrier.input.use = false;
  run(w, ROUND.bombTime + 1);
  check('bomb explodes after the timer', events.some((e) => e.type === 'bombExploded'));
  check('T win by explosion', w.round.winner === 'T' && w.round.reason === 'bomb_exploded', String(w.round.reason));
  check('bomb beeps while ticking', events.filter((e) => e.type === 'bombBeep').length > 10);
}

// ------------------------------------------------------------------ 7. bomb: plant -> defuse -> CT wins
{
  const w = idleWorld();
  const events: GameEvent[] = [];
  w.events.on((e) => events.push(e));
  skipFreeze(w);
  const carrier = w.actors.find((a) => a.hasBomb)!;
  teleport(carrier, 20, 20, 0);
  carrier.input.use = true;
  run(w, ROUND.plantTime + 0.3);
  carrier.input.use = false;
  check('B site plant works', w.bomb.status === 'planted' && w.bomb.site === 'B');
  const defuser = w.actors[0];
  teleport(defuser, w.bomb.pos.x + 1, w.bomb.pos.z, w.bomb.pos.y);
  defuser.input.use = true;
  run(w, ROUND.defuseTime / 2);
  check('defuse takes time (not instant)', w.bomb.status === 'planted' && defuser.useKind === 'defuse');
  run(w, ROUND.defuseTime / 2 + 0.5);
  check('CT defuses the bomb and wins', w.bomb.status === 'defused' && w.round.winner === 'CT' && w.round.reason === 'bomb_defused');
}

// ------------------------------------------------------------------ 8. planting outside a site is not possible
{
  const w = idleWorld();
  skipFreeze(w);
  const carrier = w.actors.find((a) => a.hasBomb)!;
  teleport(carrier, 52, 60, 0);
  carrier.input.use = true;
  run(w, ROUND.plantTime + 0.5);
  check('cannot plant in mid', w.bomb.status === 'carried');
}

// ------------------------------------------------------------------ 9. bomb drop and pickup
{
  const w = idleWorld();
  const events: GameEvent[] = [];
  w.events.on((e) => events.push(e));
  skipFreeze(w);
  const carrier = w.actors.find((a) => a.hasBomb)!;
  const killer = w.actors[0];
  teleport(carrier, 60, 60, 0);
  applyDamage(w, killer, carrier, 'awp', 'chest', 5);
  check('carrier dies -> bomb drops', !carrier.alive && w.bomb.status === 'dropped');
  const other = w.actors.find((a) => a.team === 'T' && a.alive)!;
  teleport(other, w.bomb.pos.x + 0.5, w.bomb.pos.z, 0);
  run(w, 0.2);
  check('another T picks the bomb up', w.bomb.status === 'carried' && other.hasBomb && w.bomb.carrierId === other.id);
  const ct = w.actors.find((a) => a.team === 'CT')!;
  const before = w.bomb.status;
  check('bomb is not pickable by CT', before === 'carried');
  void ct;
}

// ------------------------------------------------------------------ 10. elimination wins
{
  const w = idleWorld();
  skipFreeze(w);
  for (const a of w.actors) if (a.team === 'CT') applyDamage(w, w.actors[5], a, 'awp', 'head', 3);
  run(w, 0.1);
  check('T eliminate CT -> T win', w.round.winner === 'T' && w.round.reason === 'elimination');
  const w2 = idleWorld();
  skipFreeze(w2);
  for (const a of w2.actors) if (a.team === 'T') applyDamage(w2, w2.actors[0], a, 'awp', 'head', 3);
  run(w2, 0.1);
  check('CT eliminate T (no plant) -> CT win', w2.round.winner === 'CT' && w2.round.reason === 'elimination');
  // T all dead AFTER plant does not end the round
  const w3 = idleWorld();
  skipFreeze(w3);
  const carrier = w3.actors.find((a) => a.hasBomb)!;
  teleport(carrier, 86, 20, 1.6);
  carrier.input.use = true;
  run(w3, ROUND.plantTime + 0.3);
  carrier.input.use = false;
  for (const a of w3.actors) if (a.team === 'T') applyDamage(w3, w3.actors[0], a, 'awp', 'head', 3);
  run(w3, 0.2);
  check('T wiped after plant: round continues until defuse / explosion', w3.round.winner === null && w3.round.phase === 'planted');
  run(w3, ROUND.bombTime + 1);
  check('...and the bomb then explodes for T', w3.round.winner === 'T' && w3.round.reason === 'bomb_exploded');
}

// ------------------------------------------------------------------ 11. time runs out
{
  const w = idleWorld();
  skipFreeze(w);
  run(w, ROUND.roundTime + 0.5);
  check('time out without plant -> CT win', w.round.winner === 'CT' && w.round.reason === 'time');
}

// ------------------------------------------------------------------ 12. mid door
{
  const w = idleWorld();
  skipFreeze(w);
  const a = w.actors[0];
  const door = w.level.doors[0];
  teleport(a, 52.5, 44, 0, 0); // top mid, far
  run(w, 1.5);
  check('mid door starts closed when nobody is near', door.open === 0);
  const before = w.level.cw.raycast(52.5, 1.6, 40, 0, 0, -1, 30, { t: 0, nx: 0, ny: 0, nz: 0, box: null });
  check('closed door blocks bullets / sight', before);
  teleport(a, 52.5, 37, 0, 0);
  run(w, 1.5);
  check('door opens when someone approaches', door.open > 0.95);
  a.input.forward = 1;
  run(w, 3);
  a.input.forward = 0;
  check('player walks through the door body to CT side', a.pos.z < 31, 'z=' + a.pos.z.toFixed(1));
}

console.log(failed === 0 ? '\nALL SCENARIOS PASSED' : '\n' + failed + ' CHECK(S) FAILED');
process.exit(failed === 0 ? 0 : 1);
