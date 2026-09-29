// World props that follow simulation state: the C4 (planted / dropped, with a blinking LED) and dropped weapons.
import * as THREE from 'three';
import type { World } from '../game/world';
import { buildWeaponModel } from './weaponModels';
import { makeGlowTexture } from './textures';

export class WorldProps {
  readonly group = new THREE.Group();
  private readonly bomb = new THREE.Group();
  private readonly led: THREE.Sprite;
  private readonly glowTex = makeGlowTexture('rgba(255,70,50,1)', 'rgba(255,0,0,0)');
  private ledUntil = 0;
  private readonly drops = new Map<number, THREE.Group>();

  constructor() {
    const model = buildWeaponModel('c4');
    model.group.scale.setScalar(1.25);
    this.bomb.add(model.group);
    const mat = new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff3020, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.led = new THREE.Sprite(mat);
    this.led.scale.setScalar(0.28);
    this.led.position.set(0.075, 0.06, -0.065);
    this.bomb.add(this.led);
    this.bomb.visible = false;
    this.group.add(this.bomb);
  }

  /** Flash the LED (called on every bomb beep). */
  beep(now: number): void {
    this.ledUntil = now + 0.09;
  }

  update(world: World, now: number): void {
    const b = world.bomb;
    const onFloor = b.status === 'planted' || b.status === 'dropped';
    this.bomb.visible = onFloor;
    if (onFloor) {
      this.bomb.position.set(b.pos.x, b.pos.y + 0.05, b.pos.z);
      this.led.visible = b.status === 'planted' && now < this.ledUntil;
    }

    // Dropped weapons.
    const alive = new Set<number>();
    for (const d of world.drops) {
      alive.add(d.id);
      let g = this.drops.get(d.id);
      if (!g) {
        g = buildWeaponModel(d.weapon.id).group;
        // Lie on the side, a little rotated so a pile of drops does not look cloned.
        g.rotation.set(0, (d.id * 2.399) % (Math.PI * 2), Math.PI / 2);
        this.drops.set(d.id, g);
        this.group.add(g);
      }
      g.position.set(d.pos.x, d.pos.y + 0.08, d.pos.z);
    }
    for (const [id, g] of this.drops) {
      if (!alive.has(id)) {
        this.group.remove(g);
        this.drops.delete(id);
      }
    }
  }

  dispose(): void {
    this.glowTex.dispose();
    this.led.material.dispose();
  }
}
