import * as THREE from 'three';
import { boxGeo, vertexColorMaterial } from './geo.ts';
import { glowTexture } from './textures.ts';
import type { BombState } from '../core/game/bomb.ts';

interface Tracer {
  mesh: THREE.Mesh;
  active: boolean;
  sx: number;
  sy: number;
  sz: number;
  dx: number;
  dy: number;
  dz: number;
  len: number;
  age: number;
}

interface Particle {
  mesh: THREE.Mesh;
  active: boolean;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  grav: number;
  size: number;
}

interface Flash {
  mesh: THREE.Mesh;
  life: number;
}

const TRACER_SPEED = 420;
const TRACER_TAIL = 4.5;

/** Pooled short-lived effects: tracers, impact dust, blood, bullet holes, flashes, explosion. */
export class Effects {
  readonly group = new THREE.Group();
  private tracers: Tracer[] = [];
  private particles: Particle[] = [];
  private decals: THREE.Mesh[] = [];
  private decalIdx = 0;
  private flashes: Flash[] = [];
  private glow: THREE.Texture;
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private matDust: THREE.MeshBasicMaterial;
  private matSpark: THREE.MeshBasicMaterial;
  private matBlood: THREE.MeshBasicMaterial;
  private fire: THREE.Mesh;
  private fireMat: THREE.MeshBasicMaterial;
  private fireT = -1;
  private smoke: THREE.Mesh[] = [];
  private tmpV = new THREE.Vector3();
  /** screen shake amplitude (metres) read by the camera controller */
  shake = 0;
  /** 0..1 white flash on explosion, read by the HUD */
  whiteout = 0;

