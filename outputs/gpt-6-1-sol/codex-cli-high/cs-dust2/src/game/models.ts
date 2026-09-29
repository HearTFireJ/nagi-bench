import * as THREE from "three";
import type { HitZone, Team, WeaponId } from "./types";
import { WEAPONS } from "./weapons";
const materials = new Map<number, THREE.MeshStandardMaterial>();
export function material(color: number, roughness = 0.82) {
  if (!materials.has(color))
    materials.set(color, new THREE.MeshStandardMaterial({ color, roughness }));
  return materials.get(color)!;
}
export function disposeMaterials() {
  for (const value of materials.values()) value.dispose();
  materials.clear();
}
export function box(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function tube(
  parent: THREE.Object3D,
  radius: number,
  length: number,
  x: number,
  y: number,
  z: number,
  color: number,
) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 10),
    material(color),
  );
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
export function weaponModel(
  id: WeaponId,
  firstPerson = false,
  team: Team = "CT",
) {
  const root = new THREE.Group();
  const c = WEAPONS[id].color;
  if (id === "knife") {
    box(root, 0.045, 0.07, 0.25, 0, 0, 0, 0x292e2b);
    const blade = box(root, 0.028, 0.11, 0.37, 0, 0.025, -0.31, 0xb7c7c8);
    blade.rotation.x = -0.08;
    box(root, 0.12, 0.025, 0.035, 0, 0, -0.13, 0x383e3d);
  } else if (WEAPONS[id].slot === 1) {
    box(root, 0.095, 0.1, 0.28, 0, 0.015, -0.08, c);
    box(root, 0.073, 0.12, 0.25, 0, -0.08, -0.055, 0x202727);
    const grip = box(root, 0.078, 0.16, 0.085, 0, -0.16, 0.015, 0x222828);
    grip.rotation.x = -0.22;
    tube(
      root,
      id === "usp" ? 0.022 : 0.018,
      id === "usp" ? 0.24 : 0.05,
      0,
      0.012,
      id === "usp" ? -0.33 : -0.23,
      0x171c1d,
    );
    box(root, 0.022, 0.025, 0.025, 0, 0.077, -0.17, 0x121718);
  } else {
    box(root, 0.105, 0.14, 0.4, 0, 0, -0.06, 0x252c2b);
    box(root, 0.12, 0.105, 0.29, 0, -0.015, -0.36, c);
    tube(
      root,
      0.023,
      id === "awp" ? 0.46 : 0.33,
      0,
      0.025,
      id === "awp" ? -0.68 : -0.61,
      0x1e2625,
    );
    tube(root, 0.031, 0.08, 0, 0.025, id === "awp" ? -0.92 : -0.8, 0x111a19);
    const stock = box(root, 0.095, 0.115, 0.28, 0, -0.015, 0.24, c);
    stock.rotation.x = 0.07;
    box(root, 0.12, 0.19, 0.04, 0, -0.047, 0.38, 0x242b2b);
    const grip = box(root, 0.06, 0.19, 0.075, 0, -0.14, 0.035, 0x292d27);
    grip.rotation.x = -0.2;
    const mag = box(
      root,
      0.075,
      id === "awp" ? 0.13 : 0.26,
      0.1,
      0,
      -0.16,
      -0.15,
      0x2a3230,
    );
    mag.rotation.x = id === "ak" ? -0.28 : 0.08;
    for (let i = 0; i < 7; i++)
      box(root, 0.125, 0.025, 0.014, 0, 0.055, -0.24 - i * 0.035, 0x1f2827);
    if (id === "awp") {
      tube(root, 0.055, 0.35, 0, 0.14, -0.12, 0x202827);
      tube(root, 0.072, 0.08, 0, 0.14, -0.32, 0x172321);
      tube(root, 0.054, 0.012, 0, 0.14, -0.367, 0x4d8790);
      box(root, 0.04, 0.1, 0.045, 0, 0.08, -0.08, 0x202827);
    } else {
      box(root, 0.035, 0.075, 0.035, 0, 0.115, -0.48, 0x1e2724);
      box(root, 0.065, 0.04, 0.1, 0, 0.1, 0.05, 0x141c1a);
    }
  }
  if (firstPerson) {
    const sleeve = team === "CT" ? 0x344c51 : 0x9b805c;
    const right = box(root, 0.135, 0.135, 0.4, 0.1, -0.22, 0.32, sleeve);
    right.rotation.x = -0.2;
    right.rotation.z = -0.18;
    box(root, 0.115, 0.12, 0.13, 0.025, -0.14, 0.11, 0x29322e);
    const left = box(root, 0.13, 0.13, 0.46, -0.16, -0.23, -0.02, sleeve);
    left.rotation.y = -0.65;
    left.rotation.x = 0.1;
    box(root, 0.11, 0.1, 0.15, -0.07, -0.115, -0.25, 0x29322e);
  }
  root.userData.weapon = id;
  return root;
}
export function humanoid(team: Team, id: number, weapon: WeaponId) {
  const root = new THREE.Group(),
    limbs: THREE.Mesh[] = [];
  const suit = team === "CT" ? 0x354f5c : 0xb19a71,
    vest = team === "CT" ? 0x243a45 : 0x705843;
  const pants = team === "CT" ? 0x344751 : 0x706956;
  const limb = (
    zone: HitZone,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    c: number,
  ) => {
    const m = box(root, w, h, d, x, y, z, c);
    m.userData = { actor: id, zone };
    limbs.push(m);
    return m;
  };
  limb("chest", 0.52, 0.45, 0.29, 0, 1.27, 0, suit);
  limb("abdomen", 0.43, 0.22, 0.28, 0, 0.95, 0, pants);
  box(root, 0.45, 0.36, 0.075, 0, 1.26, -0.18, vest);
  for (let i = 0; i < 3; i++)
    box(
      root,
      0.105,
      0.115,
      0.06,
      -0.14 + i * 0.14,
      1.17,
      -0.23,
      team === "CT" ? 0x586c68 : 0x8c7750,
    );
  limb("head", 0.29, 0.32, 0.28, 0, 1.67, -0.015, 0xb68c68);
  if (team === "CT") {
    box(root, 0.33, 0.19, 0.32, 0, 1.82, 0.015, 0x263d42);
    box(root, 0.31, 0.065, 0.025, 0, 1.71, -0.16, 0x101e22);
    box(root, 0.26, 0.1, 0.04, 0, 1.59, -0.16, 0x243338);
  } else {
    box(root, 0.3, 0.09, 0.29, 0, 1.82, 0, 0x665443);
    box(root, 0.31, 0.085, 0.03, 0, 1.59, -0.16, 0x9d7e5d);
    box(root, 0.25, 0.05, 0.03, 0, 1.71, -0.165, 0x29302c);
  }
  for (const side of [-1, 1]) {
    const upper = limb("arm", 0.16, 0.3, 0.17, side * 0.32, 1.29, -0.07, suit);
    upper.rotation.x = -0.6;
    upper.rotation.z = -side * 0.14;
    const fore = limb("arm", 0.14, 0.29, 0.15, side * 0.29, 1.12, -0.25, suit);
    fore.rotation.x = -1.45;
    fore.rotation.z = side * 0.23;
    limb("arm", 0.13, 0.12, 0.14, side * 0.2, 1.13, -0.42, 0x343b31);
    const leg = limb("leg", 0.19, 0.64, 0.22, side * 0.14, 0.54, 0.015, pants);
    leg.name = `leg${side}`;
    limb("leg", 0.2, 0.16, 0.32, side * 0.14, 0.13, -0.055, 0x282d29);
    box(root, 0.2, 0.14, 0.035, side * 0.14, 0.53, -0.12, vest);
  }
  const gun = weaponModel(weapon);
  gun.position.set(0.14, 1.17, -0.43);
  gun.scale.setScalar(0.8);
  gun.name = "gun";
  root.add(gun);
  const patch = box(
    root,
    0.08,
    0.07,
    0.01,
    0.2,
    1.4,
    -0.159,
    team === "CT" ? 0x80c8d1 : 0xe1bb65,
  );
  patch.name = "patch";
  return { root, limbs };
}
