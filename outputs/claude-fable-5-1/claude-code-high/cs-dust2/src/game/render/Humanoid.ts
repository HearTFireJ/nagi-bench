import * as THREE from 'three';
import type { Team, WeaponModelStyle } from '../weapons/WeaponDefs';
import { buildMuzzleFlash, buildWeaponModel, type WeaponModel } from './WeaponModels';
import { makeNameTexture } from './Textures';

interface TeamPalette {
  torso: number;
  vest: number;
  legs: number;
  sleeve: number;
  skin: number;
  headgear: number;
  boots: number;
}

const PALETTES: Record<Team, TeamPalette> = {
  CT: { torso: 0x2c3e6b, vest: 0x3d5286, legs: 0x1e2a45, sleeve: 0x2c3e6b, skin: 0xc9a27e, headgear: 0x1a2338, boots: 0x111318 },
  T: { torso: 0x8a6d46, vest: 0x6d5536, legs: 0x5c4b36, sleeve: 0xc9a27e, skin: 0xc9a27e, headgear: 0xb0292b, boots: 0x2a221a },
};

const materialCache = new Map<number, THREE.MeshLambertMaterial>();
function mat(color: number): THREE.MeshLambertMaterial {
  let m = materialCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    materialCache.set(color, m);
  }
  return m;
}

function part(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}

/**
 * A blocky humanoid with an articulated head, torso, two arms (upper + forearm) and two
 * legs, holding a weapon in a rifle pose. Feet are at the group origin, forward is -Z.
 */
export class Humanoid {
  readonly group = new THREE.Group();
  private readonly upper = new THREE.Group(); // pivots at the hips
  private readonly arms = new THREE.Group(); // pivots at the shoulders
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly shoulderL = new THREE.Group();
  private readonly shoulderR = new THREE.Group();
  private readonly elbowL = new THREE.Group();
  private readonly elbowR = new THREE.Group();
  private readonly weaponSlot = new THREE.Group();
  private readonly flash: THREE.Mesh;
  private weapon: WeaponModel | null = null;
  private nameSprite: THREE.Sprite | null = null;
  private walkPhase = 0;
  private flashUntil = 0;
  private deathT = -1;
  private hitFlashMeshes: THREE.Mesh[] = [];
  private hitFlashUntil = 0;
  private team: Team;

  constructor(team: Team, name: string) {
    this.team = team;
    const p = PALETTES[team];
    // Legs (pivot at hip, 0.85m)
    for (const [grp, sx] of [
      [this.legL, -0.14],
      [this.legR, 0.14],
    ] as [THREE.Group, number][]) {
      grp.position.set(sx, 0.85, 0);
      grp.add(part(0.22, 0.5, 0.24, p.legs, 0, -0.25, 0)); // thigh
      grp.add(part(0.2, 0.35, 0.22, p.legs, 0, -0.65, 0)); // shin
      grp.add(part(0.22, 0.1, 0.3, p.boots, 0, -0.8, -0.03)); // boot
      this.group.add(grp);
    }
    // Upper body
    this.upper.position.set(0, 0.85, 0);
    this.group.add(this.upper);
    this.upper.add(part(0.5, 0.6, 0.28, p.torso, 0, 0.3, 0)); // torso
    this.upper.add(part(0.42, 0.34, 0.06, p.vest, 0, 0.36, -0.16)); // chest plate / vest
    this.upper.add(part(0.46, 0.08, 0.3, team === 'CT' ? 0x141a2b : 0x3a2f24, 0, 0.02, 0)); // belt
    // Head
    const head = new THREE.Group();
    head.position.set(0, 0.6, 0);
    head.add(part(0.26, 0.26, 0.26, p.skin, 0, 0.13, 0));
    head.add(part(0.2, 0.05, 0.02, 0x2a1d14, 0, 0.16, -0.135)); // brow / eyes strip
    if (team === 'CT') {
      head.add(part(0.3, 0.14, 0.3, p.headgear, 0, 0.22, 0)); // helmet
      head.add(part(0.24, 0.05, 0.02, 0x66ccff, 0, 0.17, -0.15)); // visor
    } else {
      head.add(part(0.28, 0.06, 0.28, p.headgear, 0, 0.23, 0)); // bandana
      head.add(part(0.06, 0.14, 0.02, p.headgear, 0.1, 0.17, 0.15)); // bandana tail
      head.add(part(0.24, 0.1, 0.02, 0x3a2f28, 0, 0.07, -0.135)); // face mask
    }
    this.upper.add(head);
    // Arms
    this.arms.position.set(0, 0.55, 0);
    this.upper.add(this.arms);
    this.buildArm(this.shoulderL, this.elbowL, -0.32, p);
    this.buildArm(this.shoulderR, this.elbowR, 0.32, p);
    // Weapon in front of the chest
    this.weaponSlot.position.set(0.14, -0.12, -0.28);
    this.arms.add(this.weaponSlot);
    this.flash = buildMuzzleFlash();
    this.weaponSlot.add(this.flash);
    this.setRiflePose();
    this.setName(name);
  }

