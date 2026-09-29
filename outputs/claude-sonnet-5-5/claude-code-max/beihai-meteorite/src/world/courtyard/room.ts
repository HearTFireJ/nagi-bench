// 四合院正房：小型地质博物馆。四壁玻璃柜、冷白射灯照着貌不惊人的石头；暗、旧、暖，窗外是黄昏。
import * as THREE from "three";
import { voxelMaterial } from "@agentbench/voxel-kit";
import { Vox, noisy, type ColorFn } from "../../util/vox";
import { hash2, hash3, noise3, TAU, DEG, clamp, smooth, lerp } from "../../util/math";
import { mix, shade } from "../../util/color";
import { glowSprite } from "../../util/glow";
import { rockMesh, meteoriteMesh, widmanstattenSlab, type RockKind } from "./rocks";

export const ROOM = { x0: -3.6, x1: 3.6, y0: 0, y1: 3.4, z0: -2.7, z1: 2.7 };
const VS = 0.0625;

const WOOD_D = 0x2a2019;
const WOOD_M = 0x3f3026;
const WOOD_L = 0x584636;
const PLASTER = 0xbdb094;

function emissiveMat(scale = 1.4, opacity?: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  m.color.setScalar(scale);
  if (opacity !== undefined) {
    m.transparent = true;
    m.opacity = opacity;
  }
  return m;
}

// ---------------------------------------------------------------------------
// 建筑：地砖、灰泥墙 + 木墙裙、梁、门洞、花格窗
// ---------------------------------------------------------------------------
function buildArchitecture(): { hull: THREE.Mesh; paper: THREE.Mesh } {
  const min: [number, number, number] = [-3.95, -0.13, -3.05];
  const max: [number, number, number] = [3.95, 3.55, 3.05];
  const g = new Vox(min, max, VS);
  const { x0, x1, y0, y1, z0, z1 } = ROOM;

  const paint: ColorFn = (x, y, z, i, j, k) => {
    // 地面：灰色方砖（金砖）
    if (y < y0) {
      const tx = Math.floor((x + 10) / 0.5), tz = Math.floor((z + 10) / 0.5);
      const fx = (x + 10) / 0.5 - tx, fz = (z + 10) / 0.5 - tz;
      let c = mix(0x4e4d4e, 0x3d3c3e, hash2(tx, tz));
      if (fx < 0.04 || fz < 0.04) c = 0x2a2a2c;
      return shade(c, 0.94 + hash3(i, j, k) * 0.12);
    }
    // 天花：深色木板
    if (y >= y1) return shade(0x2a1c12, 0.9 + hash3(i, j, k) * 0.2);
    const onWall = x < x0 || x > x1 || z < z0 || z > z1;
    if (onWall) {
      if (y < 1.1) {
        // 木墙裙：竖向木板
        const plank = Math.floor(x * 5 + z * 5);
        return shade(mix(WOOD_M, WOOD_D, hash2(plank, 3)), 0.9 + hash3(i, j, k) * 0.16);
      }
      if (y < 1.16) return WOOD_L; // 压条
      // 灰泥：旧、微黄，带污渍
      const stain = noise3(x * 1.3, y * 1.1, z * 1.3);
      return shade(mix(PLASTER, 0x9c8760, stain * 0.55), 0.92 + hash3(i, j, k) * 0.14);
    }
    return null;
  };
  // 外壳（实心）→ 挖空内部
  g.box(min[0], min[1], min[2], max[0], max[1], max[2], paint);
  g.clearBox(x0, y0, z0, x1, y1, z1);

  // 梁：沿 x 方向 5 根 + 沿 z 方向 2 根
  for (const z of [-2.2, -1.1, 0, 1.1, 2.2]) g.box(x0, y1 - 0.38, z - 0.13, x1, y1, z + 0.13, noisy(WOOD_D, 0.14, 4));
  for (const x of [-1.8, 1.8]) g.box(x - 0.11, y1 - 0.3, z0, x + 0.11, y1 - 0.08, z1, noisy(WOOD_M, 0.12, 5));
  // 踢脚
  g.box(x0, y0, z0, x1, 0.12, z0 + 0.06, WOOD_D);

  // 门洞（右墙，z 1.0~2.2）与门框
  g.clearBox(x1 - 0.02, y0, 1.0, x1 + 0.4, 2.3, 2.2);
  g.box(x1 - 0.03, y0, 0.94, x1 + 0.3, 2.36, 1.02, WOOD_D);
  g.box(x1 - 0.03, y0, 2.18, x1 + 0.3, 2.36, 2.26, WOOD_D);
  g.box(x1 - 0.03, 2.3, 0.94, x1 + 0.3, 2.4, 2.26, WOOD_D);
  // 门槛
  g.box(x1 - 0.1, y0, 1.0, x1 + 0.3, 0.08, 2.2, 0x555055);

  // 花格窗（左墙，z 0.3~1.5，y 1.1~2.5）：木格 + 纸窗
  g.clearBox(x0 - 0.4, 1.1, 0.3, x0 + 0.02, 2.5, 1.5);
  const paperCells = g.split(() => null); // 占位（不挖）
  void paperCells;
  for (let z = 0.3; z <= 1.5; z += 0.3) g.box(x0 - 0.16, 1.1, z - 0.03, x0 + 0.02, 2.5, z + 0.03, WOOD_D);
  for (let y = 1.1; y <= 2.5; y += 0.35) g.box(x0 - 0.16, y - 0.03, 0.3, x0 + 0.02, y + 0.03, 1.5, WOOD_D);

  const hull = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  hull.receiveShadow = true;
  hull.castShadow = true;

  // 窗纸：自发光，暖蓝黄昏
  const p = new Vox([x0 - 0.3, 1.1, 0.3], [x0 - 0.2, 2.5, 1.5], VS);
  p.box(x0 - 0.3, 1.1, 0.3, x0 - 0.2, 2.5, 1.5, (x, y, z) => {
    const t = clamp((y - 1.1) / 1.4);
    return mix(0xffb37a, 0x7f9bd6, t);
  });
  const paper = new THREE.Mesh(p.toGeometry(), emissiveMat(1.5));
  return { hull, paper };
}

