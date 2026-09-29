/** One source of truth for world geometry, collision, pathfinding and minimap. Units are metres. */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
  name: string;
}
export interface Solid {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  y: number;
  kind: "wall" | "crate" | "door";
}
export const ROOMS: Rect[] = [
  { x: 0, z: 29, w: 23, d: 12, name: "T 出生点" },
  { x: 3, z: 18, w: 10, d: 14, name: "T 斜坡" },
  { x: 1, z: 5, w: 10, d: 16, name: "中路" },
  { x: 0, z: -5, w: 8, d: 9, name: "中门" },
  { x: 0, z: -18, w: 15, d: 19, name: "CT 出生点" },
  { x: 16, z: 27, w: 13, d: 8, name: "A 大入口" },
  { x: 24, z: 18, w: 9, d: 14, name: "A 大门" },
  { x: 29, z: 1, w: 9, d: 26, name: "A 大" },
  { x: 24, z: -17, w: 19, d: 16, name: "A 点" },
  { x: 13, z: -21, w: 13, d: 7, name: "A 斜坡" },
  { x: 8, z: 5, w: 10, d: 6, name: "猫道入口" },
  { x: 10, z: -3, w: 5, d: 18, name: "猫道" },
  { x: 16, z: -10, w: 15, d: 6, name: "A 小" },
  { x: -17, z: 27, w: 15, d: 8, name: "B 洞入口" },
  { x: -23, z: 14, w: 8, d: 24, name: "B 洞" },
  { x: -24, z: 0, w: 7, d: 10, name: "B 洞出口" },
  { x: -12, z: 8, w: 18, d: 6, name: "B 下层洞" },
  { x: -24, z: -15, w: 20, d: 22, name: "B 点" },
  { x: -12, z: -20, w: 15, d: 8, name: "B 门 / CT 通道" },
];
export const SITE_A = { x: 24, z: -17, radius: 6.5 };
export const SITE_B = { x: -24, z: -15, radius: 7 };
export function inside(x: number, z: number, r: Rect, padding = 0) {
  return (
    Math.abs(x - r.x) <= r.w / 2 + padding &&
    Math.abs(z - r.z) <= r.d / 2 + padding
  );
}
export function walkable(x: number, z: number) {
  return ROOMS.some((r) => inside(x, z, r));
}
/** Smooth ramps to the raised A site and catwalk; shared by rendering and physics. */
export function groundHeight(x: number, z: number) {
  if (x >= 14.5 && z <= -9) return 1.2;
  if (x >= 6.5 && x < 14.5 && z >= -24.5 && z <= -17.5)
    return ((x - 6.5) / 8) * 1.2;
  if (x >= 24.5 && z > -9 && z < -3) return ((-3 - z) / 6) * 1.2;
  if (x >= 8.5 && x <= 23.5 && z >= -13 && z <= -7) return 1.2;
  if (x >= 7.5 && x <= 12.5 && z >= -12 && z < 2)
    return Math.min(1.2, ((2 - z) / 8) * 1.2);
  return 0;
}
export function siteAt(x: number, z: number): "A" | "B" | null {
  if (Math.hypot(x - SITE_A.x, z - SITE_A.z) < SITE_A.radius) return "A";
  if (Math.hypot(x - SITE_B.x, z - SITE_B.z) < SITE_B.radius) return "B";
  return null;
}
export function locationAt(x: number, z: number) {
  return [...ROOMS].reverse().find((r) => inside(x, z, r))?.name ?? "Dust II";
}
// Boundary segments derived from the union of all rooms; openings stay truly open.
function boundaries(): Solid[] {
  const segments: {
    axis: "x" | "z";
    fixed: number;
    from: number;
    to: number;
  }[] = [];
  for (const r of ROOMS) {
    for (const sign of [-1, 1]) {
      const fixedX = r.x + (sign * r.w) / 2;
      for (let z = r.z - r.d / 2; z < r.z + r.d / 2; z += 0.5) {
        if (!walkable(fixedX + sign * 0.12, z + 0.25))
          segments.push({ axis: "z", fixed: fixedX, from: z, to: z + 0.5 });
      }
      const fixedZ = r.z + (sign * r.d) / 2;
      for (let x = r.x - r.w / 2; x < r.x + r.w / 2; x += 0.5) {
        if (!walkable(x + 0.25, fixedZ + sign * 0.12))
          segments.push({ axis: "x", fixed: fixedZ, from: x, to: x + 0.5 });
      }
    }
  }
  segments.sort(
    (a, b) =>
      a.axis.localeCompare(b.axis) || a.fixed - b.fixed || a.from - b.from,
  );
  const merged: typeof segments = [];
  for (const s of segments) {
    const prev = merged.at(-1);
    if (
      prev &&
      prev.axis === s.axis &&
      prev.fixed === s.fixed &&
      s.from <= prev.to
    )
      prev.to = Math.max(prev.to, s.to);
    else merged.push({ ...s });
  }
  return merged.map((s) => ({
    x: s.axis === "x" ? (s.from + s.to) / 2 : s.fixed,
    z: s.axis === "z" ? (s.from + s.to) / 2 : s.fixed,
    w: s.axis === "x" ? s.to - s.from + 0.35 : 0.45,
    d: s.axis === "z" ? s.to - s.from + 0.35 : 0.45,
    h: 5.2,
    y: 0,
    kind: "wall",
  }));
}
export const SOLIDS: Solid[] = [
  ...boundaries(),
  { x: 21, z: -18, w: 3, d: 3.5, h: 2.2, y: 0, kind: "crate" },
  { x: 28, z: -13, w: 2, d: 2, h: 1.4, y: 0, kind: "crate" },
  { x: 18, z: -22, w: 2, d: 2.5, h: 1.7, y: 0, kind: "crate" },
  { x: -26, z: -16, w: 3, d: 3, h: 2.4, y: 0, kind: "crate" },
  { x: -19, z: -21, w: 2.5, d: 3, h: 1.6, y: 0, kind: "crate" },
  { x: -29, z: -9, w: 2, d: 2, h: 1.7, y: 0, kind: "crate" },
  { x: 31, z: 0, w: 2, d: 3, h: 1.6, y: 0, kind: "crate" },
  { x: 2.8, z: 0, w: 2, d: 2, h: 1.7, y: 0, kind: "crate" },
  { x: -22, z: 14, w: 2, d: 2, h: 1.5, y: 0, kind: "crate" },
  // Two opened door leaves have real colliders. The 3m centre gap is traversable.
  { x: -2.3, z: -5.7, w: 0.35, d: 2.6, h: 3.1, y: 0, kind: "door" },
  { x: 2.3, z: -4.3, w: 0.35, d: 2.6, h: 3.1, y: 0, kind: "door" },
  { x: -3.6, z: -5, w: 0.8, d: 0.8, h: 4, y: 0, kind: "wall" },
  { x: 3.6, z: -5, w: 0.8, d: 0.8, h: 4, y: 0, kind: "wall" },
];
// Crates stand on their actual floor height; visual and collision bounds stay identical.
for (const solid of SOLIDS)
  if (solid.kind === "crate") solid.y = groundHeight(solid.x, solid.z);
