import * as THREE from "three";
import { voxelTerrain, voxelMaterial, voxelModel } from "@agentbench/voxel-kit";
import { block, mat, hash3 } from "../util";
import { meteorite, meteorSegment } from "../props";
import { ParticleField } from "../fx";

/**
 * A research-institute model shop after hours. One work lamp over a numerically
 * controlled lathe; cold moonlight from clerestory windows; racks receding into
 * the dark. The meteorite spins in the chuck and the cutter throws sparks.
 */
export interface WorkshopSet {
  group: THREE.Group;
  chuck: THREE.Group;
  workpiece: THREE.Mesh;
  cutter: THREE.Mesh;
  sparks: ParticleField;
  cutPoint: THREE.Vector3;
  segments: THREE.Mesh[];
  cloth: THREE.Mesh;
  lamp: THREE.SpotLight;
  update(time: number): void;
}

export function buildWorkshop(): WorkshopSet {
  const g = new THREE.Group();
  g.name = "set:workshop";
  const W = 16, D = 12, H = 5.5;

  const floor = new THREE.Mesh(voxelTerrain(32, 24, () => 1, (x, _y, z) => {
    const t = hash3(x, 3, z);
    return new THREE.Color(0x5c6066).offsetHSL(0, 0, (t - 0.5) * 0.06).getHex();
  }, { voxel: 0.5, anchor: "center" }), voxelMaterial({ roughness: 0.95 }));
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  g.add(floor);

  const wall = mat(0x3b4048, { roughness: 1 });
  g.add(block(W, H, 0.2, wall, 0, H / 2, -D / 2));
  g.add(block(W, H, 0.2, wall, 0, H / 2, D / 2));
  g.add(block(0.2, H, D, wall, -W / 2, H / 2, 0));
  g.add(block(0.2, H, D, wall, W / 2, H / 2, 0));
  g.add(block(W, 0.2, D, mat(0x2a2d33), 0, H, 0));

  // Clerestory windows on the -Z wall: pale blue panes.
  const pane = new THREE.MeshStandardMaterial({ color: 0x7f9ab8, emissive: 0x6d87a6, emissiveIntensity: 0.5, roughness: 1 });
  for (let i = -3; i <= 3; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.05), pane);
    p.position.set(i * 2.1, H - 0.9, -D / 2 + 0.12);
    g.add(p);
    g.add(block(0.06, 0.9, 0.08, mat(0x1c1e22), i * 2.1, H - 0.9, -D / 2 + 0.16, false));
  }
  const moon = new THREE.DirectionalLight(0x8fb2dc, 0.7);
  moon.position.set(2, 8, -6);
  moon.target.position.set(0, 0, 1);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -8; moon.shadow.camera.right = 8;
  moon.shadow.camera.top = 8; moon.shadow.camera.bottom = -8;
  moon.shadow.camera.far = 30;
  moon.shadow.bias = -0.001;
  g.add(moon, moon.target);

  // Racks and a second machine fading into the dark.
  const rackMat = mat(0x2c3037, { roughness: 0.8, metalness: 0.3 });
  for (let i = 0; i < 4; i++) {
    const x = -6.5 + i * 1.6;
    g.add(block(1.4, 2.6, 0.6, rackMat, x, 1.3, -D / 2 + 0.6));
    for (let s = 0; s < 3; s++) g.add(block(1.2, 0.06, 0.55, mat(0x4a4f57), x, 0.5 + s * 0.8, -D / 2 + 0.6, false));
  }
  g.add(block(2.6, 1.6, 1.4, rackMat, 5.5, 0.8, -2.5));
  g.add(block(1.2, 1.0, 0.8, rackMat, -5.5, 0.5, 3.5));

  // The lathe.
  const machine = new THREE.Group();
  machine.position.set(0, 0, 0);
  const body = mat(0x9aa3ad, { roughness: 0.5, metalness: 0.35 });
  const dark = mat(0x23262b, { roughness: 0.6, metalness: 0.4 });
  machine.add(block(3.2, 0.9, 1.6, body, 0, 0.45, 0));                    // base
  machine.add(block(3.2, 0.1, 1.6, dark, 0, 0.95, 0));                    // deck
  machine.add(block(0.9, 1.3, 1.6, body, -1.15, 1.6, 0));                 // headstock
  machine.add(block(3.2, 0.12, 1.6, body, 0, 2.3, 0));                    // canopy rail
  machine.add(block(0.12, 1.3, 1.6, body, 1.55, 1.6, 0));
  const shield = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.03), new THREE.MeshStandardMaterial({ color: 0xa9c4d8, transparent: true, opacity: 0.16, roughness: 0.1, depthWrite: false }));
  shield.position.set(0.35, 1.65, 0.8);
  machine.add(shield);
  // Control panel with a lit screen.
  machine.add(block(0.5, 0.7, 0.3, dark, 1.9, 1.4, 0.7));
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.02), new THREE.MeshStandardMaterial({ color: 0x1d5a3a, emissive: 0x33d17a, emissiveIntensity: 0.9 }));
  screen.position.set(1.9, 1.55, 0.86);
  machine.add(screen);
  for (let i = 0; i < 6; i++) {
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.01), new THREE.MeshStandardMaterial({ color: 0x222, emissive: i % 2 ? 0xff5a2a : 0x4aa8ff, emissiveIntensity: 1.2 }));
    key.position.set(1.75 + (i % 3) * 0.12, 1.25 - Math.floor(i / 3) * 0.1, 0.86);
    machine.add(key);
  }
  // Chuck + workpiece on the spindle axis (x), 1.55 m up.
  const chuck = new THREE.Group();
  chuck.position.set(-0.55, 1.55, 0);
  const jaws = voxelModel({
    palette: { "#": 0x3a3f47, j: 0x6a7079 },
    layers: [
      [".j###j.", "j#####j", "#######", "#######", "#######", "j#####j", ".j###j."],
      ["..###..", ".#####.", "#######", "#######", "#######", ".#####.", "..###.."],
      [".......", "..jjj..", ".j...j.", ".j...j.", ".j...j.", "..jjj..", "......."],
    ],
    axis: "x", voxel: 0.045, anchor: "center",
  });
  const chuckMesh = new THREE.Mesh(jaws, voxelMaterial({ roughness: 0.4, metalness: 0.6 }));
  chuckMesh.castShadow = true;
  chuck.add(chuckMesh);
  const workpiece = meteorite(5, 3, 0.03);
  workpiece.position.set(0.22, 0, 0);
  chuck.add(workpiece);
  machine.add(chuck);
  // Tool post and cutter approaching from +Z.
  machine.add(block(0.3, 0.5, 0.3, dark, -0.1, 1.2, 0.5));
  const cutter = block(0.04, 0.06, 0.4, mat(0xd9d4c8, { metalness: 0.9, roughness: 0.25 }), -0.1, 1.5, 0.35);
  machine.add(cutter);
  // Coolant lines, a tray with the finished segments.
  const cloth = block(0.9, 0.01, 0.6, mat(0x1f3a5a, { roughness: 1 }), 0.9, 1.01, 0.35, false);
  machine.add(cloth);
  const segments: THREE.Mesh[] = [];
  for (let i = 0; i < 36; i++) {
    const s = meteorSegment(0.0075);
    s.position.set(0.55 + (i % 9) * 0.085, 1.045, 0.15 + Math.floor(i / 9) * 0.1);
    s.visible = false;
    segments.push(s);
    machine.add(s);
  }
  g.add(machine);

  // Work lamp hanging over the machine, the only warm light in the room.
  const lampHousing = block(0.5, 0.15, 0.5, dark, -0.3, 3.4, 0.3, false);
  g.add(lampHousing);
  g.add(block(0.03, 2.0, 0.03, dark, -0.3, 4.45, 0.3, false));
  const tube = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.4), new THREE.MeshStandardMaterial({ color: 0xfff3dc, emissive: 0xfff0d0, emissiveIntensity: 2.5 }));
  tube.position.set(-0.3, 3.31, 0.3);
  g.add(tube);
  const lamp = new THREE.SpotLight(0xffe7c4, 60, 9, 0.62, 0.45, 1.3);
  lamp.position.set(-0.3, 3.35, 0.3);
  lamp.target.position.set(-0.3, 1.2, 0.2);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0006;
  lamp.shadow.camera.near = 0.5;
  lamp.shadow.camera.far = 10;
  g.add(lamp, lamp.target);
  g.add(new THREE.HemisphereLight(0x3b4c63, 0x0e0f12, 0.5));

  const sparks = new ParticleField(1500, true);
  g.add(sparks.points);
  const cutPoint = new THREE.Vector3(-0.33, 1.55, 0.13);

  return {
    group: g,
    chuck,
    workpiece,
    cutter,
    sparks,
    cutPoint,
    segments,
    cloth,
    lamp,
    update(time) {
      chuck.rotation.x = time * 22;
      lamp.intensity = 60 + Math.sin(time * 9.7) * 1.2;
    },
  };
}
