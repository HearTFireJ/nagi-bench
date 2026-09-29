// Monte-Carlo balance check: plays N single rounds (fresh match each time) and reports win rates.
//   node scripts/balance.ts [rounds=30] [mode=pistol]
import { CFG } from '../src/sim/config.ts';
import type { RoundMode } from '../src/sim/config.ts';
import { GameSim } from '../src/sim/game.ts';
import { setSeed } from '../src/sim/math.ts';

const n = Number(process.argv[2] ?? 30);
const mode = (process.argv[3] ?? 'pistol') as RoundMode;
let ctWins = 0;
let tWins = 0;
let ctKills = 0;
let tKills = 0;
const reasons: Record<string, number> = {};
let planted = 0;
let totalTime = 0;
for (let seed = 1; seed <= n; seed++) {
  setSeed(seed * 7919);
  const sim = new GameSim({ mode, playerTeam: 'CT', winRounds: 8, withHuman: false });
  sim.startMatch();
  if (process.argv[4] === 'mirror') for (const a of sim.actors) a.giveWeapon('glock');
  let steps = 0;
  let done = false;
  while (!done && steps < 60 * 200) {
    sim.update(CFG.TICK);
    steps++;
    for (const e of sim.drainEvents()) {
      if (e.type === 'roundEnd') {
        done = true;
        if (e.winner === 'CT') ctWins++;
        else tWins++;
        reasons[e.reason] = (reasons[e.reason] ?? 0) + 1;
        if (sim.bombWasPlanted) planted++;
        totalTime += sim.t;
      }
      if (e.type === 'kill' && e.killerId >= 0) {
        if (sim.actors[e.killerId].team === 'CT') ctKills++;
        else tKills++;
      }
    }
  }
}
console.log(`${mode} rounds=${n}: CT ${ctWins} - ${tWins} T | kills CT ${ctKills} / T ${tKills} | planted ${planted} | avg ${(totalTime / n).toFixed(0)}s`);
console.log('reasons', JSON.stringify(reasons));