// ---------------------------------------------------------------------------
// 玻璃柜
// ---------------------------------------------------------------------------
export interface CabinetSpec {
  /** 柜体中心（世界系，贴墙一侧的中点，y=0） */
  x: number;
  z: number;
  /** 朝向：柜前面法线的偏航角（弧度）——0 表示朝 +Z */
  yaw: number;
  width: number;
  height: number;
  depth: number;
  /** 每层的石头列表：[种类, 直径(m)] */
  shelves: Array<Array<[RockKind, number]>>;
  seed: number;
}

export interface CabinetRig {
  group: THREE.Group;
  light: THREE.PointLight;
  glass: THREE.Mesh;
  /** 玻璃门（可以打开）：以门轴为原点 */
  door: THREE.Group;
}

function buildCabinet(spec: CabinetSpec, glassMat: THREE.Material): CabinetRig {
  const { width: w, height: h, depth: d } = spec;
  const g = new Vox([-w / 2, 0, -d / 2], [w / 2, h, d / 2], VS / 2);
  const t = 0.07;
  // 外框（开口朝 +Z）
  g.box(-w / 2, 0, -d / 2, w / 2, 0.14, d / 2, noisy(WOOD_D, 0.1, 1)); // 底座
  g.box(-w / 2, h - 0.12, -d / 2, w / 2, h, d / 2, noisy(WOOD_D, 0.1, 2)); // 顶
  g.box(-w / 2, 0, -d / 2, -w / 2 + t, h, d / 2, noisy(WOOD_M, 0.1, 3));
  g.box(w / 2 - t, 0, -d / 2, w / 2, h, d / 2, noisy(WOOD_M, 0.1, 4));
  // 背板：深绿丝绒
  g.box(-w / 2 + t, 0.14, -d / 2, w / 2 - t, h - 0.12, -d / 2 + 0.04, (x, y, z, i, j, k) => shade(0x1e2b25, 0.85 + hash3(i, j, k) * 0.3));
  // 层板
  const nSh = spec.shelves.length;
  const gap = (h - 0.26) / nSh;
  const shelfY: number[] = [];
  for (let s = 0; s < nSh; s++) {
    const y = 0.14 + gap * s;
    shelfY.push(y);
    g.box(-w / 2 + t, y, -d / 2 + 0.04, w / 2 - t, y + 0.03, d / 2 - 0.04, noisy(WOOD_L, 0.1, 5 + s));
  }
  // 前沿的灯带（自发光）
  const strips = new Vox([-w / 2, 0, d / 2 - 0.08], [w / 2, h, d / 2], VS / 2);
  for (let s = 1; s < nSh; s++) {
    strips.box(-w / 2 + t + 0.02, shelfY[s] - 0.02, d / 2 - 0.07, w / 2 - t - 0.02, shelfY[s], d / 2 - 0.05, 0xe4f4ff);
  }
  strips.box(-w / 2 + t + 0.02, h - 0.14, d / 2 - 0.07, w / 2 - t - 0.02, h - 0.12, d / 2 - 0.05, 0xe4f4ff);

  const group = new THREE.Group();
  const frame = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame, new THREE.Mesh(strips.toGeometry(), emissiveMat(2.6)));

  // 石头 + 小标签
  spec.shelves.forEach((list, s) => {
    const n = list.length;
    list.forEach(([kind, diam], idx) => {
      const x = -w / 2 + t + 0.1 + ((idx + 0.5) / n) * (w - 2 * t - 0.2);
      const y = shelfY[s] + 0.03;
      const stand = new Vox([-0.05, 0, -0.05], [0.05, 0.04, 0.05], VS / 2);
      stand.box(-0.05, 0, -0.05, 0.05, 0.04, 0.05, 0x151518);
      const sm = new THREE.Mesh(stand.toGeometry(), voxelMaterial());
      sm.position.set(x, y, -0.02 + (hash2(spec.seed + idx, s) - 0.5) * 0.08);
      const rock = rockMesh(diam, kind, spec.seed * 7 + s * 13 + idx, 0.014);
      rock.position.set(x, y + 0.04 + diam * 0.3, sm.position.z);
      rock.rotation.set(0, hash2(spec.seed, idx + s * 9) * TAU, 0);
      const label = new Vox([-0.03, 0, -0.008], [0.03, 0.04, 0.008], 0.01);
      label.box(-0.03, 0, -0.008, 0.03, 0.04, 0.008, 0xe9e2cf);
      const lm = new THREE.Mesh(label.toGeometry(), voxelMaterial());
      lm.position.set(x + 0.02, y, d / 2 - 0.14);
      lm.rotation.x = -0.35;
      group.add(sm, rock, lm);
    });
  });

  // 玻璃门（整面一块，可绕左侧铰链开合）
  const door = new THREE.Group();
  door.position.set(-w / 2 + t, 0, d / 2 - 0.02);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w - 2 * t, h - 0.28, 0.012), glassMat);
  glass.position.set((w - 2 * t) / 2, 0.14 + (h - 0.28) / 2, 0);
  glass.renderOrder = 5;
  door.add(glass);
  // 玻璃门框（细）
  const fr = new Vox([0, 0, -0.02], [w - 2 * t, h - 0.28, 0.02], VS / 2);
  fr.box(0, 0, -0.02, w - 2 * t, 0.04, 0.02, WOOD_D);
  fr.box(0, h - 0.32, -0.02, w - 2 * t, h - 0.28, 0.02, WOOD_D);
  fr.box(0, 0, -0.02, 0.04, h - 0.28, 0.02, WOOD_D);
  fr.box(w - 2 * t - 0.04, 0, -0.02, w - 2 * t, h - 0.28, 0.02, WOOD_D);
  const frM = new THREE.Mesh(fr.toGeometry(), voxelMaterial());
  frM.position.y = 0.14;
  door.add(frM);
  // 反光条
  const sheen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.1, h * 0.6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false, fog: false }),
  );
  sheen.position.set((w - 2 * t) * 0.3, 0.14 + (h - 0.28) * 0.55, 0.008);
  sheen.rotation.z = -0.35;
  door.add(sheen);
  group.add(door);

  const light = new THREE.PointLight(0xdff2ff, 5, 3.2, 2);
  light.position.set(0, h * 0.72, d * 0.2);
  group.add(light);

  group.position.set(spec.x, 0, spec.z);
  group.rotation.y = spec.yaw;
  return { group, light, glass, door };
}

