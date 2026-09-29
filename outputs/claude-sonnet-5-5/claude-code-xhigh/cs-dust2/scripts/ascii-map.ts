// Dev tool: print the generated Dust2 layout as ASCII (2 columns per metre would be too wide,
// so this samples every 2 m).  Run:  node --experimental-strip-types scripts/ascii-map.ts
import { buildDust2 } from '../src/core/map/dust2.ts';

const map = buildDust2();
const step = 2;
const anchorAt = new Map<string, string>();
for (const [name, p] of Object.entries(map.anchors)) {
  anchorAt.set(`${Math.floor(p.x / step)},${Math.floor(p.z / step)}`, name[0]);
}
let out = '';
for (let z = 0; z < map.depth; z += step) {
  let line = String(z).padStart(3) + ' ';
  for (let x = 0; x < map.cols; x += step) {
    const a = anchorAt.get(`${x / step},${z / step}`);
    const h = map.terrain[z * map.cols + x];
    let ch = '#';
    if (!Number.isNaN(h)) {
      ch = h < 0.05 ? '.' : h < 1.5 ? '-' : '=';
      for (const bx of map.boxes) {
        if (bx.kind === 'crate' && x + 0.5 >= bx.minX && x + 0.5 <= bx.maxX && z + 0.5 >= bx.minZ && z + 0.5 <= bx.maxZ) ch = 'o';
      }
      for (const d of map.doors) {
        if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) ch = 'D';
      }
    }
    if (a && ch !== '#') ch = a;
    line += ch;
  }
  out += line + '\n';
}
console.log(out);
