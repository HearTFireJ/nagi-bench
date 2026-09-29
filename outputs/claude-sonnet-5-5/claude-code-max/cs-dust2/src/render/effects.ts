// Transient visual effects: bullet tracers, dust / spark / blood / smoke particles, bullet-hole decals and the C4 blast.
// Everything is pooled: no allocation happens while shooting.
import * as THREE from 'three';
import type { Vec3 } from '../core/math';
import { makeBulletHoleTexture, makeGlowTexture } from './textures';

// ------------------------------------------------------------------------------------------------------------------
// Tracers
// ------------------------------------------------------------------------------------------------------------------

interface Tracer {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  dir: THREE.Vector3;
  length: number;
  age: number;
  life: number;
  active: boolean;
}

class TracerPool {
  private readonly items: Tracer[] = [];
  private next = 0;
  private readonly geo = new THREE.BoxGeometry(1, 1, 1);
  private readonly mat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly tmp = new THREE.Vector3();

  constructor(parent: THREE.Group, count: number) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      parent.add(mesh);
      this.items.push({ mesh, from: new THREE.Vector3(), dir: new THREE.Vector3(), length: 0, age: 0, life: 0, active: false });
    }
  }

  spawn(from: Vec3, to: Vec3): void {
    const t = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    t.from.set(from.x, from.y, from.z);
    t.dir.set(to.x - from.x, to.y - from.y, to.z - from.z);
    t.length = t.dir.length();
    if (t.length < 0.5) return;
    t.dir.multiplyScalar(1 / t.length);
    t.age = 0;
    t.life = Math.min(0.2, t.length / 320);
    t.active = true;
    t.mesh.visible = true;
  }

  update(dt: number): void {
    for (const t of this.items) {
      if (!t.active) continue;
      t.age += dt;
      const p = t.age / t.life;
      if (p >= 1) {
        t.active = false;
        t.mesh.visible = false;
        continue;
      }
      // A short bright streak travelling from the muzzle to the impact point.
      const head = p * t.length;
      const streak = Math.min(5, t.length);
      const tail = Math.max(0, head - streak);
      const len = Math.max(0.05, head - tail);
      this.tmp.copy(t.from).addScaledVector(t.dir, (head + tail) / 2);
      t.mesh.position.copy(this.tmp);
      t.mesh.scale.set(0.012, 0.012, len);
      this.tmp.copy(t.from).addScaledVector(t.dir, head);
      t.mesh.lookAt(this.tmp);
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ------------------------------------------------------------------------------------------------------------------
// Particles
// ------------------------------------------------------------------------------------------------------------------

interface ParticleOptions {
  count: number;
  size: number;
  additive: boolean;
  gravity: number;
  drag: number;
  /** Multiply colour by remaining life (fade to black; use with additive blending). */
  fade: boolean;
}

class ParticleSystem {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly baseCol: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private next = 0;
  private readonly opts: ParticleOptions;

  constructor(parent: THREE.Group, opts: ParticleOptions) {
    this.opts = opts;
    const n = opts.count;
    this.pos = new Float32Array(n * 3).fill(0);
    this.col = new Float32Array(n * 3);
    this.baseCol = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n).fill(1);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -1000;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: opts.size,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    parent.add(this.points);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, r: number, g: number, b: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.opts.count;
    const k = i * 3;
    this.pos[k] = x;
    this.pos[k + 1] = y;
    this.pos[k + 2] = z;
    this.vel[k] = vx;
    this.vel[k + 1] = vy;
    this.vel[k + 2] = vz;
    this.baseCol[k] = r;
    this.baseCol[k + 1] = g;
    this.baseCol[k + 2] = b;
    this.col[k] = r;
    this.col[k + 1] = g;
    this.col[k + 2] = b;
    this.life[i] = life;
    this.maxLife[i] = life;
  }

  update(dt: number): void {
    const { count, gravity, drag, fade } = this.opts;
    const damp = Math.exp(-drag * dt);
    for (let i = 0; i < count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      if (this.life[i] <= 0) {
        this.pos[k + 1] = -1000;
        continue;
      }
      this.vel[k] *= damp;
      this.vel[k + 1] = this.vel[k + 1] * damp - gravity * dt;
      this.vel[k + 2] *= damp;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (fade) {
        const f = this.life[i] / this.maxLife[i];
        this.col[k] = this.baseCol[k] * f;
        this.col[k + 1] = this.baseCol[k + 1] * f;
        this.col[k + 2] = this.baseCol[k + 2] * f;
      }
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    if (fade) (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

// ------------------------------------------------------------------------------------------------------------------
// Effects manager
// ------------------------------------------------------------------------------------------------------------------

interface Blast {
  age: number;
  fire: THREE.Mesh;
  ring: THREE.Mesh;
  flash: THREE.Sprite;
  active: boolean;
}

export class Effects {
  readonly group = new THREE.Group();
  private readonly tracers: TracerPool;
  private readonly dust: ParticleSystem;
  private readonly sparks: ParticleSystem;
  private readonly blood: ParticleSystem;
  private readonly smoke: ParticleSystem;
  private readonly holes: THREE.Mesh[] = [];
  private nextHole = 0;
  private readonly holeGeo = new THREE.PlaneGeometry(0.14, 0.14);
  private readonly holeMat: THREE.MeshBasicMaterial;
  private readonly holeTex = makeBulletHoleTexture();
  private readonly glowTex = makeGlowTexture();
  private readonly blast: Blast;
  private readonly sphereGeo = new THREE.SphereGeometry(1, 18, 14);
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending });
  private readonly fireMat = new THREE.MeshBasicMaterial({ color: 0xff9a30, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly flashMat: THREE.SpriteMaterial;
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpN = new THREE.Vector3();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);

  constructor() {
    this.tracers = new TracerPool(this.group, 40);
    this.dust = new ParticleSystem(this.group, { count: 220, size: 0.11, additive: false, gravity: 1.5, drag: 2.2, fade: false });
    this.sparks = new ParticleSystem(this.group, { count: 160, size: 0.05, additive: true, gravity: 9, drag: 0.6, fade: true });
    this.blood = new ParticleSystem(this.group, { count: 200, size: 0.07, additive: false, gravity: 10, drag: 0.8, fade: false });
    this.smoke = new ParticleSystem(this.group, { count: 90, size: 1.1, additive: false, gravity: -1.2, drag: 1.4, fade: false });

    this.holeMat = new THREE.MeshBasicMaterial({ map: this.holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(this.holeGeo, this.holeMat);
      m.visible = false;
      this.group.add(m);
      this.holes.push(m);
    }

    this.flashMat = new THREE.SpriteMaterial({ map: this.glowTex, color: 0xfff0c0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const fire = new THREE.Mesh(this.sphereGeo, this.fireMat);
    const ring = new THREE.Mesh(this.sphereGeo, this.ringMat);
    const flash = new THREE.Sprite(this.flashMat);
    fire.visible = ring.visible = flash.visible = false;
    this.group.add(fire, ring, flash);
    this.blast = { age: 0, fire, ring, flash, active: false };
  }

  tracer(from: Vec3, to: Vec3): void {
    this.tracers.spawn(from, to);
  }

  /** Dust + sparks + a bullet hole where a bullet hit the world. */
  impact(point: Vec3, normal: Vec3 | null, metal: boolean): void {
    const n = normal ?? { x: 0, y: 1, z: 0 };
    for (let i = 0; i < 5; i++) {
      const s = 0.6 + Math.random() * 1.6;
      this.dust.emit(
        point.x + n.x * 0.03,
        point.y + n.y * 0.03,
        point.z + n.z * 0.03,
        n.x * s + (Math.random() - 0.5) * 1.4,
        n.y * s + Math.random() * 0.9,
        n.z * s + (Math.random() - 0.5) * 1.4,
        0.45 + Math.random() * 0.35,
        0.78,
        0.68,
        0.5,
      );
    }
    const sparkCount = metal ? 7 : 3;
    for (let i = 0; i < sparkCount; i++) {
      const s = 2 + Math.random() * 3;
      this.sparks.emit(point.x, point.y, point.z, n.x * s + (Math.random() - 0.5) * 3, n.y * s + Math.random() * 2, n.z * s + (Math.random() - 0.5) * 3, 0.25 + Math.random() * 0.25, 1, 0.75, 0.3);
    }
    // Decal, oriented to the surface normal.
    const hole = this.holes[this.nextHole];
    this.nextHole = (this.nextHole + 1) % this.holes.length;
    this.tmpN.set(n.x, n.y, n.z);
    this.tmpQ.setFromUnitVectors(this.zAxis, this.tmpN);
    hole.quaternion.copy(this.tmpQ);
    hole.rotateZ(Math.random() * Math.PI * 2);
    hole.position.set(point.x + n.x * 0.012, point.y + n.y * 0.012, point.z + n.z * 0.012);
    hole.visible = true;
  }

  /** Blood spray at a hit point, biased away from the shooter. */
  bloodSplat(point: Vec3, dir: Vec3, head: boolean): void {
    const count = head ? 16 : 9;
    for (let i = 0; i < count; i++) {
      const s = 1.5 + Math.random() * 3;
      this.blood.emit(
        point.x,
        point.y,
        point.z,
        dir.x * s + (Math.random() - 0.5) * 2.2,
        dir.y * s + Math.random() * 2,
        dir.z * s + (Math.random() - 0.5) * 2.2,
        0.35 + Math.random() * 0.35,
        0.55 + Math.random() * 0.2,
        0.02,
        0.03,
      );
    }
  }

  explosion(pos: Vec3): void {
    const b = this.blast;
    b.active = true;
    b.age = 0;
    b.fire.position.set(pos.x, pos.y + 0.8, pos.z);
    b.ring.position.copy(b.fire.position);
    b.flash.position.copy(b.fire.position);
    b.fire.visible = b.ring.visible = b.flash.visible = true;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const s = 6 + Math.random() * 16;
      this.sparks.emit(pos.x, pos.y + 0.8, pos.z, Math.cos(a) * s * (1 - up * 0.4), 4 + up * 14, Math.sin(a) * s * (1 - up * 0.4), 0.6 + Math.random() * 0.8, 1, 0.55, 0.15);
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 5;
      this.smoke.emit(pos.x + (Math.random() - 0.5) * 3, pos.y + 0.8 + Math.random() * 1.5, pos.z + (Math.random() - 0.5) * 3, Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s, 2 + Math.random() * 2.5, 0.22, 0.2, 0.19);
    }
  }

  /** Remove every decal (new round). */
  clearDecals(): void {
    for (const h of this.holes) h.visible = false;
  }

  update(dt: number): void {
    this.tracers.update(dt);
    this.dust.update(dt);
    this.sparks.update(dt);
    this.blood.update(dt);
    this.smoke.update(dt);
    const b = this.blast;
    if (b.active) {
      b.age += dt;
      const t = b.age / 1.1;
      if (t >= 1) {
        b.active = false;
        b.fire.visible = b.ring.visible = b.flash.visible = false;
      } else {
        const fireScale = 1 + t * 9;
        b.fire.scale.setScalar(fireScale);
        this.fireMat.opacity = 0.9 * (1 - t) * (1 - t);
        b.ring.scale.setScalar(2 + t * 24);
        this.ringMat.opacity = 0.5 * (1 - t);
        b.flash.scale.setScalar(30 * (1 - t * 0.6));
        this.flashMat.opacity = Math.max(0, 1 - t * 4);
      }
    }
  }

  dispose(): void {
    this.tracers.dispose();
    this.dust.dispose();
    this.sparks.dispose();
    this.blood.dispose();
    this.smoke.dispose();
    this.holeGeo.dispose();
    this.holeMat.dispose();
    this.holeTex.dispose();
    this.glowTex.dispose();
    this.sphereGeo.dispose();
    this.ringMat.dispose();
    this.fireMat.dispose();
    this.flashMat.dispose();
  }
}