// ---------------------------------------------------------------------------
// 工作台与桌上物件
// ---------------------------------------------------------------------------
function buildBench(): THREE.Mesh {
  const g = new Vox([-1.25, 0, -0.5], [1.25, 0.95, 0.5], VS / 2);
  g.box(-1.25, 0.86, -0.5, 1.25, 0.95, 0.5, noisy(WOOD_L, 0.1, 1)); // 台面
  g.box(-1.2, 0.83, -0.45, 1.2, 0.86, 0.45, WOOD_D);
  for (const [x, z] of [[-1.14, -0.4], [1.14, -0.4], [-1.14, 0.4], [1.14, 0.4]] as Array<[number, number]>) g.box(x - 0.07, 0, z - 0.07, x + 0.07, 0.83, z + 0.07, noisy(WOOD_M, 0.1, 2));
  g.box(-1.14, 0.2, -0.4, 1.14, 0.27, -0.33, WOOD_M); // 横档
  g.box(-1.14, 0.2, 0.33, 1.14, 0.27, 0.4, WOOD_M);
  // 抽屉
  g.box(-0.5, 0.55, 0.45, 0.5, 0.8, 0.5, WOOD_D);
  g.box(-0.08, 0.66, 0.5, 0.08, 0.7, 0.52, 0x9a8a5a);
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildLamp(): { group: THREE.Group; bulb: THREE.Mesh; spot: THREE.SpotLight; glow: THREE.Sprite } {
  const g = new Vox([-0.3, 0, -0.15], [0.3, 0.55, 0.15], 0.015);
  g.cylY(0, 0, 0.09, 0, 0.03, 0x1c1d20); // 底座
  g.line(0, 0.03, 0, 0, 0.36, 0, 0.012, 0x2b2d31);
  g.line(0, 0.36, 0, 0.16, 0.46, 0, 0.012, 0x2b2d31);
  // 灯罩：向下的锥形
  g.cylY(0.2, 0, 0.075, 0.38, 0.5, 0x8a3a1c, 0.04);
  const group = new THREE.Group();
  const body = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  body.castShadow = true;
  group.add(body);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.8), fog: false }));
  bulb.position.set(0.2, 0.395, 0);
  group.add(bulb);
  const spot = new THREE.SpotLight(0xffc27a, 46, 4.5, 0.85, 0.7, 2);
  spot.position.set(0.2, 0.42, 0);
  spot.target.position.set(0.2, 0, 0.02);
  group.add(spot, spot.target);
  const glow = glowSprite(0xffb060, 0.5, 0.55);
  glow.position.set(0.2, 0.4, 0);
  group.add(glow);
  return { group, bulb, spot, glow };
}

