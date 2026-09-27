// Minimal three-free vector math so that map / nav / physics can be unit tested in Node.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const vcopy = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const vset = (o: Vec3, x: number, y: number, z: number): Vec3 => {
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
};
export const vadd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vsub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vscale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const vdot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const vlen = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const vlenXZ = (a: Vec3): number => Math.sqrt(a.x * a.x + a.z * a.z);
export const vdist = (a: Vec3, b: Vec3): number => vlen(vsub(a, b));
export const vdistXZ = (a: Vec3, b: Vec3): number => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
};
export const vnorm = (a: Vec3): Vec3 => {
  const l = vlen(a);
  return l > 1e-8 ? vscale(a, 1 / l) : v3();
};
export const vlerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
export const vcross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** Forward vector for a yaw angle. yaw=0 looks down -Z (three.js camera convention). */
export const forwardFromYaw = (yaw: number): Vec3 => ({ x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) });
export const rightFromYaw = (yaw: number): Vec3 => ({ x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) });
export const dirFromYawPitch = (yaw: number, pitch: number): Vec3 => {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
};
export const yawToward = (from: Vec3, to: Vec3): number => Math.atan2(-(to.x - from.x), -(to.z - from.z));
export const pitchToward = (from: Vec3, to: Vec3): number => {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.atan2(to.y - from.y, Math.sqrt(dx * dx + dz * dz));
};

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Shortest signed angular difference b - a in [-PI, PI]. */
export const angleDelta = (a: number, b: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export const randRange = (a: number, b: number): number => a + Math.random() * (b - a);
export const randInt = (a: number, b: number): number => Math.floor(randRange(a, b + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
/** Approximately gaussian random in [-1, 1]. */
export const randGauss = (): number => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

export interface AABB {
  min: Vec3;
  max: Vec3;
}

export const aabb = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): AABB => ({
  min: { x: Math.min(x0, x1), y: Math.min(y0, y1), z: Math.min(z0, z1) },
  max: { x: Math.max(x0, x1), y: Math.max(y0, y1), z: Math.max(z0, z1) },
});

/** Slab ray/AABB test. Returns distance along dir (dir normalized) or -1. */
export function rayAABB(o: Vec3, d: Vec3, box: AABB, maxDist: number): number {
  let tmin = 0;
  let tmax = maxDist;
  // X
  if (Math.abs(d.x) < 1e-9) {
    if (o.x < box.min.x || o.x > box.max.x) return -1;
  } else {
    const inv = 1 / d.x;
    let t1 = (box.min.x - o.x) * inv;
    let t2 = (box.max.x - o.x) * inv;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  // Y
  if (Math.abs(d.y) < 1e-9) {
    if (o.y < box.min.y || o.y > box.max.y) return -1;
  } else {
    const inv = 1 / d.y;
    let t1 = (box.min.y - o.y) * inv;
    let t2 = (box.max.y - o.y) * inv;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  // Z
  if (Math.abs(d.z) < 1e-9) {
    if (o.z < box.min.z || o.z > box.max.z) return -1;
  } else {
    const inv = 1 / d.z;
    let t1 = (box.min.z - o.z) * inv;
    let t2 = (box.max.z - o.z) * inv;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

/** Normal of the AABB face closest to point p (p assumed on/near the surface). */
export function aabbNormalAt(p: Vec3, box: AABB): Vec3 {
  const dx0 = Math.abs(p.x - box.min.x);
  const dx1 = Math.abs(p.x - box.max.x);
  const dy0 = Math.abs(p.y - box.min.y);
  const dy1 = Math.abs(p.y - box.max.y);
  const dz0 = Math.abs(p.z - box.min.z);
  const dz1 = Math.abs(p.z - box.max.z);
  let best = dx0;
  let n = v3(-1, 0, 0);
  if (dx1 < best) {
    best = dx1;
    n = v3(1, 0, 0);
  }
  if (dy0 < best) {
    best = dy0;
    n = v3(0, -1, 0);
  }
  if (dy1 < best) {
    best = dy1;
    n = v3(0, 1, 0);
  }
  if (dz0 < best) {
    best = dz0;
    n = v3(0, 0, -1);
  }
  if (dz1 < best) {
    n = v3(0, 0, 1);
  }
  return n;
}
