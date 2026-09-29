// Deterministic rule tests for the simulation (no rendering).  npm run test:rules
import { applyDamage } from '../src/sim/combat.ts';
import { CFG, ROUND_MODES } from '../src/sim/config.ts';
import { GameSim } from '../src/sim/game.ts';
import { HIT_MULT, rayHitbox } from '../src/sim/hitbox.ts';
import { setSeed } from '../src/sim/math.ts';
import { SITES } from '../src/sim/map.ts';
import { WEAPONS } from '../src/sim/weapons.ts';
import type { WeaponId } from '../src/sim/weapons.ts';
import { emptyInput } from '../src/sim/actor.ts';

let failures = 0;
let passes = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) passes++;
  else {
    failures++;
    console.error('  FAIL:', msg);
  }
}
function section(name: string): void {
  console.log('• ' + name);
}
function fresh(mode: 'pistol' | 'full' = 'pistol', team: 'CT' | 'T' = 'CT'): GameSim {
  setSeed(99);
  const sim = new GameSim({ mode, playerTeam: team, winRounds: 8, withHuman: true });
  sim.startMatch();
  return sim;
}
function runUntilLive(sim: GameSim): void {
  while (sim.phase === 'freeze') sim.update(CFG.TICK);
}
function run(sim: GameSim, seconds: number): void {
  const n = Math.round(seconds / CFG.TICK);
  for (let i = 0; i < n; i++) sim.update(CFG.TICK);
}
/** Stops every bot from acting so scripted scenarios are not disturbed. */
function freezeBrains(sim: GameSim): void {
  for (const id of [...sim.brains.keys()]) sim.brains.delete(id);
  for (const a of sim.actors) a.input = emptyInput();
}

section('weapon data');
{
  const W = WEAPONS;
  ok(W.ak47.damage > W.m4a4.damage, 'AK damage > M4 damage');
  ok(W.ak47.recoil.pitch > 2 * W.m4a4.recoil.pitch - 0.2, 'AK view kick >> M4');
  ok(W.ak47.spread.perShot > W.m4a4.spread.perShot, 'AK spread growth > M4');
  ok(W.m4a4.fireInterval < W.ak47.fireInterval, 'M4 fires faster than AK');
  ok(W.awp.fireInterval > 1, 'AWP fires very slowly');
  ok(W.awp.damage >= 200 && !!W.awp.scope, 'AWP one-shot damage + scope');
  const pistols: WeaponId[] = ['glock', 'usp', 'deagle'];
  for (const p of pistols) ok(W[p].damage < W.m4a4.damage, p + ' damage < rifle');
  ok(W.deagle.damage > W.glock.damage && W.deagle.damage > W.usp.damage, 'deagle > glock/usp');
  ok(W.deagle.magSize < W.glock.magSize && W.deagle.magSize < W.usp.magSize, 'deagle magazine is the smallest');
  ok(W.knife.slot === 'melee' && W.ak47.slot === 'primary' && W.usp.slot === 'secondary', 'slots');
  ok(HIT_MULT.head === 2 * HIT_MULT.chest, 'headshot is exactly twice body damage');
  const mults = new Set(Object.values(HIT_MULT));
  ok(mults.size === 5, 'five different hit-zone multipliers');
}

section('hitbox zones');
{
  const shoot = (y: number, x = 0): string | null => rayHitbox(x, y, -5, 0, 0, 1, 20, 0, 0, 0, Math.PI)?.group ?? null;
  // actor at origin, yaw = PI faces +Z, shooter at z=-5 looking +Z hits its back; zones are symmetric
  ok(shoot(1.62) === 'head', 'head @1.62');
  ok(shoot(1.3) === 'chest', 'chest @1.3');
  ok(shoot(1.0) === 'stomach', 'stomach @1.0');
  ok(shoot(0.4) === 'leg' || shoot(0.4, 0.12) === 'leg', 'leg @0.4');
  ok(shoot(1.15, 0.36) === 'arm', 'arm @x=0.36');
  ok(shoot(1.3, 1.5) === null, 'miss wide');
}

