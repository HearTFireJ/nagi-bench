// Dev tool: run whole matches headlessly (10 bots) and print per-round summaries.
//   node --experimental-strip-types scripts/match-sim.ts [rounds] [seed] [mode]
import { Game } from '../src/core/game/game.ts';
import type { GameEvent } from '../src/core/game/events.ts';
import { ROUND, TICK_DT } from '../src/core/config.ts';

const ROUND_T = ROUND.roundTime;

const rounds = Number(process.argv[2] ?? 6);
const seed = Number(process.argv[3] ?? 1);
const mode = (process.argv[4] ?? 'pistol') as 'pistol' | 'fullbuy';

const g = new Game({ noHuman: true, seed, mode, maxRounds: 30 });
let lastRound = g.roundNumber;
const counts: Record<string, number> = {};
let roundEvents: GameEvent[] = [];
const t0 = Date.now();
let ticks = 0;
while (g.roundNumber <= rounds && g.phase !== 'matchEnd' && ticks < 60 * 60 * 60) {
  g.step(TICK_DT);
  ticks++;
  const evs = g.drainEvents();
  for (const e of evs) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    roundEvents.push(e);
    if (process.argv[5] === 'v' && (e.type === 'kill' || e.type === 'planted' || e.type === 'defuseStart' || e.type === 'bombDrop')) {
      const at = (id: number) => {
        const c = g.chars[id];
        return c ? `${c.name}@${g.zoneOf(c.pos.x, c.pos.z)?.label ?? '?'}` : '-';
      };
      const rt = g.phase === 'freeze' ? 0 : ROUND_T - g.roundTimeLeft;
      if (e.type === 'kill') console.log(`   [${rt.toFixed(0).padStart(3)}s] ${at(e.killer)} killed ${at(e.victim)} with ${e.weapon}${e.headshot ? ' (HS)' : ''}`);
      else if (e.type === 'planted') console.log(`   [${rt.toFixed(0).padStart(3)}s] PLANTED at ${e.site} by ${at(e.id)}`);
      else if (e.type === 'defuseStart') console.log(`   [${rt.toFixed(0).padStart(3)}s] defuse start ${at(e.id)}`);
      else if (e.type === 'bombDrop') console.log(`   [${rt.toFixed(0).padStart(3)}s] bomb dropped by ${at(e.id)}`);
    }
    if (e.type === 'roundEnd') {
      const kills = roundEvents.filter((x) => x.type === 'kill').length;
      const hs = roundEvents.filter((x) => x.type === 'kill' && x.headshot).length;
      const planted = roundEvents.some((x) => x.type === 'planted');
      console.log(
        `round ${String(g.roundNumber).padStart(2)}: ${e.winner} wins by ${e.reason.padEnd(13)} t=${(g.time).toFixed(0).padStart(4)}s kills=${kills} hs=${hs} planted=${planted} alive CT/T=${g.aliveCount('CT')}/${g.aliveCount('T')} score CT ${g.score.CT}-${g.score.T} T`,
      );
      roundEvents = [];
    }
  }
  if (g.roundNumber !== lastRound) lastRound = g.roundNumber;
}
console.log(`\nsimulated ${(g.time / 60).toFixed(1)} game-minutes in ${Date.now() - t0} ms real time (${ticks} ticks)`);
console.log(counts);