  private buildArm(shoulder: THREE.Group, elbow: THREE.Group, x: number, p: TeamPalette) {
    shoulder.position.set(x, 0, 0);
    shoulder.add(part(0.15, 0.3, 0.15, p.torso, 0, -0.15, 0)); // upper arm (sleeve)
    elbow.position.set(0, -0.3, 0);
    elbow.add(part(0.13, 0.28, 0.13, p.sleeve, 0, -0.14, 0)); // forearm
    elbow.add(part(0.12, 0.1, 0.12, p.skin, 0, -0.32, 0)); // hand
    shoulder.add(elbow);
    this.arms.add(shoulder);
  }

  private setRiflePose() {
    // Right arm: forward, holding the grip
    this.shoulderR.rotation.set(1.05, 0, 0.15);
    this.elbowR.rotation.set(0.9, 0, 0);
    // Left arm: reaches forward-inward to the handguard
    this.shoulderL.rotation.set(1.35, 0.5, -0.25);
    this.elbowL.rotation.set(0.55, 0, 0);
  }

  private setPistolPose() {
    this.shoulderR.rotation.set(1.45, 0, 0.1);
    this.elbowR.rotation.set(0.15, 0, 0);
    this.shoulderL.rotation.set(1.3, 0.45, -0.35);
    this.elbowL.rotation.set(0.35, 0, 0);
  }

  private setKnifePose() {
    this.shoulderR.rotation.set(0.9, 0, 0.2);
    this.elbowR.rotation.set(1.4, 0, 0);
    this.shoulderL.rotation.set(0.5, 0.2, -0.3);
    this.elbowL.rotation.set(0.6, 0, 0);
  }

  setWeapon(style: WeaponModelStyle | null) {
    if (this.weapon) {
      this.weaponSlot.remove(this.weapon.group);
      this.weapon = null;
    }
    if (!style) return;
    this.weapon = buildWeaponModel(style);
    this.weapon.group.scale.setScalar(1.0);
    this.weaponSlot.add(this.weapon.group);
    this.flash.position.copy(this.weapon.muzzle);
    if (style === 'pistol' || style === 'deagle') {
      this.setPistolPose();
      this.weaponSlot.position.set(0.16, -0.05, -0.36);
    } else if (style === 'knife') {
      this.setKnifePose();
      this.weaponSlot.position.set(0.22, -0.2, -0.28);
    } else {
      this.setRiflePose();
      this.weaponSlot.position.set(0.14, -0.12, -0.28);
    }
  }

