import * as THREE from 'three';
import type { Character } from '../core/entities/character.ts';
import type { Team } from '../core/map/types.ts';
import { clamp, lerp } from '../core/math.ts';
import { boxGeo, vertexColorMaterial } from './geo.ts';
import { buildWeaponRig } from './weaponModel.ts';
import type { WeaponRig } from './weaponModel.ts';

interface Look {
  skin: number;
  shirt: number;
  pants: number;
  vest: number;
  boots: number;
  gloves: number;
}

// CT = blue uniform, dark navy vest, helmet with visor. T = khaki / brown gear, balaclava + head wrap.
const LOOK: Record<Team, Look> = {
  CT: { skin: 0xe0b48c, shirt: 0x3a62b0, pants: 0x27385e, vest: 0x1a2438, boots: 0x15171c, gloves: 0x1a1a1e },
  T: { skin: 0xc99a72, shirt: 0xb9975a, pants: 0x7a6640, vest: 0x4a3a26, boots: 0x3a2a1a, gloves: 0x2a2018 },
};

const shadowGeo = new THREE.CircleGeometry(0.5, 16);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });

type Pose = { rx: number; rz: number; ex: number };

/**
 * Procedural humanoid built from separate boxes: head (+helmet / mask), torso (+vest, belt, pack),
 * two two-segment arms with hands, two two-segment legs with boots. Faces -Z at yaw 0.
 * The rig is animated by rotating pivot groups (walk cycle, aim pitch, weapon hold, death fall).
 */
export class CharacterModel {
  readonly holder = new THREE.Group();
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private kneeL = new THREE.Group();
  private kneeR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private elbowL = new THREE.Group();
  private elbowR = new THREE.Group();
  private socket = new THREE.Group();
  private rig: WeaponRig | null = null;
  private weaponId = '';
  private phase = Math.random() * 6;
  private kickAmt = 0;
  private lastShot = -99;
  private shadow: THREE.Mesh;
  readonly team: Team;

