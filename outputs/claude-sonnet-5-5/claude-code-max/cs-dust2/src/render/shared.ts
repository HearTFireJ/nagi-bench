// Shared geometries / materials for the procedural models (weapons, characters, props): one unit box and one unit
// cylinder scaled per part, and Lambert materials cached by colour.
import * as THREE from 'three';

export const unitBox = new THREE.BoxGeometry(1, 1, 1);
export const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 12);

const materials = new Map<string, THREE.MeshLambertMaterial>();

export const lambert = (color: number, emissive = 0): THREE.MeshLambertMaterial => {
  const key = color + ':' + emissive;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(emissive) });
    materials.set(key, m);
  }
  return m;
};

/** A box mesh of the given size centred at (x,y,z). */
export const boxMesh = (w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, emissive = 0): THREE.Mesh => {
  const m = new THREE.Mesh(unitBox, lambert(color, emissive));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
};

/** Lambert light rig shared by the world and view-model scenes. */
export const addSceneLights = (scene: THREE.Scene): void => {
  // Physically-based light units (three >= r155): these three sum to ~pi on an up-facing surface, i.e. albedo on screen,
  // and ~0.45 x albedo on faces turned away from the sun, which matches the baked shading of the static level.
  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x8f7c58, 1.2));
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.6);
  sun.position.set(0.45, 0.8, 0.35).multiplyScalar(50);
  scene.add(sun);
};