function buildMicroscope(): THREE.Mesh {
  const g = new Vox([-0.14, 0, -0.16], [0.14, 0.42, 0.16], 0.012);
  g.box(-0.1, 0, -0.14, 0.1, 0.03, 0.14, 0x1b1c20); // 底座
  g.box(-0.02, 0.03, -0.1, 0.02, 0.36, -0.06, 0x1b1c20); // 立柱
  g.box(-0.05, 0.12, -0.12, 0.05, 0.14, 0.05, 0x2a2c31); // 载物台
  g.box(-0.012, 0.14, -0.02, 0.012, 0.155, 0.0, 0xd8d2c4); // 小样品
  // 镜筒（倾斜向前上）
  g.line(0, 0.33, -0.08, 0, 0.2, 0.04, 0.024, 0x2f3238);
  g.line(0, 0.33, -0.08, 0, 0.42, -0.14, 0.02, 0x22242a); // 目镜
  g.cylZ(0, 0.2, 0.012, 0.03, 0.06, 0x9a9da4);
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial({ roughness: 0.6 }));
  m.castShadow = true;
  return m;
}

function buildTeaSet(): THREE.Group {
  const grp = new THREE.Group();
  const tray = new Vox([-0.28, 0, -0.18], [0.28, 0.03, 0.18], 0.01);
  tray.box(-0.28, 0, -0.18, 0.28, 0.03, 0.18, noisy(0x2b1a10, 0.1, 3));
  grp.add(new THREE.Mesh(tray.toGeometry(), voxelMaterial()));
  const pot = new Vox([-0.11, 0, -0.09], [0.13, 0.13, 0.09], 0.008);
  pot.ellipsoid(0, 0.06, 0, 0.075, 0.055, 0.075, noisy(0x6d3a2a, 0.08, 2));
  pot.cylY(0, 0, 0.03, 0.105, 0.125, 0x5a2f22);
  pot.line(0.06, 0.07, 0, 0.11, 0.1, 0, 0.008, 0x6d3a2a); // 壶嘴
  pot.line(-0.06, 0.05, 0, -0.11, 0.09, 0, 0.008, 0x6d3a2a); // 壶把
  const potM = new THREE.Mesh(pot.toGeometry(), voxelMaterial());
  potM.position.set(-0.08, 0.03, 0);
  potM.castShadow = true;
  grp.add(potM);
  for (const [x, z] of [[0.12, 0.06], [0.12, -0.07]] as Array<[number, number]>) {
    const cup = new Vox([-0.04, 0, -0.04], [0.04, 0.05, 0.04], 0.006);
    cup.cylY(0, 0, 0.038, 0, 0.05, noisy(0xe6e2d6, 0.05, 4), 0.03);
    cup.cylY(0, 0, 0.032, 0, 0.008, 0xe6e2d6);
    const cm = new THREE.Mesh(cup.toGeometry(), voxelMaterial());
    cm.position.set(x, 0.03, z);
    cm.name = "cup";
    grp.add(cm);
  }
  return grp;
}

