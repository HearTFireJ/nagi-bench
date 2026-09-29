// Prints the generated Dust2 map as ASCII plus some stats. Run: node --import ./scripts/register-ts.mjs scripts/mapdump.ts
import { buildMap } from '../src/game/map/build.ts';
import { dumpAscii } from '../src/game/map/debug.ts';

const t0 = performance.now();
const map = buildMap();
const ms = performance.now() - t0;
console.log(dumpAscii(map, 2));
const tags = new Map<string, number>();
for (const b of map.boxes) tags.set(b.tag.split(':')[0], (tags.get(b.tag.split(':')[0]) ?? 0) + 1);
console.log('grid', map.cols + 'x' + map.rows, 'boxes', map.boxes.length, Object.fromEntries(tags), 'built in', ms.toFixed(1) + 'ms');
