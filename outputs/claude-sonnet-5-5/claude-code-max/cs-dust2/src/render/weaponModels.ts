// Procedural weapon models: each weapon is a list of boxes / cylinders in a "barrel points to -Z, origin at the grip"
// frame. The same model is used for the first-person view model and for the weapon in the characters' hands.
// Adding a weapon = add a spec here (plus its data in game/weapons.ts).
import * as THREE from 'three';
import type { WeaponId } from '../game/types';
import { lambert, unitBox, unitCyl } from './shared';

type Vec3Tuple = [number, number, number];

interface PartSpec {
  shape: 'box' | 'cyl';
  /** box: [w, h, d]; cyl: [radius, length, unused] with the axis along Z. */
  size: Vec3Tuple;
  pos: Vec3Tuple;
  /** Euler rotation in degrees. */
  rot?: Vec3Tuple;
  color: number;
  emissive?: number;
}

export interface WeaponModelSpec {
  parts: PartSpec[];
  muzzle: Vec3Tuple;
  /** Where the support hand goes (view model). */
  foregrip: Vec3Tuple;
  /** Ejection port (for casing puffs / smoke). */
  length: number;
}

const METAL = 0x2f3236;
const DARK = 0x1b1c1f;
const STEEL = 0x8d9096;
const WOOD = 0x8a5a2b;
const WOOD_DARK = 0x6a4220;
const OLIVE = 0x4d5b3c;
const POLY = 0x232427;

const b = (size: Vec3Tuple, pos: Vec3Tuple, color: number, rot?: Vec3Tuple): PartSpec => ({ shape: 'box', size, pos, color, rot });
const c = (radius: number, length: number, pos: Vec3Tuple, color: number): PartSpec => ({ shape: 'cyl', size: [radius, length, 0], pos, color });

