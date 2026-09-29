import * as THREE from 'three';
import type { WeaponModelSpec } from '../core/weapons/models.ts';
import { boxGeo, cylGeo, vertexColorMaterial } from './geo.ts';

export interface WeaponRig {
  group: THREE.Group;
  /** parts grouped by their animation tag ('mag', 'slide', 'bolt', 'blade', 'lens') */
  tagged: Map<string, { obj: THREE.Object3D; home: THREE.Vector3 }[]>;
  muzzle: THREE.Object3D;
}

const lensMat = new THREE.MeshBasicMaterial({ color: 0x4f86d6 });

/** Build a weapon from its procedural spec (boxes + a few cylinders). */
export function buildWeaponRig(spec: WeaponModelSpec): WeaponRig {
  const group = new THREE.Group();
  const tagged: WeaponRig['tagged'] = new Map();
  const mat = vertexColorMaterial();
  for (const p of spec.parts) {
    const geo = p.shape === 'box' ? boxGeo(p.size[0], p.size[1], p.size[2], p.color) : cylGeo(p.size[0], p.size[1], p.color);
    const mesh = new THREE.Mesh(geo, p.emissive ? lensMat : mat);
    mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
    if (p.rot) mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    group.add(mesh);
    if (p.tag) {
      let list = tagged.get(p.tag);
      if (!list) {
        list = [];
        tagged.set(p.tag, list);
      }
      list.push({ obj: mesh, home: mesh.position.clone() });
    }
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(spec.muzzle[0], spec.muzzle[1], spec.muzzle[2]);
  group.add(muzzle);
  return { group, tagged, muzzle };
}
