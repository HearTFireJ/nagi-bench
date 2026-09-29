// Procedural humanoid built from separate boxes: head (+helmet / balaclava), neck, torso + vest,
// pelvis, two-segment arms with hands, two-segment legs with boots. No capsules or cylinders.
// Proportions match sim/hitbox.ts (feet at y=0, head centre at 1.60 m, faces -Z).

import * as THREE from 'three';
import type { Actor } from '../sim/actor.ts';
import type { Team } from '../sim/map.ts';
import { angleDelta } from '../sim/math.ts';
import type { WeaponId } from '../sim/weapons.ts';
import { buildWeapon, lambert, mkBox } from './weaponModels.ts';

interface Palette {
  top: number;
  pants: number;
  vest: number;
  vestTrim: number;
  head: number;
  headAccent: number;
  skin: number;
  boots: number;
  glove: number;
}

const PALETTES: Record<Team, Palette> = {
  // Counter-Terrorists: navy uniform, grey-blue vest, blue helmet
  CT: {
    top: 0x2f4a7a,
    pants: 0x26324a,
    vest: 0x3d4f66,
    vestTrim: 0x5db2ff,
    head: 0x22385e,
    headAccent: 0x5db2ff,
    skin: 0xd6a582,
    boots: 0x131417,
    glove: 0x1b1d22,
  },
  // Terrorists: khaki / orange-brown, dark vest, red-brown balaclava
  T: {
    top: 0xa86b2c,
    pants: 0x6a5537,
    vest: 0x4a3b28,
    vestTrim: 0xff8a2a,
    head: 0x7a2418,
    headAccent: 0xe0d7bd,
    skin: 0xc48f6b,
    boots: 0x2b2118,
    glove: 0x2a211a,
  },
};

export class CharacterModel {
  readonly root = new THREE.Group();
  private tilt = new THREE.Group();
  private upper = new THREE.Group();
  private headG = new THREE.Group();
  private aim = new THREE.Group();
  private gunHolder = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private shinL = new THREE.Group();
  private shinR = new THREE.Group();
  private forearmR = new THREE.Group();
  private armRg = new THREE.Group();
  private armLg = new THREE.Group();
  private bombPack: THREE.Mesh;
  private flash: THREE.Mesh;
  private rig: THREE.Group | null = null;
  private muzzleObj: THREE.Object3D | null = null;
  private weaponId: WeaponId | null = null;
  readonly team: Team;
  private deathDir: number;

