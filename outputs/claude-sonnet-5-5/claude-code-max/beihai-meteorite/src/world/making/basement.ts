// 隐蔽的地下室：裸灯泡、混凝土、一张桌子、远端的靶子——一个可以把一声枪响关在里面的房间。
import * as THREE from "three";
import { voxelMaterial } from "@agentbench/voxel-kit";
import { Vox, noisy } from "../../util/vox";
import { hash2, hash3, noise3, fbm3 } from "../../util/math";
import { mix, shade } from "../../util/color";
import { glowSprite } from "../../util/glow";

export const BM = { x0: -2.4, x1: 2.4, z0: -2.7, z1: 2.9, h: 2.7 };
const VS = 0.0625;

function buildShell(): THREE.Mesh {
  const { x0, x1, z0, z1, h } = BM;
  const min: [number, number, number] = [x0 - 0.3, -0.13, z0 - 0.3];
  const max: [number, number, number] = [x1 + 0.3, h + 0.3, z1 + 0.3];
  const g = new Vox(min, max, VS);
  const paint = (x: number, y: number, z: number, i: number, j: number, k: number): number | null => {
    if (y < 0) {
      let c = mix(0x5a5c5e, 0x48494c, fbm3(x * 2, 0, z * 2, 2));
      if (Math.abs(x + 1.6) < 0.2 && Math.abs(z - 0.5) < 0.2) c = 0x2a2b2d; // 地漏
      return shade(c, 0.9 + hash3(i, j, k) * 0.16);
    }
    if (y > h) return shade(0x4a4c4f, 0.85 + hash3(i, j, k) * 0.2);
    const wall = x < x0 || x > x1 || z < z0 || z > z1;
    if (!wall) return null;
    // 混凝土：浇筑模板的横纹 + 污渍 + 水渍
    const stain = fbm3(x * 1.8, y * 0.9, z * 1.8, 3);
    let c = mix(0x8b8d8e, 0x6c6e70, stain);
    if (Math.abs(y - Math.round(y / 0.9) * 0.9) < 0.03) c = shade(c, 0.78); // 模板缝
    if (y < 0.5 && stain > 0.6) c = mix(c, 0x4c5a4a, 0.3); // 潮湿发绿
    return shade(c, 0.92 + hash3(i, j, k) * 0.14);
  };
  g.box(min[0], min[1], min[2], max[0], max[1], max[2], paint);
  g.clearBox(x0, 0, z0, x1, h, z1);
  // 顶上的管线
  for (const [x, r] of [[-1.5, 0.08], [-0.9, 0.05], [1.7, 0.1]] as Array<[number, number]>) g.cylZ(x, h - 0.16, r, z0, z1, noisy(0x505458, 0.08, 3));
  g.cylX(h - 0.4, -1.9, 0.05, x0, x1, noisy(0x6a4a3a, 0.1, 4));
  // 入口铁门（+Z 端）：留一个门洞
  g.clearBox(-0.55, 0, z1 - 0.02, 0.55, 2.1, z1 + 0.4);
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildTable(): THREE.Mesh {
  const g = new Vox([-0.9, 0, -0.4], [0.9, 0.95, 0.4], VS / 2);
  g.box(-0.9, 0.84, -0.4, 0.9, 0.92, 0.4, noisy(0x5d4a36, 0.1, 1));
  g.box(-0.9, 0.78, -0.4, 0.9, 0.84, 0.4, 0x2c3035);
  for (const [x, z] of [[-0.84, -0.34], [0.84, -0.34], [-0.84, 0.34], [0.84, 0.34]] as Array<[number, number]>) g.box(x - 0.04, 0, z - 0.04, x + 0.04, 0.78, z + 0.04, 0x2c3035);
  // 工具台面上的螺丝虎钳 + 工具排
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildShelf(): THREE.Mesh {
  const g = new Vox([-0.4, 0, -0.25], [0.4, 1.8, 0.25], VS / 2);
  for (const y of [0.5, 1.0, 1.5]) g.box(-0.4, y, -0.25, 0.4, y + 0.04, 0.25, noisy(0x6a5a44, 0.1, 5));
  for (const [x, z] of [[-0.38, -0.23], [0.38, -0.23], [-0.38, 0.23], [0.38, 0.23]] as Array<[number, number]>) g.box(x - 0.02, 0, z - 0.02, x + 0.02, 1.8, z + 0.02, 0x2c3035);
  // 上面杂物：罐子、纸箱
  g.box(-0.3, 0.54, -0.15, -0.1, 0.8, 0.1, noisy(0x8a6a3a, 0.1, 6));
  g.cylY(0.1, 0, 0.09, 0.54, 0.78, noisy(0xb0392b, 0.1, 7));
  g.box(-0.3, 1.04, -0.2, 0.3, 1.3, 0.2, noisy(0x9a7a4a, 0.1, 8));
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.castShadow = true;
  return m;
}

/** 弹药：推进药块 + 弹头（铜色）/ 陨石小段（灰色）。整体放大 1.7 倍以符合方块世界的比例 */
export const ROUND_S = 1.7;
export const ROUND_H = 0.048;

export function roundParts(): { prop: THREE.BufferGeometry; copper: THREE.BufferGeometry; iron: THREE.BufferGeometry } {
  const s = ROUND_S;
  const v = 0.0028 * s;
  const mkProp = () => {
    const g = new Vox([-0.009 * s, 0, -0.009 * s], [0.009 * s, 0.024 * s, 0.009 * s], v);
    g.box(-0.009 * s, 0, -0.009 * s, 0.009 * s, 0.024 * s, 0.009 * s, noisy(0xd7b878, 0.08, 1));
    return g.toGeometry();
  };
  const mkCopper = () => {
    const g = new Vox([-0.009 * s, 0, -0.009 * s], [0.009 * s, 0.02 * s, 0.009 * s], v);
    g.cylY(0, 0, 0.0085 * s, 0, 0.014 * s, noisy(0xb87333, 0.08, 2));
    g.cylY(0, 0, 0.0055 * s, 0.014 * s, 0.02 * s, noisy(0xc98545, 0.08, 3));
    return g.toGeometry();
  };
  const mkIron = () => {
    const g = new Vox([-0.009 * s, 0, -0.009 * s], [0.009 * s, 0.018 * s, 0.009 * s], v);
    g.cylY(0, 0, 0.0075 * s, 0, 0.016 * s, noisy(0x7c8188, 0.1, 4));
    g.cylY(0, 0, 0.0075 * s, 0.014 * s, 0.016 * s, 0xbfc4ca);
    return g.toGeometry();
  };
  return { prop: mkProp(), copper: mkCopper(), iron: mkIron() };
}

export function buildRoundSet(): { prop: THREE.InstancedMesh; copper: THREE.InstancedMesh; iron: THREE.InstancedMesh } {
  const parts = roundParts();
  const mat = voxelMaterial({ roughness: 0.5 });
  const prop = new THREE.InstancedMesh(parts.prop, mat, 36);
  const copper = new THREE.InstancedMesh(parts.copper, mat, 36);
  const iron = new THREE.InstancedMesh(parts.iron, mat, 36);
  for (const m of [prop, copper, iron]) {
    m.frustumCulled = false;
    m.castShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  return { prop, copper, iron };
}

/** 靶子：木桩 + 布包（航天服面料夹层：外层白布、泡沫保温层、塑胶管道、里面裹着一大块生牛肉） */
export interface TargetRig {
  group: THREE.Group;
  clothFront: THREE.Object3D[];
  layers: THREE.Object3D[];
  beef: THREE.Mesh;
  holes: THREE.Mesh[];
  pieces: THREE.InstancedMesh;
}

export function buildTarget(): TargetRig {
  const group = new THREE.Group();
  // 木箱（靶台）
  const crate = new Vox([-0.3, 0, -0.26], [0.3, 0.72, 0.26], 0.02);
  crate.box(-0.3, 0, -0.26, 0.3, 0.72, 0.26, (x, y, z, i, j, k) => {
    const plank = Math.floor(y / 0.12);
    let c = mix(0x6a5238, 0x54402a, hash2(plank, 3));
    if (Math.abs(y - plank * 0.12) < 0.012) c = 0x2f2418;
    return shade(c, 0.9 + hash3(i, j, k) * 0.2);
  });
  group.add(new THREE.Mesh(crate.toGeometry(), voxelMaterial()));

  // 牛肉：红肉 + 白色脂肪纹理
  const y0 = 0.72;
  const bv = new Vox([-0.16, y0, -0.13], [0.16, y0 + 0.5, 0.13], 0.01);
  bv.box(-0.16, y0, -0.13, 0.16, y0 + 0.5, 0.13, (x, y, z, i, j, k) => {
    const yy = (y - y0) / 0.5;
    const bulge = 0.7 + 0.3 * Math.sin(Math.PI * Math.min(1, Math.max(0, yy)));
    if (Math.hypot(x / 0.16, z / 0.13) > bulge) return null;
    const marble = noise3(x * 30 + 3, y * 30, z * 30);
    let c = mix(0x9c1f24, 0xc23a3a, hash3(i, j, k));
    if (marble > 0.68) c = mix(c, 0xf1dcd4, 0.7);
    return shade(c, 0.92 + hash3(i + 1, j, k) * 0.14);
  });
  const beef = new THREE.Mesh(bv.toGeometry(), voxelMaterial({ roughness: 0.45 }));
  group.add(beef);

  // 三层包裹（每层一个前半壳 + 一个后半壳；拆开时前半壳依次揭去）。整体像一个鼓鼓的布包，顶上扎口。
  const layers: THREE.Object3D[] = [];
  const clothFront: THREE.Object3D[] = [];
  const mkShell = (rIn: number, rOut: number, color: number, front: boolean, seed: number): THREE.Mesh => {
    const g = new Vox([-0.32, y0 - 0.04, -0.32], [0.32, y0 + 0.58, 0.32], 0.012);
    g.box(-0.32, y0 - 0.04, -0.32, 0.32, y0 + 0.58, 0.32, (x, y, z, i, j, k) => {
      const yy = Math.min(1.15, Math.max(-0.08, (y - y0) / 0.5));
      const bulge = 0.72 + 0.28 * Math.sin(Math.PI * Math.min(1, Math.max(0, yy))) - Math.max(0, yy - 0.95) * 2.0;
      const r = Math.hypot(x / 1.15, z);
      if (r < rIn * bulge || r > rOut * bulge) return null;
      if (front ? z < 0 : z >= 0) return null;
      let c = color;
      if (seed === 3) c = mix(0xf4f6f8, 0xc9d0d8, hash3(Math.floor(x * 30), Math.floor(y * 30), seed)); // 外层：航天服白布
      if (seed === 2) c = (Math.floor(x * 24) + Math.floor(y * 24)) % 5 === 0 ? 0x2f6fb3 : color; // 塑胶管道（蓝）
      return shade(c, 0.92 + hash3(i, j, k) * 0.14);
    });
    return new THREE.Mesh(g.toGeometry(), voxelMaterial({ roughness: 0.9 }));
  };
  const foamF = mkShell(0.15, 0.2, 0xe8d57a, true, 1);
  const tubeF = mkShell(0.2, 0.23, 0xc9d1d8, true, 2);
  const clothF = mkShell(0.23, 0.27, 0xffffff, true, 3);
  const foamB = mkShell(0.15, 0.2, 0xe8d57a, false, 1);
  const tubeB = mkShell(0.2, 0.23, 0xc9d1d8, false, 2);
  const clothB = mkShell(0.23, 0.27, 0xffffff, false, 3);
  for (const m of [foamF, tubeF, clothF, foamB, tubeB, clothB]) {
    m.castShadow = true;
    group.add(m);
  }
  layers.push(clothF, tubeF, foamF);
  clothFront.push(clothB, tubeB, foamB);

  // 弹孔
  const holes: THREE.Mesh[] = [];
  const hpos: Array<[number, number]> = [[0.02, 1.02], [-0.08, 1.1], [0.09, 0.95], [-0.03, 0.9], [0.05, 1.12]];
  for (const [x, y] of hpos) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.026, 0.014), new THREE.MeshBasicMaterial({ color: 0x070707, fog: false }));
    h.position.set(x, y, 0.262);
    h.visible = false;
    holes.push(h);
    group.add(h);
  }
  // 取出来的碎石：一小堆灰色碎屑（放在“手掌”里）
  const pieces = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.016, 0.02), new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.6 }), 26);
  pieces.frustumCulled = false;
  pieces.visible = false;
  group.add(pieces);
  return { group, clothFront, layers, beef, holes, pieces };
}