export const WEAPON_MODELS: Record<WeaponId, WeaponModelSpec> = {
  ak47: {
    length: 0.9,
    muzzle: [0, 0.045, -0.7],
    foregrip: [0, 0.0, -0.4],
    parts: [
      b([0.05, 0.07, 0.3], [0, 0.03, -0.08], METAL),
      b([0.046, 0.022, 0.24], [0, 0.078, -0.1], STEEL),
      c(0.011, 0.4, [0, 0.045, -0.5], DARK),
      c(0.008, 0.26, [0, 0.083, -0.42], STEEL),
      b([0.008, 0.032, 0.01], [0, 0.09, -0.66], DARK),
      b([0.062, 0.052, 0.26], [0, 0.03, -0.4], WOOD),
      b([0.046, 0.1, 0.26], [0, -0.005, 0.27], WOOD, [-6, 0, 0]),
      b([0.036, 0.1, 0.045], [0, -0.075, 0.05], WOOD_DARK, [-16, 0, 0]),
      b([0.04, 0.11, 0.06], [0, -0.1, -0.1], DARK, [8, 0, 0]),
      b([0.04, 0.09, 0.06], [0, -0.19, -0.07], DARK, [22, 0, 0]),
    ],
  },
  m4a4: {
    length: 0.86,
    muzzle: [0, 0.04, -0.76],
    foregrip: [0, 0.0, -0.36],
    parts: [
      b([0.05, 0.08, 0.3], [0, 0.035, -0.06], POLY),
      b([0.028, 0.02, 0.28], [0, 0.093, -0.06], METAL),
      b([0.056, 0.058, 0.28], [0, 0.035, -0.36], METAL),
      c(0.009, 0.24, [0, 0.04, -0.6], DARK),
      c(0.014, 0.06, [0, 0.04, -0.72], POLY),
      b([0.006, 0.03, 0.006], [0, 0.085, -0.62], DARK),
      b([0.042, 0.075, 0.2], [0, 0.02, 0.24], POLY),
      c(0.016, 0.16, [0, 0.03, 0.3], METAL),
      b([0.036, 0.1, 0.045], [0, -0.075, 0.05], POLY, [-16, 0, 0]),
      b([0.036, 0.16, 0.05], [0, -0.115, -0.1], METAL, [6, 0, 0]),
    ],
  },
  awp: {
    length: 1.25,
    muzzle: [0, 0.05, -1.0],
    foregrip: [0, 0.0, -0.36],
    parts: [
      b([0.056, 0.092, 0.44], [0, 0.03, -0.02], OLIVE),
      b([0.052, 0.115, 0.34], [0, -0.002, 0.34], OLIVE, [-4, 0, 0]),
      b([0.056, 0.03, 0.14], [0, 0.052, 0.32], DARK),
      c(0.014, 0.6, [0, 0.05, -0.66], DARK),
      c(0.021, 0.09, [0, 0.05, -0.97], METAL),
      c(0.028, 0.3, [0, 0.145, -0.12], DARK),
      c(0.034, 0.035, [0, 0.145, -0.28], METAL),
      c(0.032, 0.035, [0, 0.145, 0.04], METAL),
      b([0.02, 0.05, 0.02], [0, 0.105, -0.2], METAL),
      b([0.02, 0.05, 0.02], [0, 0.105, -0.03], METAL),
      b([0.085, 0.014, 0.014], [0.07, 0.075, 0.06], STEEL),
      b([0.04, 0.07, 0.1], [0, -0.04, -0.02], DARK),
      b([0.036, 0.1, 0.045], [0, -0.075, 0.08], OLIVE, [-16, 0, 0]),
    ],
  },
  glock: {
    length: 0.2,
    muzzle: [0, 0.05, -0.17],
    foregrip: [0, 0.0, -0.04],
    parts: [
      b([0.03, 0.038, 0.2], [0, 0.05, -0.07], DARK),
      b([0.028, 0.03, 0.17], [0, 0.017, -0.05], POLY),
      b([0.03, 0.105, 0.048], [0, -0.048, 0.02], POLY, [-13, 0, 0]),
      b([0.012, 0.02, 0.05], [0, 0.0, -0.02], POLY),
      c(0.0065, 0.02, [0, 0.05, -0.17], STEEL),
      b([0.006, 0.01, 0.006], [0, 0.073, -0.15], STEEL),
    ],
  },
  usp: {
    length: 0.3,
    muzzle: [0, 0.052, -0.28],
    foregrip: [0, 0.0, -0.04],
    parts: [
      b([0.03, 0.04, 0.22], [0, 0.052, -0.08], STEEL),
      b([0.03, 0.03, 0.18], [0, 0.017, -0.06], DARK),
      b([0.03, 0.105, 0.05], [0, -0.048, 0.02], POLY, [-13, 0, 0]),
      c(0.017, 0.13, [0, 0.052, -0.245], DARK),
      b([0.006, 0.012, 0.006], [0, 0.076, -0.16], DARK),
    ],
  },
  deagle: {
    length: 0.27,
    muzzle: [0, 0.055, -0.245],
    foregrip: [0, 0.0, -0.05],
    parts: [
      b([0.038, 0.055, 0.26], [0, 0.055, -0.1], STEEL),
      b([0.036, 0.04, 0.2], [0, 0.015, -0.07], DARK),
      b([0.034, 0.115, 0.055], [0, -0.05, 0.03], POLY, [-13, 0, 0]),
      b([0.012, 0.012, 0.22], [0, 0.088, -0.1], METAL),
      c(0.009, 0.02, [0, 0.055, -0.245], DARK),
    ],
  },
  knife: {
    length: 0.3,
    muzzle: [0, 0, -0.32],
    foregrip: [0, 0, 0],
    parts: [
      b([0.028, 0.03, 0.12], [0, 0, 0.02], DARK),
      b([0.07, 0.02, 0.016], [0, 0, -0.045], METAL),
      b([0.008, 0.042, 0.2], [0, 0.004, -0.15], 0xc9ced4),
      b([0.008, 0.02, 0.06], [0, -0.008, -0.3], 0xc9ced4, [-18, 0, 0]),
    ],
  },
  c4: {
    length: 0.24,
    muzzle: [0, 0, 0],
    foregrip: [0, 0, 0],
    parts: [
      b([0.24, 0.07, 0.15], [0, 0, -0.05], 0x40483a),
      b([0.245, 0.02, 0.05], [0, 0.0, -0.05], 0xb9702d),
      b([0.1, 0.02, 0.05], [-0.04, 0.045, -0.05], 0x101112),
      { shape: 'box', size: [0.018, 0.012, 0.018], pos: [0.06, 0.05, -0.05], color: 0xff2211, emissive: 0xff2211 },
      c(0.006, 0.12, [0.05, 0.04, 0.03], 0x1f6fbf),
    ],
  },
};

// --------------------------------------------------------------------------------------------------------------------

export interface WeaponModel {
  group: THREE.Group;
  /** Muzzle marker (child of `group`): attach flashes here. */
  muzzle: THREE.Object3D;
  /** Position of the support hand grip in model space. */
  foregrip: THREE.Vector3;
}

/** Build a fresh model instance (geometries and materials are shared between instances). */
export const buildWeaponModel = (id: WeaponId): WeaponModel => {
  const spec = WEAPON_MODELS[id];
  const group = new THREE.Group();
  group.name = 'weapon:' + id;
  for (const p of spec.parts) {
    let mesh: THREE.Mesh;
    if (p.shape === 'box') {
      mesh = new THREE.Mesh(unitBox, lambert(p.color, p.emissive));
      mesh.scale.set(p.size[0], p.size[1], p.size[2]);
    } else {
      mesh = new THREE.Mesh(unitCyl, lambert(p.color, p.emissive));
      mesh.scale.set(p.size[0], p.size[1], p.size[0]);
      mesh.rotation.x = Math.PI / 2;
    }
    mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
    if (p.rot) {
      // Extra tilt applied after the base orientation.
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((p.rot[0] * Math.PI) / 180, (p.rot[1] * Math.PI) / 180, (p.rot[2] * Math.PI) / 180));
      mesh.quaternion.premultiply(q);
    }
    group.add(mesh);
  }
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(spec.muzzle[0], spec.muzzle[1], spec.muzzle[2]);
  group.add(muzzle);
  return { group, muzzle, foregrip: new THREE.Vector3(spec.foregrip[0], spec.foregrip[1], spec.foregrip[2]) };
};