section('damage, headshot ×2, armor');
{
  const sim = fresh('full', 'T');
  freezeBrains(sim);
  const t = sim.actors[5];
  const ct = sim.actors[0];
  const dmgTo = (group: 'head' | 'chest' | 'stomach' | 'arm' | 'leg', id: WeaponId, armor = 0, helmet = false): number => {
    ct.hp = 100;
    ct.armor = armor;
    ct.helmet = helmet;
    ct.alive = true;
    const def = WEAPONS[id];
    applyDamage(sim, t, ct, def.damage * HIT_MULT[group], group, def.armorPen, id, { x: 0, y: 0, z: 0 });
    return 100 - ct.hp;
  };
  const chest = dmgTo('chest', 'ak47');
  const head = dmgTo('head', 'ak47');
  ok(chest === 45, 'AK chest = 45, got ' + chest);
  ok(head === 2 * chest, 'AK head = 2x chest, got ' + head);
  ok(dmgTo('leg', 'ak47') < chest && dmgTo('arm', 'ak47') < chest, 'legs/arms weaker than chest');
  ok(dmgTo('stomach', 'ak47') > chest, 'stomach > chest');
  ct.hp = 100;
  const withArmor = dmgTo('chest', 'ak47', 100, false);
  ok(withArmor < chest, 'kevlar reduces chest damage: ' + withArmor);
  ok(ct.armor < 100, 'armor wears down: ' + ct.armor);
  ok(dmgTo('head', 'ak47', 100, false) === head, 'no helmet -> head unprotected');
  ok(dmgTo('head', 'ak47', 100, true) < head, 'helmet protects head');
  ok(dmgTo('leg', 'ak47', 100, true) === dmgTo('leg', 'ak47', 0, false), 'armor does not cover legs');
  for (const g of ['chest', 'stomach', 'arm', 'leg', 'head'] as const) {
    ok(dmgTo(g, 'awp', 100, true) >= 100, 'AWP one-shots (' + g + ') even with armor');
  }
  ok(dmgTo('chest', 'm4a4') < dmgTo('chest', 'ak47'), 'M4 < AK per bullet');
  ok(dmgTo('chest', 'deagle') > dmgTo('chest', 'glock'), 'deagle > glock');
}

section('pistol round');
{
  const sim = fresh('pistol', 'CT');
  const cfg = ROUND_MODES.pistol;
  ok(sim.phase === 'freeze' && sim.round === 1, 'match starts in freeze of round 1');
  ok(sim.actors.every((a) => a.weapons.primary === null), 'nobody has a primary weapon');
  ok(sim.actors.filter((a) => a.team === 'CT').every((a) => a.weapons.secondary?.def.id === 'usp'), 'CT default USP');
  ok(sim.actors.filter((a) => a.team === 'T').every((a) => a.weapons.secondary?.def.id === 'glock'), 'T default Glock');
  ok(sim.actors.every((a) => a.weapons.melee?.def.id === 'knife'), 'everyone has a knife');
  ok(sim.actors.every((a) => a.armor === cfg.armor && a.helmet === cfg.helmet && a.money === cfg.startMoney), 'pistol-round armor / money config');
  ok(sim.actors.filter((a) => a.hasBomb).length === 1 && sim.actors.find((a) => a.hasBomb)?.team === 'T', 'exactly one T carries C4');
  const me = sim.actors[0];
  ok(sim.buy(me, 'rifle') === '金钱不足', 'cannot afford a rifle in the pistol round');
  ok(sim.buy(me, 'kevlar') === null && me.armor === 100 && me.money === 150, 'can buy kevlar');
  ok(sim.buy(me, 'awp') !== null, 'AWP too expensive');
}

section('round flow + economy');
{
  const sim = fresh('pistol', 'CT');
  freezeBrains(sim);
  runUntilLive(sim);
  ok(sim.phase === 'live', 'goes live after freeze time');
  ok(sim.buy(sim.actors[0], 'kevlar') === '现在不是购买时间', 'no buying while live');
  for (const a of sim.actors.filter((x) => x.team === 'T')) sim.killActor(a, sim.actors[0], 'usp', false);
  run(sim, 0.1);
  ok(sim.phase === 'roundEnd' && sim.roundResult?.winner === 'CT' && sim.roundResult.reason === 't_eliminated', 'T wiped, no bomb planted -> CT wins');
  ok(sim.score.CT === 1, 'score updated');
  ok(sim.actors[0].money >= 800 + CFG.WIN_REWARD, 'winner paid');
  ok(sim.actors[5].money >= 800 + CFG.LOSS_BASE, 'loser gets loss bonus');
  run(sim, CFG.ROUND_END_TIME + 0.2);
  ok(sim.round === 2 && sim.phase === 'freeze', 'next round starts');
  ok(sim.actors.every((a) => a.alive && a.hp === 100), 'everyone respawned');
}