export function buildCase(): THREE.Group {
  const grp = new THREE.Group();
  const g = new Vox([-0.22, 0, -0.14], [0.22, 0.09, 0.14], 0.01);
  g.box(-0.22, 0, -0.14, 0.22, 0.09, 0.14, noisy(0x2a2d33, 0.06, 1));
  g.box(-0.2, 0.03, -0.12, 0.2, 0.09, 0.12, 0x1a1c20);
  // 海绵凹槽：3 行 × 11 列
  for (let r = 0; r < 3; r++) for (let c = 0; c < 11; c++) g.box(-0.175 + c * 0.035, 0.04, -0.09 + r * 0.06, -0.155 + c * 0.035, 0.09, -0.06 + r * 0.06, 0x2e3138);
  g.box(-0.02, 0.07, -0.145, 0.02, 0.09, -0.135, 0x8a9099); // 锁扣
  grp.add(new THREE.Mesh(g.toGeometry(), voxelMaterial()));
  const lid = new Vox([-0.22, 0, -0.14], [0.22, 0.045, 0.14], 0.01);
  lid.box(-0.22, 0, -0.14, 0.22, 0.045, 0.14, noisy(0x2a2d33, 0.06, 2));
  lid.box(-0.2, 0, -0.12, 0.2, 0.02, 0.12, 0x1a1c20);
  const lidM = new THREE.Mesh(lid.toGeometry(), voxelMaterial());
  lidM.name = "lid";
  lidM.position.set(0, 0.09, 0.14);
  const hinge = new THREE.Group();
  hinge.name = "lidHinge";
  hinge.position.set(0, 0.09, -0.14);
  lidM.position.set(0, 0, 0.14);
  hinge.add(lidM);
  grp.add(hinge);
  return grp;
}

