import { clearPosition } from "./map.ts";
export interface Point {
  x: number;
  z: number;
}
const MIN = -36,
  MAX = 38,
  SIZE = MAX - MIN + 1;
const key = (x: number, z: number) => (z - MIN) * SIZE + x - MIN;
const point = (k: number): Point => ({
  x: (k % SIZE) + MIN,
  z: Math.floor(k / SIZE) + MIN,
});
/** Occupancy-grid A*, diagonal corner-cutting disallowed. Cached static occupancy. */
export class Navigation {
  cells = new Uint8Array(SIZE * SIZE);
  constructor() {
    for (let z = MIN; z <= MAX; z++)
      for (let x = MIN; x <= MAX; x++)
        this.cells[key(x, z)] = clearPosition(x, z, 0.48) ? 1 : 0;
  }
  valid(x: number, z: number) {
    return (
      x >= MIN &&
      x <= MAX &&
      z >= MIN &&
      z <= MAX &&
      this.cells[key(x, z)] === 1
    );
  }
  nearest(p: Point): Point {
    const x = Math.round(p.x),
      z = Math.round(p.z);
    if (this.valid(x, z)) return { x, z };
    for (let r = 1; r < 10; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++)
          if (this.valid(x + dx, z + dz)) return { x: x + dx, z: z + dz };
    return { x: 0, z: 29 };
  }
  find(start: Point, end: Point): Point[] {
    const s = this.nearest(start),
      e = this.nearest(end),
      sk = key(s.x, s.z),
      ek = key(e.x, e.z);
    const open = [sk],
      closed = new Set<number>(),
      came = new Map<number, number>(),
      cost = new Map([[sk, 0]]);
    const score = new Map([[sk, Math.hypot(s.x - e.x, s.z - e.z)]]);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++)
        if (score.get(open[i])! < score.get(open[bi])!) bi = i;
      const k = open.splice(bi, 1)[0];
      if (k === ek) {
        const path = [point(k)];
        let cur = k;
        while (came.has(cur)) {
          cur = came.get(cur)!;
          path.unshift(point(cur));
        }
        return path.slice(1);
      }
      closed.add(k);
      const p = point(k);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        const x = p.x + dx,
          z = p.z + dz,
          nk = key(x, z);
        if (
          !this.valid(x, z) ||
          closed.has(nk) ||
          (dx &&
            dz &&
            (!this.valid(p.x + dx, p.z) || !this.valid(p.x, p.z + dz)))
        )
          continue;
        const g = cost.get(k)! + Math.hypot(dx, dz);
        if (g >= (cost.get(nk) ?? Infinity)) continue;
        came.set(nk, k);
        cost.set(nk, g);
        score.set(nk, g + Math.hypot(x - e.x, z - e.z));
        if (!open.includes(nk)) open.push(nk);
      }
    }
    return [];
  }
}