section('C4: carry, drop, pickup, plant, defuse, explode');
{
  const sim = fresh('pistol', 'CT');
  freezeBrains(sim);
  runUntilLive(sim);
  const ts = sim.actors.filter((a) => a.team === 'T');
  const carrier = ts.find((a) => a.hasBomb)!;
  const other = ts.find((a) => !a.hasBomb)!;
  // carrier dies -> dropped
  carrier.pos = { x: 50.5, y: 0, z: 80.5 };
  sim.killActor(carrier, sim.actors[0], 'usp', false);
  ok(sim.bomb.state === 'dropped' && !carrier.hasBomb, 'bomb drops when the carrier dies');
  // other T walks over it
  other.pos = { x: 50.5, y: 0, z: 80.2 };
  run(sim, 0.1);
  ok(sim.bomb.state === 'carried' && other.hasBomb, 'another T picks the bomb up');
  // CT can not pick it up
  // plant
  const site = SITES[0];
  other.pos = { x: site.plantSpots[0].x, y: 0, z: site.plantSpots[0].z };
  other.vel = { x: 0, y: 0, z: 0 };
  other.input.use = true;
  run(sim, 1);
  ok(sim.bomb.state === 'carried' && other.plantProgress > 0.5, 'planting takes time');
  run(sim, CFG.PLANT_TIME);
  ok(sim.bomb.state === 'planted' && sim.bomb.site === 'A', 'bomb planted at A');
  other.input.use = false;

  // planting outside a site is impossible
  const sim2 = fresh('pistol', 'CT');
  freezeBrains(sim2);
  runUntilLive(sim2);
  const c2 = sim2.actors.find((a) => a.hasBomb)!;
  c2.pos = { x: 51.5, y: 0, z: 60.5 };
  c2.input.use = true;
  run(sim2, 5);
  ok(sim2.bomb.state === 'carried', 'cannot plant in mid');

  // defuse with a CT next to the bomb
  const ct = sim.actors[1];
  ct.pos = { x: sim.bomb.pos.x + 1, y: 0, z: sim.bomb.pos.z };
  ct.vel = { x: 0, y: 0, z: 0 };
  ct.input.use = true;
  run(sim, CFG.DEFUSE_TIME - 1);
  ok(sim.bomb.state === 'planted' && ct.defuseProgress > 5, 'defusing takes ~10s');
  ct.input.use = false;
  run(sim, 0.05);
  ok(ct.defuseProgress === 0, 'defuse progress resets when released');
  ct.input.use = true;
  run(sim, CFG.DEFUSE_TIME + 0.2);
  ok(sim.bomb.state === 'defused' && sim.roundResult?.winner === 'CT' && sim.roundResult.reason === 'bomb_defused', 'CT wins by defusing');

  // kit halves the time + explosion path
  const sim3 = fresh('pistol', 'CT');
  freezeBrains(sim3);
  runUntilLive(sim3);
  const p3 = sim3.actors.find((a) => a.hasBomb)!;
  p3.pos = { x: SITES[1].plantSpots[0].x, y: 0, z: SITES[1].plantSpots[0].z };
  p3.input.use = true;
  run(sim3, CFG.PLANT_TIME + 0.3);
  ok(sim3.bomb.state === 'planted' && sim3.bomb.site === 'B', 'planted at B');
  p3.input.use = false;
  const kitCt = sim3.actors[2];
  kitCt.kit = true;
  kitCt.pos = { x: sim3.bomb.pos.x, y: 0, z: sim3.bomb.pos.z + 1 };
  kitCt.input.use = true;
  run(sim3, CFG.DEFUSE_KIT_TIME + 0.3);
  ok(sim3.bomb.state === 'defused', 'defuse kit -> 5s');

  const sim4 = fresh('pistol', 'CT');
  freezeBrains(sim4);
  runUntilLive(sim4);
  const p4 = sim4.actors.find((a) => a.hasBomb)!;
  p4.pos = { x: SITES[0].plantSpots[0].x, y: 0, z: SITES[0].plantSpots[0].z };
  p4.input.use = true;
  run(sim4, CFG.PLANT_TIME + 0.3);
  p4.input.use = false;
  const near = sim4.actors.find((a) => a.team === 'CT')!;
  near.pos = { x: sim4.bomb.pos.x + 3, y: 0, z: sim4.bomb.pos.z };
  const far = sim4.actors.filter((a) => a.team === 'CT')[1];
  far.pos = { x: 51.5, y: 0, z: 10 };
  run(sim4, CFG.BOMB_TIME + 1);
  ok(sim4.bomb.state === 'exploded' && sim4.roundResult?.winner === 'T' && sim4.roundResult.reason === 'bomb_exploded', 'T wins when C4 explodes');
  ok(!near.alive, 'blast kills a nearby CT');
  ok(far.alive, 'far CT survives the blast');

  // all T dead but bomb planted -> round continues
  const sim5 = fresh('pistol', 'CT');
  freezeBrains(sim5);
  runUntilLive(sim5);
  const p5 = sim5.actors.find((a) => a.hasBomb)!;
  p5.pos = { x: SITES[0].plantSpots[0].x, y: 0, z: SITES[0].plantSpots[0].z };
  p5.input.use = true;
  run(sim5, CFG.PLANT_TIME + 0.3);
  for (const a of sim5.actors.filter((x) => x.team === 'T')) sim5.killActor(a, sim5.actors[0], 'usp', false);
  run(sim5, 0.2);
  ok(sim5.phase === 'live', 'planted bomb: CT must still defuse after killing all T');
  // all CT dead -> T wins even with the bomb planted
  for (const a of sim5.actors.filter((x) => x.team === 'CT')) sim5.killActor(a, sim5.actors[5], 'glock', false);
  run(sim5, 0.2);
  ok(sim5.roundResult?.winner === 'T' && sim5.roundResult.reason === 'ct_eliminated', 'CT wiped -> T wins');

  // time out with no plant -> CT
  const sim6 = fresh('pistol', 'CT');
  freezeBrains(sim6);
  runUntilLive(sim6);
  run(sim6, CFG.ROUND_TIME + 1);
  ok(sim6.roundResult?.winner === 'CT' && sim6.roundResult.reason === 'time', 'timer expires without plant -> CT wins');
}

