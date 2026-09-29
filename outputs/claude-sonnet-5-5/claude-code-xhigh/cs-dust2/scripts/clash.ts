// Dev tool: 5v5 open clash in mid, both teams standing their ground (isolates raw fight fairness).
//   node --experimental-strip-types scripts/clash.ts [trials] [distance]
import { Game } from '../src/core/game/game.ts';
import { TICK_DT } from '../src/core/config.ts';
import { giveWeapon } from '../src/core/game/economy.ts';

const trials = Number(process.argv[2] ?? 60);
const dist = Number(process.argv[3] ?? 34);
let ct = 0;
let t = 0;
let draw = 0;
for (let n = 0; n < trials; n++) {
  const g = new Game({ noHuman: true, seed: 500 + n, mode: 'fullbuy' });
  while (g.phase === 'freeze') g.step(TICK_DT);
  const tsC = g.chars.filter((c) => c.team === 'T');
  const ctC = g.chars.filter((c) => c.team === 'CT');
  const place = (arr: typeof tsC, z: number, yaw: number) =>
    arr.forEach((c, i) => {
      c.pos.x = 54 + i * 2.2;
      c.pos.z = z;
      c.pos.y = 0;
      c.yaw = yaw;
      c.brain?.setPlan([], []);
      c.hasBomb = false;
    });
  const forced = process.argv[5];
  if (forced === 'pistol') {
    for (const c of g.chars) {
      c.primary = null;
      giveWeapon(c, c.team === 'T' ? 'glock' : 'usp', g.time);
      c.armor = 0;
      c.helmet = false;
    }
  } else if (forced) {
    for (const c of g.chars) {
      giveWeapon(c, forced, g.time);
      c.armor = 100;
      c.helmet = true;
    }
  }
  if (process.argv[4] === 'swap') {
    place(ctC, 90, 0);
    place(tsC, 90 - dist, Math.PI);
  } else {
    place(tsC, 90, 0);
    place(ctC, 90 - dist, Math.PI);
  }
  g.bomb.state = 'dropped';
  g.bomb.carrier = -1;
  g.roundTimeLeft = 1e9;
  let guard = 0;
  while (g.aliveCount('CT') > 0 && g.aliveCount('T') > 0 && guard++ < 60 * 40) {
    g.step(TICK_DT);
    if (g.phase !== 'live') g.phase = 'live';
    g.drainEvents();
  }
  const a = g.aliveCount('CT');
  const b = g.aliveCount('T');
  if (a > 0 && b === 0) ct++;
  else if (b > 0 && a === 0) t++;
  else draw++;
}
console.log(`5v5 clash at ${dist} m: CT ${ct}  T ${t}  draws ${draw}`);
