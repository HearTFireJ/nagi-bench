// Headless bot-vs-bot simulation: plays whole rounds with all 10 actors as bots and reports what happened.
// Run: npm run sim [-- rounds seed pistol(0|1)]
import { World } from '../src/game/world.ts';
import { createLevel } from '../src/game/level.ts';
import { SIM_DT } from '../src/game/config.ts';
import type { GameEvent } from '../src/game/events.ts';
import { zoneAt } from '../src/game/map/build.ts';

const rounds = Number(process.argv[2] ?? 8);
const seed = Number(process.argv[3] ?? 1337);
const pistol = (process.argv[4] ?? '1') !== '0';

const level = createLevel();
const world = new World({ allBots: true, seed, pistolRound: pistol, difficulty: 0.6 }, level);

const counts: Record<string, number> = {};
const bump = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);
const zones: Record<string, number> = {};
const results: string[] = [];
let roundStart = 0;
let firstKillAt = -1;

world.events.on((e: GameEvent) => {
  bump(e.type);
  if (e.type === 'hit') {
    bump('zone:' + e.zone);
    if (e.killed) bump('killByZone:' + e.zone);
  }
  if (e.type === 'kill') {
    if (firstKillAt < 0) firstKillAt = world.time - roundStart;
    bump('weapon:' + e.weapon);
    if (e.headshot) bump('headshotKills');
  }
  if (e.type === 'roundStart') {
    roundStart = world.time;
    firstKillAt = -1;
    const p = pistol && world.round.number === 1;
    if (p) {
      for (const a of world.actors) {
        if (a.weapons.primary || a.armor !== 0) console.log('!! pistol round violation', a.name, a.weapons.primary?.id, a.armor);
      }
    }
  }
  if (e.type === 'roundEnd') {
    const alive = { T: world.aliveCount('T'), CT: world.aliveCount('CT') };
    results.push(
      'R' + world.round.number + ' ' + e.winner + ' by ' + e.reason + ' after ' + (world.time - roundStart).toFixed(0) + 's (alive T' + alive.T + ' CT' + alive.CT + ', bomb ' + world.bomb.status + (world.bomb.site ? '@' + world.bomb.site : '') + ', tactic T:' + world.tacticNames.T + ')',
    );
  }
});

// Invariant checks: nobody may ever be inside a solid box or outside the level.
let embedded = 0;
let outside = 0;
let maxSpeedSeen = 0;
const cw = level.cw;
const t0 = performance.now();
let ticks = 0;
const maxTime = rounds * 200;
while (world.round.number <= rounds && world.round.phase !== 'matchEnd' && world.time < maxTime) {
  world.step(SIM_DT);
  ticks++;
  if (ticks % 30 === 0) {
    for (const a of world.actors) {
      if (!a.alive) continue;
      const boxes = cw.overlapping(a.pos.x - 0.28, a.pos.y + 0.05, a.pos.z - 0.28, a.pos.x + 0.28, a.pos.y + 1.75, a.pos.z + 0.28);
      if (boxes.length > 0) embedded++;
      const z = zoneAt(level.map, a.pos.x, a.pos.z);
      if (!z) outside++;
      else zones[z.id] = (zones[z.id] ?? 0) + 1;
      maxSpeedSeen = Math.max(maxSpeedSeen, Math.hypot(a.vel.x, a.vel.z));
    }
  }
}
const wall = performance.now() - t0;

let jumps = 0;
let repaths = 0;
let teleports = 0;
for (const b of world.brains.values()) {
  jumps += b.follower.jumps;
  repaths += b.follower.repaths;
  teleports += b.follower.teleports;
}

console.log('--- results');
results.forEach((r) => console.log(r));
console.log('score T', world.round.score.T, 'CT', world.round.score.CT, 'phase', world.round.phase);
console.log('sim time', world.time.toFixed(0) + 's in', wall.toFixed(0) + 'ms (' + ((world.time * 1000) / wall).toFixed(0) + 'x realtime, ' + (wall / ticks).toFixed(3) + ' ms/tick)');
console.log('events', JSON.stringify(counts));
console.log('embedded-in-wall samples:', embedded, ' outside-level samples:', outside, ' max speed', maxSpeedSeen.toFixed(2));
console.log('stuck rescues: jumps', jumps, 'repaths', repaths, 'teleports', teleports);
console.log('time spent per zone (samples):', JSON.stringify(zones));
process.exit(embedded === 0 && outside === 0 ? 0 : 1);
