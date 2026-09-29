// 数学与确定性随机工具：所有动画都必须是时间的纯函数，因此这里的随机全部基于整数哈希。

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (x: number, a = 0, b = 1): number => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number): number => (a === b ? 0 : (x - a) / (b - a));
export const remap = (x: number, a: number, b: number, c: number, d: number): number =>
  lerp(c, d, clamp(invLerp(a, b, x)));

export const smooth = (t: number): number => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};
export const smoother = (t: number): number => {
  const x = clamp(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
export const easeIn = (t: number): number => {
  const x = clamp(t);
  return x * x * x;
};
export const easeOut = (t: number): number => {
  const x = clamp(t);
  return 1 - Math.pow(1 - x, 3);
};
export const easeInOut = (t: number): number => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOutBack = (t: number): number => {
  const x = clamp(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
/** 区间进度：t 在 [a,b] 内映射到 0..1 */
export const seg = (t: number, a: number, b: number): number => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
/** 在 [a,b] 内为 1，两端各用 fi/fo 秒平滑过渡 */
export function window01(t: number, a: number, b: number, fi = 0.3, fo = 0.3): number {
  if (t < a || t > b) return 0;
  const i = fi <= 0 ? 1 : smooth((t - a) / fi);
  const o = fo <= 0 ? 1 : smooth((b - t) / fo);
  return Math.min(i, o);
}
/** 快起慢落的脉冲（闪光、枪口火焰） */
export function pulse(t: number, t0: number, attack: number, decay: number): number {
  const d = t - t0;
  if (d < 0) return 0;
  if (d < attack) return d / attack;
  return Math.exp(-(d - attack) / decay);
}

// ---------- 哈希 / 随机 ----------
export function hashInt(n: number): number {
  n = (n ^ 61) ^ (n >>> 16);
  n = Math.imul(n, 9);
  n = n ^ (n >>> 4);
  n = Math.imul(n, 0x27d4eb2d);
  n = n ^ (n >>> 15);
  return n >>> 0;
}
/** 0..1 */
export const hash1 = (n: number): number => hashInt(Math.floor(n) | 0) / 4294967296;
export const hash2 = (x: number, y: number): number =>
  hashInt((Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0) / 4294967296;
export const hash3 = (x: number, y: number, z: number): number =>
  hashInt((Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647 & 1274126177)) | 0) /
  4294967296;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 值噪声 ----------
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
  const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}
export function fbm3(x: number, y: number, z: number, oct = 4): number {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x * f, y * f, z * f);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}
export function noise2(x: number, y: number): number {
  return noise3(x, y, 0.5);
}
export function fbm2(x: number, y: number, oct = 4): number {
  return fbm3(x, y, 0.5, oct);
}