section('spectate + takeover');
{
  const sim = fresh('pistol', 'CT');
  runUntilLive(sim);
  const me = sim.human!;
  sim.killActor(me, sim.actors[5], 'glock', true);
  run(sim, 0.1);
  ok(sim.spectateId >= 0 && sim.actors[sim.spectateId].team === 'CT' && sim.actors[sim.spectateId].alive, 'spectating a living teammate');
  const mate = sim.actors[sim.spectateId];
  ok(sim.viewActor === mate, 'camera follows the teammate');
  ok(sim.takeover() && sim.humanId === mate.id && mate.human, 'takeover hands control to the bot');
  ok(!sim.brains.get(mate.id) || mate.human, 'bot brain no longer drives the controlled actor');
}

section('walls / physics');
{
  const sim = fresh('pistol', 'CT');
  freezeBrains(sim);
  runUntilLive(sim);
  const a = sim.actors[0];
  a.pos = { x: 51.5, y: 0, z: 60.5 };
  a.vel = { x: 0, y: 0, z: 0 };
  a.input.wishX = -1; // walk west into the mid corridor wall (x=47)
  a.input.wishZ = 0;
  run(sim, 4);
  ok(a.pos.x >= 47 + CFG.RADIUS - 0.01, 'cannot walk through walls, x=' + a.pos.x.toFixed(2));
  // jump on the xbox crate (1.3m)
  a.pos = { x: 52.9, y: 0, z: 71.0 };
  a.vel = { x: 0, y: 0, z: 0 };
  a.input.wishX = -1;
  a.input.jump = true;
  let maxY = 0;
  for (let i = 0; i < 90; i++) {
    sim.update(CFG.TICK);
    maxY = Math.max(maxY, a.pos.y);
  }
  ok(maxY > 0.9, 'jump apex ~1m, got ' + maxY.toFixed(2));
  ok(a.pos.y > 1.2 || a.pos.x < 50, 'can stand on a crate (y=' + a.pos.y.toFixed(2) + ')');
}

console.log(failures === 0 ? `\nALL RULE TESTS PASSED (${passes} checks)` : `\n${failures} FAILED, ${passes} passed`);
process.exit(failures === 0 ? 0 : 1);
