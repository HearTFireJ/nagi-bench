// Sanity checks for the Dust2 layout: every required region exists and is mutually reachable,
// all routes / posts / spawns / plant spots are on navigable cells, walls actually block rays.
import { AREAS, CT_POSTS, SITES, SPAWNS, T_ROUTES } from '../src/sim/map.ts';
import { World } from '../src/sim/world.ts';
import { NavGrid } from '../src/sim/nav.ts';

const world = new World();
const nav = new NavGrid(world);
let fail = 0;
const check = (cond: boolean, msg: string): void => {
  if (!cond) {
    fail++;
    console.error('FAIL', msg);
  }
};

console.log(`wall/crate/door boxes: ${world.boxes.length}`);
const required = ['T_SPAWN', 'CT_SPAWN', 'LONG', 'A_SITE', 'MID_DOORS', 'CAT', 'B_TUNNELS', 'B_SITE'];
for (const id of required) check(AREAS.some((a) => a.id === id), 'missing area ' + id);

const t0 = SPAWNS.T[0];
const center = (id: string): { x: number; z: number } => {
  const a = AREAS.find((q) => q.id === id)!;
  return { x: (a.rect[0] + a.rect[2]) / 2, z: (a.rect[1] + a.rect[3]) / 2 };
};

for (const a of AREAS) {
  const c = center(a.id);
  const t = performance.now();
  const p = nav.findPath(t0.x, t0.z, c.x, c.z);
  const ms = performance.now() - t;
  check(p !== null, `no path T spawn -> ${a.id}`);
  if (p) {
    let len = 0;
    let px = t0.x;
    let pz = t0.z;
    for (const q of p) {
      len += Math.hypot(q.x - px, q.z - pz);
      px = q.x;
      pz = q.z;
    }
    console.log(`T_SPAWN -> ${a.id.padEnd(14)} len=${len.toFixed(0).padStart(3)}m wp=${p.length} ${ms.toFixed(1)}ms`);
  }
}

for (const s of [...SPAWNS.T, ...SPAWNS.CT]) check(nav.isWalkable(s.x, s.z), `spawn not walkable ${s.x},${s.z}`);
for (const s of SITES) {
  for (const p of [...s.plantSpots, ...s.guardSpots]) check(nav.isWalkable(p.x, p.z), `site spot bad ${s.id} ${p.x},${p.z}`);
}
for (const r of T_ROUTES) {
  let prev = SPAWNS.T[0];
  for (const p of r.points) {
    check(nav.isWalkable(p.x, p.z), `route ${r.id} point bad ${p.x},${p.z}`);
    check(nav.findPath(prev.x, prev.z, p.x, p.z) !== null, `route ${r.id} unreachable ${p.x},${p.z}`);
    prev = p;
  }
  const site = SITES.find((s) => s.id === r.site)!;
  check(nav.findPath(prev.x, prev.z, site.plantSpots[0].x, site.plantSpots[0].z) !== null, `route ${r.id} -> site`);
}
for (const p of CT_POSTS) {
  check(nav.isWalkable(p.x, p.z), `post bad ${p.id}`);
  check(nav.findPath(SPAWNS.CT[0].x, SPAWNS.CT[0].z, p.x, p.z) !== null, `post unreachable ${p.id}`);
}

// walls block: T spawn -> CT spawn straight line must be blocked
check(!world.lineOfSight(45, 1.6, 100, 57, 1.6, 10), 'LOS through the map should be blocked');
// open sightline down mid corridor (doors closed at far end)
check(world.lineOfSight(51.5, 1.6, 88, 51.5, 1.6, 60), 'mid corridor should be open');

// collision: walking into a wall stops
const p = { x: 51.5, z: 60 };
for (let i = 0; i < 400; i++) {
  p.z -= 0.05;
  world.resolveCircle(p, 0.4, 0, 1.8, 0.5);
}
console.log('walked north up mid until', p.z.toFixed(2), '(door closed at z=41)');
check(p.z > 41.3 && p.z < 43, 'closed mid door should block');

console.log(fail === 0 ? 'MAP OK' : `MAP FAILED (${fail})`);
process.exit(fail === 0 ? 0 : 1);
