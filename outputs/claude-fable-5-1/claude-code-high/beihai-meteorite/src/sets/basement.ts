import * as THREE from "three";
import { voxelTerrain, voxelMaterial } from "@agentbench/voxel-kit";
import { block, mat, hash3 } from "../util";
import { cartridge, pliers, magazine, beef } from "../props";
import { ParticleField, MuzzleFlash } from "../fx";

/**
 * A hidden basement: raw concrete, one bare bulb on a wire, a card table with
 * thirty-six rounds laid out in rows, and a cloth bundle in the corner.
 */
export interface BasementSet {
  group: THREE.Group;
  bulb: THREE.PointLight;
  bulbMesh: THREE.Mesh;
  table: THREE.Group;
  rounds: THREE.Mesh[];
  heads: THREE.Mesh[];          // detached bullet heads, appear as rounds are converted
  segments: THREE.Mesh[];       // meteorite segments glued in place
  tool: THREE.Mesh;
  mags: THREE.Mesh[];
  bundle: THREE.Group;
  holes: THREE.Mesh[];
  beef: THREE.Mesh;
  fragments: THREE.Group;
  smoke: ParticleField;
  flash: MuzzleFlash;
  bundlePoint: THREE.Vector3;
  update(time: number): void;
}

export function buildBasement(): BasementSet {
  const g = new THREE.Group();
  g.name = "set:basement";
  const W = 4.6, D = 4.6, H = 2.5;

  const concrete = (seed: number) => (x: number, _y: number, z: number) =>
    new THREE.Color(0x6d6b62).offsetHSL(0, 0, (hash3(x, seed, z) - 0.5) * 0.08).getHex();
  const floor = new THREE.Mesh(voxelTerrain(23, 23, () => 1, concrete(1), { voxel: 0.2, anchor: "center" }), voxelMaterial({ roughness: 1 }));
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  g.add(floor);
  const wallMat = mat(0x5f6259, { roughness: 1 });
  g.add(block(W, H, 0.2, wallMat, 0, H / 2, -D / 2));
  g.add(block(W, H, 0.2, wallMat, 0, H / 2, D / 2));
  g.add(block(0.2, H, D, wallMat, -W / 2, H / 2, 0));
  g.add(block(0.2, H, D, wallMat, W / 2, H / 2, 0));
  g.add(block(W, 0.2, D, mat(0x4a4c46), 0, H, 0));
  // A pipe along one wall, a drain, a stack of crates.
  g.add(block(W, 0.12, 0.12, mat(0x4d4a45, { metalness: 0.5, roughness: 0.6 }), 0, H - 0.3, -D / 2 + 0.2));
  g.add(block(0.7, 0.6, 0.7, mat(0x4b3b2c), -1.7, 0.3, -1.7));
  g.add(block(0.7, 0.5, 0.7, mat(0x54432f), -1.7, 0.85, -1.7));
  const steps = new THREE.Group();
  for (let i = 0; i < 4; i++) steps.add(block(0.9, 0.25, 0.3, mat(0x55574f), -1.7, 0.125 + i * 0.25, 1.9 - i * 0.3));
  g.add(steps);

  // The bulb: wire, socket, glowing cube, and a shadow-casting point light.
  g.add(block(0.015, 0.5, 0.015, mat(0x111), 0, H - 0.25, 0, false));
  const bulbMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), new THREE.MeshStandardMaterial({ color: 0xffe9c4, emissive: 0xffd89a, emissiveIntensity: 3 }));
  bulbMesh.position.set(0, H - 0.56, 0);
  g.add(bulbMesh);
  const bulb = new THREE.PointLight(0xffd9a0, 22, 9, 1.4);
  bulb.position.set(0, H - 0.6, 0);
  bulb.castShadow = true;
  bulb.shadow.mapSize.set(1024, 1024);
  bulb.shadow.bias = -0.002;
  bulb.shadow.camera.near = 0.1;
  bulb.shadow.camera.far = 8;
  g.add(bulb);
  g.add(new THREE.HemisphereLight(0x2a2823, 0x0b0b0a, 0.5));

  // Card table with the rounds.
  const table = new THREE.Group();
  table.position.set(0.1, 0, 0.2);
  table.add(block(1.2, 0.04, 0.75, mat(0x3a4a3a, { roughness: 0.9 }), 0, 0.74, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) table.add(block(0.04, 0.72, 0.04, mat(0x2a2a2a, { metalness: 0.6 }), sx! * 0.55, 0.36, sz! * 0.33));
  const rounds: THREE.Mesh[] = [];
  const heads: THREE.Mesh[] = [];
  const segments: THREE.Mesh[] = [];
  for (let i = 0; i < 36; i++) {
    const c = cartridge(false);
    c.scale.setScalar(0.06);
    c.position.set(-0.42 + (i % 9) * 0.06, 0.76, -0.22 + Math.floor(i / 9) * 0.075);
    table.add(c);
    rounds.push(c);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.014), mat(0xb08a52, { metalness: 0.6, roughness: 0.4 }));
    h.position.set(0.28 + (i % 6) * 0.03, 0.766, -0.32 + Math.floor(i / 6) * 0.03);
    h.visible = false;
    table.add(h);
    heads.push(h);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.02, 0.013), mat(0x3d3f45, { metalness: 0.55, roughness: 0.5 }));
    s.position.copy(c.position).add(new THREE.Vector3(0.0, 0.1 * 0.06 + 0.026, 0));
    s.visible = false;
    table.add(s);
    segments.push(s);
  }
  const tool = pliers();
  tool.position.set(0.15, 0.775, 0.25);
  tool.rotation.y = 0.5;
  table.add(tool);
  table.add(block(0.03, 0.03, 0.12, mat(0xd8d3c8), 0.35, 0.775, 0.22, false));   // glue tube
  const mags = [magazine(), magazine()];
  mags.forEach((m, i) => { m.scale.setScalar(0.06); m.position.set(-0.45 + i * 0.07, 0.79, 0.28); m.rotation.z = Math.PI / 2; table.add(m); });
  g.add(table);
  // A folding chair behind the table.
  g.add(block(0.4, 0.04, 0.4, mat(0x2d3a4a), 0.1, 0.45, 0.85));
  g.add(block(0.4, 0.45, 0.04, mat(0x2d3a4a), 0.1, 0.72, 1.05));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(block(0.03, 0.45, 0.03, mat(0x2a2a2a), 0.1 + sx! * 0.18, 0.22, 0.85 + sz! * 0.18, false));

  // The cloth bundle in the far corner: suit fabric, layered.
  const bundle = new THREE.Group();
  bundle.position.set(1.6, 0, -1.6);
  const cloth = mat(0xd8d3c6, { roughness: 1 });
  bundle.add(block(0.5, 0.42, 0.42, cloth, 0, 0.21, 0));
  bundle.add(block(0.56, 0.08, 0.46, mat(0xbfb9aa), 0, 0.12, 0));
  bundle.add(block(0.56, 0.08, 0.46, mat(0xbfb9aa), 0, 0.3, 0));
  bundle.add(block(0.5, 0.3, 0.3, mat(0x9aa0a8), 0, 0.5, -0.1));     // crate behind
  const holes: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.03), mat(0x0a0a0a));
    hole.position.set(-0.252, 0.18 + (i % 2) * 0.08 + (i > 1 ? 0.02 : 0), -0.05 + i * 0.045);
    hole.visible = false;
    bundle.add(hole);
    holes.push(hole);
  }
  g.add(bundle);
  const bundlePoint = new THREE.Vector3(1.35, 0.25, -1.6);

  // The beef and the crushed fragments, shown at the end on the table.
  const meat = beef();
  meat.position.set(0.05, 0.86, 0.15);
  meat.visible = false;
  table.add(meat);
  const fragments = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.008 + hash3(i, 1, 1) * 0.008, 0.006 + hash3(i, 2, 1) * 0.006, 0.008 + hash3(i, 3, 1) * 0.008), mat(0x3d3f45, { metalness: 0.55, roughness: 0.5 }));
    f.position.set((hash3(i, 4, 1) - 0.5) * 0.06, 0.006, (hash3(i, 5, 1) - 0.5) * 0.05);
    f.rotation.y = hash3(i, 6, 1) * 3;
    fragments.add(f);
  }
  fragments.visible = false;
  g.add(fragments);

  const smoke = new ParticleField(900, false);
  g.add(smoke.points);
  const flash = new MuzzleFlash(0.5, 0xffc46b, 7);
  g.add(flash.group);

  return {
    group: g,
    bulb, bulbMesh, table, rounds, heads, segments, tool, mags, bundle, holes, beef: meat, fragments, smoke, flash, bundlePoint,
    update(time) {
      // Bulb sways a little on its wire and flickers.
      const sway = Math.sin(time * 1.7) * 0.02;
      bulb.position.x = sway;
      bulbMesh.position.x = sway;
      bulb.intensity = 22 + Math.sin(time * 23) * 0.5 + (hash3(Math.floor(time * 10), 9, 9) < 0.06 ? -3 : 0);
    },
  };
}
