import * as THREE from 'three';
import type { Vec3 } from '../core/vec';

export const C4_TIMER = 40;
export const PLANT_TIME = 3.2;
export const DEFUSE_TIME = 7;
export const C4_EXPLOSION_RADIUS = 17;
export const C4_MAX_DAMAGE = 500;

export type C4State = 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded';

/** The bomb: carried by a T, dropped on death, planted at a site, defused or exploded. */
export class C4 {
  state: C4State = 'dropped';
  carrierId = -1;
  pos: Vec3 = { x: 0, y: 0, z: 0 };
  site: 'A' | 'B' | null = null;
  plantedAt = 0;
  explodeAt = 0;
  readonly mesh: THREE.Group;
  private readonly led: THREE.Mesh;
  private readonly ledMat: THREE.MeshBasicMaterial;
  private readonly light: THREE.PointLight;
  private nextBeep = 0;

  constructor() {
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.24), new THREE.MeshLambertMaterial({ color: 0x55584f }));
    body.position.y = 0.07;
    body.castShadow = true;
    this.mesh.add(body);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.26), new THREE.MeshLambertMaterial({ color: 0x2c2a26 }));
    tape.position.y = 0.09;
    this.mesh.add(tape);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.1), new THREE.MeshLambertMaterial({ color: 0x1a1d1a }));
    panel.position.set(0.05, 0.15, 0);
    this.mesh.add(panel);
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    this.led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.03), this.ledMat);
    this.led.position.set(-0.1, 0.155, 0.06);
    this.mesh.add(this.led);
    this.light = new THREE.PointLight(0xff2020, 0, 4);
    this.light.position.set(0, 0.4, 0);
    this.mesh.add(this.light);
    this.mesh.visible = false;
  }

  reset() {
    this.state = 'dropped';
    this.carrierId = -1;
    this.site = null;
    this.mesh.visible = false;
    this.nextBeep = 0;
  }

  giveTo(carrierId: number) {
    this.state = 'carried';
    this.carrierId = carrierId;
    this.mesh.visible = false;
  }

  drop(pos: Vec3) {
    this.state = 'dropped';
    this.carrierId = -1;
    this.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.mesh.position.set(pos.x, pos.y + 0.02, pos.z);
    this.mesh.rotation.set(0, Math.random() * Math.PI, 0);
    this.mesh.visible = true;
    this.light.intensity = 0;
  }

  plant(pos: Vec3, site: 'A' | 'B', now: number) {
    this.state = 'planted';
    this.carrierId = -1;
    this.site = site;
    this.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.plantedAt = now;
    this.explodeAt = now + C4_TIMER;
    this.nextBeep = now;
    this.mesh.position.set(pos.x, pos.y + 0.02, pos.z);
    this.mesh.rotation.set(0, Math.random() * Math.PI, 0);
    this.mesh.visible = true;
  }

  timeLeft(now: number): number {
    return this.state === 'planted' ? Math.max(0, this.explodeAt - now) : 0;
  }

  /** Blink & return true when a beep should be played this frame. */
  update(now: number): boolean {
    if (this.state !== 'planted') return false;
    const left = this.timeLeft(now);
    // Beep interval accelerates as the timer runs down
    const interval = Math.max(0.12, Math.min(1.0, left / C4_TIMER) * 1.0);
    let beep = false;
    if (now >= this.nextBeep) {
      beep = true;
      this.nextBeep = now + interval;
    }
    const phase = (now - this.plantedAt) % interval;
    const on = phase < Math.min(0.1, interval * 0.5);
    this.ledMat.color.setHex(on ? 0xff3030 : 0x400000);
    this.light.intensity = on ? 1.5 : 0;
    return beep;
  }

  setDefused() {
    this.state = 'defused';
    this.ledMat.color.setHex(0x20ff40);
    this.light.color.setHex(0x20ff40);
    this.light.intensity = 0.8;
  }

  setExploded() {
    this.state = 'exploded';
    this.mesh.visible = false;
    this.light.intensity = 0;
  }
}
