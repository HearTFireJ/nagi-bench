// Prints a per-second trace of one round: who is where, in which AI state, with how much hp.
import { CFG } from '../src/sim/config.ts';
import { GameSim } from '../src/sim/game.ts';
import { setSeed } from '../src/sim/math.ts';

setSeed(Number(process.argv[2] ?? 2));
const wantRound = Number(process.argv[3] ?? 1);
const sim = new GameSim({ mode: 'pistol', playerTeam: 'CT', winRounds: 8, withHuman: false });
sim.startMatch();
let steps = 0;
while (sim.round <= wantRound && steps < 60 * 400) {
  sim.update(CFG.TICK);
  steps++;
  const events = sim.drainEvents();
  if (sim.round === wantRound && sim.phase === 'live' && steps % 60 === 0) {
    const line = sim.actors
      .map((a) => {
        const b = sim.brains.get(a.id);
        return a.alive
          ? a.team + a.id + ':' + (b ? b.state : '?') + '@' + a.pos.x.toFixed(0) + ',' + a.pos.z.toFixed(0) + ' ' + a.hp
          : a.team + a.id + ':dead';
      })
      .join(' | ');
    console.log((sim.t - sim.roundEndsAt + CFG.ROUND_TIME).toFixed(0).padStart(3) + 's ' + line);
  }
  for (const e of events) if (e.type === 'kill' && sim.round === wantRound) console.log('   KILL', e.killerId, '->', e.victimId, e.weaponId, e.headshot ? 'HS' : '');
}
