import * as THREE from 'three';
import type { Team, WeaponModelStyle } from '../weapons/WeaponDefs';
import { buildMuzzleFlash, buildWeaponModel, type WeaponModel } from './WeaponModels';

export interface ViewModelParams {
  moving01: number; // 0..1 horizontal speed fraction
  grounded: boolean;
  mouseDX: number;
  mouseDY: number;
  reloading: boolean;
  reloadProgress: number; // 0..1
  scoped: boolean;
  switchProgress: number; // 0..1 (1 = fully raised)
  meleeSwing: number; // 0..1 progress of a knife swing, 0 when idle
}

/**
 * First-person weapon rendered in its own scene/camera pass so that it never clips
 * into world geometry. Includes procedural arms, sway, bob, recoil, reload and switch
 * animations and a muzzle flash.
 */
export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  private readonly root = new THREE.Group();
  private readonly gunPivot = new THREE.Group();
  private weapon: WeaponModel | null = null;
  private readonly flash: THREE.Mesh;
  private readonly flashLight: THREE.PointLight;
  private armR: THREE.Mesh;
  private armL: THREE.Mesh;
  private handR: THREE.Mesh;
  private handL: THREE.Mesh;
  private recoilKick = 0;
  private recoilRot = 0;
  private bobPhase = 0;
  private swayX = 0;
  private swayY = 0;
  private flashUntil = 0;
  private style: WeaponModelStyle | null = null;
  private basePos = new THREE.Vector3(0.24, -0.24, -0.42);

  constructor(team: Team) {
    const amb = new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 1.1);
    this.scene.add(amb);
    const dir = new THREE.DirectionalLight(0xfff2dc, 1.2);
    dir.position.set(0.5, 1, 0.5);
    this.scene.add(dir);
    this.scene.add(this.root);
    this.root.add(this.gunPivot);
    this.flash = buildMuzzleFlash();
    this.flashLight = new THREE.PointLight(0xffc477, 0, 2);
    this.scene.add(this.flashLight);
    const sleeve = new THREE.MeshLambertMaterial({ color: team === 'CT' ? 0x2c3e6b : 0x8a6d46 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc9a27e });
    this.armR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.42), sleeve);
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.42), sleeve);
    this.handR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.1), skin);
    this.handL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.1), skin);
    this.gunPivot.add(this.armR, this.armL, this.handR, this.handL);
    this.setWeapon('pistol');
  }

  setTeam(team: Team) {
    (this.armR.material as THREE.MeshLambertMaterial).color.setHex(team === 'CT' ? 0x2c3e6b : 0x8a6d46);
    (this.armL.material as THREE.MeshLambertMaterial).color.setHex(team === 'CT' ? 0x2c3e6b : 0x8a6d46);
  }

  setWeapon(style: WeaponModelStyle) {
    if (this.style === style && this.weapon) return;
    this.style = style;
    if (this.weapon) {
      this.gunPivot.remove(this.weapon.group);
      this.weapon.group.remove(this.flash);
    }
    this.weapon = buildWeaponModel(style);
    this.weapon.group.add(this.flash);
    this.flash.position.copy(this.weapon.muzzle);
    this.gunPivot.add(this.weapon.group);
    // pose arms: right hand on grip, left hand at the support point
    this.handR.position.set(0, -0.03, 0.03);
    this.armR.position.set(0.03, -0.1, 0.26);
    this.armR.rotation.set(-0.25, 0.1, 0);
    const s = this.weapon.supportHand;
    if (style === 'knife') {
      this.handL.visible = false;
      this.armL.visible = false;
      this.basePos.set(0.28, -0.26, -0.4);
    } else if (style === 'pistol' || style === 'deagle') {
      this.handL.visible = true;
      this.armL.visible = true;
      this.handL.position.set(-0.035, -0.05, 0.02);
      this.armL.position.set(-0.12, -0.12, 0.24);
      this.armL.rotation.set(-0.3, -0.35, 0);
      this.basePos.set(0.16, -0.2, -0.38);
    } else {
      this.handL.visible = true;
      this.armL.visible = true;
      this.handL.position.set(-0.01, s.y - 0.02, s.z);
      this.armL.position.set(-0.14, s.y - 0.1, s.z + 0.22);
      this.armL.rotation.set(-0.2, -0.45, 0);
      this.basePos.set(0.22, -0.25, -0.45);
    }
  }

  /** Called when the weapon fires. */
  kick(amount: number) {
    this.recoilKick = Math.min(0.12, this.recoilKick + 0.035 * amount);
    this.recoilRot = Math.min(0.35, this.recoilRot + 0.09 * amount);
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.9 + Math.random() * 0.5);
    this.flashLight.intensity = 3;
    this.flashUntil = performance.now() / 1000 + 0.045;
  }

  update(dt: number, params: ViewModelParams) {
    const now = performance.now() / 1000;
    // recoil recovery
    this.recoilKick = Math.max(0, this.recoilKick - dt * 0.6);
    this.recoilRot = Math.max(0, this.recoilRot - dt * 2.2);
    // sway toward mouse motion
    this.swayX += (-params.mouseDX * 0.0006 - this.swayX) * Math.min(1, dt * 12);
    this.swayY += (params.mouseDY * 0.0006 - this.swayY) * Math.min(1, dt * 12);
    this.swayX = THREE.MathUtils.clamp(this.swayX, -0.05, 0.05);
    this.swayY = THREE.MathUtils.clamp(this.swayY, -0.05, 0.05);
    // bob
    if (params.grounded && params.moving01 > 0.05) this.bobPhase += dt * 9 * Math.max(0.4, params.moving01);
    const bobX = Math.sin(this.bobPhase) * 0.012 * params.moving01;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * 0.01 * params.moving01;
    // switch (raise from below) & reload (dip + tilt)
    const lower = (1 - params.switchProgress) * 0.35;
    let reloadDip = 0;
    let reloadTilt = 0;
    if (params.reloading) {
      const p = params.reloadProgress;
      const s = Math.sin(Math.PI * Math.min(1, p * 1.15));
      reloadDip = s * 0.12;
      reloadTilt = s * 0.7;
    }
    // knife swing
    let swingRot = 0;
    let swingZ = 0;
    if (params.meleeSwing > 0) {
      const s = Math.sin(Math.PI * params.meleeSwing);
      swingRot = -s * 1.2;
      swingZ = -s * 0.15;
    }
    this.root.position.set(
      this.basePos.x + this.swayX + bobX,
      this.basePos.y + this.swayY - bobY - lower - reloadDip,
      this.basePos.z + this.recoilKick + swingZ,
    );
    this.root.rotation.set(-this.recoilRot * 0.6 - reloadTilt * 0.5 + swingRot * 0.4, reloadTilt * 0.4 + this.swayX * 2 + swingRot * 0.5, -reloadTilt * 0.5 + swingRot * 0.2);
    this.root.visible = !params.scoped;
    if (this.flash.visible && now > this.flashUntil) {
      this.flash.visible = false;
      this.flashLight.intensity = 0;
    }
    if (this.weapon) {
      this.flashLight.position.copy(this.weapon.muzzle);
      this.weapon.group.localToWorld(this.flashLight.position);
    }
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
