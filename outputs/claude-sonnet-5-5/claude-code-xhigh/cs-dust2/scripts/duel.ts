// Dev tool: 1v1 duels between two bots in the open (isolates weapon / AI fairness).
//   node --experimental-strip-types scripts/duel.ts [trials] [weaponA] [weaponB] [distance]
import { Game } from '../src/core/game/game.ts';
import { TICK_DT } from '../src/core/config.ts';
import { giveWeapon } from '../src/core/game/economy.ts';

const trials = Number(process.argv[2] ?? 100);
const wa = process.argv[3] ?? 'ak47';
const wb = process.argv[4] ?? 'm4a4';
const dist = Number(process.argv[5] ?? 20);

let aWins = 0;
let bWins = 0;
let draws = 0;
let ttk = 0;
for (let n = 0; n < trials; n++) {
  const g = new Game({ noHuman: true, seed: 1000 + n, mode: 'fullbuy' });
  while (g.phase === 'freeze') g.step(TICK_DT);
  g.phase = 'live';
  const a = g.chars.find((c) => c.team === 'T') as (typeof g.chars)[number];
  const b = g.chars.find((c) => c.team === 'CT') as (typeof g.chars)[number];
  for (const c of g.chars) if (c !== a && c !== b) c.alive = false;
  giveWeapon(a, wa, g.time);
  giveWeapon(b, wb, g.time);
  for (const c of [a, b]) {
    c.armor = 100;
    c.helmet = true;
    c.weapon.deployEnd = g.time;
    c.brain?.setPlan([], []);
  }
  a.pos.x = 55;
  a.pos.z = 92;
  b.pos.x = 55;
  b.pos.z = 92 - dist;
  a.pos.y = b.pos.y = 0;
  a.yaw = 0;
  b.yaw = Math.PI;
  g.bomb.state = 'dropped';
  // keep the round from ending when one side is "eliminated"
  g.roundTimeLeft = 1e9;
  const start = g.time;
  let guard = 0;
  while (a.alive && b.alive && guard++ < 60 * 20) {
    g.step(TICK_DT);
    // prevent round-end logic from freezing the duel
    if (g.phase !== 'live') g.phase = 'live';
    g.drainEvents();
  }
  if (a.alive && !b.alive) {
    aWins++;
    ttk += g.time - start;
  } else if (b.alive && !a.alive) {
    bWins++;
    ttk += g.time - start;
  } else draws++;
}
console.log(`${wa} (T) vs ${wb} (CT) at ${dist} m, ${trials} duels: ${wa} ${aWins}  ${wb} ${bWins}  draws ${draws}  avg TTK ${(ttk / Math.max(1, aWins + bWins)).toFixed(2)} s`);
