// First-person weapon + hands. Rendered in its own scene / camera after clearing depth so it
// never clips into world geometry. Animations: idle sway, walk bob, recoil kick, reload dip,
// draw raise, knife swing.

import * as THREE from 'three';
import type { Actor } from '../sim/actor.ts';
import type { Team } from '../sim/map.ts';
import type { WeaponId } from '../sim/weapons.ts';
import { KICK_STRENGTH, VIEW_POSE, buildWeapon, mkBox } from './weaponModels.ts';

const SLEEVE: Record<Team, number> = { CT: 0x2f4a7a, T: 0xa86b2c };
const GLOVE: Record<Team, number> = { CT: 0x1b1d22, T: 0x2a211a };

export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
  private root = new THREE.Group();
  private holder = new THREE.Group();
  private flash: THREE.Mesh;
  private currentWeapon: WeaponId | null = null;
  private currentTeam: Team | null = null;
  private bobPhase = 0;
  private kickZ = 0;
  private kickRot = 0;
  private swayX = 0;
  private swayY = 0;
  private flashUntil = 0;
  private time = 0;
  visible = true;

  constructor() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 2.1));
    const dir = new THREE.DirectionalLight(0xfff0d8, 2.4);
    dir.position.set(0.5, 1, 0.8);
    this.scene.add(dir);
    this.scene.add(this.camera);
    this.camera.add(this.root);
    this.root.add(this.holder);
    this.flash = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xffdf8a, transparent: true, opacity: 0.95 }),
    );
    this.flash.visible = false;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setWeapon(id: WeaponId, team: Team): void {
    if (this.currentWeapon === id && this.currentTeam === team) return;
    this.currentWeapon = id;
    this.currentTeam = team;
    this.holder.clear();
    const rig = buildWeapon(id);
    const pose = VIEW_POSE[id];
    const wrap = new THREE.Group();
    wrap.add(rig.group);
    wrap.position.set(...pose.pos);
    wrap.rotation.set(...pose.rot);
    wrap.scale.setScalar(pose.scale);
    this.holder.add(wrap);

    // hands / sleeves attached to the weapon so they follow every animation
    const sleeve = SLEEVE[team];
    const glove = GLOVE[team];
    const rh = new THREE.Group();
    rh.position.copy(rig.rightHand);
    rh.add(mkBox(0.06, 0.065, 0.1, glove, 0, -0.005, 0));
    const rs = new THREE.Group();
    rs.rotation.set(0.32, 0.3, 0);
    rs.add(mkBox(0.08, 0.08, 0.55, sleeve, 0.0, -0.02, 0.3));
    rh.add(rs);
    rig.group.add(rh);
    if (rig.leftHand) {
      const lh = new THREE.Group();
      lh.position.copy(rig.leftHand);
      lh.add(mkBox(0.065, 0.06, 0.1, glove, 0, 0.0, 0));
      const ls = new THREE.Group();
      ls.rotation.set(0.42, -0.5, 0);
      ls.add(mkBox(0.08, 0.08, 0.5, sleeve, 0, -0.02, 0.28));
      lh.add(ls);
      rig.group.add(lh);
    }
    rig.muzzle.add(this.flash);
  }

  /** Called when the viewed actor fires. */
  fired(t: number): void {
    const id = this.currentWeapon;
    if (!id) return;
    this.kickZ += 0.028 * KICK_STRENGTH[id];
    this.kickRot += 0.05 * KICK_STRENGTH[id];
    if (id !== 'knife') this.flashUntil = t + 0.045;
  }

  update(dt: number, simT: number, a: Actor, mouseDX: number, mouseDY: number): void {
    this.time += dt;
    this.setWeapon(a.weapon.def.id, a.team);
    const id = a.weapon.def.id;
    const pose = VIEW_POSE[id];

    // sway follows mouse movement with lag
    this.swayX += (-mouseDX * 0.00035 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (mouseDY * 0.00035 - this.swayY) * Math.min(1, dt * 10);
    this.swayX = THREE.MathUtils.clamp(this.swayX, -0.04, 0.04);
    this.swayY = THREE.MathUtils.clamp(this.swayY, -0.04, 0.04);

    const speedF = Math.min(1, a.speed / 5) * (a.onGround ? 1 : 0.2);
    this.bobPhase += dt * (6 + a.speed * 0.9) * (a.speed > 0.5 ? 1 : 0.3);
    const bobX = Math.sin(this.bobPhase) * 0.008 * speedF + Math.sin(this.time * 1.2) * 0.0015;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.008 * speedF + Math.sin(this.time * 1.7) * 0.0012;

    this.kickZ *= Math.exp(-dt * 16);
    this.kickRot *= Math.exp(-dt * 14);

    let dipY = 0;
    let dipRot = 0;
    let dipRotZ = 0;
    if (a.reloadLeft > 0 && a.weapon.def.reloadTime > 0) {
      const f = 1 - a.reloadLeft / a.weapon.def.reloadTime;
      const s = Math.sin(Math.min(1, f * 1.05) * Math.PI);
      dipY = -0.09 * s;
      dipRot = -0.55 * s;
      dipRotZ = 0.35 * s;
    }
    if (a.drawLeft > 0 && a.weapon.def.drawTime > 0) {
      const f = a.drawLeft / a.weapon.def.drawTime;
      dipY -= 0.28 * f * f;
      dipRot -= 0.9 * f * f;
    }
    let slashRot = 0;
    let slashX = 0;
    const m = simT - a.meleeAnimAt;
    if (id === 'knife' && m < 0.4) {
      const s = Math.sin((m / 0.4) * Math.PI);
      slashRot = -0.9 * s;
      slashX = -0.16 * s;
    }

    this.holder.position.set(this.swayX + bobX + slashX, this.swayY + bobY + dipY, this.kickZ);
    this.holder.rotation.set(this.kickRot + dipRot + slashRot, this.swayX * 1.5, dipRotZ - this.swayX);
    void pose;

    this.flash.visible = simT < this.flashUntil;
    if (this.flash.visible) this.flash.rotation.z = Math.random() * Math.PI;
    this.root.visible = this.visible;
  }
}
