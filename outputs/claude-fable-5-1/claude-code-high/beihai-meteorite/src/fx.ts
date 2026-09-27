import * as THREE from "three";
import { rng } from "./util";

/*
 * Deterministic particle emitters. Every particle's state is a pure function of
 * absolute time, so seeking and replay produce identical frames.
 */

export interface Burst {
  /** Emission time (absolute seconds). */
  at: number;
  /** World origin at emission. */
  origin: THREE.Vector3;
  /** Mean direction; unit length. */
  dir: THREE.Vector3;
  /** Speed range (units / s). */
  speed: [number, number];
  /** Angular spread in radians around `dir`. */
  spread: number;
  /** Particle life (s). */
  life: number;
  /** Particles in this burst. */
  count: number;
  /** Size in world units. */
  size: number;
  /** Colour at birth and death. */
  color: THREE.Color;
  colorEnd?: THREE.Color;
  /** Gravity-like acceleration (world). */
  accel?: THREE.Vector3;
  /** Emission window: particles are released evenly across `at .. at+window`. */
  window?: number;
  /** Deterministic seed. */
  seed?: number;
}

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / max(0.0001, -mv.z);
  }
`;
const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    // Soft square-ish puff: keeps the block language while still reading as gas.
    float m = 1.0 - smoothstep(0.55, 1.0, max(abs(p.x), abs(p.y)) * 2.0);
    float a = vAlpha * m * (1.0 - d * 0.35);
    if (a <= 0.003) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

export class ParticleField {
  readonly points: THREE.Points;
  private readonly bursts: Burst[] = [];
  private readonly capacity: number;
  private readonly pos: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly col: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  constructor(capacity: number, additive = true) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.col = new Float32Array(capacity * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    this.geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
    this.geometry.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3));
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 600 } },
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  setPixelScale(heightPx: number, fovDeg: number): void {
    // Pixel size of a 1-unit particle at 1 unit distance.
    this.material.uniforms.uScale!.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  add(b: Burst): this {
    this.bursts.push(b);
    return this;
  }

  clear(): void {
    this.bursts.length = 0;
  }

  /** Recompute every particle from absolute time. */
  update(time: number): void {
    let n = 0;
    const tmp = new THREE.Vector3();
    const side = new THREE.Vector3();
    const up = new THREE.Vector3();
    const c = new THREE.Color();
    for (const b of this.bursts) {
      const window = b.window ?? 0;
      if (time < b.at || time > b.at + window + b.life) continue;
      const r = rng((b.seed ?? 1) * 1013 + Math.floor(b.at * 100));
      // Basis around the direction.
      side.set(b.dir.y, b.dir.z, b.dir.x).cross(b.dir);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      up.crossVectors(b.dir, side).normalize();
      for (let i = 0; i < b.count && n < this.capacity; i++) {
        const born = b.at + (window > 0 ? (i / b.count) * window : 0) + r() * 0.02;
        const speed = b.speed[0] + r() * (b.speed[1] - b.speed[0]);
        const ang = r() * Math.PI * 2;
        const off = r() * b.spread;
        const jitter = r();
        const age = time - born;
        if (age < 0 || age > b.life) continue;
        const k = age / b.life;
        tmp.copy(b.dir).multiplyScalar(Math.cos(off))
          .addScaledVector(side, Math.sin(off) * Math.cos(ang))
          .addScaledVector(up, Math.sin(off) * Math.sin(ang))
          .multiplyScalar(speed * age);
        if (b.accel) tmp.addScaledVector(b.accel, 0.5 * age * age);
        this.pos[n * 3] = b.origin.x + tmp.x;
        this.pos[n * 3 + 1] = b.origin.y + tmp.y;
        this.pos[n * 3 + 2] = b.origin.z + tmp.z;
        this.size[n] = b.size * (0.6 + 0.4 * jitter) * (1 + k * 1.4);
        this.alpha[n] = (1 - k) * (1 - k) * (0.55 + 0.45 * jitter);
        c.copy(b.color);
        if (b.colorEnd) c.lerp(b.colorEnd, k);
        this.col[n * 3] = c.r;
        this.col[n * 3 + 1] = c.g;
        this.col[n * 3 + 2] = c.b;
        n++;
      }
    }
    this.geometry.setDrawRange(0, n);
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** A star field as points; sizes vary, no attenuation. */
export function starField(count: number, radius: number, seed: number): THREE.Points {
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1, phi = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = radius * s * Math.cos(phi);
    pos[i * 3 + 1] = radius * u;
    pos[i * 3 + 2] = radius * s * Math.sin(phi);
    const mag = Math.pow(r(), 3);
    const warm = r();
    c.setRGB(0.6 + 0.4 * mag, 0.62 + 0.36 * mag * (warm > 0.5 ? 1 : 0.9), 0.7 + 0.3 * mag * (warm > 0.5 ? 0.85 : 1));
    c.multiplyScalar(0.35 + mag * 0.9);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

/** Muzzle flash: a small emissive cross of planes plus a point light, driven by a 0..1 intensity. */
export class MuzzleFlash {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;
  private readonly mats: THREE.MeshBasicMaterial[] = [];

  constructor(size: number, color = 0xffc46b, lightRange = 6) {
    const mk = (rot: THREE.Euler) => {
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.55), m);
      mesh.rotation.copy(rot);
      this.mats.push(m);
      this.group.add(mesh);
    };
    mk(new THREE.Euler(0, 0, 0));
    mk(new THREE.Euler(0, Math.PI / 2, 0));
    mk(new THREE.Euler(Math.PI / 2, 0, 0));
    this.light = new THREE.PointLight(color, 0, lightRange, 1.6);
    this.group.add(this.light);
  }

  set(intensity: number, lightPower: number): void {
    for (const m of this.mats) m.opacity = Math.min(1, intensity * 1.2);
    this.light.intensity = intensity * lightPower;
    this.group.visible = intensity > 0.001;
  }
}
