// Where / in which bot state do stuck-rescue jumps still happen?
import { World } from '../src/game/world.ts';
import { createLevel } from '../src/game/level.ts';
import { SIM_DT } from '../src/game/config.ts';
import { zoneAt } from '../src/game/map/build.ts';

const level = createLevel();
const w = new World({ allBots: true, seed: 2024, pistolRound: true, difficulty: 0.6 }, level);
const prev = new Map<number, number>();
const where = new Map<string, number>();
let shown = 0;
let guard = 0;
while (w.round.number <= 8 && guard++ < 60 * 60 * 200) {
  w.step(SIM_DT);
  for (const a of w.actors) {
    const b = w.brains.get(a.id);
    if (!b) continue;
    const before = prev.get(a.id) ?? 0;
    if (b.follower.jumps > before) {
      const z = zoneAt(level.map, a.pos.x, a.pos.z)?.id ?? 'OUT';
      const key = a.team + ' ' + b.state + ' ' + z;
      where.set(key, (where.get(key) ?? 0) + (b.follower.jumps - before));
      if (shown++ < 6) {
        const wp = b.follower.path[b.follower.idx];
        console.log('jump', a.name, b.state, z, 'pos', a.pos.x.toFixed(1), a.pos.z.toFixed(1), 'y', a.pos.y.toFixed(2), 'vel', a.vel.x.toFixed(2), a.vel.z.toFixed(2), 'wp', wp ? wp.x.toFixed(1) + ',' + wp.z.toFixed(1) : '-', 'in', a.input.forward.toFixed(2), a.input.strafe.toFixed(2));
      }
    }
    prev.set(a.id, b.follower.jumps);
  }
}
console.log([...where.entries()].sort((p, q) => q[1] - p[1]).slice(0, 12));
