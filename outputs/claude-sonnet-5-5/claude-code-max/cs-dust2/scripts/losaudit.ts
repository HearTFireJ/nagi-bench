// Long sight-line audit: samples walkable points and reports the longest unobstructed eye-level lines.
// Real Dust2's longest lanes are ~50-60 m (Long A, mid to T spawn); anything much longer is a layout leak.
import { createLevel } from '../src/game/level.ts';
import { Rng } from '../src/core/math.ts';
import { zoneAt } from '../src/game/map/build.ts';

const level = createLevel();
const { nav, cw, map } = level;
const rng = new Rng(3);
const pts: { x: number; z: number; y: number }[] = [];
for (let i = 0; i < nav.walkable.length; i += 7) {
  if (nav.walkable[i] && nav.clearance[i] >= 2) {
    const p = nav.cellCenter(i, { x: 0, z: 0 });
    pts.push({ x: p.x, z: p.z, y: nav.height[i] + 1.62 });
  }
}
console.log('sample points', pts.length);
const threshold = Number(process.argv[2] ?? 50);
const found: { d: number; a: string; b: string; ax: number; az: number; bx: number; bz: number }[] = [];
let checked = 0;
for (let n = 0; n < 400000; n++) {
  const a = pts[rng.int(pts.length)];
  const b = pts[rng.int(pts.length)];
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  if (d < threshold) continue;
  checked++;
  if (cw.lineClear(a, b, a.y, b.y - 0.1)) {
    found.push({ d, a: zoneAt(map, a.x, a.z)?.id ?? '?', b: zoneAt(map, b.x, b.z)?.id ?? '?', ax: a.x, az: a.z, bx: b.x, bz: b.z });
  }
}
found.sort((p, q) => q.d - p.d);
console.log('pairs >' + threshold + 'm checked', checked, 'with clear line of sight', found.length);
const seen = new Set<string>();
for (const f of found) {
  const key = [f.a, f.b].sort().join('~');
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(f.d.toFixed(1).padStart(6) + 'm', f.a.padEnd(13), '(' + f.ax.toFixed(0) + ',' + f.az.toFixed(0) + ')', '<->', f.b.padEnd(13), '(' + f.bx.toFixed(0) + ',' + f.bz.toFixed(0) + ')');
  if (seen.size >= 25) break;
}
