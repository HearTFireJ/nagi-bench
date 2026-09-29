// Procedural humanoid built from separate boxes: head (with team headgear), neck, chest, abdomen, pelvis, two-segment arms
// with hands, two-segment legs with boots. Arms are solved with a small two-bone IK so both hands always land on the
// weapon (right hand on the grip, left hand on the fore-end), whatever the aim pitch. Never a single capsule / cylinder.
import * as THREE from 'three';
import type { Actor, Team, WeaponId } from '../game/types';
import { activeWeaponId } from '../game/actor';
import { buildWeaponModel } from './weaponModels';
import type { WeaponModel } from './weaponModels';
import { boxMesh } from './shared';
import { makeGlowTexture } from './textures';

export interface Outfit {
  skin: number;
  jacket: number;
  vest: number;
  pants: number;
  boots: number;
  gloves: number;
  head: number;
  headAccent: number;
  face: number;
}

/** T: sand / brown with a dark red headwrap and mask.  CT: navy with a bright blue vest, helmet and goggles. */
export const OUTFITS: Record<Team, Outfit> = {
  T: { skin: 0xd6a273, jacket: 0x9a8455, vest: 0x5d4a2e, pants: 0x4f4232, boots: 0x2a2118, gloves: 0x1c1a18, head: 0x3a2f28, headAccent: 0xb02a22, face: 0x121212 },
  CT: { skin: 0xe0b48a, jacket: 0x22375a, vest: 0x3f74c4, pants: 0x2d3746, boots: 0x131313, gloves: 0x101215, head: 0x1a2843, headAccent: 0xe8eef7, face: 0x0a0b0d },
};

const UPPER = 0.32;
const FORE = 0.3;
const THIGH = 0.44;
const SHIN = 0.4;
const DOWN = new THREE.Vector3(0, -1, 0);

let glowTexture: THREE.Texture | null = null;
const flashTexture = (): THREE.Texture => {
  if (!glowTexture) glowTexture = makeGlowTexture();
  return glowTexture;
};

const tmpDir = new THREE.Vector3();
const tmpPerp = new THREE.Vector3();
const tmpElbow = new THREE.Vector3();
const tmpUpper = new THREE.Vector3();
const tmpLower = new THREE.Vector3();
const tmpHand = new THREE.Vector3();
const qUpper = new THREE.Quaternion();
const qLower = new THREE.Quaternion();

/**
 * Two-bone IK in the parent's frame: place the elbow so that the hand reaches `target` (clamped to the arm's reach).
 * `pole` hints where the elbow should point. Writes orientations into the shoulder group and elbow group.
 */