function buildSafe(): { group: THREE.Group; door: THREE.Group } {
  const group = new THREE.Group();
  const body = new Vox([-0.35, 0, -0.32], [0.35, 0.9, 0.32], VS / 2);
  body.box(-0.35, 0, -0.32, 0.35, 0.9, 0.32, noisy(0x2b323c, 0.1, 5));
  body.clearBox(-0.28, 0.08, -0.2, 0.28, 0.82, 0.33);
  body.box(-0.28, 0.08, -0.2, 0.28, 0.82, -0.17, 0x171b21);
  body.box(-0.3, 0.4, -0.2, 0.3, 0.43, 0.3, 0x171b21); // 内部隔板
  body.box(-0.3, 0.0, -0.32, -0.25, 0.9, -0.28, 0x232a33);
  const bm = new THREE.Mesh(body.toGeometry(), voxelMaterial());
  bm.castShadow = true;
  group.add(bm);
  // 门（铰链在左侧）
  const door = new THREE.Group();
  door.position.set(-0.35, 0, 0.32);
  const dg = new Vox([0, 0, -0.03], [0.7, 0.9, 0.03], VS / 2);
  dg.box(0, 0, -0.03, 0.7, 0.9, 0.03, noisy(0x353c48, 0.1, 6));
  dg.box(0.05, 0.05, 0.03, 0.65, 0.85, 0.05, noisy(0x2b323d, 0.1, 7));
  dg.cylZ(0.45, 0.45, 0.09, 0.03, 0.07, 0xb08d3c); // 转盘
  dg.cylZ(0.45, 0.45, 0.045, 0.07, 0.09, 0x6b5522);
  dg.box(0.55, 0.42, 0.03, 0.62, 0.48, 0.1, 0x8a8f96); // 把手
  door.add(new THREE.Mesh(dg.toGeometry(), voxelMaterial()));
  group.add(door);
  // 小盒（火星陨石的展示盒）——放在保险柜里
  const box = new Vox([-0.05, 0, -0.04], [0.05, 0.03, 0.04], 0.005);
  box.box(-0.05, 0, -0.04, 0.05, 0.03, 0.04, 0x1a1a20);
  box.box(-0.045, 0.02, -0.035, 0.045, 0.03, 0.035, 0x7a1f2a);
  box.box(-0.006, 0.03, -0.006, 0.006, 0.036, 0.006, 0xa85a3a);
  const boxM = new THREE.Mesh(box.toGeometry(), voxelMaterial());
  boxM.name = "marsBox";
  boxM.position.set(0, 0.43, -0.05);
  group.add(boxM);
  return { group, door };
}

function buildRug(): THREE.Mesh {
  const g = new Vox([-1.6, 0, -1.1], [1.6, 0.02, 1.1], 0.03125);
  g.box(-1.6, 0, -1.1, 1.6, 0.02, 1.1, (x, y, z, i, j, k) => {
    const ax = Math.abs(x), az = Math.abs(z);
    let c = 0x6b1f20;
    if (ax > 1.42 || az > 0.92) c = 0x1e2233;
    else if (ax > 1.3 || az > 0.8) c = 0xb59a5a;
    else if ((ax < 0.5 && az < 0.3) || (Math.floor(x * 5) + Math.floor(z * 5)) % 2 === 0) c = 0x7a2628;
    return shade(c, 0.88 + hash3(i, j, k) * 0.2);
  });
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.receiveShadow = true;
  return m;
}

