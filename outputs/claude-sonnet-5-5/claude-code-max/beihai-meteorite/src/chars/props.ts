// 手持/背负道具：用字符网格 (voxelModel) 或 Vox 构建，挂在 figure.anchors 上，继承手臂运动。
import * as THREE from "three";
import { voxelModel, voxelMaterial, PX_METRES, BASE_HEIGHT_M } from "@agentbench/voxel-kit";
import type { Actor } from "./actor";
import { Vox, noisy } from "../util/vox";
import { shade } from "../util/color";

export type AnchorName = "handR" | "handL" | "head" | "back" | "hipR" | "hipL";

/** 把以“米”建模的几何挂到锚点：自动补偿人物根节点的缩放（px→m） */
export function mountMeters(actor: Actor, anchor: AnchorName, mesh: THREE.Object3D, opts: { pos?: [number, number, number]; rot?: [number, number, number] } = {}): THREE.Object3D {
  const k = 1 / actor.root.scale.x;
  const holder = new THREE.Group();
  holder.scale.setScalar(k);
  mesh.position.set(0, 0, 0);
  holder.add(mesh);
  if (opts.pos) holder.position.set(...opts.pos);
  if (opts.rot) holder.rotation.set(...opts.rot);
  actor.figure.anchors[anchor].add(holder);
  return holder;
}
/** 把以“figure px”建模的几何（voxelModel）挂到锚点 */
export function mountPx(actor: Actor, anchor: AnchorName, mesh: THREE.Object3D, opts: { pos?: [number, number, number]; rot?: [number, number, number] } = {}): THREE.Object3D {
  const holder = new THREE.Group();
  holder.add(mesh);
  if (opts.pos) holder.position.set(...opts.pos);
  if (opts.rot) holder.rotation.set(...opts.rot);
  actor.figure.anchors[anchor].add(holder);
  return holder;
}
export const PX_M = (h = 1.8): number => (PX_METRES * h) / BASE_HEIGHT_M;

// ---------------------------------------------------------------------------
// 2010 式制式手枪（无壳弹）：侧视字符网格，枪口朝 +Z
// ---------------------------------------------------------------------------
const PISTOL_SIDE = [
  "..##########b.",
  "..##########b.",
  "..ffffffffff..",
  "..ggg.ftf.....",
  "..ggg.fff.....",
  "..ggg.........",
  "..ggg.........",
  "..gg..........",
];
const PISTOL_EDGE = [
  "..##########b.",
  "..##########b.",
  "..ffffffffff..",
  "..ggg.f.......",
  "..ggg.f.......",
  "..ggg.........",
  "..ggg.........",
  "..gg..........",
];

export function pistolMesh(voxel = 0.42): THREE.Mesh {
  const geo = voxelModel({
    palette: { "#": 0x30353d, f: 0x22262c, g: 0x15171a, b: 0x5b616b, t: 0x8a9099 },
    layers: [PISTOL_EDGE, PISTOL_SIDE, PISTOL_EDGE],
    axis: "x",
    voxel,
  });
  const m = new THREE.Mesh(geo, voxelMaterial());
  m.castShadow = true;
  m.name = "pistol";
  return m;
}

/** 手枪相对手锚点的摆放：握把落在拳中，枪口指向 +Z */
export const PISTOL_HOLD = { pos: [0, 0.9, 1.2] as [number, number, number] };

// ---------------------------------------------------------------------------
// 步枪瞄准镜（章北海把它改装成磁吸的）：细长圆筒
// ---------------------------------------------------------------------------
export function scopeMesh(): THREE.Mesh {
  const L = 0.24;
  const r = 0.03;
  const v = 0.0075;
  const g = new Vox([-r - v, -r - v, 0], [r + v, r + v, L], v);
  g.cylZ(0, 0, r * 0.62, 0, L, noisy(0x24272d, 0.05, 1));
  g.cylZ(0, 0, r, 0.02, 0.065, noisy(0x2c3037, 0.05, 2)); // 物镜端粗
  g.cylZ(0, 0, r * 0.9, L - 0.075, L - 0.02, noisy(0x2c3037, 0.05, 3)); // 目镜端
  g.cylZ(0, 0, r * 0.66, 0.0, 0.006, 0x8ad0ff); // 物镜玻璃
  g.cylZ(0, 0, r * 0.7, L - 0.006, L, 0x2a3140);
  g.box(-0.007, -r - v, 0.09, 0.007, -r * 0.6, 0.15, 0x555b66); // 磁吸底座
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.castShadow = true;
  m.name = "scope";
  return m;
}

// ---------------------------------------------------------------------------
// 航天服背包（生命维持 + 推进器喷口）
// ---------------------------------------------------------------------------
export function backpackMesh(): THREE.Mesh {
  // 以米建模：宽 0.42（≈7.5px）高 0.6 深 0.24
  const v = 0.03;
  const w = 0.44, h = 0.62, d = 0.26;
  const g = new Vox([-w / 2, -h / 2 - 0.1, 0], [w / 2, h / 2, d + 0.16], v);
  const body = 0xdfe3e7;
  g.box(-w / 2, -h / 2 + 0.08, 0, w / 2, h / 2, d, noisy(body, 0.05, 4));
  g.box(-w / 2 + 0.04, -h / 2 + 0.12, d, w / 2 - 0.04, h / 2 - 0.06, d + 0.03, noisy(0xb9c0c7, 0.04, 5)); // 后盖
  g.box(-0.05, 0.0, d + 0.03, 0.05, 0.1, d + 0.05, 0x5a626c); // 面板
  g.box(-w / 2, 0.02, 0, w / 2, 0.06, d + 0.04, 0xe0872d); // 橙色腰线
  // 两个推进喷口（向下）
  for (const sx of [-0.12, 0.12]) {
    g.cylY(sx, d * 0.5, 0.06, -h / 2 - 0.1, -h / 2 + 0.09, noisy(0x3a4048, 0.05, 6));
    g.cylY(sx, d * 0.5, 0.04, -h / 2 - 0.1, -h / 2 - 0.06, 0x14161a);
  }
  // 顶部天线
  g.box(w / 2 - 0.05, h / 2, d * 0.5 - 0.015, w / 2 - 0.02, h / 2 + 0.0, d * 0.5 + 0.015, 0x888f98);
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.castShadow = true;
  m.name = "backpack";
  return m;
}

export function shadeMat(c: number, k: number): number {
  return shade(c, k);
}