export const solveArm = (shoulder: THREE.Group, elbow: THREE.Group, target: THREE.Vector3, pole: THREE.Vector3): void => {
  const s = shoulder.position;
  tmpDir.copy(target).sub(s);
  let d = tmpDir.length();
  if (d < 1e-4) tmpDir.set(0, 0, -1);
  else tmpDir.multiplyScalar(1 / d);
  d = Math.min(Math.max(d, Math.abs(UPPER - FORE) + 0.01), UPPER + FORE - 0.005);
  const cosA = (UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  tmpPerp.copy(pole).addScaledVector(tmpDir, -pole.dot(tmpDir));
  if (tmpPerp.lengthSq() < 1e-6) tmpPerp.set(0, -1, 0);
  tmpPerp.normalize();
  tmpElbow.copy(s).addScaledVector(tmpDir, UPPER * cosA).addScaledVector(tmpPerp, UPPER * sinA);
  tmpUpper.copy(tmpElbow).sub(s).normalize();
  tmpHand.copy(s).addScaledVector(tmpDir, d);
  tmpLower.copy(tmpHand).sub(tmpElbow).normalize();
  qUpper.setFromUnitVectors(DOWN, tmpUpper);
  qLower.setFromUnitVectors(DOWN, tmpLower);
  shoulder.quaternion.copy(qUpper);
  elbow.quaternion.copy(qUpper).invert().multiply(qLower);
};

export interface ArmRig {
  shoulder: THREE.Group;
  elbow: THREE.Group;
}

export const buildArm = (side: 1 | -1, o: Outfit): ArmRig => {
  const shoulder = new THREE.Group();
  shoulder.position.set(0.25 * side, 0.44, 0);
  // Shoulder pad + upper arm (jacket sleeve), forearm (sleeve), glove.
  shoulder.add(boxMesh(0.13, 0.1, 0.13, o.jacket, 0, 0.0, 0));
  shoulder.add(boxMesh(0.105, UPPER, 0.105, o.jacket, 0, -UPPER / 2, 0));
  const elbow = new THREE.Group();
  elbow.position.set(0, -UPPER, 0);
  elbow.add(boxMesh(0.09, FORE, 0.09, o.jacket, 0, -FORE / 2, 0));
  elbow.add(boxMesh(0.085, 0.085, 0.095, o.gloves, 0, -FORE - 0.02, 0));
  shoulder.add(elbow);
  return { shoulder, elbow };
};

interface LegRig {
  hip: THREE.Group;
  knee: THREE.Group;
}

const buildLeg = (side: 1 | -1, o: Outfit): LegRig => {
  const hip = new THREE.Group();
  hip.position.set(0.1 * side, 0.9, 0);
  hip.add(boxMesh(0.155, THIGH, 0.18, o.pants, 0, -THIGH / 2, 0));
  const knee = new THREE.Group();
  knee.position.set(0, -THIGH, 0);
  knee.add(boxMesh(0.135, SHIN, 0.155, o.pants, 0, -SHIN / 2, 0));
  knee.add(boxMesh(0.145, 0.09, 0.27, o.boots, 0, -SHIN - 0.005, -0.045));
  hip.add(knee);
  return { hip, knee };
};

export class CharacterView {
  readonly root = new THREE.Group();
  readonly team: Team;
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly armR: ArmRig;
  private readonly armL: ArmRig;
  private readonly legR: LegRig;
  private readonly legL: LegRig;
  private readonly mount = new THREE.Group();
  private readonly flashSprite: THREE.Sprite;
  private readonly models = new Map<WeaponId, WeaponModel>();
  private current: WeaponModel | null = null;
  private currentId: WeaponId | null = null;
  private phase = Math.random() * 6;
  private flashUntil = 0;
  private readonly targetR = new THREE.Vector3();
  private readonly targetL = new THREE.Vector3();
  private readonly poleR = new THREE.Vector3(0.7, -1, 0.15);
  private readonly poleL = new THREE.Vector3(-0.7, -1, 0.15);
  private smoothPitch = 0;

  constructor(team: Team) {
    this.team = team;
    const o = OUTFITS[team];

    // Pelvis and legs live under `hips` so the whole body can bob; legs are separate pivots.
    this.root.add(this.hips);
    this.hips.add(boxMesh(0.34, 0.16, 0.21, o.pants, 0, 0.93, 0));
    this.legR = buildLeg(1, o);
    this.legL = buildLeg(-1, o);
    this.hips.add(this.legR.hip, this.legL.hip);

    // Torso: abdomen, chest, vest / bandolier.
    this.torso.position.set(0, 0.98, 0);
    this.hips.add(this.torso);
    this.torso.add(boxMesh(0.32, 0.2, 0.2, o.jacket, 0, 0.1, 0));
    this.torso.add(boxMesh(0.43, 0.28, 0.24, o.jacket, 0, 0.34, 0));
    if (team === 'CT') {
      this.torso.add(boxMesh(0.45, 0.27, 0.27, o.vest, 0, 0.33, 0.005));
      this.torso.add(boxMesh(0.1, 0.06, 0.02, 0xdfe6f2, 0, 0.42, -0.14));
    } else {
      // Bandolier strap across the chest and a belt pouch.
      const strap = boxMesh(0.09, 0.42, 0.26, o.vest, 0.02, 0.33, 0, 0);
      strap.rotation.z = -0.65;
      this.torso.add(strap);
      this.torso.add(boxMesh(0.4, 0.06, 0.22, o.vest, 0, 0.02, 0));
    }

    // Head: skin box + team headgear, neck.
    this.torso.add(boxMesh(0.09, 0.09, 0.09, o.skin, 0, 0.5, 0));
    this.head.position.set(0, 0.56, 0);
    this.head.add(boxMesh(0.2, 0.22, 0.21, o.skin, 0, 0.11, 0));
    if (team === 'CT') {
      this.head.add(boxMesh(0.24, 0.13, 0.25, o.head, 0, 0.19, 0.0)); // helmet shell
      this.head.add(boxMesh(0.25, 0.03, 0.27, o.head, 0, 0.13, -0.01)); // brim
      this.head.add(boxMesh(0.06, 0.13, 0.26, o.headAccent, 0, 0.2, 0)); // centre stripe
      this.head.add(boxMesh(0.2, 0.06, 0.02, o.face, 0, 0.11, -0.112)); // goggles
    } else {
      this.head.add(boxMesh(0.235, 0.1, 0.245, o.head, 0, 0.18, 0.005)); // headwrap
      this.head.add(boxMesh(0.24, 0.035, 0.25, o.headAccent, 0, 0.135, 0.005)); // red band
      this.head.add(boxMesh(0.21, 0.1, 0.02, o.face, 0, 0.04, -0.108)); // face mask
      this.head.add(boxMesh(0.06, 0.16, 0.08, o.head, 0, 0.05, 0.14)); // wrap tail
    }
    this.torso.add(this.head);

    this.armR = buildArm(1, o);
    this.armL = buildArm(-1, o);
    this.torso.add(this.armR.shoulder, this.armL.shoulder);

    // Weapon mount in the torso frame (grip position); the barrel points along -Z.
    this.mount.position.set(0.1, 0.25, -0.24);
    this.torso.add(this.mount);

    const mat = new THREE.SpriteMaterial({ map: flashTexture(), color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flashSprite = new THREE.Sprite(mat);
    this.flashSprite.scale.set(0.5, 0.5, 0.5);
    this.flashSprite.visible = false;
  }

  private setWeapon(id: WeaponId): void {
    if (this.currentId === id) return;
    if (this.current) {
      this.mount.remove(this.current.group);
      this.current.muzzle.remove(this.flashSprite);
    }
    let model = this.models.get(id);
    if (!model) {
      model = buildWeaponModel(id);
      this.models.set(id, model);
    }
    this.mount.add(model.group);
    model.muzzle.add(this.flashSprite);
    this.current = model;
    this.currentId = id;
  }

  /** World position of the weapon's muzzle (null while no weapon model is attached / the model is hidden). */
  muzzlePosition(out: THREE.Vector3): THREE.Vector3 | null {
    if (!this.current || !this.root.visible) return null;
    return this.current.muzzle.getWorldPosition(out);
  }

  /** Trigger the muzzle flash (time in seconds of the renderer clock). */
  flash(now: number): void {
    this.flashUntil = now + 0.06;
  }

  /**
   * Pose the character. (px,py,pz) is the interpolated feet position; `now` is the simulation time.
   * `hidden` hides the model (the player's own body, or a spectated actor's).
   */
  update(a: Actor, px: number, py: number, pz: number, now: number, dt: number, hidden: boolean): void {
    this.root.visible = !hidden;
    if (hidden) return;
    this.root.position.set(px, py, pz);
    this.root.rotation.y = a.yaw;

    const id = activeWeaponId(a);
    this.setWeapon(id);

    // ---- death: fall backwards and lie still ----
    if (!a.alive) {
      const t = Math.min(1, Math.max(0, (now - a.diedAt) / 0.45));
      const e = 1 - (1 - t) * (1 - t);
      this.root.rotation.x = e * (Math.PI / 2);
      this.root.position.y = py + 0.1 * e;
      this.flashSprite.visible = false;
      this.poseLimbs(id, 0.2, 0);
      return;
    }
    this.root.rotation.x = 0;

    // ---- locomotion ----
    const speed = Math.hypot(a.vel.x, a.vel.z);
    if (a.onGround) this.phase += dt * speed * 1.5;
    const stride = Math.min(1, speed / 4.5);
    const swing = a.onGround ? Math.sin(this.phase) * 0.85 * stride : 0.5;
    const swing2 = a.onGround ? Math.sin(this.phase + Math.PI) * 0.85 * stride : -0.3;
    this.legR.hip.rotation.x = swing;
    this.legL.hip.rotation.x = swing2;
    this.legR.knee.rotation.x = -(a.onGround ? Math.max(0, Math.cos(this.phase)) * 1.0 * stride : 0.6);
    this.legL.knee.rotation.x = -(a.onGround ? Math.max(0, Math.cos(this.phase + Math.PI)) * 1.0 * stride : 0.9);
    this.hips.position.y = a.onGround ? Math.abs(Math.sin(this.phase)) * 0.035 * stride : 0;
    // Lean into the movement direction a touch.
    this.hips.rotation.x = 0.06 * stride;

    // ---- aim: torso and head follow the pitch ----
    // The torso (and with it the weapon) takes most of the pitch so the barrel points where the bullets go; the head
    // adds the remainder so the eyes / hitbox still look where the player looks.
    this.smoothPitch += (a.pitch - this.smoothPitch) * Math.min(1, dt * 18);
    const torsoPitch = Math.max(-1.1, Math.min(1.1, this.smoothPitch * 0.9));
    this.torso.rotation.x = torsoPitch - 0.06 * stride;
    this.head.rotation.x = this.smoothPitch - torsoPitch + 0.06 * stride;

    this.poseLimbs(id, 1, now);

    // Muzzle flash sprite.
    this.flashSprite.visible = now < this.flashUntil && id !== 'knife';
    if (this.flashSprite.visible) this.flashSprite.scale.setScalar(0.35 + Math.random() * 0.25);
  }

  /** Weapon mount + arm IK for the current weapon. */
  private poseLimbs(id: WeaponId, _energy: number, _now: number): void {
    const model = this.current;
    if (!model) return;
    const isPistol = id === 'glock' || id === 'usp' || id === 'deagle';
    const isKnife = id === 'knife';
    const isC4 = id === 'c4';
    if (isKnife) this.mount.position.set(0.2, 0.2, -0.3);
    else if (isC4) this.mount.position.set(0.02, 0.18, -0.3);
    else if (isPistol) this.mount.position.set(0.1, 0.32, -0.34);
    else this.mount.position.set(0.09, 0.27, -0.14);
    this.mount.rotation.set(isKnife ? 0.5 : 0.02, 0, 0);
    this.mount.updateMatrix();

    // Right hand sits on the grip; left hand on the fore-end (or hangs back for the knife). The support hand grips
    // ~80% of the way to the model's fore-end marker so it always stays within the arm's reach.
    this.targetR.set(0, -0.045, 0.0).applyMatrix4(this.mount.matrix);
    if (isKnife) {
      this.targetL.set(-0.2, 0.08, -0.14);
    } else if (isC4) {
      this.targetL.set(-0.05, 0.16, -0.32);
    } else {
      this.targetL.copy(model.foregrip).multiplyScalar(0.8).applyMatrix4(this.mount.matrix);
      if (!isPistol) this.targetL.y -= 0.03;
    }
    solveArm(this.armR.shoulder, this.armR.elbow, this.targetR, this.poleR);
    solveArm(this.armL.shoulder, this.armL.elbow, this.targetL, this.poleL);
  }

  dispose(): void {
    this.flashSprite.material.dispose();
  }
}