export interface RoomRig {
  group: THREE.Group;
  cabinets: CabinetRig[];
  bench: THREE.Mesh;
  lamp: ReturnType<typeof buildLamp>;
  microscope: THREE.Mesh;
  teaSet: THREE.Group;
  safe: ReturnType<typeof buildSafe>;
  windowLight: THREE.SpotLight;
  paper: THREE.Mesh;
  lights: THREE.Light[];
  dust: THREE.InstancedMesh;
  updateDust(t: number): void;
  /** 桌面上的三块铁陨石（大） + 一块小的 + 切片 */
  heroStones: { small: THREE.Mesh; big: THREE.Mesh[]; slab: THREE.Mesh };
  benchTopY: number;
}

export function buildRoom(): RoomRig {
  const group = new THREE.Group();
  const lights: THREE.Light[] = [];

  const arch = buildArchitecture();
  group.add(arch.hull, arch.paper);

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fd6ff, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0, depthWrite: false,
  });

  // 六个玻璃柜：后墙 3 + 左墙 1 + 右墙 2
  const kinds: RockKind[] = ["iron", "stony", "pallasite", "rust", "black", "moon", "agate"];
  const pickShelf = (seed: number, n: number): Array<[RockKind, number]> =>
    Array.from({ length: n }, (_, i) => [kinds[Math.floor(hash2(seed, i) * kinds.length)], 0.07 + hash2(seed + 3, i) * 0.06] as [RockKind, number]);
  const specs: CabinetSpec[] = [
    { x: -2.3, z: ROOM.z0 + 0.3, yaw: 0, width: 2.0, height: 2.3, depth: 0.55, seed: 1, shelves: [pickShelf(1, 4), pickShelf(2, 4), pickShelf(3, 3), pickShelf(4, 4)] },
    { x: 0.0, z: ROOM.z0 + 0.3, yaw: 0, width: 2.0, height: 2.3, depth: 0.55, seed: 2, shelves: [pickShelf(5, 4), pickShelf(6, 3), pickShelf(7, 4), pickShelf(8, 3)] },
    { x: 2.3, z: ROOM.z0 + 0.3, yaw: 0, width: 2.0, height: 2.3, depth: 0.55, seed: 3, shelves: [pickShelf(9, 4), pickShelf(10, 4), pickShelf(11, 3), pickShelf(12, 4)] },
    { x: ROOM.x0 + 0.3, z: -1.35, yaw: Math.PI / 2, width: 2.0, height: 2.3, depth: 0.55, seed: 4, shelves: [pickShelf(13, 4), pickShelf(14, 3), pickShelf(15, 4), pickShelf(16, 3)] },
    { x: ROOM.x1 - 0.3, z: -1.1, yaw: -Math.PI / 2, width: 2.2, height: 2.3, depth: 0.55, seed: 5, shelves: [pickShelf(17, 4), pickShelf(18, 4), pickShelf(19, 3), pickShelf(20, 4)] },
    { x: ROOM.x1 - 0.3, z: 0.05, yaw: -Math.PI / 2, width: 0.9, height: 1.6, depth: 0.5, seed: 6, shelves: [pickShelf(21, 2), pickShelf(22, 2), pickShelf(23, 2)] },
  ];
  const cabinets = specs.map((s) => buildCabinet(s, glassMat));
  for (const c of cabinets) {
    group.add(c.group);
    lights.push(c.light);
  }

  // 工作台 + 台灯 + 显微镜 + 茶具
  const bench = buildBench();
  bench.position.set(0.35, 0, -0.95);
  group.add(bench);
  const benchTopY = 0.95;

  const lamp = buildLamp();
  // 台灯放在桌面右后角（灯罩朝桌面中央探出），不挡住收藏者的脸
  lamp.group.position.set(1.0, benchTopY, -1.28);
  lamp.group.rotation.y = Math.PI;
  group.add(lamp.group);
  lights.push(lamp.spot);
  // 台灯的暖色漫反射：桌面中央一小团光，让桌上的石头有质感
  const benchGlow = new THREE.PointLight(0xffb870, 5, 2.4, 2);
  benchGlow.position.set(0.4, benchTopY + 0.7, -0.95);
  group.add(benchGlow);
  lights.push(benchGlow);

  const microscope = buildMicroscope();
  microscope.position.set(-0.45, benchTopY, -1.0);
  microscope.rotation.y = 0.5;
  group.add(microscope);

  const teaSet = buildTeaSet();
  teaSet.position.set(1.25, benchTopY, -0.95);
  group.add(teaSet);

  const safe = buildSafe();
  safe.group.position.set(-2.62, 0, 0.05);
  safe.group.rotation.y = Math.PI / 2;
  group.add(safe.group);

  group.add(buildRug());
  // 地毯要落在地面上，略抬起避免共面
  group.children[group.children.length - 1].position.set(0.2, 0.001, 0.5);

  // 桌面英雄石头
  const small = meteoriteMesh(0.09, 41, 0.007, false);
  small.position.set(0.25, benchTopY + 0.045, -0.85);
  small.visible = false;
  const big: THREE.Mesh[] = [];
  const bigPos: Array<[number, number]> = [[-0.05, -0.75], [0.35, -0.7], [0.75, -0.78]];
  for (let i = 0; i < 3; i++) {
    const r = meteoriteMesh(0.16, 50 + i, 0.0095, true);
    r.position.set(bigPos[i][0], benchTopY + 0.07, bigPos[i][1]);
    r.rotation.y = -0.5 + i * 0.35; // 切面朝向镜头一侧
    r.visible = false;
    big.push(r);
  }
  const slab = new THREE.Mesh(widmanstattenSlab(0.17, 0.12, 0.02, 0.0065), voxelMaterial({ roughness: 0.45 }));
  slab.position.set(0.55, benchTopY + 0.001, -0.62);
  slab.rotation.y = 0.35;
  slab.visible = false;
  group.add(small, ...big, slab);

  // ---- 光：暖黄昏从窗户斜射进来，投下花格影子 ----
  const windowLight = new THREE.SpotLight(0xffa860, 150, 11, 0.5, 0.55, 2);
  windowLight.position.set(ROOM.x0 - 0.8, 1.95, 0.9);
  windowLight.target.position.set(0.6, 0.2, -0.4);
  windowLight.castShadow = true;
  windowLight.shadow.mapSize.set(1024, 1024);
  windowLight.shadow.bias = -0.0006;
  windowLight.shadow.normalBias = 0.03;
  group.add(windowLight, windowLight.target);
  lights.push(windowLight);
  const amb = new THREE.AmbientLight(0x30281f, 0.9);
  const hemi = new THREE.HemisphereLight(0x46527a, 0x1a1008, 0.55);
  group.add(amb, hemi);
  lights.push(amb, hemi);

  // 门外的黄昏（门洞里看到的一块亮天）
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.55, 0.42), fog: false }),
  );
  sky.position.set(ROOM.x1 + 0.35, 1.2, 1.6);
  sky.rotation.y = -Math.PI / 2;
  group.add(sky);

  // 光束里的浮尘
  const dustGeo = new THREE.BoxGeometry(0.012, 0.012, 0.012);
  const dust = new THREE.InstancedMesh(dustGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.8), fog: false }), 70);
  dust.frustumCulled = false;
  const dustBase: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 70; i++) {
    // 沿窗到桌面的光束内随机分布
    const u = hash2(i, 1);
    const px = lerp(ROOM.x0 + 0.3, 0.6, u);
    const py = lerp(1.9, 0.6, u) + (hash2(i, 2) - 0.5) * 1.0;
    const pz = lerp(0.9, -0.4, u) + (hash2(i, 3) - 0.5) * 1.1;
    dustBase.push([px, py, pz, hash2(i, 4) * TAU]);
  }
  const mtx = new THREE.Matrix4();
  const updateDust = (t: number) => {
    for (let i = 0; i < dustBase.length; i++) {
      const [x, y, z, ph] = dustBase[i];
      mtx.makeTranslation(
        x + Math.sin(t * 0.21 + ph) * 0.06,
        y + Math.sin(t * 0.17 + ph * 1.7) * 0.05 - ((t * 0.008 + hash2(i, 5)) % 1) * 0.0,
        z + Math.cos(t * 0.19 + ph) * 0.06,
      );
      dust.setMatrixAt(i, mtx);
    }
    dust.instanceMatrix.needsUpdate = true;
  };
  updateDust(0);
  group.add(dust);

  return { group, cabinets, bench, lamp, microscope, teaSet, safe, windowLight, paper: arch.paper, lights, dust, updateDust, heroStones: { small, big, slab }, benchTopY };
}

export { smooth, DEG };
