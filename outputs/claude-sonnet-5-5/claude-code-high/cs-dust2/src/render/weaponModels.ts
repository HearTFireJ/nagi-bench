// Procedural weapon models built from boxes / cylinders. Barrel points to -Z, origin is at the
// pistol grip. Used for the first-person view model and for the weapon carried by characters.

import * as THREE from 'three';
import type { WeaponId } from '../sim/weapons.ts';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map<number, THREE.MeshLambertMaterial>();
const cylCache = new Map<string, THREE.CylinderGeometry>();

export function lambert(color: number): THREE.MeshLambertMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    matCache.set(color, m);
  }
  return m;
}

export function mkBox(
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(unitBox, lambert(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

/** Cylinder whose axis runs along Z. */
export function mkCyl(r: number, len: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const key = r.toFixed(4) + ':' + len.toFixed(4);
  let g = cylCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(r, r, len, 10, 1);
    cylCache.set(key, g);
  }
  const m = new THREE.Mesh(g, lambert(color));
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

export interface WeaponRig {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  /** grip positions (weapon-local) for the view-model hands */
  rightHand: THREE.Vector3;
  leftHand: THREE.Vector3 | null;
}

const METAL = 0x2a2a2d;
const DARK = 0x1b1b1e;
const WOOD = 0x8a4b1f;
const WOOD_D = 0x5f3313;
const SILVER = 0x9aa0a6;

export function buildWeapon(id: WeaponId): WeaponRig {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  let right = new THREE.Vector3(0, -0.07, 0.05);
  let left: THREE.Vector3 | null = null;

  switch (id) {
    case 'ak47': {
      g.add(mkBox(0.05, 0.085, 0.42, METAL, 0, 0, -0.1));
      g.add(mkBox(0.045, 0.02, 0.36, 0x333336, 0, 0.05, -0.1));
      g.add(mkBox(0.062, 0.06, 0.26, WOOD, 0, -0.005, -0.44));
      g.add(mkBox(0.05, 0.03, 0.24, WOOD_D, 0, 0.04, -0.44));
      g.add(mkCyl(0.011, 0.3, DARK, 0, 0.012, -0.72));
      g.add(mkCyl(0.009, 0.25, METAL, 0, 0.052, -0.56));
      g.add(mkBox(0.012, 0.045, 0.012, DARK, 0, 0.045, -0.82));
      g.add(mkCyl(0.015, 0.05, DARK, 0, 0.012, -0.9));
      g.add(mkBox(0.04, 0.14, 0.07, DARK, 0, -0.12, -0.14, -0.12));
      g.add(mkBox(0.04, 0.1, 0.07, DARK, 0, -0.235, -0.105, -0.42));
      g.add(mkBox(0.04, 0.11, 0.05, 0x222222, 0, -0.09, 0.08, 0.35));
      g.add(mkBox(0.042, 0.09, 0.22, WOOD, 0, -0.02, 0.3, 0.08));
      muzzle.position.set(0, 0.012, -0.94);
      right = new THREE.Vector3(0, -0.09, 0.08);
      left = new THREE.Vector3(0, -0.03, -0.42);
      break;
    }
    case 'm4a4': {
      g.add(mkBox(0.045, 0.07, 0.28, 0x1e1e21, 0, -0.01, -0.05));
      g.add(mkBox(0.05, 0.06, 0.36, METAL, 0, 0.045, -0.1));
      g.add(mkBox(0.03, 0.03, 0.12, DARK, 0, 0.1, -0.06));
      g.add(mkBox(0.012, 0.04, 0.012, DARK, 0, 0.06, -0.62));
      g.add(mkBox(0.06, 0.06, 0.3, 0x2c2c30, 0, 0.01, -0.42));
      g.add(mkBox(0.062, 0.012, 0.3, SILVER, 0, 0.04, -0.42));
      g.add(mkCyl(0.009, 0.18, DARK, 0, 0.012, -0.66));
      g.add(mkCyl(0.014, 0.07, DARK, 0, 0.012, -0.78));
      g.add(mkBox(0.035, 0.15, 0.06, 0x1a1a1c, 0, -0.12, -0.1, -0.08));
      g.add(mkBox(0.035, 0.1, 0.045, DARK, 0, -0.08, 0.06, 0.4));
      g.add(mkBox(0.042, 0.085, 0.2, 0x222225, 0, -0.01, 0.24));
      g.add(mkCyl(0.017, 0.18, METAL, 0, 0.012, 0.2));
      muzzle.position.set(0, 0.012, -0.82);
      right = new THREE.Vector3(0, -0.08, 0.06);
      left = new THREE.Vector3(0, -0.02, -0.4);
      break;
    }
    case 'awp': {
      g.add(mkBox(0.055, 0.09, 0.55, 0x55663d, 0, 0, -0.15));
      g.add(mkBox(0.05, 0.12, 0.3, 0x4a5a36, 0, -0.03, 0.3));
      g.add(mkBox(0.052, 0.03, 0.15, 0x3a4630, 0, 0.05, 0.3));
      g.add(mkCyl(0.014, 0.62, DARK, 0, 0.012, -0.76));
      g.add(mkBox(0.04, 0.04, 0.09, DARK, 0, 0.012, -1.08));
      g.add(mkCyl(0.028, 0.34, 0x141416, 0, 0.11, -0.12));
      g.add(mkCyl(0.034, 0.05, 0x0d0d0f, 0, 0.11, -0.3));
      g.add(mkCyl(0.034, 0.05, 0x0d0d0f, 0, 0.11, 0.06));
      g.add(mkBox(0.02, 0.05, 0.03, DARK, 0, 0.075, -0.2));
      g.add(mkBox(0.02, 0.05, 0.03, DARK, 0, 0.075, 0.0));
      g.add(mkBox(0.05, 0.016, 0.016, METAL, 0.05, 0.03, 0.05));
      g.add(mkBox(0.04, 0.06, 0.1, DARK, 0, -0.08, -0.1));
      g.add(mkBox(0.04, 0.11, 0.05, 0x333a2a, 0, -0.09, 0.09, 0.3));
      muzzle.position.set(0, 0.012, -1.14);
      right = new THREE.Vector3(0, -0.09, 0.09);
      left = new THREE.Vector3(0, -0.03, -0.3);
      break;
    }
    case 'glock': {
      g.add(mkBox(0.032, 0.036, 0.19, METAL, 0, 0.02, -0.07));
      g.add(mkBox(0.03, 0.026, 0.17, DARK, 0, -0.01, -0.06));
      g.add(mkBox(0.032, 0.1, 0.046, DARK, 0, -0.07, 0.01, 0.22));
      g.add(mkBox(0.01, 0.02, 0.05, DARK, 0, -0.03, -0.06));
      g.add(mkCyl(0.008, 0.03, DARK, 0, 0.02, -0.17));
      muzzle.position.set(0, 0.02, -0.19);
      right = new THREE.Vector3(0, -0.06, 0.02);
      break;
    }
    case 'usp': {
      g.add(mkBox(0.034, 0.038, 0.2, SILVER, 0, 0.02, -0.07));
      g.add(mkBox(0.03, 0.026, 0.17, DARK, 0, -0.01, -0.06));
      g.add(mkBox(0.032, 0.1, 0.046, DARK, 0, -0.07, 0.01, 0.22));
      g.add(mkCyl(0.017, 0.17, 0x17171a, 0, 0.02, -0.25));
      muzzle.position.set(0, 0.02, -0.34);
      right = new THREE.Vector3(0, -0.06, 0.02);
      break;
    }
    case 'deagle': {
      g.add(mkBox(0.042, 0.048, 0.28, 0xb4b7bc, 0, 0.026, -0.1));
      g.add(mkBox(0.036, 0.03, 0.22, 0x8f9297, 0, -0.008, -0.08));
      g.add(mkBox(0.038, 0.11, 0.056, 0x18181a, 0, -0.075, 0.02, 0.2));
      g.add(mkBox(0.03, 0.03, 0.05, 0x77797d, 0, 0.0, -0.23));
      g.add(mkBox(0.012, 0.012, 0.24, DARK, 0, 0.054, -0.1));
      muzzle.position.set(0, 0.026, -0.25);
      right = new THREE.Vector3(0, -0.07, 0.03);
      break;
    }
    case 'knife': {
      g.add(mkBox(0.006, 0.04, 0.2, 0xd4d9de, 0, 0.005, -0.13));
      g.add(mkBox(0.006, 0.022, 0.06, 0xd4d9de, 0, -0.004, -0.26));
      g.add(mkBox(0.014, 0.055, 0.016, DARK, 0, 0, -0.025));
      g.add(mkBox(0.026, 0.032, 0.115, 0x2b2b2d, 0, 0, 0.04));
      g.add(mkBox(0.03, 0.036, 0.02, METAL, 0, 0, 0.1));
      muzzle.position.set(0, 0, -0.28);
      right = new THREE.Vector3(0, 0, 0.04);
      break;
    }
  }
  g.add(muzzle);
  return { group: g, muzzle, rightHand: right, leftHand: left };
}

/** View-model placement (camera space) per weapon. */
export const VIEW_POSE: Record<WeaponId, { pos: [number, number, number]; rot: [number, number, number]; scale: number }> = {
  ak47: { pos: [0.17, -0.17, -0.38], rot: [0.02, 0.03, 0], scale: 1 },
  m4a4: { pos: [0.17, -0.165, -0.38], rot: [0.02, 0.03, 0], scale: 1 },
  awp: { pos: [0.16, -0.17, -0.34], rot: [0.02, 0.03, 0], scale: 0.9 },
  glock: { pos: [0.14, -0.14, -0.34], rot: [0.03, 0.04, 0], scale: 1.15 },
  usp: { pos: [0.14, -0.14, -0.34], rot: [0.03, 0.04, 0], scale: 1.1 },
  deagle: { pos: [0.14, -0.145, -0.34], rot: [0.03, 0.04, 0], scale: 1.1 },
  knife: { pos: [0.15, -0.14, -0.3], rot: [0.5, 0.3, 0.1], scale: 1.2 },
};

export const KICK_STRENGTH: Record<WeaponId, number> = {
  ak47: 1.0,
  m4a4: 0.55,
  awp: 2.4,
  glock: 0.7,
  usp: 0.6,
  deagle: 1.7,
  knife: 0,
};
