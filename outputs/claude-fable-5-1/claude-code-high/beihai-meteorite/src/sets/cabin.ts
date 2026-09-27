import * as THREE from "three";
import { block, mat } from "../util";
import { beacon } from "../props";

/**
 * Zhang Beihai's cabin on Base One: a padded grey cell with a locker, a shelf
 * and a sliding door. Only the shelf matters: the positioning unit stays here.
 */
export interface CabinSet {
  group: THREE.Group;
  shelfPoint: THREE.Vector3;
  unit: THREE.Group;
  unitLamp: THREE.Mesh;
  door: THREE.Mesh;
  update(time: number): void;
}

export function buildCabin(): CabinSet {
  const g = new THREE.Group();
  g.name = "set:cabin";
  const W = 2.6, D = 2.4, H = 2.2;
  const panel = mat(0xb9bec6, { roughness: 0.8 });
  const dark = mat(0x5c626b, { roughness: 0.7, metalness: 0.3 });
  g.add(block(W, 0.1, D, mat(0x8a9099), 0, -0.05, 0));
  g.add(block(W, 0.1, D, dark, 0, H + 0.05, 0));
  g.add(block(W, H, 0.1, panel, 0, H / 2, -D / 2));
  g.add(block(0.1, H, D, panel, -W / 2, H / 2, 0));
  g.add(block(0.1, H, D, panel, W / 2, H / 2, 0));
  // Padding seams on the walls.
  for (let i = -2; i <= 2; i++) g.add(block(0.02, H, 0.02, dark, i * 0.5, H / 2, -D / 2 + 0.06, false));
  // Sliding door on +Z.
  g.add(block(W, H, 0.1, panel, 0, H / 2, D / 2));
  const door = block(0.9, 1.9, 0.06, mat(0x7d8792, { roughness: 0.6, metalness: 0.4 }), -0.45, 0.95, D / 2 - 0.08);
  g.add(door);
  // Locker and shelf.
  g.add(block(0.6, 1.8, 0.45, dark, -0.9, 0.9, -D / 2 + 0.3));
  g.add(block(0.9, 0.04, 0.35, dark, 0.35, 1.25, -D / 2 + 0.25));
  g.add(block(0.9, 0.04, 0.35, dark, 0.35, 0.75, -D / 2 + 0.25));
  // Sleeping bag strapped to the wall.
  g.add(block(0.5, 1.7, 0.15, mat(0x334a6b, { roughness: 1 }), 0.95, 1.0, -D / 2 + 0.15));
  // Small strip lights.
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 0.08), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfe8ff, emissiveIntensity: 1.6 }));
  strip.position.set(0, H - 0.02, 0.2);
  g.add(strip);
  const light = new THREE.PointLight(0xdfe8ff, 6, 6, 1.4);
  light.position.set(0, H - 0.2, 0.3);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.bias = -0.003;
  g.add(light);
  g.add(new THREE.HemisphereLight(0x8a94a8, 0x33363c, 0.6));

  const unit = beacon();
  unit.position.set(0.55, 1.27, -D / 2 + 0.28);
  g.add(unit);
  const unitLamp = unit.getObjectByName("lamp") as THREE.Mesh;
  const shelfPoint = new THREE.Vector3(0.55, 1.27, -D / 2 + 0.28);

  return {
    group: g,
    shelfPoint,
    unit,
    unitLamp,
    door,
    update(time) {
      const m = unitLamp.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = (Math.floor(time * 1.5) % 2 === 0) ? 2.5 : 0.2;
    },
  };
}
