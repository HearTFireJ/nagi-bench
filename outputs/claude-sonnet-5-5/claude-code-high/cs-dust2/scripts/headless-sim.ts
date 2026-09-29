// Runs full bot-vs-bot matches without any renderer, to verify the game logic end-to-end:
// rounds advance, bots path & fight, C4 gets planted / defused / explodes, nobody walks through walls.
//   npm run sim            (Node >= 22.18 runs .ts directly)
//   npm run sim -- 3 pistol 42     -> 3 rounds, pistol mode, seed 42
import { CFG } from '../src/sim/config.ts';
import type { RoundMode } from '../src/sim/config.ts';
import { GameSim } from '../src/sim/game.ts';
import { setSeed } from '../src/sim/math.ts';

const maxRounds = Number(process.argv[2] ?? 6);
const mode = (process.argv[3] ?? 'pistol') as RoundMode;
const seed = Number(process.argv[4] ?? 1234);
setSeed(seed);

const sim = new GameSim({ mode, playerTeam: 'CT', winRounds: 8, withHuman: false });
sim.startMatch();

const counts: Record<string, number> = {};
let wallHacks = 0;
let stuckSamples = 0;
let liveSamples = 0;
const t0 = performance.now();
let steps = 0;
let currentRound = 0;
let roundStartT = 0;

while (sim.round <= maxRounds && sim.phase !== 'matchEnd' && steps < 60 * 60 * 40) {
  sim.update(CFG.TICK);
  steps++;
  for (const e of sim.drainEvents()) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (e.type === 'roundEnd') {
      const c = sim.actors.filter((a) => a.team === 'CT' && a.alive).length;
      const t = sim.actors.filter((a) => a.team === 'T' && a.alive).length;
      console.log(
        `round ${sim.round} [${sim.tStrategy}] -> ${e.winner} (${e.reason}) after ${(sim.t - roundStartT).toFixed(0)}s ` +
          `alive CT ${c} / T ${t}  score CT ${sim.score.CT}:${sim.score.T} T  bomb=${sim.bomb.state}${sim.bomb.site ? ' @' + sim.bomb.site : ''}`,
      );
    }
    if (e.type === 'freezeStart') {
      currentRound = e.round;
      roundStartT = sim.t;
    }
  }
  // invariants
  for (const a of sim.actors) {
    if (!a.alive) continue;
    if (!sim.world.isWalkCell(Math.floor(a.pos.x), Math.floor(a.pos.z))) wallHacks++;
    if (sim.world.circleBlocked(a.pos.x, a.pos.z, CFG.RADIUS - 0.1, a.pos.y, CFG.STEP_H, true)) wallHacks++;
  }
  if (sim.phase === 'live' && steps % 60 === 0) {
    for (const a of sim.actors) {
      if (!a.alive) continue;
      liveSamples++;
      if (a.speed < 0.2) stuckSamples++;
    }
  }
}
const ms = performance.now() - t0;
console.log('---');
console.log(`rounds played: ${currentRound}, sim steps: ${steps} (${(steps / 60).toFixed(0)}s game time) in ${ms.toFixed(0)} ms -> ${(ms / steps).toFixed(3)} ms/step`);
console.log('events:', JSON.stringify(counts));
console.log(`invariant violations (inside walls): ${wallHacks}`);
console.log(`idle bot samples while live: ${((stuckSamples / Math.max(1, liveSamples)) * 100).toFixed(0)}%`);
console.log('kills per actor:', sim.actors.map((a) => `${a.team}:${a.name}=${a.kills}/${a.deaths}`).join('  '));
process.exit(wallHacks === 0 ? 0 : 1);