  constructor(team: Team, id: number) {
    this.team = team;
    this.deathDir = id % 2 === 0 ? 1 : -1;
    const p = PALETTES[team];
    this.root.add(this.tilt);

    // ---- legs -----------------------------------------------------------------------------
    for (const [leg, shin, side] of [
      [this.legL, this.shinL, -1],
      [this.legR, this.shinR, 1],
    ] as [THREE.Group, THREE.Group, number][]) {
      leg.position.set(0.11 * side, 0.92, 0);
      leg.add(mkBox(0.17, 0.44, 0.19, p.pants, 0, -0.22, 0));
      shin.position.set(0, -0.44, 0);
      shin.add(mkBox(0.145, 0.38, 0.165, p.pants, 0, -0.19, 0));
      shin.add(mkBox(0.155, 0.1, 0.27, p.boots, 0, -0.43, -0.04));
      leg.add(shin);
      this.tilt.add(leg);
    }

    // ---- pelvis / belt --------------------------------------------------------------------
    this.tilt.add(mkBox(0.38, 0.18, 0.22, p.pants, 0, 0.96, 0));
    this.tilt.add(mkBox(0.39, 0.04, 0.23, 0x1b1b1b, 0, 1.03, 0));

    // ---- upper body (pivot at the waist) ------------------------------------------------------
    this.upper.position.set(0, 1.0, 0);
    this.tilt.add(this.upper);
    this.upper.add(mkBox(0.46, 0.42, 0.25, p.top, 0, 0.26, 0));
    this.upper.add(mkBox(0.48, 0.32, 0.27, p.vest, 0, 0.29, 0));
    this.upper.add(mkBox(0.49, 0.045, 0.28, p.vestTrim, 0, 0.42, 0));
    this.upper.add(mkBox(0.12, 0.1, 0.03, 0x22262b, -0.1, 0.24, -0.145));
    this.upper.add(mkBox(0.12, 0.1, 0.03, 0x22262b, 0.1, 0.24, -0.145));
    this.bombPack = mkBox(0.3, 0.22, 0.11, 0x46562f, 0, 0.3, 0.19);
    this.bombPack.add(mkBox(0.08, 0.05, 0.02, 0xd82020, 0, 0.02, 0.06));
    this.bombPack.visible = false;
    this.upper.add(this.bombPack);
    this.upper.add(mkBox(0.1, 0.06, 0.1, p.skin, 0, 0.5, 0)); // neck

    // ---- head ---------------------------------------------------------------------------------------
    this.headG.position.set(0, 0.5, 0);
    this.upper.add(this.headG);
    this.headG.add(mkBox(0.22, 0.26, 0.24, team === 'T' ? p.head : p.skin, 0, 0.1, 0));
    if (team === 'CT') {
      this.headG.add(mkBox(0.27, 0.13, 0.29, p.head, 0, 0.2, 0)); // helmet shell
      this.headG.add(mkBox(0.27, 0.03, 0.06, p.head, 0, 0.145, -0.15)); // brim
      this.headG.add(mkBox(0.2, 0.05, 0.02, 0x0e1116, 0, 0.12, -0.125)); // visor
      this.headG.add(mkBox(0.02, 0.06, 0.14, p.headAccent, 0, 0.27, 0)); // helmet stripe
    } else {
      this.headG.add(mkBox(0.17, 0.05, 0.02, p.skin, 0, 0.13, -0.125)); // eye slit
      this.headG.add(mkBox(0.245, 0.07, 0.265, p.headAccent, 0, 0.2, 0)); // keffiyeh band
      this.headG.add(mkBox(0.1, 0.16, 0.06, p.headAccent, 0, 0.0, 0.14)); // tail
    }

    // ---- arms + weapon (pivot at the shoulders so pitch rotates the aim) ----------------------------------------
    this.aim.position.set(0, 0.4, 0);
    this.upper.add(this.aim);
    this.armRg.position.set(0.28, 0, 0);
    this.armRg.rotation.set(1.3, 0, -0.32);
    this.armRg.add(mkBox(0.115, 0.29, 0.115, p.top, 0, -0.145, 0));
    this.forearmR.position.set(0, -0.29, 0);
    this.forearmR.rotation.set(0.5, 0, 0);
    this.forearmR.add(mkBox(0.1, 0.27, 0.1, p.top, 0, -0.135, 0));
    this.forearmR.add(mkBox(0.09, 0.09, 0.11, p.glove, 0, -0.31, 0));
    this.armRg.add(this.forearmR);
    this.aim.add(this.armRg);

    this.armLg.position.set(-0.28, 0, 0);
    this.armLg.rotation.set(1.3, 0, 0.55);
    this.armLg.add(mkBox(0.115, 0.29, 0.115, p.top, 0, -0.145, 0));
    const forearmL = new THREE.Group();
    forearmL.position.set(0, -0.29, 0);
    forearmL.rotation.set(0.35, 0, 0);
    forearmL.add(mkBox(0.1, 0.27, 0.1, p.top, 0, -0.135, 0));
    forearmL.add(mkBox(0.09, 0.09, 0.11, p.glove, 0, -0.31, 0));
    this.armLg.add(forearmL);
    this.aim.add(this.armLg);

    this.gunHolder.position.set(0.1, -0.1, -0.3);
    this.aim.add(this.gunHolder);

    this.flash = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xffd36b }),
    );
    this.flash.visible = false;
  }

  setWeapon(id: WeaponId): void {
    if (this.weaponId === id) return;
    this.weaponId = id;
    if (this.rig) this.gunHolder.remove(this.rig);
    const w = buildWeapon(id);
    this.rig = w.group;
    this.muzzleObj = w.muzzle;
    w.muzzle.add(this.flash);
    this.gunHolder.add(w.group);
  }

  /** World position of the current muzzle, if attached. */
  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    if (this.muzzleObj) this.muzzleObj.getWorldPosition(out);
    return out;
  }

  update(a: Actor, simT: number, alpha: number, hidden: boolean): void {
    this.root.visible = !hidden;
    if (hidden) return;
    const id = a.weapon.def.id;
    this.setWeapon(id);

    const k = a.alive ? alpha : 1;
    this.root.position.set(
      a.prev.x + (a.pos.x - a.prev.x) * k,
      a.prev.y + (a.pos.y - a.prev.y) * k,
      a.prev.z + (a.pos.z - a.prev.z) * k,
    );
    this.root.rotation.y = a.prevYaw + angleDelta(a.prevYaw, a.yaw) * k;

    if (!a.alive) {
      const f = Math.min(1, (simT - a.diedAt) / 0.45);
      const e = 1 - (1 - f) * (1 - f);
      this.tilt.rotation.x = this.deathDir * e * (Math.PI / 2 - 0.08);
      this.tilt.position.y = 0.16 * e;
      this.flash.visible = false;
      this.bombPack.visible = false;
      return;
    }
    this.tilt.rotation.x = 0;
    this.tilt.position.y = 0;

    // walk cycle
    const amp = Math.min(1, a.speed / 4.5) * 0.85;
    const ph = a.walkPhase;
    this.legL.rotation.x = Math.sin(ph) * amp;
    this.legR.rotation.x = -Math.sin(ph) * amp;
    this.shinL.rotation.x = -Math.max(0, -Math.sin(ph)) * amp * 1.1;
    this.shinR.rotation.x = -Math.max(0, Math.sin(ph)) * amp * 1.1;
    this.tilt.position.y = Math.abs(Math.sin(ph)) * 0.025 * amp;
    if (!a.onGround) {
      this.legL.rotation.x = -0.5;
      this.legR.rotation.x = 0.3;
    }

    // aiming
    const pitch = a.pitch;
    this.upper.rotation.x = pitch * 0.25;
    this.headG.rotation.x = pitch * 0.55;
    const sinceShot = simT - a.lastShotAt;
    const kick = sinceShot < 0.12 ? (1 - sinceShot / 0.12) * 0.06 : 0;
    this.aim.rotation.x = pitch * 0.75 + kick;
    this.gunHolder.position.z = -0.3 + kick * 1.5;
    const melee = simT - a.meleeAnimAt;
    if (melee < 0.35 && id === 'knife') {
      this.aim.rotation.x = pitch * 0.75 + Math.sin((melee / 0.35) * Math.PI) * 0.9;
    }
    this.flash.visible = sinceShot < 0.05 && id !== 'knife';
    this.bombPack.visible = a.hasBomb;
  }
}
