// Headless sanity test: prints the map and verifies connectivity + pathfinding + physics.
import { MapGrid } from '../src/game/map/MapGrid';
import { NavGrid } from '../src/game/map/NavGrid';
import { World } from '../src/game/physics/World';
import { buildRawGrid, CELL, CT_HOLD_SPOTS, CT_SPAWNS, PLANT_SPOTS, ROAM_SPOTS, T_POST_PLANT_SPOTS, T_ROUTES, T_SPAWNS } from '../src/game/map/MapData';

const raw = buildRawGrid();
console.log(raw.map((r) => r.join('')).join('\n'));

const map = new MapGrid();
const nav = new NavGrid(map);
const world = new World(map);

console.log('colliders:', map.colliders.length, 'wallRects:', map.wallRects.length, 'ramps:', map.rampRuns.length);
for (const r of map.rampRuns) console.log('ramp', r, r.info);

let fail = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) fail++;
  console.log((ok ? 'OK   ' : 'FAIL ') + name);
};

const center = (c: { x: number; z: number }) => map.cellCenter(c.x, c.z);
const spots = [
  ...T_SPAWNS.map((s) => ({ ...s, n: 'Tspawn' })),
  ...CT_SPAWNS.map((s) => ({ ...s, n: 'CTspawn' })),
  ...CT_HOLD_SPOTS.map((s) => ({ ...s, n: 'hold' + s.site })),
  ...T_POST_PLANT_SPOTS.map((s) => ({ ...s, n: 'post' + s.site })),
  ...PLANT_SPOTS.A.map((s) => ({ ...s, n: 'plantA' })),
  ...PLANT_SPOTS.B.map((s) => ({ ...s, n: 'plantB' })),
  ...ROAM_SPOTS.map((s) => ({ ...s, n: 'roam' })),
  ...T_ROUTES.A.flat().map((s) => ({ ...s, n: 'routeA' })),
  ...T_ROUTES.B.flat().map((s) => ({ ...s, n: 'routeB' })),
];
for (const s of spots) {
  const c = map.cell(s.x, s.z);
  check(`spot ${s.n} (${s.x},${s.z}) walkable ch=${c?.ch}`, map.isNavWalkable(c));
}
// plant spots must be inside plant zones
for (const s of PLANT_SPOTS.A) check(`plantA zone (${s.x},${s.z})`, map.cell(s.x, s.z)?.zone === 'A');
for (const s of PLANT_SPOTS.B) check(`plantB zone (${s.x},${s.z})`, map.cell(s.x, s.z)?.zone === 'B');

// Pathfinding between all pairs of key locations
const key = [T_SPAWNS[0], CT_SPAWNS[0], PLANT_SPOTS.A[0], PLANT_SPOTS.B[0], ...ROAM_SPOTS];
let maxLen = 0;
for (let i = 0; i < key.length; i++) {
  for (let j = i + 1; j < key.length; j++) {
    const p = nav.findPath(center(key[i]), center(key[j]));
    if (!p) {
      check(`path ${JSON.stringify(key[i])} -> ${JSON.stringify(key[j])}`, false);
    } else maxLen = Math.max(maxLen, p.length);
  }
}
check(`all key pairs reachable (max waypoints ${maxLen})`, fail === 0);

// Timing
const t0 = performance.now();
for (let i = 0; i < 200; i++) nav.findPath(center(T_SPAWNS[i % 10]), center(CT_SPAWNS[i % 10]));
console.log('200 paths in', (performance.now() - t0).toFixed(1), 'ms');

// Ramps: walking a body up the A ramp from long to site
const body = { pos: { ...center({ x: 55, z: 30 }) }, vel: { x: 0, y: 0, z: 0 }, radius: 0.35, grounded: true };
body.pos.y = 0;
for (let i = 0; i < 600; i++) {
  body.vel.x = 0;
  body.vel.z = -4;
  world.moveBody(body, 1 / 60);
}
console.log('after walking north from long:', body.pos);
check('body climbed onto A site (y≈2)', Math.abs(body.pos.y - 2) < 0.01 && body.pos.z < 46);

