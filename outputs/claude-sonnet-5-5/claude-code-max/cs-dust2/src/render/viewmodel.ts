// First-person view model: the held weapon plus two arms, rendered in its own scene / camera on top of the world
// (so it never clips into walls). Animated procedurally from simulation state: walk bob, mouse sway, recoil kick,
// draw / reload / knife-swing motions.
import * as THREE from 'three';
import { activeWeaponId } from '../game/actor';
import type { Actor, Team, WeaponId } from '../game/types';
import { getWeapon } from '../game/weapons';
import { OUTFITS, buildArm, solveArm } from './characterModel';
import type { ArmRig } from './characterModel';
import { addSceneLights } from './shared';
import { makeGlowTexture } from './textures';
import { buildWeaponModel } from './weaponModels';
import type { WeaponModel } from './weaponModels';

interface Pose {
  x: number;
  y: number;
  z: number;
  rx: number;
}

const POSES: Record<string, Pose> = {
  rifle: { x: 0.16, y: -0.18, z: -0.26, rx: 0.0 },
  sniper: { x: 0.17, y: -0.19, z: -0.28, rx: 0.0 },
  pistol: { x: 0.13, y: -0.15, z: -0.3, rx: 0.02 },
  knife: { x: 0.19, y: -0.17, z: -0.36, rx: 0.35 },
  bomb: { x: 0.02, y: -0.19, z: -0.38, rx: 0.1 },
};

