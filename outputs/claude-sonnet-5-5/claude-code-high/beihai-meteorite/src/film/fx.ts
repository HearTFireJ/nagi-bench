import * as THREE from "three";
import { rng, type V3 } from "../blocks";

/**
 * Deterministic particle pools: every instance is a pure function of absolute time,
 * so seeking anywhere in the film reproduces exactly the same clouds and sparks.
 */
export interface Emission {
  /** emission time */
  t: number;
  /** world origin at emission */
  p: V3;
  /** base velocity (world units per second) */
  v: V3;
  /** seed for jitter */
  seed: number;
  life: number;
  size: number;
  /** growth over the life (multiplier at end); <1 shrinks */
  grow: number;
  /** colour at start/end */
  c0: number;
  c1: number;
  /** switch time of colour (seconds after emission); Infinity = never */
  turn?: number;
  jitter?: number;
}

export class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private list: Emission[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private col = new THREE.Color();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(private capacity: number, opacity = 1, additive = false) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: opacity < 1 || additive,
        opacity,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        fog: false,
      }),
      capacity,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = capacity;
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, this.zero);
      this.mesh.setColorAt(i, this.col.setHex(0xffffff));
    }
  }

  set(emissions: Emission[]): void {
    this.list = emissions.slice(0, this.capacity);
  }

  update(t: number): void {
    for (let i = 0; i < this.capacity; i++) {
      const e = this.list[i];
      const age = e ? t - e.t : -1;
      if (!e || age < 0 || age > e.life) {
        this.mesh.setMatrixAt(i, this.zero);
        continue;
      }
      const r = rng(e.seed);
      const j = e.jitter ?? 0;
      const vx = e.v[0] + (r() - 0.5) * j;
      const vy = e.v[1] + (r() - 0.5) * j;
      const vz = e.v[2] + (r() - 0.5) * j;
      const u = age / e.life;
      const s = e.size * (1 + (e.grow - 1) * u) * (1 - Math.pow(u, 3));
      this.m.compose(
        new THREE.Vector3(e.p[0] + vx * age, e.p[1] + vy * age, e.p[2] + vz * age),
        this.q.setFromEuler(new THREE.Euler(r() * 6 + age, r() * 6, r() * 6)),
        new THREE.Vector3(s, s, s),
      );
      this.mesh.setMatrixAt(i, this.m);
      const turned = e.turn !== undefined && age > e.turn;
      this.col.setHex(turned ? e.c1 : e.c0);
      this.mesh.setColorAt(i, this.col);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Puff trail behind something moving along `path`, from t0 to t1. */
export function trail(
  out: Emission[],
  path: (t: number) => V3,
  t0: number,
  t1: number,
  n: number,
  seed: number,
  opts: { life?: number; size?: number; grow?: number; back?: number; spread?: number; c0?: number } = {},
): void {
  const r = rng(seed);
  for (let k = 0; k < n; k++) {
    const te = t0 + ((t1 - t0) * k) / Math.max(1, n - 1);
    const p = path(te);
    const p2 = path(te + 0.1);
    let dx = p2[0] - p[0];
    let dy = p2[1] - p[1];
    let dz = p2[2] - p[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    const back = opts.back ?? 0.5;
    const sp = opts.spread ?? 0.6;
    out.push({
      t: te,
      p: [p[0] - dx * back, p[1] - dy * back, p[2] - dz * back],
      v: [-dx * 1.4 + (r() - 0.5) * sp, -dy * 1.4 + (r() - 0.5) * sp, -dz * 1.4 + (r() - 0.5) * sp],
      seed: seed * 131 + k,
      life: opts.life ?? 1.3,
      size: opts.size ?? 0.22,
      grow: opts.grow ?? 2.6,
      c0: opts.c0 ?? 0xeaf4ff,
      c1: 0xeaf4ff,
      jitter: 0.2,
    });
  }
}