  constructor() {
    this.glow = glowTexture();

    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mats.push(tracerMat);
    const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
    this.geos.push(tracerGeo);
    for (let i = 0; i < 64; i++) {
      const mesh = new THREE.Mesh(tracerGeo, tracerMat);
      mesh.visible = false;
      this.group.add(mesh);
      this.tracers.push({ mesh, active: false, sx: 0, sy: 0, sz: 0, dx: 0, dy: 0, dz: 1, len: 1, age: 0 });
    }

    this.matDust = new THREE.MeshBasicMaterial({ color: 0xd6c095 });
    this.matSpark = new THREE.MeshBasicMaterial({ color: 0xffd27a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    this.matBlood = new THREE.MeshBasicMaterial({ color: 0x9a1212 });
    this.mats.push(this.matDust, this.matSpark, this.matBlood);
    const pGeo = new THREE.BoxGeometry(1, 1, 1);
    this.geos.push(pGeo);
    for (let i = 0; i < 160; i++) {
      const mesh = new THREE.Mesh(pGeo, this.matDust);
      mesh.visible = false;
      this.group.add(mesh);
      this.particles.push({ mesh, active: false, vx: 0, vy: 0, vz: 0, life: 0, max: 1, grav: 9, size: 0.06 });
    }

    const decalMat = new THREE.MeshBasicMaterial({ color: 0x14110d, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mats.push(decalMat);
    const decalGeo = new THREE.PlaneGeometry(0.13, 0.13);
    this.geos.push(decalGeo);
    for (let i = 0; i < 64; i++) {
      const m = new THREE.Mesh(decalGeo, decalMat);
      m.visible = false;
      this.group.add(m);
      this.decals.push(m);
    }

    const flashMat = new THREE.MeshBasicMaterial({ map: this.glow, color: 0xffd08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mats.push(flashMat);
    const flashGeo = new THREE.PlaneGeometry(0.7, 0.7);
    this.geos.push(flashGeo);
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(flashGeo, flashMat);
      mesh.visible = false;
      this.group.add(mesh);
      this.flashes.push({ mesh, life: 0 });
    }

    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xffa640, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mats.push(this.fireMat);
    const fireGeo = new THREE.SphereGeometry(1, 18, 12);
    this.geos.push(fireGeo);
    this.fire = new THREE.Mesh(fireGeo, this.fireMat);
    this.fire.visible = false;
    this.group.add(this.fire);
    const smokeMat = new THREE.MeshBasicMaterial({ map: this.glow, color: 0x6a5a48, transparent: true, opacity: 0.0, depthWrite: false });
    this.mats.push(smokeMat);
    const smokeGeo = new THREE.PlaneGeometry(1, 1);
    this.geos.push(smokeGeo);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(smokeGeo, smokeMat.clone());
      this.mats.push(m.material as THREE.Material);
      m.visible = false;
      this.group.add(m);
      this.smoke.push(m);
    }
  }

  /** Bullet streak from the muzzle towards the impact point. */
  tracer(sx: number, sy: number, sz: number, ex: number, ey: number, ez: number): void {
    const t = this.tracers.find((q) => !q.active);
    if (!t) return;
    const dx = ex - sx;
    const dy = ey - sy;
    const dz = ez - sz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1) return;
    t.active = true;
    t.sx = sx;
    t.sy = sy;
    t.sz = sz;
    t.dx = dx / len;
    t.dy = dy / len;
    t.dz = dz / len;
    t.len = len;
    t.age = 0;
    t.mesh.visible = true;
  }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, mat: THREE.Material, grav = 9): void {
    const p = this.particles.find((q) => !q.active);
    if (!p) return;
    p.active = true;
    p.mesh.material = mat;
    p.mesh.position.set(x, y, z);
    p.mesh.scale.setScalar(size);
    p.mesh.visible = true;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = life;
    p.max = life;
    p.grav = grav;
    p.size = size;
  }

  /** Dust puff + sparks + bullet hole where a bullet hit geometry. */
  impact(x: number, y: number, z: number, nx: number, ny: number, nz: number): void {
    for (let i = 0; i < 5; i++) {
      this.spawn(x, y, z, nx * 1.5 + (Math.random() - 0.5) * 2.2, ny * 1.5 + Math.random() * 1.6, nz * 1.5 + (Math.random() - 0.5) * 2.2, 0.35 + Math.random() * 0.25, 0.05 + Math.random() * 0.05, this.matDust, 6);
    }
    for (let i = 0; i < 2; i++) {
      this.spawn(x, y, z, nx * 3 + (Math.random() - 0.5) * 3, ny * 3 + Math.random() * 2, nz * 3 + (Math.random() - 0.5) * 3, 0.12, 0.025, this.matSpark, 4);
    }
    const d = this.decals[this.decalIdx++ % this.decals.length];
    d.visible = true;
    d.position.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
    this.tmpV.set(x + nx, y + ny, z + nz);
    d.lookAt(this.tmpV);
  }

  blood(x: number, y: number, z: number, dx: number, dy: number, dz: number): void {
    for (let i = 0; i < 9; i++) {
      this.spawn(x, y, z, -dx * 1.5 + (Math.random() - 0.5) * 3, -dy * 1.5 + Math.random() * 2.5, -dz * 1.5 + (Math.random() - 0.5) * 3, 0.45 + Math.random() * 0.3, 0.04 + Math.random() * 0.05, this.matBlood, 9);
    }
  }

  muzzleFlash(x: number, y: number, z: number): void {
    const f = this.flashes.find((q) => q.life <= 0);
    if (!f) return;
    f.life = 0.055;
    f.mesh.visible = true;
    f.mesh.position.set(x, y, z);
    const s = 0.6 + Math.random() * 0.5;
    f.mesh.scale.set(s, s, s);
  }

  explosion(x: number, y: number, z: number): void {
    this.fire.position.set(x, y + 1, z);
    this.fireT = 0;
    this.fire.visible = true;
    this.shake = 0.6;
    this.whiteout = 1;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 16;
      this.spawn(x, y + 0.5, z, Math.cos(a) * sp, 4 + Math.random() * 14, Math.sin(a) * sp, 0.9 + Math.random() * 0.9, 0.1 + Math.random() * 0.25, Math.random() < 0.5 ? this.matSpark : this.matDust, 10);
    }
    this.smoke.forEach((m, i) => {
      m.visible = true;
      m.position.set(x + (Math.random() - 0.5) * 3, y + 1 + i * 0.6, z + (Math.random() - 0.5) * 3);
      m.userData.t = -i * 0.05;
    });
  }

  clearAll(): void {
    for (const t of this.tracers) {
      t.active = false;
      t.mesh.visible = false;
    }
    for (const p of this.particles) {
      p.active = false;
      p.mesh.visible = false;
    }
    for (const d of this.decals) d.visible = false;
    for (const f of this.flashes) {
      f.life = 0;
      f.mesh.visible = false;
    }
    this.fire.visible = false;
    this.fireT = -1;
    this.smoke.forEach((m) => (m.visible = false));
    this.shake = 0;
    this.whiteout = 0;
  }

  update(dt: number, camera: THREE.Camera): void {
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.age += dt;
      const head = Math.min(t.len, t.age * TRACER_SPEED);
      const tail = Math.max(0, head - TRACER_TAIL);
      if (tail >= t.len - 0.01 || t.age > 0.5) {
        t.active = false;
        t.mesh.visible = false;
        continue;
      }
      const mid = (head + tail) / 2;
      t.mesh.position.set(t.sx + t.dx * mid, t.sy + t.dy * mid, t.sz + t.dz * mid);
      this.tmpV.set(t.sx + t.dx * head, t.sy + t.dy * head, t.sz + t.dz * head);
      t.mesh.lookAt(this.tmpV);
      t.mesh.scale.set(1, 1, Math.max(0.05, head - tail));
    }
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vy -= p.grav * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(p.size * (0.4 + 0.6 * (p.life / p.max)));
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) f.mesh.visible = false;
      else f.mesh.quaternion.copy(camera.quaternion);
    }
    if (this.fireT >= 0) {
      this.fireT += dt;
      const k = this.fireT / 0.9;
      if (k >= 1) {
        this.fire.visible = false;
        this.fireT = -1;
      } else {
        const s = 2 + k * 15;
        this.fire.scale.setScalar(s);
        this.fireMat.opacity = (1 - k) * 0.85;
      }
    }
    this.smoke.forEach((m) => {
      if (!m.visible) return;
      const t = (m.userData.t as number) + dt;
      m.userData.t = t;
      if (t < 0) return;
      const k = t / 4;
      if (k >= 1) {
        m.visible = false;
        return;
      }
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.sin(k * Math.PI) * 0.6;
      m.scale.setScalar(4 + k * 10);
      m.position.y += dt * 1.2;
      m.quaternion.copy(camera.quaternion);
    });
    this.shake = Math.max(0, this.shake - dt * 0.9);
    this.whiteout = Math.max(0, this.whiteout - dt * 1.1);
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.glow.dispose();
  }
}

