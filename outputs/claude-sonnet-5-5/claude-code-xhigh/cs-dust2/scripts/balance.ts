// Dev tool: aggregate statistics over many headless bot-vs-bot matches.
//   node --experimental-strip-types scripts/balance.ts [seeds] [roundsPerMatch] [mode] [difficulty]
import { Game } from '../src/core/game/game.ts';
import type { Difficulty } from '../src/core/game/game.ts';
import { TICK_DT } from '../src/core/config.ts';

const seeds = Number(process.argv[2] ?? 8);
const rounds = Number(process.argv[3] ?? 6);
const mode = (process.argv[4] ?? 'pistol') as 'pistol' | 'fullbuy';
const diff = (process.argv[5] ?? 'normal') as Difficulty;

const wins = { CT: 0, T: 0 };
const reasons: Record<string, number> = {};
let total = 0;
let planted = 0;
let defused = 0;
let exploded = 0;
let kills = 0;
let hs = 0;
let stuckSamples = 0;
let stuckBad = 0;
let roundLen = 0;
const perRound: Record<number, { CT: number; T: number }> = {};
const byWeapon: Record<string, number> = {};
let early = 0;
let mid = 0;
let late = 0;

const t0 = Date.now();
for (let s = 1; s <= seeds; s++) {
  const g = new Game({ noHuman: true, seed: s * 7919, mode, difficulty: diff, maxRounds: 30 });
  let roundStartTime = g.time;
  let guard = 0;
  // stuck detector: bots that should be walking but barely move for long
  const lastPos = new Map<number, { x: number; z: number; t: number }>();
  while (g.roundNumber <= rounds && g.phase !== 'matchEnd' && guard++ < 60 * 60 * 90) {
    g.step(TICK_DT);
    for (const e of g.drainEvents()) {
      if (e.type === 'kill') {
        kills++;
        if (e.headshot) hs++;
        const key = `${e.killerTeam}:${e.weapon}`;
        byWeapon[key] = (byWeapon[key] ?? 0) + 1;
        const kt = g.time - roundStartTime - 6;
        if (kt < 20) early++;
        else if (kt < 45) mid++;
        else late++;
      } else if (e.type === 'planted') planted++;
      else if (e.type === 'defused') defused++;
      else if (e.type === 'exploded') exploded++;
      else if (e.type === 'roundEnd') {
        wins[e.winner]++;
        reasons[e.reason] = (reasons[e.reason] ?? 0) + 1;
        total++;
        roundLen += g.time - roundStartTime;
        const pr = (perRound[g.roundNumber] ??= { CT: 0, T: 0 });
        pr[e.winner]++;
      } else if (e.type === 'roundStart') roundStartTime = g.time;
    }
    if (g.phase === 'live' || g.phase === 'planted') {
      for (const c of g.chars) {
        if (!c.alive || !c.brain) continue;
        const st = c.brain.state;
        if (st !== 'travel' && st !== 'search' && st !== 'pickup') continue;
        const lp = lastPos.get(c.id);
        if (!lp || g.time - lp.t > 4) {
          if (lp) {
            stuckSamples++;
            if (Math.hypot(c.pos.x - lp.x, c.pos.z - lp.z) < 0.6) stuckBad++;
          }
          lastPos.set(c.id, { x: c.pos.x, z: c.pos.z, t: g.time });
        }
      }
    }
  }
}
const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(0) : '0') + '%';
console.log(`${seeds} matches x ${rounds} rounds, mode=${mode}, difficulty=${diff}  (${Date.now() - t0} ms)`);
console.log(`rounds: ${total}   CT wins ${wins.CT} (${pct(wins.CT, total)})   T wins ${wins.T} (${pct(wins.T, total)})`);
console.log('reasons:', reasons);
console.log(`bomb planted in ${pct(planted, total)} of rounds; defused ${defused}, exploded ${exploded}`);
console.log(`avg round length ${(roundLen / Math.max(1, total)).toFixed(0)} s, kills/round ${(kills / Math.max(1, total)).toFixed(1)}, headshot rate ${pct(hs, kills)}`);
console.log(`stuck check: ${stuckBad}/${stuckSamples} 4-second samples of walking bots moved < 0.6 m`);
console.log('kills by team:weapon', byWeapon);
console.log(`kills by time since freeze end: <20s ${early}, 20-45s ${mid}, >45s ${late}`);
console.log('CT win rate by round number:', Object.entries(perRound).map(([r, v]) => `${r}:${pct(v.CT, v.CT + v.T)}`).join(' '));
