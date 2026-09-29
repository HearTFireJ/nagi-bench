// Pure math helpers + a seedable RNG (so the headless sim can be deterministic).

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function wrapAngle(a: number): number {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  else if (a < -Math.PI) a += TAU;
  return a;
}

/** Shortest signed delta from `from` to `to`. */
export const angleDelta = (from: number, to: number): number => wrapAngle(to - from);

export function approach(cur: number, target: number, maxDelta: number): number {
  if (cur < target) return Math.min(cur + maxDelta, target);
  return Math.max(cur - maxDelta, target);
}

export const dist2D = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz);

/**
 * Convention (same as three.js Euler Y / X):
 *   yaw = 0 faces -Z, yaw grows counter-clockwise seen from above (turn left).
 *   pitch > 0 looks up.
 */
export function yawToDir(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function dirToYaw(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export function dirFromAngles(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

// ---- RNG (mulberry32) -------------------------------------------------------
let seedState = (Math.random() * 4294967296) >>> 0;

export function setSeed(v: number): void {
  seedState = v >>> 0;
}

export function rand(): number {
  seedState = (seedState + 0x6d2b79f5) >>> 0;
  let t = seedState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randRange = (a: number, b: number): number => a + (b - a) * rand();
export const randInt = (n: number): number => Math.floor(rand() * n);
export function pick<T>(arr: readonly T[]): T {
  return arr[randInt(arr.length)];
}
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
/** Gaussian-ish noise in [-1, 1] (sum of uniforms). */
export const noise = (): number => (rand() + rand() + rand()) / 1.5 - 1;
