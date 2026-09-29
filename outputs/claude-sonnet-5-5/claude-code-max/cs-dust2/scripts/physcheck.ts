// Drives actors along nav paths with the real movement code (stairs, ramps, mid door) and cross-checks the ray caster.
import { createLevel, updateDoors } from '../src/game/level.ts';
import { createActor } from '../src/game/actor.ts';
import { stepMovement } from '../src/game/movement.ts';
import { makeRayHit } from '../src/game/collision.ts';
import type { RayHit } from '../src/game/collision.ts';
import { ANCHORS } from '../src/game/map/layout.ts';
import { NavGrid } from '../src/game/nav.ts';
import { Rng, yawTo } from '../src/core/math.ts';
import { SIM_DT } from '../src/game/config.ts';
import { floorAt } from '../src/game/map/build.ts';

const level = createLevel();
const { cw, nav, map } = level;
const emit = () => {};

// ---- 1. spawn drop test
{
  const a = createActor(0, 'test', 'CT', true);
  a.pos.x = 52;
  a.pos.z = 10;
  a.pos.y = 3;
  for (let i = 0; i < 120; i++) stepMovement(cw, a, SIM_DT, false, emit);
  console.log('drop test: y=' + a.pos.y.toFixed(3), 'onGround', a.onGround, 'expected floor', floorAt(map, 52, 10));
}

// ---- 2. path following
const names = Object.keys(ANCHORS);
const rng = new Rng(7);
let failures = 0;
let total = 0;
const pairs: [string, string][] = [
  ['T_SPAWN', 'A_SITE'],
  ['T_SPAWN', 'B_SITE'],
  ['T_SPAWN', 'CT_SPAWN'],
  ['CT_SPAWN', 'A_SITE'],
  ['CT_SPAWN', 'B_SITE'],
  ['CT_SPAWN', 'T_SPAWN'],
  ['B_SITE', 'A_SITE'],
  ['LONG_DOORS', 'SHORT_TOP'],
  ['B_TUNNEL_UPPER', 'B_SITE'],
  ['CT_RAMP', 'CATWALK'],
];
for (let k = 0; k < 40; k++) pairs.push([rng.pick(names), rng.pick(names)]);

for (const [from, to] of pairs) {
  const pa = ANCHORS[from];
  const pb = ANCHORS[to];
  const start = nav.nearestWalkable(pa.x, pa.z);
  const sp = nav.cellCenter(start, { x: 0, z: 0 });
  const path = nav.findPath(sp.x, sp.z, pb.x, pb.z);
  if (!path) {
    console.log('NO PATH', from, to);
    failures++;
    continue;
  }
  const a = createActor(1, 'walker', 'T', true);
  a.pos.x = sp.x;
  a.pos.z = sp.z;
  a.pos.y = nav.height[start];
  a.onGround = true;
  const len = NavGrid.pathLength(sp.x, sp.z, path);
  const budget = (len / 5.0) * 1.5 + 4;
  let t = 0;
  let wp = 0;
  let stuck = 0;
  let lastX = a.pos.x;
  let lastZ = a.pos.z;
  let lastCheck = 0;
  let doorOpened = false;
  while (wp < path.length && t < budget) {
    const target = path[wp];
    if (Math.hypot(target.x - a.pos.x, target.z - a.pos.z) < 0.45) {
      wp++;
      continue;
    }
    a.yaw = yawTo(a.pos.x, a.pos.z, target.x, target.z);
    a.input.forward = 1;
    a.input.strafe = 0;
    updateDoors(level, [a], SIM_DT, () => {});
    if (level.doors[0].open > 0.5) doorOpened = true;
    stepMovement(cw, a, SIM_DT, false, emit);
    t += SIM_DT;
    if (t - lastCheck > 1) {
      if (Math.hypot(a.pos.x - lastX, a.pos.z - lastZ) < 0.5) stuck++;
      lastX = a.pos.x;
      lastZ = a.pos.z;
      lastCheck = t;
    }
  }
  total++;
  const ok = wp >= path.length;
  if (!ok) failures++;
  if (!ok || pairs.indexOf([from, to] as never) >= 0 || total <= 10) {
    console.log((ok ? 'OK  ' : 'FAIL') + ' ' + from.padEnd(15) + '->' + to.padEnd(16) + 'len ' + len.toFixed(1) + 'm time ' + t.toFixed(1) + 's/' + budget.toFixed(1) + 's stuckTicks ' + stuck + (doorOpened ? ' (door opened)' : ''));
  }
}
console.log('path following:', total - failures + '/' + total, 'ok');

// ---- 3. ray cast vs brute force
{
  const hit: RayHit = makeRayHit();
  let mismatches = 0;
  const N = 3000;
  const all = [...cw.statics, ...cw.dynamics];
  for (let n = 0; n < N; n++) {
    const ox = rng.range(5, 100);
    const oy = rng.range(0.5, 3);
    const oz = rng.range(5, 100);
    let dx = rng.range(-1, 1);
    let dy = rng.range(-0.3, 0.3);
    let dz = rng.range(-1, 1);
    const l = Math.hypot(dx, dy, dz);
    dx /= l;
    dy /= l;
    dz /= l;
    const got = cw.raycast(ox, oy, oz, dx, dy, dz, 150, hit);
    // brute force
    let best = 150;
    let found = false;
    for (const b of all) {
      if (!b.enabled) continue;
      const t1x = (b.minX - ox) / dx;
      const t2x = (b.maxX - ox) / dx;
      const t1y = (b.minY - oy) / dy;
      const t2y = (b.maxY - oy) / dy;
      const t1z = (b.minZ - oz) / dz;
      const t2z = (b.maxZ - oz) / dz;
      const tn = Math.max(Math.min(t1x, t2x), Math.min(t1y, t2y), Math.min(t1z, t2z));
      const tf = Math.min(Math.max(t1x, t2x), Math.max(t1y, t2y), Math.max(t1z, t2z));
      if (tn <= tf && tf >= 0) {
        const t = Math.max(0, tn);
        if (t < best) {
          best = t;
          found = true;
        }
      }
    }
    if (got !== found || (got && Math.abs(hit.t - best) > 1e-6)) mismatches++;
  }
  console.log('raycast vs brute force:', N - mismatches + '/' + N, 'match');
}
process.exit(failures === 0 ? 0 : 1);
