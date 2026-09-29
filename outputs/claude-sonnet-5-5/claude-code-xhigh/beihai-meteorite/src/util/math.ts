// Deterministic helpers. Nothing here reads a clock or Math.random, so every
// frame of the film is a pure function of absolute time.

export const TAU = Math.PI * 2;
export type V3 = [number, number, number];

export const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const seg = (t: number, a: number, b: number): number => clamp((t - a) / (b - a));
export const smooth = (t: number): number => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};
export const smoother = (t: number): number => {
  const x = clamp(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
export const easeOut = (t: number): number => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t: number): number => Math.pow(clamp(t), 3);
export const easeInOut = (t: number): number => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const pulse = (t: number, a: number, b: number, fade = 0.2): number =>
  smooth(seg(t, a, a + fade)) * (1 - smooth(seg(t, b - fade, b)));

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash to [0,1). */
export function hash(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export const hash2 = (x: number, y: number, s = 0): number => hash(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(s | 0, 83492791));
export const hash3 = (x: number, y: number, z: number, s = 0): number =>
  hash(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791) ^ Math.imul(s | 0, 2654435761));

export function vnoise2(x: number, y: number, s = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
}

export function vnoise3(x: number, y: number, z: number, s = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const h = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, s);
  const x00 = lerp(h(0, 0, 0), h(1, 0, 0), xf), x10 = lerp(h(0, 1, 0), h(1, 1, 0), xf);
  const x01 = lerp(h(0, 0, 1), h(1, 0, 1), xf), x11 = lerp(h(0, 1, 1), h(1, 1, 1), xf);
  return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
}

export function fbm3(x: number, y: number, z: number, octaves = 4, s = 0): number {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise3(x * f, y * f, z * f, s + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

export function fbm2(x: number, y: number, octaves = 4, s = 0): number {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise2(x * f, y * f, s + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Smooth pseudo-random wobble in [-1,1] from a few incommensurate sines. */
export function wobble(t: number, seed = 0): number {
  const s = seed * 12.9898;
  return (
    Math.sin(t * 1.13 + s) * 0.5 +
    Math.sin(t * 2.71 + s * 1.7) * 0.3 +
    Math.sin(t * 5.37 + s * 2.3) * 0.2
  );
}

// ---- colour helpers (0xRRGGBB) ------------------------------------------------
export function rgb(hex: number): V3 {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
export function toHex(r: number, g: number, b: number): number {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}
export function shade(hex: number, k: number): number {
  const [r, g, b] = rgb(hex);
  return toHex(r * k, g * k, b * k);
}
export function mix(a: number, b: number, t: number): number {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}
/** Per-voxel value jitter so flat colours read as material rather than paint. */
export function jitter(hex: number, amount: number, x: number, y: number, z: number, seed = 0): number {
  return shade(hex, 1 + (hash3(x, y, z, seed) - 0.5) * 2 * amount);
}
export const css = (hex: number): string => `#${hex.toString(16).padStart(6, "0")}`;