export interface BasementRig {
  group: THREE.Group;
  bulb: THREE.Mesh;
  bulbLight: THREE.SpotLight;
  bulbFill: THREE.PointLight;
  glow: THREE.Sprite;
  flashLight: THREE.PointLight;
  lights: THREE.Light[];
  table: THREE.Mesh;
  rounds: ReturnType<typeof buildRoundSet>;
  target: TargetRig;
  doorLeaf: THREE.Group;
  stairLight: THREE.Mesh;
  smoke: THREE.Group;
}

export function buildBasement(): BasementRig {
  const group = new THREE.Group();
  group.add(buildShell());
  const table = buildTable();
  table.position.set(-1.3, 0, 0.45);
  group.add(table);
  const shelf = buildShelf();
  shelf.position.set(1.95, 0, 1.6);
  shelf.rotation.y = -Math.PI / 2;
  group.add(shelf);

  // 裸灯泡
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.6, 1.8), fog: false }));
  bulb.position.set(-0.4, BM.h - 0.55, 0.3);
  const cord = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.5, 0.015), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
  cord.position.set(-0.4, BM.h - 0.28, 0.3);
  group.add(bulb, cord);
  const glow = glowSprite(0xffc070, 0.9, 0.55);
  glow.position.copy(bulb.position);
  group.add(glow);
  const bulbLight = new THREE.SpotLight(0xffc27a, 34, 9, 1.35, 0.9, 2);
  bulbLight.position.copy(bulb.position);
  bulbLight.target.position.set(-0.4, 0, 0.3);
  bulbLight.castShadow = true;
  bulbLight.shadow.mapSize.set(1024, 1024);
  bulbLight.shadow.bias = -0.0006;
  bulbLight.shadow.normalBias = 0.03;
  group.add(bulbLight, bulbLight.target);
  const bulbFill = new THREE.PointLight(0xffc27a, 5, 7, 2);
  bulbFill.position.copy(bulb.position).add(new THREE.Vector3(0, -0.2, 0));
  group.add(bulbFill);
  const amb = new THREE.AmbientLight(0x2a2620, 0.7);
  group.add(amb);

  // 枪口火光的瞬时灯
  const flashLight = new THREE.PointLight(0xffd8a0, 0, 9, 2);
  group.add(flashLight);

  const rounds = buildRoundSet();
  group.add(rounds.prop, rounds.copper, rounds.iron);

  const target = buildTarget();
  target.group.position.set(0.4, 0, -2.0);
  group.add(target.group);

  // 入口铁门：门扇可开
  const doorLeaf = new THREE.Group();
  const dg = new Vox([0, 0, -0.04], [1.1, 2.1, 0.04], 0.03);
  dg.box(0, 0, -0.04, 1.1, 2.1, 0.04, noisy(0x3a4a3c, 0.1, 1));
  dg.box(0.08, 0.1, 0.04, 1.02, 2.0, 0.06, noisy(0x33413a, 0.1, 2));
  dg.cylZ(0.9, 1.05, 0.1, 0.06, 0.12, 0x8a8f96);
  doorLeaf.add(new THREE.Mesh(dg.toGeometry(), voxelMaterial()));
  doorLeaf.position.set(-0.55, 0, BM.z1 + 0.04);
  group.add(doorLeaf);
  // 门外楼梯透进来的光
  const stairLight = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.0, 0.85), fog: false, transparent: true, opacity: 0 }));
  stairLight.position.set(0, 1.1, BM.z1 + 0.6);
  stairLight.rotation.y = Math.PI;
  group.add(stairLight);

  // 烟：一个容器，粒子由 ParticleField 管理（在 world 里挂载）
  const smoke = new THREE.Group();
  group.add(smoke);

  const lights: THREE.Light[] = [bulbLight, bulbFill, amb, flashLight];
  return { group, bulb, bulbLight, bulbFill, glow, flashLight, lights, table, rounds, target, doorLeaf, stairLight, smoke };
}
