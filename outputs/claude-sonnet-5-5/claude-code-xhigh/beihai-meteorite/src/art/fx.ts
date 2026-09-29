import * as THREE from "three";
import { VoxGrid } from "../util/vox";
import { hash, lerp, type V3 } from "../util/math";

/**
 * Deterministic voxel particles. Every particle's position is a closed-form
 * function of absolute time (birth time, seeded randoms, velocity), so scrubbing
 * the timeline shows exactly what playback shows.
 */
export interface Emitter {
  t0: number;
  t1: number;
  /** Particles per second while emitting. */
  rate: number;
  life: number;
  origin: V3 | ((birth: number) => V3);
  dir: V3 | ((birth: number) => V3);
  speed: [number, number];
  /** Cone half-angle in radians. */
  spread: number;
  size: [number, number];
  colors: number[];
  seed: number;
  gravity?: V3;
  /** Exponential velocity drag (1/s). */
  drag?: number;
  /** Extra random positional jitter at birth (m). */
  jitter?: number;
  /** Tumble speed (rad/s). */
  spin?: number;
  /** Fade by shrinking in the last fraction of life (0..1). */
  fade?: number;
  /** Delay the ease-in of size (grow first). */
  grow?: number;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

export class Fx {
  readonly mesh: THREE.InstancedMesh;
  readonly emitters: Emitter[] = [];
  private readonly cap: number;

  constructor(parent: THREE.Object3D, capacity = 1400, opts: { emissive?: boolean; cube?: number } = {}) {
    this.cap = capacity;
    const geo = new VoxGrid(1, 1, 1).box(0, 0, 0, 1, 1, 1, 0xffffff).geometry(opts.cube ?? 1, "center");
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: opts.emissive === false });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.mesh.setColorAt(0, tmpC.set(0xffffff));
    parent.add(this.mesh);
  }

  add(e: Emitter): this {
    this.emitters.push(e);
    return this;
  }

  update(t: number): void {
    let n = 0;
    for (const e of this.emitters) {
      if (t < e.t0) continue;
      const first = Math.max(0, Math.floor((t - e.life - e.t0) * e.rate));
      const last = Math.floor((Math.min(t, e.t1) - e.t0) * e.rate);
      for (let i = first; i <= last; i++) {
        if (n >= this.cap) break;
        const birth = e.t0 + i / e.rate;
        if (birth > e.t1) break;
        const age = t - birth;
        if (age < 0 || age > e.life) continue;
        const k = e.seed * 977 + i * 31;
        const r1 = hash(k), r2 = hash(k + 1), r3 = hash(k + 2), r4 = hash(k + 3), r5 = hash(k + 4), r6 = hash(k + 5);
        const o = typeof e.origin === "function" ? e.origin(birth) : e.origin;
        const d = typeof e.dir === "function" ? e.dir(birth) : e.dir;
        // random direction inside the cone around d
        const dl = Math.hypot(d[0], d[1], d[2]) || 1;
        const dx = d[0] / dl, dy = d[1] / dl, dz = d[2] / dl;
        // build an orthonormal basis
        const ax = Math.abs(dy) < 0.9 ? 0 : 1, ay = Math.abs(dy) < 0.9 ? 1 : 0;
        let ux = ay * dz - 0 * dy, uy = 0 * dx - ax * dz, uz = ax * dy - ay * dx;
        const ul = Math.hypot(ux, uy, uz) || 1;
        ux /= ul; uy /= ul; uz /= ul;
        const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
        const ang = r1 * Math.PI * 2;
        const cone = Math.sqrt(r2) * e.spread;
        const sc = Math.sin(cone), cc = Math.cos(cone);
        const px = dx * cc + (ux * Math.cos(ang) + vx * Math.sin(ang)) * sc;
        const py = dy * cc + (uy * Math.cos(ang) + vy * Math.sin(ang)) * sc;
        const pz = dz * cc + (uz * Math.cos(ang) + vz * Math.sin(ang)) * sc;
        const speed = lerp(e.speed[0], e.speed[1], r3);
        const drag = e.drag ?? 0;
        const travel = drag > 0 ? (1 - Math.exp(-drag * age)) / drag : age;
        const g = e.gravity;
        const jit = e.jitter ?? 0;
        tmpP.set(
          o[0] + (r4 - 0.5) * jit + px * speed * travel + (g ? 0.5 * g[0] * age * age : 0),
          o[1] + (r5 - 0.5) * jit + py * speed * travel + (g ? 0.5 * g[1] * age * age : 0),
          o[2] + (r6 - 0.5) * jit + pz * speed * travel + (g ? 0.5 * g[2] * age * age : 0),
        );
        const u = age / e.life;
        let size = lerp(e.size[0], e.size[1], u);
        if (e.grow) size *= Math.min(1, u / e.grow);
        if (e.fade !== undefined && u > 1 - e.fade) size *= (1 - u) / e.fade;
        if (size <= 0.0005) continue;
        const spin = (e.spin ?? 0) * age;
        tmpE.set(r1 * 6 + spin, r2 * 6 + spin * 0.7, r3 * 6);
        tmpQ.setFromEuler(tmpE);
        tmpS.setScalar(size);
        tmpM.compose(tmpP, tmpQ, tmpS);
        this.mesh.setMatrixAt(n, tmpM);
        tmpC.set(e.colors[Math.floor(r4 * e.colors.length) % e.colors.length]!);
        this.mesh.setColorAt(n, tmpC);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
