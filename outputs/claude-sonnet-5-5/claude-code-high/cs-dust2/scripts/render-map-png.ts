// Renders a top-down PNG of the map (no dependencies) to eyeball the layout:
//   node scripts/render-map-png.ts out.png
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { AREAS, CRATES, CT_POSTS, DOORS, SITES, SPAWNS, T_ROUTES } from '../src/sim/map.ts';
import { World } from '../src/sim/world.ts';

const S = 8; // px per meter
const world = new World();
const W = world.grid.W * S;
const H = world.grid.H * S;
const px = new Uint8Array(W * H * 3).fill(18);

function put(x: number, y: number, r: number, g: number, b: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
}
function rect(x0: number, z0: number, x1: number, z1: number, c: [number, number, number]): void {
  for (let y = Math.floor(z0 * S); y < Math.floor(z1 * S); y++) for (let x = Math.floor(x0 * S); x < Math.floor(x1 * S); x++) put(x, y, ...c);
}
function dot(x: number, z: number, r: number, c: [number, number, number]): void {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) put(Math.round(x * S) + dx, Math.round(z * S) + dy, ...c);
}
function line(x0: number, z0: number, x1: number, z1: number, c: [number, number, number]): void {
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * S);
  for (let i = 0; i <= n; i++) put(Math.round((x0 + ((x1 - x0) * i) / n) * S), Math.round((z0 + ((z1 - z0) * i) / n) * S), ...c);
}

const { W: gw, H: gh, walk, area } = world.grid;
for (let z = 0; z < gh; z++) {
  for (let x = 0; x < gw; x++) {
    if (!walk[z * gw + x]) continue;
    const t = AREAS[area[z * gw + x]].tint;
    rect(x, z, x + 1, z + 1, [((t >> 16) & 255) * 0.8, ((t >> 8) & 255) * 0.8, (t & 255) * 0.8].map(Math.round) as [number, number, number]);
  }
}
for (const b of world.boxes) if (b.kind === 'wall') rect(b.minX, b.minZ, b.maxX, b.maxZ, [70, 62, 52]);
for (const c of CRATES) rect(c.x, c.z, c.x + c.w, c.z + c.d, [110, 70, 30]);
for (const d of DOORS) for (const l of d.leaves) rect(l.x0, l.z0, l.x1, l.z1, [60, 140, 255]);
for (const s of SITES) {
  rect(s.rect[0], s.rect[1], s.rect[0] + 0.3, s.rect[3], [255, 210, 60]);
  dot(s.center.x, s.center.z, 6, [255, 210, 60]);
  for (const p of s.plantSpots) dot(p.x, p.z, 2, [255, 255, 255]);
}
for (const r of T_ROUTES) {
  const col: [number, number, number] = r.site === 'A' ? [255, 120, 60] : [255, 60, 200];
  for (let i = 0; i + 1 < r.points.length; i++) line(r.points[i].x, r.points[i].z, r.points[i + 1].x, r.points[i + 1].z, col);
  for (const p of r.points) dot(p.x, p.z, 2, col);
}
for (const p of CT_POSTS) dot(p.x, p.z, 3, [80, 170, 255]);
for (const p of SPAWNS.CT) dot(p.x, p.z, 3, [40, 120, 255]);
for (const p of SPAWNS.T) dot(p.x, p.z, 3, [255, 150, 30]);

// PNG encode
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
}
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(process.argv[2] ?? 'map.png', png);
console.log('wrote', process.argv[2] ?? 'map.png', W + 'x' + H);
