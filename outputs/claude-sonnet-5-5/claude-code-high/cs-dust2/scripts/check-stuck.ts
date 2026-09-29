// Detects bots that are supposed to be travelling but stand still for a long time.
import { CFG } from '../src/sim/config.ts';
import { GameSim } from '../src/sim/game.ts';
import { setSeed } from '../src/sim/math.ts';

const TRAVEL = new Set(['route', 'seek', 'retake', 'fetch']);
let worst = 0;
let worstInfo = '';
let stuckEpisodes = 0;
for (const mode of ['pistol', 'full'] as const) {
  for (let seed = 1; seed <= 6; seed++) {
    setSeed(seed * 101);
    const sim = new GameSim({ mode, playerTeam: 'CT', winRounds: 8, withHuman: false });
    sim.startMatch();
    const still = new Map<number, number>();
    for (let i = 0; i < 60 * 60 * 6; i++) {
      sim.update(CFG.TICK);
      sim.drainEvents();
      if (sim.phase !== 'live') {
        still.clear();
        continue;
      }
      for (const [id, brain] of sim.brains) {
        const a = sim.actors[id];
        if (!a.alive) {
          still.delete(id);
          continue;
        }
        const hasGoal = (brain as unknown as { goal: unknown }).goal !== null;
        if (TRAVEL.has(brain.state) && hasGoal && a.speed < 0.25 && !sim.actors.some((e) => e.alive && e.team !== a.team && sim.sees(a, e))) {
          const v = (still.get(id) ?? 0) + CFG.TICK;
          still.set(id, v);
          if (v > worst) {
            worst = v;
            worstInfo = `${mode} seed ${seed} round ${sim.round} ${a.name} state=${brain.state} at (${a.pos.x.toFixed(1)},${a.pos.z.toFixed(1)})`;
          }
          if (Math.abs(v - 4) < CFG.TICK / 2) stuckEpisodes++;
        } else still.set(id, 0);
      }
    }
  }
}
console.log(`longest continuous stand-still while travelling: ${worst.toFixed(1)}s (${worstInfo})`);
console.log(`episodes longer than 4s: ${stuckEpisodes}`);