  setName(name: string) {
    if (this.nameSprite) {
      this.group.remove(this.nameSprite);
      (this.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
      this.nameSprite.material.dispose();
    }
    const tex = makeNameTexture(name, this.team === 'CT' ? '#8fd3ff' : '#ffcf7a');
    const sm = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    this.nameSprite = new THREE.Sprite(sm);
    this.nameSprite.scale.set(1.2, 0.3, 1);
    this.nameSprite.position.set(0, 2.05, 0);
    this.nameSprite.visible = false;
    this.group.add(this.nameSprite);
  }

  setNameVisible(v: boolean) {
    if (this.nameSprite) this.nameSprite.visible = v;
  }

  /** Update transform & animation. speed is horizontal m/s. */
  update(dt: number, now: number, x: number, y: number, z: number, yaw: number, pitch: number, speed: number) {
    if (this.deathT >= 0) {
      const t = Math.min(1, (now - this.deathT) / 0.5);
      const e = 1 - (1 - t) * (1 - t);
      this.group.position.set(x, y + 0.12 * e, z);
      this.group.rotation.set(e * Math.PI * 0.5, yaw, 0, 'YXZ');
      return;
    }
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, yaw, 0, 'YXZ');
    // body pitch: part of the aim goes into the torso, the rest into the arms
    this.upper.rotation.x = pitch * 0.3;
    this.arms.rotation.x = pitch * 0.7;
    // walking
    const moving = speed > 0.3;
    if (moving) {
      this.walkPhase += dt * Math.min(12, speed * 2.4);
      const s = Math.sin(this.walkPhase) * Math.min(1, speed / 4) * 0.7;
      this.legL.rotation.x = s;
      this.legR.rotation.x = -s;
      this.upper.position.y = 0.85 + Math.abs(Math.cos(this.walkPhase)) * 0.03;
    } else {
      this.legL.rotation.x *= 0.8;
      this.legR.rotation.x *= 0.8;
      this.upper.position.y = 0.85 + Math.sin(now * 1.5) * 0.005;
    }
    if (this.flash.visible && now > this.flashUntil) this.flash.visible = false;
    if (this.hitFlashUntil > 0 && now > this.hitFlashUntil) {
      this.hitFlashUntil = 0;
      for (const m of this.hitFlashMeshes) {
        const mm = m.material as THREE.MeshLambertMaterial;
        mm.emissive.setHex(0x000000);
      }
    }
  }

  fireFlash(now: number) {
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.6);
    this.flashUntil = now + 0.05;
  }

  /** World-space muzzle position (falls back to chest height when no weapon). */
  getMuzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    if (this.weapon) {
      out.copy(this.weapon.muzzle);
      this.weapon.group.localToWorld(out);
    } else {
      out.set(0, 1.3, -0.4);
      this.group.localToWorld(out);
    }
    return out;
  }

  /** Brief red tint when damaged (materials are cloned lazily on first hit). */
  hitFlash(now: number) {
    if (this.hitFlashMeshes.length === 0) {
      this.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.material instanceof THREE.MeshLambertMaterial && !(o.parent === this.weaponSlot || this.isWeaponPart(o))) {
          m.material = m.material.clone();
          this.hitFlashMeshes.push(m);
        }
      });
    }
    for (const m of this.hitFlashMeshes) (m.material as THREE.MeshLambertMaterial).emissive.setHex(0x661111);
    this.hitFlashUntil = now + 0.12;
  }

  private isWeaponPart(o: THREE.Object3D): boolean {
    let p: THREE.Object3D | null = o;
    while (p) {
      if (p === this.weaponSlot) return true;
      p = p.parent;
    }
    return false;
  }

  die(now: number) {
    this.deathT = now;
    this.setNameVisible(false);
  }

  revive() {
    this.deathT = -1;
    this.group.rotation.set(0, 0, 0);
    this.legL.rotation.x = 0;
    this.legR.rotation.x = 0;
  }

  get isDead() {
    return this.deathT >= 0;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    if (this.nameSprite) {
      (this.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
      this.nameSprite.material.dispose();
    }
  }
}
