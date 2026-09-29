// Verifies that the box face table in src/render/staticWorld.ts is wound counter-clockwise seen from outside
// (three.js culls back faces, so a wrong winding would make walls / floors invisible).
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/render/staticWorld.ts', import.meta.url), 'utf8');
const start = src.indexOf('const FACES: FaceDef[] = [');
const end = src.indexOf('];', start);
const body = src.slice(start, end + 2).replace('const FACES: FaceDef[] =', 'return ').replace(/\];$/, ']');
const FACES = new Function(body.replace(/: FaceDef\[\]/g, ''))() as { n: number[]; v: number[][] }[];

let bad = 0;
for (const f of FACES) {
  const [a, b, c, d] = f.v;
  const sub = (p: number[], q: number[]) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const cross = (u: number[], v: number[]) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  // both triangles used by the mesh: (0,1,2) and (0,2,3)
  const n1 = cross(sub(b, a), sub(c, a));
  const n2 = cross(sub(c, a), sub(d, a));
  const ok = dot(n1, f.n) > 0 && dot(n2, f.n) > 0;
  if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'BAD  ') + JSON.stringify(f.n) + ' tri1 ' + dot(n1, f.n) + ' tri2 ' + dot(n2, f.n));
}
console.log(bad === 0 ? 'all 6 faces wound counter-clockwise (outward)' : bad + ' faces are inside-out');
process.exit(bad === 0 ? 0 : 1);
