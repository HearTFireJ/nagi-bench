import * as THREE from 'three';
import type { Character } from '../core/entities/character.ts';
import type { Team } from '../core/map/types.ts';
import { clamp } from '../core/math.ts';
import { boxGeo, vertexColorMaterial } from './geo.ts';
import { glowTexture } from './textures.ts';
import { buildWeaponRig } from './weaponModel.ts';
import type { WeaponRig } from './weaponModel.ts';

const SLEEVE: Record<Team, number> = { CT: 0x3a62b0, T: 0xb9975a };
const GLOVE: Record<Team, number> = { CT: 0x1a1a1e, T: 0x2a2018 };

// hand anchor points in weapon space [right hand, left hand]
const HANDS: Record<string, { r: [number, number, number]; l: [number, number, number] | null }> = {
  rifle: { r: [0, -0.1, 0.07], l: [0, -0.03, -0.3] },
  sniper: { r: [0, -0.09, 0.16], l: [0, -0.03, -0.22] },
  pistol: { r: [0, -0.075, 0.055], l: [-0.012, -0.11, 0.075] },
  knife: { r: [0, 0, 0.03], l: null },
};

const FWD = new THREE.Vector3(0, 0, 1);

/**
 * First-person weapon + arms, rendered in a second pass with its own camera so it never
 * clips into walls. Animated procedurally: walk bob, recoil kick, draw, reload, slide/bolt,
 * knife swings.
 */
