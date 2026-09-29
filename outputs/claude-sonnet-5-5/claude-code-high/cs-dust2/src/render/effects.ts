// Short-lived world effects: bullet tracers, impact dust / blood particles, bullet-hole decals,
// and the C4 mesh. Everything is pooled (no per-shot allocation of meshes).

import * as THREE from 'three';
import type { Vec3 } from '../sim/math.ts';
import { mkBox } from './weaponModels.ts';

interface Tracer {
  mesh: THREE.Mesh;
  life: number;
  max: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  max: number;
  grav: number;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class Effects {
  readonly group = new THREE.Group();
  private tracers: Tracer[] = [];
  private particles: Particle[] = [];
  private decals: THREE.Mesh[] = [];
  private decalIdx = 0;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();

  readonly bomb = new THREE.Group();
  private bombLed: THREE.Mesh;
  private bombLedMat: THREE.MeshBasicMaterial;
  private explosion: { mesh: THREE.Mesh; age: number } | null = null;

  constructor() {
    const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe7a0, transparent: true, opacity: 0.9 });
      const m = new THREE.Mesh(tracerGeo, mat);
      m.visible = false;
      this.group.add(m);
      this.tracers.push({ mesh: m, life: 0, max: 0.06 });
    }
    const pGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 90; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xd8c39a, transparent: true, opacity: 1 });
      const m = new THREE.Mesh(pGeo, mat);
      m.visible = false;
      this.group.add(m);
      this.particles.push({ mesh: m, vel: new THREE.Vector3(), life: 0, max: 0.4, grav: 9 });
    }
    const dGeo = new THREE.PlaneGeometry(0.16, 0.16);
    const dMat = new THREE.MeshBasicMaterial({ color: 0x1c1a16, transparent: true, opacity: 0.75, depthWrite: false });
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(dGeo, dMat);
      m.visible = false;
      this.group.add(m);
      this.decals.push(m);
    }

    // C4: olive brick with a blinking red LED and a display strip
    this.bomb.add(mkBox(0.46, 0.13, 0.3, 0x3e4b2b, 0, 0.065, 0));
    this.bomb.add(mkBox(0.3, 0.02, 0.1, 0x101410, 0, 0.14, 0.05));
    this.bomb.add(mkBox(0.06, 0.03, 0.03, 0x8a2a1a, -0.15, 0.14, -0.09));
    this.bombLedMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    this.bombLed = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), this.bombLedMat);
    this.bombLed.position.set(0.15, 0.15, -0.08);
    this.bomb.add(this.bombLed);
    this.bomb.visible = false;
    this.group.add(this.bomb);
  }

  tracer(from: Vec3, to: Vec3, color = 0xffe7a0): void {
    const t = this.tracers.find((q) => q.life <= 0);
    if (!t) return;
    const a = this.tmpA.set(from.x, from.y, from.z);
    const b = this.tmpB.set(to.x, to.y, to.z);
    const len = a.distanceTo(b);
    if (len < 0.5) return;
    t.mesh.visible = true;
    t.mesh.position.copy(a).add(b).multiplyScalar(0.5);
    t.mesh.scale.set(0.012, 0.012, len);
    t.mesh.lookAt(b);
    (t.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    (t.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
    t.life = t.max = 0.07;
  }

  private spawn(pos: THREE.Vector3, vel: THREE.Vector3, size: number, color: number, life: number, grav: number): void {
    const p = this.particles.find((q) => q.life <= 0);
    if (!p) return;
    p.mesh.visible = true;
    p.mesh.position.copy(pos);
    p.mesh.scale.setScalar(size);
    (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
    p.vel.copy(vel);
    p.life = p.max = life;
    p.grav = grav;
  }

  impact(pos: Vec3, normal: Vec3): void {
    const p = this.tmpA.set(pos.x, pos.y, pos.z);
    const n = this.tmpB.set(normal.x, normal.y, normal.z);
    for (let i = 0; i < 6; i++) {
      const v = new THREE.Vector3(
        n.x * 2 + (Math.random() - 0.5) * 2.5,
        n.y * 2 + Math.random() * 1.5,
        n.z * 2 + (Math.random() - 0.5) * 2.5,
      );
      this.spawn(p, v, 0.03 + Math.random() * 0.03, 0xd9c8a0, 0.35 + Math.random() * 0.2, 8);
    }
    const d = this.decals[this.decalIdx++ % this.decals.length];
    d.visible = true;
    d.position.set(pos.x + normal.x * 0.012, pos.y + normal.y * 0.012, pos.z + normal.z * 0.012);
    this.tmpQ.setFromUnitVectors(Z_AXIS, n);
    d.quaternion.copy(this.tmpQ);
    d.rotateZ(Math.random() * Math.PI);
  }

  blood(pos: Vec3, dir: Vec3, head: boolean): void {
    const p = this.tmpA.set(pos.x, pos.y, pos.z);
    const count = head ? 12 : 8;
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(
        -dir.x * 1.2 + (Math.random() - 0.5) * 3,
        Math.random() * 2.2,
        -dir.z * 1.2 + (Math.random() - 0.5) * 3,
      );
      this.spawn(p, v, 0.035 + Math.random() * 0.03, 0xa50e0e, 0.45 + Math.random() * 0.25, 10);
    }
  }

  explode(pos: Vec3): void {
    const geo = new THREE.SphereGeometry(1, 16, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y + 0.5, pos.z);
    this.group.add(mesh);
    this.explosion = { mesh, age: 0 };
    for (let i = 0; i < 40; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 16, Math.random() * 12, (Math.random() - 0.5) * 16);
      this.spawn(this.tmpA.set(pos.x, pos.y + 0.6, pos.z), v, 0.15 + Math.random() * 0.2, Math.random() < 0.5 ? 0xff9a2a : 0x3a3a3a, 1 + Math.random(), 6);
    }
  }

  clearDynamic(): void {
    for (const t of this.tracers) {
      t.life = 0;
      t.mesh.visible = false;
    }
    for (const p of this.particles) {
      p.life = 0;
      p.mesh.visible = false;
    }
    for (const d of this.decals) d.visible = false;
    if (this.explosion) {
      this.group.remove(this.explosion.mesh);
      this.explosion = null;
    }
  }

  setBomb(visible: boolean, pos: Vec3, planted: boolean, simT: number): void {
    this.bomb.visible = visible;
    if (!visible) return;
    this.bomb.position.set(pos.x, pos.y, pos.z);
    const blink = planted ? (Math.floor(simT * 2.5) % 2 === 0 ? 1 : 0.15) : 1;
    this.bombLedMat.color.setRGB(blink, 0.1 * blink, 0.05 * blink);
  }

  update(dt: number): void {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
      else (t.mesh.material as THREE.MeshBasicMaterial).opacity = (t.life / t.max) * 0.9;
    }
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= p.grav * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.02) {
        p.mesh.position.y = 0.02;
        p.vel.multiplyScalar(0.3);
      }
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, p.life / p.max + 0.2);
    }
    if (this.explosion) {
      const e = this.explosion;
      e.age += dt;
      const s = 1 + e.age * 22;
      e.mesh.scale.setScalar(Math.min(s, 20));
      (e.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - e.age * 1.1);
      if (e.age > 1) {
        this.group.remove(e.mesh);
        e.mesh.geometry.dispose();
        (e.mesh.material as THREE.Material).dispose();
        this.explosion = null;
      }
    }
  }
}