export function clearPosition(
  x: number,
  z: number,
  radius = 0.34,
  feet = groundHeight(x, z),
) {
  if (
    ![
      [-radius, 0],
      [radius, 0],
      [0, -radius],
      [0, radius],
    ].every(([dx, dz]) => walkable(x + dx, z + dz))
  )
    return false;
  return !SOLIDS.some(
    (s) =>
      feet < s.y + s.h &&
      feet + 1.8 > s.y &&
      Math.abs(x - s.x) < s.w / 2 + radius &&
      Math.abs(z - s.z) < s.d / 2 + radius,
  );
}
export function moveWithCollision(
  pos: { x: number; y: number; z: number },
  dx: number,
  dz: number,
  radius = 0.34,
) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15));
  for (let i = 0; i < steps; i++) {
    if (clearPosition(pos.x + dx / steps, pos.z, radius, pos.y))
      pos.x += dx / steps;
    if (clearPosition(pos.x, pos.z + dz / steps, radius, pos.y))
      pos.z += dz / steps;
  }
}
// Slab intersection is also used by bot vision. No dependency on rendering or mesh visibility.
export function raySolid(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  max: number,
) {
  let nearest = max;
  for (const s of SOLIDS) {
    let near = 0,
      far = nearest;
    const bounds = [
      [origin.x, dir.x, s.x - s.w / 2, s.x + s.w / 2],
      [origin.y, dir.y, s.y, s.y + s.h],
      [origin.z, dir.z, s.z - s.d / 2, s.z + s.d / 2],
    ];
    for (const [o, d, min, upper] of bounds) {
      if (Math.abs(d) < 1e-8) {
        if (o < min || o > upper) {
          far = -1;
          break;
        }
      } else {
        const a = (min - o) / d,
          b = (upper - o) / d;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
      }
    }
    if (far >= near && near < nearest) nearest = near;
  }
  return nearest;
}