export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  private holder = new THREE.Group();
  private gun = new THREE.Group();
  private rig: WeaponRig | null = null;
  private weaponId = '';
  private team: Team | null = null;
  private flash: THREE.Mesh;
  private flashTime = -1;
  private kick = 0;
  private bobPhase = 0;
  private meleeStart = -9;
  private meleeKind: 'slash' | 'stab' = 'slash';
  private lastShotTime = -9;
  private glow: THREE.Texture;
  private flashMat: THREE.MeshBasicMaterial;
  private flashGeo: THREE.PlaneGeometry;

  constructor() {
    this.scene.add(this.holder);
    this.holder.add(this.gun);
    this.glow = glowTexture();
    this.flashGeo = new THREE.PlaneGeometry(0.3, 0.3);
    this.flashMat = new THREE.MeshBasicMaterial({ map: this.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffd08a });
    this.flash = new THREE.Mesh(this.flashGeo, this.flashMat);
    this.flash.visible = false;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private limb(parent: THREE.Object3D, from: [number, number, number], to: [number, number, number], thick: number, color: number): void {
    const a = new THREE.Vector3(from[0], from[1], from[2]);
    const b = new THREE.Vector3(to[0], to[1], to[2]);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const m = new THREE.Mesh(boxGeo(thick, thick, len, color), vertexColorMaterial());
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(FWD, dir.normalize());
    parent.add(m);
  }

  private setWeapon(ch: Character): void {
    const def = ch.weapon.def;
    if (this.weaponId === def.id && this.team === ch.team) return;
    this.weaponId = def.id;
    this.team = ch.team;
    // rebuild gun + arms
    while (this.gun.children.length) this.gun.remove(this.gun.children[0]);
    this.rig = buildWeaponRig(def.model);
    this.gun.add(this.rig.group);
    const hands = HANDS[def.model.hold] ?? HANDS.rifle;
    const sleeve = SLEEVE[ch.team];
    const glove = GLOVE[ch.team];
    const rm = new THREE.Mesh(boxGeo(0.075, 0.085, 0.1, glove), vertexColorMaterial());
    rm.position.set(hands.r[0], hands.r[1], hands.r[2]);
    this.gun.add(rm);
    this.limb(this.gun, [hands.r[0] + 0.14, hands.r[1] - 0.26, hands.r[2] + 0.5], [hands.r[0], hands.r[1] - 0.01, hands.r[2] + 0.06], 0.085, sleeve);
    if (hands.l) {
      const lm = new THREE.Mesh(boxGeo(0.075, 0.075, 0.1, glove), vertexColorMaterial());
      lm.position.set(hands.l[0], hands.l[1], hands.l[2]);
      this.gun.add(lm);
      this.limb(this.gun, [hands.l[0] - 0.22, hands.l[1] - 0.3, hands.l[2] + 0.62], [hands.l[0], hands.l[1] - 0.005, hands.l[2] + 0.06], 0.08, sleeve);
    }
    this.flash.removeFromParent();
    this.flash.position.set(def.model.muzzle[0], def.model.muzzle[1], def.model.muzzle[2] - 0.03);
    this.gun.add(this.flash);
    this.flash.visible = false;
    this.holder.scale.setScalar(def.model.view.scale);
  }

  onShot(time: number): void {
    this.kick = 1;
    this.flashTime = time;
    this.lastShotTime = time;
  }

  onMelee(kind: 'slash' | 'stab', time: number): void {
    this.meleeStart = time;
    this.meleeKind = kind;
  }

  /** hide entirely (scoped / dead / spectating a bot in third person) */
  setVisible(v: boolean): void {
    this.scene.visible = v;
  }

  update(dt: number, ch: Character, time: number): void {
    this.setWeapon(ch);
    const def = ch.weapon.def;
    const w = ch.weapon;
    const v = def.model.view;

    // ---- bob: the faster we move, the more the weapon sways
    const speedFrac = clamp(ch.speed2D / 5.5, 0, 1);
    if (ch.onGround) this.bobPhase += dt * (4 + speedFrac * 7);
    const bx = Math.sin(this.bobPhase) * 0.01 * speedFrac;
    const by = Math.abs(Math.cos(this.bobPhase)) * -0.012 * speedFrac + Math.sin(time * 1.4) * 0.0018;

    this.kick = Math.max(0, this.kick - dt * 8);
    const k = this.kick;

    // ---- draw / switch animation
    const deployT = clamp(1 - (w.deployEnd - time) / Math.max(0.05, def.deployTime), 0, 1);
    const draw = (1 - deployT) * (1 - deployT);

    // ---- reload animation
    let reloadT = 0;
    let dip = 0;
    if (ch.reloading) {
      reloadT = clamp(1 - (ch.reloadEnd - time) / Math.max(0.1, def.reloadTime), 0, 1);
      dip = Math.sin(reloadT * Math.PI);
    }

    let px = v.pos[0] + bx;
    let py = v.pos[1] + by - draw * 0.35 - dip * 0.13;
    let pz = v.pos[2] + k * 0.045;
    let rx = k * 0.09 + draw * 0.7 + dip * 0.28;
    let ry = 0;
    let rz = dip * 0.4;

    // ---- knife swings
    if (def.melee) {
      const t = (time - this.meleeStart) / (this.meleeKind === 'stab' ? 0.32 : 0.38);
      if (t >= 0 && t <= 1) {
        const s = Math.sin(t * Math.PI);
        if (this.meleeKind === 'slash') {
          px += (0.5 - t) * -0.32;
          rz += (t - 0.5) * -1.6;
          ry += (t - 0.5) * 1.2;
          py += s * 0.03;
        } else {
          pz -= s * 0.3;
          rx -= s * 0.25;
        }
      }
    }

    this.holder.position.set(px, py, pz);
    this.holder.rotation.set(rx, ry, rz);

    // ---- moving parts
    if (this.rig) {
      const mags = this.rig.tagged.get('mag');
      if (mags) {
        const off = reloadT < 0.25 ? 0 : reloadT < 0.5 ? (reloadT - 0.25) / 0.25 : reloadT < 0.72 ? 1 - (reloadT - 0.5) / 0.22 : 0;
        for (const m of mags) {
          m.obj.position.set(m.home.x, m.home.y - off * 0.22, m.home.z + off * 0.03);
        }
      }
      const slide = this.rig.tagged.get('slide');
      if (slide) {
        const back = w.def.mag > 0 && w.mag === 0 && !ch.reloading ? 0.03 : k * 0.035;
        for (const s of slide) s.obj.position.set(s.home.x, s.home.y, s.home.z + back);
      }
      const bolt = this.rig.tagged.get('bolt');
      if (bolt) {
        const t = time - this.lastShotTime;
        // bolt cycles between 0.35 s and 1.0 s after each shot
        const cyc = t > 0.35 && t < 1.0 ? Math.sin(((t - 0.35) / 0.65) * Math.PI) : 0;
        for (const b of bolt) {
          b.obj.position.set(b.home.x, b.home.y + cyc * 0.02, b.home.z + cyc * 0.07);
        }
      }
    }

    // ---- muzzle flash lasts a few frames
    const ft = time - this.flashTime;
    if (ft >= 0 && ft < 0.05 && !def.melee) {
      this.flash.visible = true;
      this.flash.rotation.z = Math.random() * Math.PI * 2;
      const s = 0.8 + Math.random() * 0.6;
      this.flash.scale.set(s, s, s);
    } else this.flash.visible = false;
  }

  dispose(): void {
    this.flashGeo.dispose();
    this.flashMat.dispose();
    this.glow.dispose();
  }
}