// Walls: walking into a wall should stop the body
const b2 = { pos: { ...center({ x: 55, z: 40 }) }, vel: { x: 0, y: 0, z: 0 }, radius: 0.35, grounded: true };
b2.pos.y = 0;
for (let i = 0; i < 300; i++) {
  b2.vel.x = 5;
  b2.vel.z = 0;
  world.moveBody(b2, 1 / 60);
}
console.log('after walking east into wall:', b2.pos);
check('blocked by wall at x<=116-0.35', b2.pos.x <= 58 * CELL - 0.35 + 1e-6 && b2.pos.x > 57 * CELL);

// Jumping onto a 1m crate at (52,30)
const b3 = { pos: { ...center({ x: 52, z: 31 }) }, vel: { x: 0, y: 0, z: 0 }, radius: 0.35, grounded: true };
b3.pos.y = 0;
b3.pos.z = 63.5;
b3.vel.y = 6.3;
b3.grounded = false;
for (let i = 0; i < 120; i++) {
  b3.vel.x = 0;
  b3.vel.z = b3.grounded && b3.pos.y > 0.9 ? 0 : -3;
  world.moveBody(b3, 1 / 60);
}
console.log('after jump toward crate:', b3.pos);
check('landed on crate (y=1)', Math.abs(b3.pos.y - 1) < 0.01);

// LOS: mid doors should block a diagonal view but allow a straight one
const a = { x: 32 * CELL, y: 1.6, z: 20 * CELL };
const b = { x: 32 * CELL, y: 1.6, z: 10 * CELL };
check('LOS through mid doors (straight)', world.lineOfSight(a, b));
const c = { x: 30.5 * CELL, y: 1.6, z: 10 * CELL };
check('LOS blocked by wall next to door', !world.lineOfSight(a, c));
check('LOS blocked B site <-> A site', !world.lineOfSight(center({ x: 9, z: 9 }), center({ x: 52, z: 17 })));

// Hit test on a target
// Target standing in open T spawn ground (cell 26,55), shooter 10m south.
const target = { id: 1, pos: { x: 53, y: 0, z: 111 }, yaw: 0, alive: true };
const hit = world.raycast({ x: 53, y: 1.58, z: 121 }, { x: 0, y: 0, z: -1 }, 50, [target], 0);
check('ray hits head', hit.target === target && hit.hitbox === 'head');
const hit2 = world.raycast({ x: 53, y: 0.4, z: 121 }, { x: 0, y: 0, z: -1 }, 50, [target], 0);
check('ray at 0.4m misses center (between legs) → hits map', hit2.target === null);
const hit3 = world.raycast({ x: 53.14, y: 0.4, z: 121 }, { x: 0, y: 0, z: -1 }, 50, [target], 0);
check('ray hits right leg', hit3.hitbox === 'leg_r');
// Rotated target: yaw 90° (facing -x). Shooter to the west should now see the target's front.
const t2 = { id: 2, pos: { x: 53, y: 0, z: 111 }, yaw: Math.PI / 2, alive: true };
const hit4 = world.raycast({ x: 43, y: 1.26, z: 111 + 0.36 }, { x: 1, y: 0, z: 0 }, 50, [t2], 0);
console.log('rotated hit:', hit4.hitbox);
check('rotated target arm hit (local +x maps to world -z... expect arm)', hit4.hitbox === 'arm_l' || hit4.hitbox === 'arm_r');
console.log('door geometry mid:', map.doorGeometry(map.cell(31, 13)!));
console.log('door geometry B:', map.doorGeometry(map.cell(24, 5)!));

console.log(fail === 0 ? '\nALL CHECKS PASSED' : `\n${fail} CHECKS FAILED`);
process.exit(fail === 0 ? 0 : 1);
