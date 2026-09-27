import * as THREE from "three";

/** Deterministic pseudo-random stream (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash-based value noise in 3D, range 0..1, cheap and deterministic. */
export function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise3(x: number, y: number, z: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const fx = x - x0, fy = y - y0, fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const c = (i: number, j: number, k: number) => hash3(x0 + i, y0 + j, z0 + k);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), sx), l(c(0, 1, 0), c(1, 1, 0), sx), sy),
    l(l(c(0, 0, 1), c(1, 0, 1), sx), l(c(0, 1, 1), c(1, 1, 1), sx), sy),
    sz,
  );
}

export function fbm3(x: number, y: number, z: number, octaves = 4): number {
  let amp = 0.5, sum = 0, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x * f, y * f, z * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
export const ease = (t: number) => { const x = clamp01(t); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeIn = (t: number) => Math.pow(clamp01(t), 3);
/** 0..1 progress of `t` between a and b, clamped. */
export const seg = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a)));
/** Envelope: rises over `fi` after `a`, falls over `fo` before `b`. */
export function env(t: number, a: number, b: number, fi = 0.5, fo = 0.5): number {
  if (t < a || t > b) return 0;
  return smooth(Math.min(fi <= 0 ? 1 : seg(t, a, a + fi), fo <= 0 ? 1 : 1 - seg(t, b - fo, b)));
}
/** Short pulse: 1 at `at`, decaying to 0 over `len`. */
export const pulse = (t: number, at: number, len: number) => (t < at ? 0 : Math.max(0, 1 - (t - at) / len));

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const C = (hex: number | string) => new THREE.Color(hex as any);

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/** Place a camera: position, look target, fov and optional roll in radians. */
export function look(cam: THREE.PerspectiveCamera, from: THREE.Vector3, to: THREE.Vector3, fov = 40, roll = 0): void {
  cam.position.copy(from);
  cam.up.set(0, 1, 0);
  cam.lookAt(to);
  if (roll) cam.rotateZ(roll);
  if (cam.fov !== fov) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
}

/** Interpolated camera move between two set-ups. */
export function dolly(
  cam: THREE.PerspectiveCamera,
  t: number,
  fromA: THREE.Vector3, toA: THREE.Vector3,
  fromB: THREE.Vector3, toB: THREE.Vector3,
  fovA = 40, fovB = fovA, roll = 0,
): void {
  tmpA.lerpVectors(fromA, fromB, t);
  tmpB.lerpVectors(toA, toB, t);
  look(cam, tmpA, tmpB, lerp(fovA, fovB, t), roll);
}

/** Small deterministic handheld jitter, in radians, for a given time. */
export function shake(cam: THREE.PerspectiveCamera, time: number, amount: number): void {
  if (amount <= 0) return;
  const a = Math.sin(time * 37.1) * 0.6 + Math.sin(time * 61.7 + 1.3) * 0.4;
  const b = Math.cos(time * 43.3 + 0.7) * 0.6 + Math.sin(time * 71.9) * 0.4;
  cam.rotateX(a * amount);
  cam.rotateY(b * amount);
}

/** Standard block material. */
export function mat(color: number | string, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...opts });
}

/** Axis-aligned block helper. */
export function block(
  w: number, h: number, d: number,
  material: THREE.Material,
  x = 0, y = 0, z = 0,
  shadow = true,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

export function setVisible(obj: THREE.Object3D, v: boolean): void {
  obj.visible = v;
}
