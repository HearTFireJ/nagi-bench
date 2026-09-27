import * as THREE from "three";
import { buildVoxelGeometry, voxelMaterial, voxelSphere } from "@agentbench/voxel-kit";
import { block, mat, hash3, rng } from "../util";
import { meteorite, teacup, magnifier } from "../props";

/**
 * The collector's study: a dim room inside a hutong courtyard house. Glass cases
 * line two walls, each a tiny lit museum. A single warm bench lamp does most of
 * the work; grey daylight leaks through a lattice window.
 */
export interface StudySet {
  group: THREE.Group;
  benchTop: THREE.Vector3;
  lamp: THREE.SpotLight;
  daylight: THREE.DirectionalLight;
  stones: THREE.Mesh[];           // the three iron meteorites on the bench
  cups: THREE.Mesh[];
  lens: THREE.Mesh;
  door: THREE.Mesh;
  update(time: number): void;
}

export function buildStudy(): StudySet {
  const g = new THREE.Group();
  g.name = "set:study";

  const W = 9, D = 6, H = 3.4;

  // Floor: dark wooden boards, drawn as a voxel slab with per-board tone.
  const floorGeo = buildVoxelGeometry({
    size: [W * 4, 1, D * 4],
    at(x, _y, z) {
      const board = Math.floor(z / 2) + Math.floor(x / 9) * 3;
      const t = hash3(board, 1, 7);
      const base = new THREE.Color(0x4b3324).offsetHSL(0, 0, (t - 0.5) * 0.08);
      if (x % 9 === 0 || z % 2 === 0) base.multiplyScalar(0.8);
      return base.getHex();
    },
  }, { voxel: 0.25, anchor: "center" });
  const floor = new THREE.Mesh(floorGeo, voxelMaterial({ roughness: 0.75 }));
  floor.position.y = -0.125;
  floor.receiveShadow = true;
  g.add(floor);

  // Walls and ceiling: grey plaster, dark timber beams.
  const plaster = mat(0x6a5f52, { roughness: 1 });
  const timber = mat(0x2f2119, { roughness: 0.9 });
  g.add(block(W, H, 0.2, plaster, 0, H / 2, -D / 2 - 0.1));
  g.add(block(W, H, 0.2, plaster, 0, H / 2, D / 2 + 0.1));
  g.add(block(0.2, H, D, plaster, -W / 2 - 0.1, H / 2, 0));
  g.add(block(0.2, H, D, plaster, W / 2 + 0.1, H / 2, 0));
  g.add(block(W, 0.2, D, timber, 0, H + 0.1, 0));
  for (let i = -3; i <= 3; i++) g.add(block(0.22, 0.3, D, timber, i * 1.3, H - 0.15, 0));
  g.add(block(W, 0.3, 0.2, timber, 0, H - 0.15, -D / 2 + 0.1));

  // Door on the +Z wall, left side.
  const door = block(1.0, 2.2, 0.08, mat(0x5a3b26, { roughness: 0.8 }), 0, 1.1, 0);
  door.geometry.translate(0.5, 0, 0);             // hinge on the left edge
  door.position.set(-3.5, 0, D / 2 - 0.05);
  g.add(door);
  g.add(block(1.2, 0.12, 0.3, timber, -3.0, 2.26, D / 2 - 0.05));

  // Lattice window on the +X wall: paper pane behind a dark grid.
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.7, 1.9), new THREE.MeshStandardMaterial({ color: 0xd8d0be, emissive: 0xcfc6b2, emissiveIntensity: 0.55, roughness: 1 }));
  paper.position.set(W / 2 - 0.02, 1.85, 0.6);
  g.add(paper);
  for (let i = 0; i <= 6; i++) g.add(block(0.08, 1.7, 0.06, timber, W / 2 - 0.08, 1.85, 0.6 - 0.95 + (1.9 / 6) * i, false));
  for (let i = 0; i <= 5; i++) g.add(block(0.08, 0.06, 1.9, timber, W / 2 - 0.08, 1.85 - 0.85 + (1.7 / 5) * i, 0.6, false));

  // Glass cases: three on the -X wall, three on the -Z wall.
  const caseFrame = mat(0x2a1d16, { roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb8c8, transparent: true, opacity: 0.14, roughness: 0.1, metalness: 0.1, depthWrite: false });
  const shelfMat = mat(0x1a1512);
  const spotlights: THREE.SpotLight[] = [];
  const stoneMat = voxelMaterial({ roughness: 0.55, metalness: 0.45 });
  const r = rng(404);
  const buildCase = (x: number, z: number, rotY: number, lit: boolean) => {
    const c = new THREE.Group();
    c.position.set(x, 0, z);
    c.rotation.y = rotY;
    const w = 1.0, d = 0.45, h = 2.1;
    c.add(block(w, 0.08, d, caseFrame, 0, 0.04, 0));
    c.add(block(w, 0.08, d, caseFrame, 0, h - 0.04, 0));
    for (const sx of [-1, 1]) {
      c.add(block(0.06, h, 0.06, caseFrame, sx * (w / 2 - 0.03), h / 2, d / 2 - 0.03));
      c.add(block(0.06, h, 0.06, caseFrame, sx * (w / 2 - 0.03), h / 2, -d / 2 + 0.03));
    }
    c.add(block(w, h, 0.04, shelfMat, 0, h / 2, -d / 2 + 0.02, false));           // back panel
    const pane = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, h - 0.16, 0.02), glass);
    pane.position.set(0, h / 2, d / 2 - 0.02);
    c.add(pane);
    for (let s = 0; s < 4; s++) {
      const y = 0.4 + s * 0.48;
      c.add(block(w - 0.12, 0.04, d - 0.1, shelfMat, 0, y, 0, false));
      const n = 2 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) {
        const rad = 1 + Math.floor(r() * 2);
        const stone = new THREE.Mesh(voxelSphere(rad, (vx, vy, vz, dd) => {
          const t = hash3(vx + k, vy + s, vz + rad);
          if (dd > 0.82 + (t - 0.5) * 0.4) return null;
          return t < 0.2 ? 0x5c4030 : t < 0.5 ? 0x3d3f45 : 0x55575d;
        }, { voxel: 0.035 }), stoneMat);
        stone.position.set(-0.3 + (k + 0.5) * (0.8 / n) + (r() - 0.5) * 0.08, y + 0.02 + rad * 0.035, (r() - 0.5) * 0.15);
        c.add(stone);
        // A label card under each stone.
        c.add(block(0.09, 0.005, 0.06, mat(0xe8e0cc), stone.position.x, y + 0.023, 0.13, false));
      }
      // A thin strip lamp above each shelf, painted as an emissive bar.
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.02, 0.04), new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffe2b0, emissiveIntensity: 1.6 }));
      strip.position.set(0, y + 0.44, d / 2 - 0.1);
      c.add(strip);
    }
    if (lit) {
      const sp = new THREE.SpotLight(0xffe0b5, 14, 2.6, 0.55, 0.6, 1.4);
      sp.position.set(0, h - 0.1, 0.05);
      sp.target.position.set(0, 0, 0);
      c.add(sp, sp.target);
      spotlights.push(sp);
    }
    g.add(c);
  };
  buildCase(-W / 2 + 0.3, -1.6, Math.PI / 2, true);
  buildCase(-W / 2 + 0.3, -0.4, Math.PI / 2, false);
  buildCase(-W / 2 + 0.3, 0.8, Math.PI / 2, true);
  buildCase(-1.2, -D / 2 + 0.3, 0, true);
  buildCase(0.0, -D / 2 + 0.3, 0, false);
  buildCase(3.6, -D / 2 + 0.3, 0, true);

  // A green steel safe in the corner: the Martian stone lives there, unseen.
  g.add(block(0.6, 0.8, 0.6, mat(0x2f4a3a, { roughness: 0.5, metalness: 0.5 }), 3.9, 0.4, -2.2));
  g.add(block(0.08, 0.08, 0.08, mat(0xc9c9c9, { metalness: 0.8, roughness: 0.3 }), 3.6, 0.5, -2.2, false));

  // Workbench.
  const benchTopMat = mat(0x6d4a2c, { roughness: 0.7 });
  const bench = new THREE.Group();
  bench.position.set(1.4, 0, -1.4);
  bench.add(block(1.9, 0.07, 0.85, benchTopMat, 0, 0.78, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bench.add(block(0.08, 0.76, 0.08, timber, sx! * 0.88, 0.38, sz! * 0.36));
  bench.add(block(1.7, 0.05, 0.6, timber, 0, 0.3, 0, false));
  // Bench lamp: a green shade on a stem, real spotlight beneath it.
  bench.add(block(0.05, 0.55, 0.05, mat(0x8a7a3a, { metalness: 0.6, roughness: 0.4 }), 0.7, 1.09, -0.3, false));
  const shade = block(0.5, 0.14, 0.26, mat(0x2d5a3a, { roughness: 0.5 }), 0.45, 1.38, -0.25, false);
  bench.add(shade);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, 0.16), new THREE.MeshStandardMaterial({ color: 0xffefc9, emissive: 0xffe0a8, emissiveIntensity: 2.2 }));
  bulb.position.set(0.45, 1.3, -0.25);
  bench.add(bulb);
  const lamp = new THREE.SpotLight(0xffd9a3, 34, 4.5, 0.75, 0.5, 1.2);
  lamp.position.set(0.45, 1.32, -0.25);
  lamp.target.position.set(0.1, 0.8, 0.1);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0008;
  lamp.shadow.camera.near = 0.2;
  lamp.shadow.camera.far = 6;
  bench.add(lamp, lamp.target);
  // Odds and ends on the bench.
  const lens = magnifier();
  lens.position.set(-0.35, 0.85, 0.1);
  lens.rotation.set(-1.3, 0.3, 0);
  bench.add(lens);
  bench.add(block(0.18, 0.02, 0.24, mat(0xe9e2cf), -0.6, 0.83, -0.15, false));   // notebook
  bench.add(block(0.4, 0.28, 0.02, mat(0x1b1d22), 0.6, 0.98, -0.25, false));      // small screen, off
  // Two tea cups.
  const cups = [teacup(), teacup()];
  cups[0]!.position.set(-0.65, 0.815, 0.28);
  cups[1]!.position.set(0.2, 0.815, 0.3);
  bench.add(cups[0]!, cups[1]!);
  // Three iron meteorites, revealed one by one.
  const stones = [meteorite(3, 3, 0.03), meteorite(11, 3, 0.03), meteorite(27, 3, 0.03)];
  stones.forEach((s, i) => {
    s.position.set(-0.25 + i * 0.28, 0.9, 0.05);
    s.rotation.set(i * 0.7, i * 1.3, 0);
    s.visible = false;
    bench.add(s);
  });
  g.add(bench);

  // Two stools.
  const stool = (x: number, z: number) => {
    const s = new THREE.Group();
    s.position.set(x, 0, z);
    s.add(block(0.4, 0.05, 0.4, benchTopMat, 0, 0.47, 0));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s.add(block(0.05, 0.46, 0.05, timber, sx! * 0.16, 0.23, sz! * 0.16));
    g.add(s);
  };
  stool(1.4, -2.3);
  stool(-2.2, 1.6);

  // Daylight through the lattice: grey, low, from high on +X.
  const daylight = new THREE.DirectionalLight(0xb9c4d2, 0.55);
  daylight.position.set(6, 4.5, 1.2);
  daylight.target.position.set(0, 0.8, 0);
  daylight.castShadow = true;
  daylight.shadow.mapSize.set(1024, 1024);
  daylight.shadow.camera.left = -6; daylight.shadow.camera.right = 6;
  daylight.shadow.camera.top = 5; daylight.shadow.camera.bottom = -5;
  daylight.shadow.camera.near = 1; daylight.shadow.camera.far = 16;
  daylight.shadow.bias = -0.001;
  g.add(daylight, daylight.target);
  g.add(new THREE.HemisphereLight(0x5a5248, 0x1e1712, 0.55));

  const benchTop = new THREE.Vector3(1.4, 0.82, -1.4);

  return {
    group: g,
    benchTop,
    lamp,
    daylight,
    stones,
    cups,
    lens,
    door,
    update(time) {
      // The bench lamp breathes a little, like an old bulb.
      lamp.intensity = 34 + Math.sin(time * 7.3) * 0.6 + Math.sin(time * 13.1) * 0.4;
      for (const sp of spotlights) sp.intensity = 14 + Math.sin(time * 5.1 + sp.position.x) * 0.3;
    },
  };
}
