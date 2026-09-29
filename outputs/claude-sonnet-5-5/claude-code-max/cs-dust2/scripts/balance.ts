// Runs many bot-only rounds across seeds and prints the win split, so AI / weapon tuning can be checked quickly.
// Run: node --import ./scripts/register-ts.mjs scripts/balance.ts [seeds] [roundsPerSeed] [pistol 0|1]
import { World } from '../src/game/world.ts';
import { createLevel } from '../src/game/level.ts';
import { SIM_DT } from '../src/game/config.ts';

const seeds = Number(process.argv[2] ?? 6);
const roundsPer = Number(process.argv[3] ?? 10);
const pistol = (process.argv[4] ?? '0') !== '0';
const level = createLevel();

const wins = { T: 0, CT: 0 };
const reasons: Record<string, number> = {};
const bySite: Record<string, number> = { A: 0, B: 0 };
let plants = 0;
let totalTime = 0;
let rounds = 0;
let kills = 0;
let teleports = 0;
let jumpTicks = 0;
let repaths = 0;
const shotsBy: Record<string, number> = {};
const hitsBy: Record<string, number> = {};
const killsBy: Record<string, number> = {};
const killsByTeam = { T: 0, CT: 0 };
let aliveTAtPlant = 0;
let aliveCTAtPlant = 0;
let plantAt = 0;
let plantTimes = 0;
let defuseStarts = 0;
let defuseAborts = 0;

for (let s = 1; s <= seeds; s++) {
  const w = new World({ allBots: true, seed: s * 7919, pistolRound: pistol, difficulty: 0.55 }, level);
  let start = 0;
  w.events.on((e) => {
    if (e.type === 'roundStart') start = w.time;
    if (e.type === 'shot') shotsBy[e.weapon] = (shotsBy[e.weapon] ?? 0) + 1;
    if (e.type === 'hit') hitsBy[e.weapon] = (hitsBy[e.weapon] ?? 0) + 1;
    if (e.type === 'kill') {
      kills++;
      killsBy[e.weapon] = (killsBy[e.weapon] ?? 0) + 1;
      killsByTeam[e.killerTeam]++;
    }
    if (e.type === 'bombPlanted') {
      plants++;
      bySite[e.site]++;
      aliveTAtPlant += w.aliveCount('T');
      aliveCTAtPlant += w.aliveCount('CT');
      plantAt = w.time - start;
      plantTimes += plantAt;
    }
    if (e.type === 'defuseStart') defuseStarts++;
    if (e.type === 'defuseAbort') defuseAborts++;
    if (e.type === 'roundEnd') {
      wins[e.winner]++;
      reasons[e.winner + ':' + e.reason] = (reasons[e.winner + ':' + e.reason] ?? 0) + 1;
      totalTime += w.time - start;
      rounds++;
    }
  });
  let guard = 0;
  while (w.round.number <= roundsPer && w.round.phase !== 'matchEnd' && guard++ < 60 * 60 * 200) w.step(SIM_DT);
  for (const b of w.brains.values()) {
    teleports += b.follower.teleports;
    jumpTicks += b.follower.jumps;
    repaths += b.follower.repaths;
  }
}
console.log('rounds', rounds, 'T wins', wins.T, 'CT wins', wins.CT, 'T win rate', ((wins.T / rounds) * 100).toFixed(0) + '%');
console.log('reasons', JSON.stringify(reasons));
console.log(
  'at plant: avg alive T',
  (aliveTAtPlant / plants).toFixed(1),
  'CT',
  (aliveCTAtPlant / plants).toFixed(1),
  'avg plant time',
  (plantTimes / plants).toFixed(0) + 's',
  'defuse starts',
  defuseStarts,
  'aborts',
  defuseAborts,
);
console.log('kills by team', JSON.stringify(killsByTeam));
for (const id of Object.keys(shotsBy)) {
  if (id === 'knife') continue;
  console.log('  ' + id.padEnd(7), 'shots', String(shotsBy[id]).padStart(5), 'hit%', (((hitsBy[id] ?? 0) / shotsBy[id]) * 100).toFixed(0).padStart(3), 'kills', killsBy[id] ?? 0);
}
console.log('plants', plants, JSON.stringify(bySite), 'avg round', (totalTime / rounds).toFixed(0) + 's', 'kills/round', (kills / rounds).toFixed(1), 'stuck rescues: jump-ticks', jumpTicks, 'repaths', repaths, 'teleports', teleports);