/** The C4: a small box with a blinking LED and a display. */
export class BombModel {
  readonly group = new THREE.Group();
  private led: THREE.Mesh;
  private ledMat: THREE.MeshBasicMaterial;
  private blink = 0;

  constructor() {
    const mat = vertexColorMaterial();
    const add = (w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh => {
      const m = new THREE.Mesh(boxGeo(w, h, d, color), mat);
      m.position.set(x, y, z);
      this.group.add(m);
      return m;
    };
    add(0.52, 0.16, 0.3, 0x2a3324, 0, 0.08, 0);
    add(0.5, 0.03, 0.06, 0xd6b32a, 0, 0.175, 0.09);
    add(0.5, 0.03, 0.06, 0xd6b32a, 0, 0.175, -0.09);
    add(0.2, 0.025, 0.09, 0x1c3a1c, -0.12, 0.185, 0);
    add(0.06, 0.02, 0.2, 0x111111, 0.14, 0.175, 0);
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0x551111 });
    this.led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), this.ledMat);
    this.led.position.set(0.2, 0.19, 0.08);
    this.group.add(this.led);
    this.group.visible = false;
  }

  /** Flash the LED when the sim reports a beep. */
  beep(): void {
    this.blink = 0.09;
  }

  update(bomb: BombState, dt: number): void {
    const show = bomb.state === 'dropped' || bomb.state === 'planted';
    this.group.visible = show;
    if (!show) return;
    this.group.position.set(bomb.pos.x, bomb.pos.y, bomb.pos.z);
    this.blink = Math.max(0, this.blink - dt);
    this.ledMat.color.setHex(bomb.state === 'planted' && this.blink > 0 ? 0xff2222 : 0x551111);
  }

  dispose(): void {
    this.led.geometry.dispose();
    this.ledMat.dispose();
  }
}
