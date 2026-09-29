// Verifies that every required Dust2 area is reachable on the nav grid and reports route lengths.
import { createLevel } from '../src/game/level.ts';
import { NavGrid } from '../src/game/nav.ts';
import { ANCHORS, ZONES } from '../src/game/map/layout.ts';

const t0 = performance.now();
const level = createLevel();
const { nav, map } = level;
console.log('level built in', (performance.now() - t0).toFixed(0) + 'ms', 'boxes', map.boxes.length);

let walkable = 0;
const compSizes = new Map<number, number>();
for (let i = 0; i < nav.walkable.length; i++) {
  if (nav.walkable[i]) {
    walkable++;
    compSizes.set(nav.component[i], (compSizes.get(nav.component[i]) ?? 0) + 1);
  }
}
console.log('walkable cells', walkable, 'components', [...compSizes.entries()].map(([k, v]) => k + ':' + v).join(' '));

const from = ANCHORS.T_SPAWN;
const fromCT = ANCHORS.CT_SPAWN;
let bad = 0;
for (const [name, p] of Object.entries(ANCHORS)) {
  const cellT = nav.nearestWalkable(p.x, p.z, 4);
  const pathT = nav.findPath(from.x, from.z, p.x, p.z);
  const pathCT = nav.findPath(fromCT.x, fromCT.z, p.x, p.z);
  const snapped = cellT >= 0 ? nav.cellCenter(cellT, { x: 0, z: 0 }) : null;
  const lenT = pathT ? NavGrid.pathLength(from.x, from.z, pathT) : -1;
  const lenCT = pathCT ? NavGrid.pathLength(fromCT.x, fromCT.z, pathCT) : -1;
  const ok = pathT && pathCT && snapped && Math.hypot(snapped.x - p.x, snapped.z - p.z) < 1.0;
  if (!ok) bad++;
  console.log(
    (ok ? 'OK  ' : 'FAIL') + ' ' + name.padEnd(16),
    'fromT', lenT.toFixed(1).padStart(6) + 'm', pathT ? '(' + pathT.length + ' wp)' : '',
    'fromCT', lenCT.toFixed(1).padStart(6) + 'm',
    snapped ? '' : 'NOT WALKABLE',
  );
}

// Every zone must contain reachable cells from both spawns.
for (const z of ZONES) {
  const zi = ZONES.indexOf(z);
  let cells = 0;
  let reach = 0;
  const main = nav.component[nav.nearestWalkable(from.x, from.z)];
  for (let i = 0; i < nav.walkable.length; i++) {
    if (map.zone[i] === zi) {
      cells++;
      if (nav.walkable[i] && nav.component[i] === main) reach++;
    }
  }
  if (reach === 0) bad++;
  console.log((reach > 0 ? 'OK  ' : 'FAIL') + ' zone ' + z.id.padEnd(14) + z.name.padEnd(6) + ' cells ' + cells + ' reachable ' + reach);
}

// Spawn points must be standable.
for (const team of ['T', 'CT'] as const) {
  for (const s of map.spawns[team]) {
    const i = nav.cellIndex(s.x, s.z);
    const ok = i >= 0 && nav.walkable[i] === 1;
    if (!ok) bad++;
    console.log((ok ? 'OK  ' : 'FAIL') + ' spawn', team, s.x, s.z);
  }
}
console.log(bad === 0 ? 'ALL GOOD' : 'PROBLEMS: ' + bad);