/** Shoulder anchors (camera space): forward of the eye so both hands can reach the weapon. */
const SHOULDER_R: [number, number, number] = [0.22, -0.27, -0.02];
const SHOULDER_L: [number, number, number] = [-0.2, -0.25, -0.06];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.01, 20);
  private readonly holder = new THREE.Group();
  private readonly models = new Map<WeaponId, WeaponModel>();
  private current: WeaponModel | null = null;
  private currentId: WeaponId | null = null;
  private armR: ArmRig;
  private armL: ArmRig;
  private team: Team = 'CT';
  private readonly flash: THREE.Sprite;
  private flashUntil = 0;
  private bobPhase = 0;
  private swayX = 0;
  private swayY = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private lastActorId = -1;
  private readonly targetR = new THREE.Vector3();
  private readonly targetL = new THREE.Vector3();
  private readonly poleR = new THREE.Vector3(0.6, -1, 0.4);
  private readonly poleL = new THREE.Vector3(-0.6, -1, 0.4);
  private readonly handLift = new THREE.Vector3(0, -0.03, 0);
  private readonly rig = new THREE.Group();

  constructor() {
    addSceneLights(this.scene);
    this.scene.add(this.camera);
    this.scene.add(this.holder);
    this.armR = buildArm(1, OUTFITS.CT);
    this.armL = buildArm(-1, OUTFITS.CT);
    this.scene.add(this.rig);
    this.rig.add(this.armR.shoulder, this.armL.shoulder);
    // Shoulders sit below the camera so the forearms enter from the bottom corners of the screen.
    this.armR.shoulder.position.set(SHOULDER_R[0], SHOULDER_R[1], SHOULDER_R[2]);
    this.armL.shoulder.position.set(SHOULDER_L[0], SHOULDER_L[1], SHOULDER_L[2]);

    const mat = new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flash = new THREE.Sprite(mat);
    this.flash.visible = false;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  triggerFlash(now: number): void {
    this.flashUntil = now + 0.05;
  }

  private setTeamLook(team: Team): void {
    if (team === this.team) return;
    this.team = team;
    const o = OUTFITS[team];
    // Rebuild arms with the new sleeve colours.
    this.rig.remove(this.armR.shoulder, this.armL.shoulder);
    this.armR = buildArm(1, o);
    this.armL = buildArm(-1, o);
    this.armR.shoulder.position.set(SHOULDER_R[0], SHOULDER_R[1], SHOULDER_R[2]);
    this.armL.shoulder.position.set(SHOULDER_L[0], SHOULDER_L[1], SHOULDER_L[2]);
    this.rig.add(this.armR.shoulder, this.armL.shoulder);
  }

  private setWeapon(id: WeaponId): void {
    if (this.currentId === id) return;
    if (this.current) {
      this.holder.remove(this.current.group);
      this.current.muzzle.remove(this.flash);
    }
    let m = this.models.get(id);
    if (!m) {
      m = buildWeaponModel(id);
      this.models.set(id, m);
    }
    this.holder.add(m.group);
    m.muzzle.add(this.flash);
    this.current = m;
    this.currentId = id;
  }

  /**
   * Update for the viewed actor. `now` is simulation time. `visible=false` (dead / scoped / no actor) hides everything.
   */
  update(a: Actor | null, now: number, dt: number, visible: boolean): void {
    if (!a || !visible) {
      this.holder.visible = false;
      this.rig.visible = false;
      return;
    }
    const id = activeWeaponId(a);
    const def = getWeapon(id);
    this.setTeamLook(a.team);
    this.setWeapon(id);
    this.holder.visible = true;
    this.rig.visible = true;

    if (a.id !== this.lastActorId) {
      this.lastActorId = a.id;
      this.lastYaw = a.yaw;
      this.lastPitch = a.pitch;
    }

    // Base pose per weapon class.
    const pose = POSES[def.kind === 'rifle' ? 'rifle' : def.kind === 'sniper' ? 'sniper' : def.kind === 'pistol' ? 'pistol' : def.kind === 'knife' ? 'knife' : 'bomb'];
    let x = pose.x;
    let y = pose.y;
    let z = pose.z;
    let rx = pose.rx;
    let ry = 0;
    let rz = 0;

    // Walk bob.
    const speed = Math.hypot(a.vel.x, a.vel.z);
    const stride = a.onGround ? Math.min(1, speed / 5) : 0.15;
    this.bobPhase += dt * (4 + speed * 1.6);
    x += Math.sin(this.bobPhase) * 0.009 * stride;
    y += Math.abs(Math.cos(this.bobPhase)) * 0.008 * stride - 0.004 * stride;
    y += Math.sin(now * 1.3) * 0.0015;

    // Mouse sway: the weapon lags behind view rotation.
    let dyaw = a.yaw - this.lastYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const dpitch = a.pitch - this.lastPitch;
    this.lastYaw = a.yaw;
    this.lastPitch = a.pitch;
    const k = Math.min(1, dt * 10);
    this.swayX += (Math.max(-0.05, Math.min(0.05, dyaw * 0.35)) - this.swayX) * k;
    this.swayY += (Math.max(-0.04, Math.min(0.04, dpitch * 0.35)) - this.swayY) * k;
    x += this.swayX;
    y -= this.swayY;
    ry += this.swayX * 1.5;

    // Recoil kick right after a shot.
    const since = now - a.lastShotAt;
    if (def.kind === 'knife') {
      // Swing arc.
      const t = clamp01(since / 0.3);
      if (since < 0.3) {
        const s = Math.sin(t * Math.PI);
        rz -= s * 1.1;
        rx += s * 0.5;
        x -= s * 0.1;
        z -= s * 0.1;
      }
    } else if (since < 0.25) {
      const strength = def.kind === 'sniper' ? 2.4 : def.kind === 'pistol' ? 1.3 : 1;
      const e = Math.exp(-since * 22);
      z += 0.045 * strength * e;
      rx += 0.09 * strength * e;
      y += 0.004 * strength * e;
    }

    // Draw animation (weapon rises from below).
    if (a.drawEndsAt > now && def.drawTime > 0) {
      const d = clamp01((a.drawEndsAt - now) / def.drawTime);
      y -= d * 0.22;
      rx -= d * 0.7;
    }
    // Reload: weapon tilts down and back up.
    if (a.reloadEndsAt > 0 && def.reloadTime > 0) {
      const p = clamp01(1 - (a.reloadEndsAt - now) / def.reloadTime);
      const s = Math.sin(p * Math.PI);
      y -= s * 0.13;
      rx -= s * 0.55;
      rz += s * 0.35;
      x -= s * 0.04;
    }
    // Planting / defusing: hold the device low and shake it.
    if (a.useKind) {
      y -= 0.05;
      x += Math.sin(now * 30) * 0.002;
    }

    this.holder.position.set(x, y, z);
    this.holder.rotation.set(rx, ry, rz);
    this.holder.updateMatrix();

    // Hands follow the weapon: right on the grip, left on the fore-end (relaxed for knife / bomb).
    this.targetR.set(0, -0.05, 0.0).applyMatrix4(this.holder.matrix);
    const m = this.current;
    if (def.kind === 'knife') this.targetL.set(-0.22, -0.22, -0.2);
    else if (def.kind === 'bomb' && m) this.targetL.set(-0.08, -0.16, -0.36);
    else if (m) this.targetL.copy(m.foregrip).multiplyScalar(0.7).applyMatrix4(this.holder.matrix).add(this.handLift);
    solveArm(this.armR.shoulder, this.armR.elbow, this.targetR, this.poleR);
    solveArm(this.armL.shoulder, this.armL.elbow, this.targetL, this.poleL);

    // Muzzle flash sprite.
    this.flash.visible = now < this.flashUntil && def.kind !== 'knife';
    if (this.flash.visible) this.flash.scale.setScalar(0.22 + Math.random() * 0.14);
  }

  dispose(): void {
    this.flash.material.dispose();
  }
}
