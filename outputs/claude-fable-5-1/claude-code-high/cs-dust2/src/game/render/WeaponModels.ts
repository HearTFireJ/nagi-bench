import * as THREE from 'three';
import type { WeaponModelStyle } from '../weapons/WeaponDefs';

/**
 * Procedural weapon meshes. Every model is built so that the grip / hand is at the
 * origin and the barrel points along -Z. Units are meters.
 */

const mats = {
  black: new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.55, metalness: 0.5 }),
  gunmetal: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.45, metalness: 0.7 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.7, metalness: 0.05 }),
  awpGreen: new THREE.MeshStandardMaterial({ color: 0x4f5d3a, roughness: 0.6, metalness: 0.3 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.9 }),
  blade: new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.25, metalness: 1.0 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x77aaff, roughness: 0.1, metalness: 0.2, emissive: 0x112244 }),
  polymer: new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.8, metalness: 0.1 }),
};

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** Cylinder along the Z axis. */
function tube(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, r2 = r): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, len, 10), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export interface WeaponModel {
  group: THREE.Group;
  /** Local position of the muzzle. */
  muzzle: THREE.Vector3;
  /** Local position where the second (support) hand rests. */
  supportHand: THREE.Vector3;
}

export function buildWeaponModel(style: WeaponModelStyle): WeaponModel {
  const g = new THREE.Group();
  let muzzle = new THREE.Vector3(0, 0.05, -0.5);
  let support = new THREE.Vector3(0, 0, -0.25);
  switch (style) {
    case 'ak': {
      g.add(box(0.045, 0.07, 0.3, mats.gunmetal, 0, 0.06, -0.1)); // receiver
      g.add(box(0.05, 0.03, 0.12, mats.gunmetal, 0, 0.11, -0.06)); // dust cover top
      g.add(box(0.05, 0.065, 0.2, mats.wood, 0, 0.055, -0.34)); // handguard
      g.add(tube(0.011, 0.34, mats.black, 0, 0.075, -0.55)); // barrel
      g.add(tube(0.016, 0.05, mats.black, 0, 0.075, -0.71)); // muzzle brake
      g.add(box(0.012, 0.05, 0.012, mats.black, 0, 0.115, -0.66)); // front sight
      const mag = box(0.035, 0.2, 0.07, mats.gunmetal, 0, -0.06, -0.19);
      mag.rotation.x = 0.35;
      g.add(mag);
      const grip = box(0.035, 0.11, 0.045, mats.wood, 0, -0.03, -0.02);
      grip.rotation.x = -0.3;
      g.add(grip);
      const stock = box(0.045, 0.06, 0.26, mats.wood, 0, 0.04, 0.17);
      stock.rotation.x = 0.06;
      g.add(stock);
      muzzle = new THREE.Vector3(0, 0.075, -0.74);
      support = new THREE.Vector3(0, 0.02, -0.34);
      break;
    }
    case 'm4': {
      g.add(box(0.05, 0.07, 0.28, mats.black, 0, 0.06, -0.08)); // upper/lower receiver
      g.add(box(0.03, 0.04, 0.16, mats.black, 0, 0.12, -0.06)); // carry handle / rail
      g.add(box(0.012, 0.03, 0.012, mats.black, 0, 0.145, 0.0)); // rear sight
      g.add(tube(0.027, 0.24, mats.polymer, 0, 0.065, -0.34, 0.027)); // round handguard
      g.add(box(0.012, 0.045, 0.012, mats.black, 0, 0.12, -0.44)); // front sight post
      g.add(tube(0.009, 0.28, mats.black, 0, 0.07, -0.58)); // barrel
      g.add(tube(0.014, 0.05, mats.black, 0, 0.07, -0.72)); // flash hider
      const mag = box(0.03, 0.17, 0.06, mats.black, 0, -0.05, -0.15);
      mag.rotation.x = 0.12;
      g.add(mag);
      const grip = box(0.032, 0.1, 0.04, mats.polymer, 0, -0.03, -0.01);
      grip.rotation.x = -0.35;
      g.add(grip);
      g.add(tube(0.018, 0.2, mats.black, 0, 0.07, 0.15)); // buffer tube
      g.add(box(0.045, 0.09, 0.09, mats.polymer, 0, 0.045, 0.24)); // stock
      muzzle = new THREE.Vector3(0, 0.07, -0.75);
      support = new THREE.Vector3(0, 0.02, -0.36);
      break;
    }
    case 'awp': {
      g.add(box(0.05, 0.075, 0.5, mats.awpGreen, 0, 0.05, -0.2)); // stock body
      g.add(box(0.055, 0.09, 0.22, mats.awpGreen, 0, 0.03, 0.2)); // rear stock
      g.add(box(0.05, 0.03, 0.06, mats.black, 0, -0.03, 0.27)); // butt pad
      g.add(tube(0.02, 0.3, mats.gunmetal, 0, 0.09, -0.3)); // barrel shroud
      g.add(tube(0.012, 0.46, mats.black, 0, 0.09, -0.68)); // barrel
      g.add(tube(0.018, 0.07, mats.black, 0, 0.09, -0.92)); // muzzle
      // scope
      g.add(tube(0.02, 0.24, mats.black, 0, 0.155, -0.12));
      g.add(tube(0.028, 0.06, mats.black, 0, 0.155, -0.25, 0.024)); // objective bell
      g.add(tube(0.024, 0.04, mats.black, 0, 0.155, 0.0)); // eyepiece
      const lens = tube(0.02, 0.005, mats.glass, 0, 0.155, -0.283);
      g.add(lens);
      g.add(box(0.02, 0.03, 0.03, mats.black, 0, 0.12, -0.2)); // scope mount
      g.add(box(0.02, 0.03, 0.03, mats.black, 0, 0.12, -0.03));
      const bolt = box(0.012, 0.012, 0.05, mats.silver, 0.035, 0.09, -0.02);
      bolt.rotation.z = -0.6;
      g.add(bolt);
      g.add(box(0.035, 0.09, 0.06, mats.black, 0, -0.02, -0.2)); // magazine
      const grip = box(0.034, 0.1, 0.045, mats.awpGreen, 0, -0.03, 0.0);
      grip.rotation.x = -0.35;
      g.add(grip);
      g.add(tube(0.006, 0.12, mats.black, 0.02, -0.005, -0.7)); // bipod leg stubs
      g.add(tube(0.006, 0.12, mats.black, -0.02, -0.005, -0.7));
      muzzle = new THREE.Vector3(0, 0.09, -0.96);
      support = new THREE.Vector3(0, 0.0, -0.36);
      break;
    }
    case 'pistol': {
      g.add(box(0.03, 0.03, 0.19, mats.black, 0, 0.065, -0.07)); // slide
      g.add(box(0.03, 0.02, 0.17, mats.polymer, 0, 0.042, -0.06)); // frame
      g.add(tube(0.007, 0.03, mats.gunmetal, 0, 0.065, -0.17)); // barrel tip
      const grip = box(0.03, 0.09, 0.04, mats.polymer, 0, -0.005, 0.01);
      grip.rotation.x = -0.25;
      g.add(grip);
      g.add(box(0.008, 0.018, 0.02, mats.black, 0, 0.03, -0.04)); // trigger
      g.add(box(0.006, 0.012, 0.012, mats.black, 0, 0.085, 0.01)); // rear sight
      g.add(box(0.006, 0.012, 0.012, mats.black, 0, 0.085, -0.15)); // front sight
      muzzle = new THREE.Vector3(0, 0.065, -0.19);
      support = new THREE.Vector3(0, 0, 0.01);
      break;
    }
    case 'deagle': {
      g.add(box(0.036, 0.038, 0.24, mats.silver, 0, 0.07, -0.09)); // large slide
      g.add(box(0.036, 0.022, 0.2, mats.gunmetal, 0, 0.042, -0.07)); // frame
      g.add(tube(0.009, 0.04, mats.black, 0, 0.072, -0.22)); // barrel
      const grip = box(0.034, 0.1, 0.045, mats.black, 0, -0.01, 0.01);
      grip.rotation.x = -0.25;
      g.add(grip);
      g.add(box(0.008, 0.02, 0.02, mats.black, 0, 0.028, -0.05)); // trigger
      g.add(box(0.008, 0.014, 0.014, mats.black, 0, 0.096, 0.0)); // rear sight
      g.add(box(0.008, 0.014, 0.014, mats.black, 0, 0.096, -0.2)); // front sight
      muzzle = new THREE.Vector3(0, 0.072, -0.24);
      support = new THREE.Vector3(0, 0, 0.01);
      break;
    }
    case 'knife': {
      g.add(box(0.025, 0.1, 0.03, mats.polymer, 0, 0.0, 0.0)); // handle
      g.add(box(0.035, 0.012, 0.035, mats.silver, 0, 0.056, 0.0)); // guard
      const blade = box(0.005, 0.03, 0.16, mats.blade, 0, 0.07, -0.09);
      g.add(blade);
      const tip = box(0.005, 0.03, 0.05, mats.blade, 0, 0.075, -0.19);
      tip.rotation.x = -0.35;
      tip.scale.y = 0.6;
      g.add(tip);
      muzzle = new THREE.Vector3(0, 0.07, -0.2);
      support = new THREE.Vector3(0, 0, 0.0);
      break;
    }
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  return { group: g, muzzle, supportHand: support };
}

/** Small emissive plane used as a muzzle flash. */
export function buildMuzzleFlash(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(0.18, 0.18);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd27a,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.visible = false;
  return m;
}