  constructor(team: Team) {
    this.team = team;
    const look = LOOK[team];
    const mat = vertexColorMaterial();
    const add = (parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh => {
      const m = new THREE.Mesh(boxGeo(w, h, d, color), mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };

    this.root.rotation.order = 'YXZ';
    this.holder.add(this.root);

    // ---- pelvis + legs
    this.hips.position.set(0, 0.92, 0);
    this.root.add(this.hips);
    add(this.hips, 0.36, 0.2, 0.22, look.pants, 0, -0.02, 0);
    for (const side of [-1, 1]) {
      const leg = side < 0 ? this.legL : this.legR;
      const knee = side < 0 ? this.kneeL : this.kneeR;
      leg.position.set(side * 0.1, -0.08, 0);
      this.hips.add(leg);
      add(leg, 0.17, 0.44, 0.19, look.pants, 0, -0.22, 0);
      knee.position.set(0, -0.44, 0);
      leg.add(knee);
      add(knee, 0.15, 0.4, 0.17, look.pants, 0, -0.2, 0);
      add(knee, 0.17, 0.09, 0.27, look.boots, 0, -0.42, -0.04);
      // knee pad
      add(knee, 0.16, 0.08, 0.04, look.vest, 0, -0.02, -0.09);
    }

    // ---- torso
    this.torso.position.set(0, 0.92, 0);
    this.root.add(this.torso);
    add(this.torso, 0.46, 0.52, 0.26, look.shirt, 0, 0.27, 0);
    add(this.torso, 0.49, 0.36, 0.3, look.vest, 0, 0.31, 0);
    add(this.torso, 0.47, 0.06, 0.28, look.boots, 0, 0.03, 0);
    if (team === 'T') {
      // ammo pouches + a small pack
      for (const x of [-0.13, 0, 0.13]) add(this.torso, 0.1, 0.12, 0.06, look.boots, x, 0.24, -0.17);
      add(this.torso, 0.3, 0.34, 0.13, 0x8a6f42, 0, 0.3, 0.2);
    } else {
      // plate carrier detail + radio
      add(this.torso, 0.3, 0.26, 0.04, 0x0f1622, 0, 0.34, -0.17);
      add(this.torso, 0.08, 0.14, 0.06, 0x111111, 0.16, 0.5, -0.02);
      add(this.torso, 0.28, 0.3, 0.1, 0x1a2438, 0, 0.3, 0.19);
    }

    // ---- head
    this.head.position.set(0, 0.55, 0);
    this.torso.add(this.head);
    add(this.head, 0.09, 0.08, 0.09, look.skin, 0, 0.02, 0); // neck
    add(this.head, 0.22, 0.24, 0.23, look.skin, 0, 0.16, 0);
    if (team === 'CT') {
      add(this.head, 0.27, 0.12, 0.29, 0x2b3a55, 0, 0.29, 0.005); // helmet shell
      add(this.head, 0.25, 0.07, 0.08, 0x2b3a55, 0, 0.24, -0.15); // brim
      add(this.head, 0.2, 0.06, 0.02, 0x0b0d12, 0, 0.19, -0.125); // visor
      add(this.head, 0.03, 0.1, 0.04, 0x111111, 0.11, 0.2, 0.02); // strap
    } else {
      add(this.head, 0.245, 0.15, 0.255, 0x141414, 0, 0.11, 0); // balaclava lower
      add(this.head, 0.245, 0.09, 0.255, 0x141414, 0, 0.245, 0);
      add(this.head, 0.19, 0.05, 0.02, look.skin, 0, 0.19, -0.125); // eye slit
      add(this.head, 0.27, 0.09, 0.28, 0xc8b078, 0, 0.29, 0.005); // head wrap
      add(this.head, 0.3, 0.07, 0.3, 0xc8b078, 0, 0.02, 0); // scarf
    }

    // ---- arms
    for (const side of [-1, 1]) {
      const arm = side < 0 ? this.armL : this.armR;
      const elbow = side < 0 ? this.elbowL : this.elbowR;
      arm.position.set(side * 0.3, 0.46, 0);
      this.torso.add(arm);
      add(arm, 0.14, 0.05, 0.16, look.vest, 0, 0.0, 0); // shoulder pad
      add(arm, 0.13, 0.29, 0.13, look.shirt, 0, -0.15, 0);
      elbow.position.set(0, -0.29, 0);
      arm.add(elbow);
      add(elbow, 0.12, 0.26, 0.12, look.shirt, 0, -0.13, 0);
      add(elbow, 0.1, 0.1, 0.11, look.gloves, 0, -0.3, 0);
    }

    // ---- weapon socket (in front of the chest)
    this.socket.position.set(0.06, 0.32, -0.26);
    this.torso.add(this.socket);

    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.035;
    this.holder.add(this.shadow);
  }

  private setWeapon(id: string, ch: Character): void {
    if (this.weaponId === id) return;
    this.weaponId = id;
    if (this.rig) this.socket.remove(this.rig.group);
    this.rig = buildWeaponRig(ch.weapon.def.model);
    this.socket.add(this.rig.group);
  }

  /** Called on a 'shot' event of this character: recoil animation. */
  kick(time: number): void {
    this.kickAmt = 1;
    this.lastShot = time;
  }

  getMuzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    if (this.rig) {
      this.rig.muzzle.getWorldPosition(out);
      return out;
    }
    return this.root.getWorldPosition(out);
  }

  private poseFor(hold: string): { r: Pose; l: Pose; socket: [number, number, number] } {
    switch (hold) {
      case 'pistol':
        return { r: { rx: 1.42, rz: -0.12, ex: 0.12 }, l: { rx: 1.38, rz: 0.4, ex: 0.22 }, socket: [0.09, 0.3, -0.34] };
      case 'knife':
        return { r: { rx: 0.95, rz: -0.1, ex: 0.85 }, l: { rx: 0.12, rz: 0.12, ex: 0.15 }, socket: [0.22, 0.14, -0.3] };
      case 'sniper':
        return { r: { rx: 1.12, rz: -0.12, ex: 0.6 }, l: { rx: 1.3, rz: 0.28, ex: 0.5 }, socket: [0.06, 0.3, -0.28] };
      default:
        return { r: { rx: 1.15, rz: -0.14, ex: 0.55 }, l: { rx: 1.28, rz: 0.32, ex: 0.42 }, socket: [0.06, 0.3, -0.27] };
    }
  }

  /**
   * Sync the rig with the simulation state. `hidden` hides the body (first-person view of
   * this very character).
   */
  update(ch: Character, alpha: number, dt: number, time: number, hidden: boolean): void {
    this.holder.visible = !hidden;
    const x = lerp(ch.prevPos.x, ch.pos.x, alpha);
    const y = lerp(ch.prevPos.y, ch.pos.y, alpha);
    const z = lerp(ch.prevPos.z, ch.pos.z, alpha);
    this.holder.position.set(x, y, z);
    if (hidden) return;

    this.setWeapon(ch.weapon.def.id, ch);
    const hold = ch.weapon.def.model.hold;
    const p = this.poseFor(hold);

    this.root.rotation.y = ch.yaw;

    if (!ch.alive) {
      // fall backwards and stay down
      const t = clamp((time - ch.deathTime) / 0.55, 0, 1);
      const e = 1 - (1 - t) * (1 - t);
      this.root.rotation.x = e * (Math.PI / 2 - 0.12);
      this.root.position.y = 0.16 * e;
      this.root.scale.y = 1;
      this.legL.rotation.x = 0.25 * e;
      this.legR.rotation.x = -0.15 * e;
      this.kneeL.rotation.x = -0.2 * e;
      this.kneeR.rotation.x = -0.35 * e;
      this.armL.rotation.x = lerp(p.l.rx, 0.4, e);
      this.armR.rotation.x = lerp(p.r.rx, 0.9, e);
      this.armL.rotation.z = 0.35 * e;
      this.armR.rotation.z = -0.35 * e;
      this.shadow.visible = false;
      return;
    }
    this.shadow.visible = true;
    this.root.rotation.x = 0;
    this.root.position.y = 0;
    this.root.scale.y = 1 - 0.2 * ch.crouch;

    // ---- aim: torso and head follow the view pitch
    const aim = clamp(ch.pitch + ch.punchPitch * 0.017, -1.2, 1.2);
    this.kickAmt = Math.max(0, this.kickAmt - dt * 9);
    const kick = this.kickAmt;
    this.torso.rotation.x = aim * 0.4 + kick * 0.05;
    this.head.rotation.x = aim * 0.6;

    // ---- walk cycle
    const speed = ch.speed2D;
    if (ch.onGround) this.phase += speed * dt * 1.7;
    const amp = clamp(speed / 4.6, 0, 1) * 0.85;
    const s = Math.sin(this.phase);
    if (ch.onGround) {
      this.legL.rotation.x = s * amp;
      this.legR.rotation.x = -s * amp;
      this.kneeL.rotation.x = -(0.5 + 0.5 * Math.sin(this.phase + 1.4)) * amp * 0.95;
      this.kneeR.rotation.x = -(0.5 + 0.5 * Math.sin(this.phase + 1.4 + Math.PI)) * amp * 0.95;
      this.torso.position.y = 0.92 + Math.abs(s) * 0.018 * amp;
    } else {
      this.legL.rotation.x = 0.5;
      this.legR.rotation.x = -0.25;
      this.kneeL.rotation.x = -0.8;
      this.kneeR.rotation.x = -0.5;
    }
    if (ch.crouch > 0.05) {
      this.legL.rotation.x += ch.crouch * 0.55;
      this.legR.rotation.x += ch.crouch * 0.55;
      this.kneeL.rotation.x -= ch.crouch * 0.9;
      this.kneeR.rotation.x -= ch.crouch * 0.9;
    }

    // ---- holding the weapon (both hands on the gun)
    const reloadT = ch.reloading ? clamp(1 - (ch.reloadEnd - time) / Math.max(0.1, ch.weapon.def.reloadTime), 0, 1) : 0;
    const reloadDip = ch.reloading ? Math.sin(reloadT * Math.PI) : 0;
    this.armR.rotation.set(p.r.rx - reloadDip * 0.25 + kick * 0.05, 0, p.r.rz);
    this.elbowR.rotation.x = p.r.ex + kick * 0.1;
    this.armL.rotation.set(p.l.rx - reloadDip * 0.5, 0, p.l.rz + reloadDip * 0.2);
    this.elbowL.rotation.x = p.l.ex + reloadDip * 0.5;
    this.socket.position.set(p.socket[0], p.socket[1] - reloadDip * 0.08, p.socket[2] + kick * 0.05);
    this.socket.rotation.x = kick * 0.08 - reloadDip * 0.25;

    // knife swing shows briefly after the last melee "shot"
    if (hold === 'knife' && time - this.lastShot < 0.3) {
      const k = (time - this.lastShot) / 0.3;
      this.armR.rotation.x = p.r.rx + Math.sin(k * Math.PI) * 0.9 - 0.4;
      this.armR.rotation.z = p.r.rz - Math.sin(k * Math.PI) * 0.6;
    }
  }

  dispose(): void {
    // geometries / materials are shared and cached
    this.holder.removeFromParent();
  }
}
