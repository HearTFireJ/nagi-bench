// Prints details for the first few long stand-still episodes (goal, path, nearby actors).
import { CFG } from '../src/sim/config.ts';
import { GameSim } from '../src/sim/game.ts';
import { setSeed } from '../src/sim/math.ts';

const TRAVEL = new Set(['route', 'seek', 'retake', 'fetch']);
let printed = 0;
setSeed(Number(process.argv[2] ?? 202));
const sim = new GameSim({ mode: (process.argv[3] as 'pistol' | 'full') ?? 'full', playerTeam: 'CT', winRounds: 8, withHuman: false });
sim.startMatch();
const still = new Map<number, number>();
for (let i = 0; i < 60 * 60 * 6 && printed < 8; i++) {
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
    const b = brain as unknown as { goal: { x: number; z: number } | null; path: { x: number; z: number }[] | null; pathIdx: number; arrive: number };
    if (TRAVEL.has(brain.state) && b.goal !== null && a.speed < 0.25 && !sim.actors.some((e) => e.alive && e.team !== a.team && sim.sees(a, e))) {
      const v = (still.get(id) ?? 0) + CFG.TICK;
      still.set(id, v);
      if (Math.abs(v - 4) < CFG.TICK / 2) {
        printed++;
        const near = sim.actors
          .filter((o) => o !== a && o.alive && Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < 2)
          .map((o) => o.name + '@' + o.pos.x.toFixed(1) + ',' + o.pos.z.toFixed(1))
          .join(' ');
        console.log(
          `r${sim.round} ${a.name}(${a.team}) state=${brain.state} pos=(${a.pos.x.toFixed(2)},${a.pos.z.toFixed(2)}) ` +
            `goal=${b.goal ? b.goal.x.toFixed(1) + ',' + b.goal.z.toFixed(1) : 'none'} arrive=${b.arrive} ` +
            `path=${b.path ? b.path.length : 'null'} idx=${b.pathIdx} wish=(${a.input.wishX.toFixed(2)},${a.input.wishZ.toFixed(2)}) ` +
            `weapon=${a.weapon.def.id} reload=${a.reloadLeft.toFixed(1)} near=[${near}] hasBomb=${a.hasBomb}`,
        );
      }
    } else still.set(id, 0);
  }
}
