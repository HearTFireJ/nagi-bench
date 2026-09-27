import * as THREE from 'three';
import type { Vec3 } from '../core/vec';

interface Tracer {
  line: THREE.Line;
  until: number;
  born: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  until: number;
  born: number;
  gravity: number;
}

/** Bullet tracers, impact sparks, blood puffs, explosion flash. Pooled and cheap. */
export class Effects {
  readonly group = new THREE.Group();
  private tracers: Tracer[] = [];
  private particles: Particle[] = [];
  private tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  private sparkGeo = new THREE.SphereGeometry(0.05, 5, 4);
  private sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd080 });
  private dustMat = new THREE.MeshBasicMaterial({ color: 0xc9b28a, transparent: true, opacity: 0.8 });
  private bloodMat = new THREE.MeshBasicMaterial({ color: 0x9b1414 });
  private explosionLight = new THREE.PointLight(0xffa040, 0, 60);
  private explosionUntil = 0;
  private explosionSphere: THREE.Mesh;

  constructor() {
    this.group.add(this.explosionLight);
    this.explosionSphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.8 }),
    );
    this.explosionSphere.visible = false;
    this.group.add(this.explosionSphere);
  }

  tracer(from: Vec3, to: Vec3, now: number) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(to.x, to.y, to.z)]);
    const line = new THREE.Line(geo, this.tracerMat);
    this.group.add(line);
    this.tracers.push({ line, until: now + 0.07, born: now });
  }

  impact(p: Vec3, n: Vec3, now: number) {
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, i < 2 ? this.sparkMat : this.dustMat);
      mesh.position.set(p.x + n.x * 0.03, p.y + n.y * 0.03, p.z + n.z * 0.03);
      const s = i < 2 ? 0.5 : 1.4 + Math.random();
      mesh.scale.setScalar(s);
      const vel = new THREE.Vector3(n.x + (Math.random() - 0.5) * 1.2, n.y + Math.random() * 0.8, n.z + (Math.random() - 0.5) * 1.2).multiplyScalar(i < 2 ? 3 : 0.8);
      this.group.add(mesh);
      this.particles.push({ mesh, vel, until: now + (i < 2 ? 0.25 : 0.5), born: now, gravity: i < 2 ? 12 : 0.5 });
    }
  }

  blood(p: Vec3, now: number) {
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, this.bloodMat);
      mesh.position.set(p.x, p.y, p.z);
      mesh.scale.setScalar(0.6 + Math.random() * 0.8);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3);
      this.group.add(mesh);
      this.particles.push({ mesh, vel, until: now + 0.45, born: now, gravity: 9 });
    }
  }

  explosion(p: Vec3, now: number) {
    this.explosionLight.position.set(p.x, p.y + 1.5, p.z);
    this.explosionLight.intensity = 40;
    this.explosionUntil = now + 1.2;
    this.explosionSphere.position.set(p.x, p.y + 1, p.z);
    this.explosionSphere.scale.setScalar(0.5);
    this.explosionSphere.visible = true;
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, i % 3 === 0 ? this.sparkMat : this.dustMat);
      mesh.position.set(p.x, p.y + 0.5, p.z);
      mesh.scale.setScalar(2 + Math.random() * 4);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 16, Math.random() * 14, (Math.random() - 0.5) * 16);
      this.group.add(mesh);
      this.particles.push({ mesh, vel, until: now + 1.2 + Math.random(), born: now, gravity: 6 });
    }
  }

  update(dt: number, now: number) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      if (now >= t.until) {
        this.group.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (now >= p.until) {
        this.group.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const life = (now - p.born) / (p.until - p.born);
      p.mesh.scale.multiplyScalar(1 - dt * 1.5 * life);
    }
    if (this.explosionUntil > 0) {
      const t = 1 - Math.max(0, (this.explosionUntil - now) / 1.2);
      this.explosionLight.intensity = 40 * (1 - t);
      this.explosionSphere.scale.setScalar(0.5 + t * 9);
      (this.explosionSphere.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
      if (now >= this.explosionUntil) {
        this.explosionUntil = 0;
        this.explosionLight.intensity = 0;
        this.explosionSphere.visible = false;
      }
    }
  }

  clear() {
    for (const t of this.tracers) {
      this.group.remove(t.line);
      t.line.geometry.dispose();
    }
    for (const p of this.particles) this.group.remove(p.mesh);
    this.tracers = [];
    this.particles = [];
  }
}
