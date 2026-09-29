// 研究所模型车间（下班后）：冷白日光灯、水泥地、蓝色安全条纹；中央是一台先进的数控机床。
import * as THREE from "three";
import { voxelMaterial } from "@agentbench/voxel-kit";
import { Vox, noisy } from "../../util/vox";
import { hash2, hash3, TAU, smooth, seg, clamp, lerp } from "../../util/math";
import { mix, shade } from "../../util/color";
import { textTexture } from "../../util/pixelfont";
import { meteoriteMesh } from "../courtyard/rocks";

export const WS = { x0: -4.5, x1: 4.5, z0: -3.2, z1: 3.8, h: 3.6 };
const VS = 0.0625;

function emissiveMat(scale = 1.5): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  m.color.setScalar(scale);
  return m;
}

function buildShell(): THREE.Mesh {
  const { x0, x1, z0, z1, h } = WS;
  const min: [number, number, number] = [x0 - 0.3, -0.13, z0 - 0.3];
  const max: [number, number, number] = [x1 + 0.3, h + 0.2, z1 + 0.3];
  const g = new Vox(min, max, VS);
  const paint = (x: number, y: number, z: number, i: number, j: number, k: number): number | null => {
    if (y < 0) {
      // 水泥地 + 黄色安全线
      let c = mix(0x6a6e73, 0x585c62, hash2(Math.floor(x * 2), Math.floor(z * 2)));
      if (Math.abs(Math.abs(x) - 1.6) < 0.06 && Math.abs(z + 0.2) < 1.6) c = 0xd7b12a;
      if (Math.abs(Math.abs(z + 0.2) - 1.6) < 0.06 && Math.abs(x) < 1.66) c = 0xd7b12a;
      return shade(c, 0.94 + hash3(i, j, k) * 0.12);
    }
    if (y > h) return shade(0x2a2d32, 0.9 + hash3(i, j, k) * 0.2);
    const wall = x < x0 || x > x1 || z < z0 || z > z1;
    if (!wall) return null;
    if (y < 0.12) return 0x35383d;
    if (y > 1.05 && y < 1.2) return 0x2f6fb3; // 蓝色安全条
    // 空心砖：浅灰，带砖缝
    const bx = Math.floor((x + z) / 0.4), by = Math.floor(y / 0.2);
    const fx = (x + z) / 0.4 - bx, fy = y / 0.2 - by;
    let c = mix(0xb9bcbd, 0xa9adaf, hash2(bx, by));
    if (fx < 0.04 || fy < 0.06) c = shade(c, 0.78);
    return shade(c, 0.94 + hash3(i, j, k) * 0.1);
  };
  g.box(min[0], min[1], min[2], max[0], max[1], max[2], paint);
  g.clearBox(x0, 0, z0, x1, h, z1);
  // 钢桁架横梁
  for (const z of [-2.2, -0.2, 1.8, 3.4]) g.box(x0, h - 0.4, z - 0.09, x1, h - 0.16, z + 0.09, noisy(0x51575e, 0.08, 3));
  for (const x of [-3.2, 0, 3.2]) g.box(x - 0.08, h - 0.55, z0, x + 0.08, h - 0.4, z1, noisy(0x51575e, 0.08, 4));
  // 后墙大窗（夜里，只有远处零星的灯）
  g.clearBox(-2.6, 1.5, z0 - 0.4, 0.6, 2.9, z0 + 0.02);
  for (const x of [-2.6, -1.8, -1.0, -0.2, 0.6]) g.box(x - 0.03, 1.5, z0 - 0.3, x + 0.03, 2.9, z0 + 0.02, 0x2a2d32);
  g.box(-2.6, 2.2, z0 - 0.3, 0.6, 2.25, z0 + 0.02, 0x2a2d32);
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

/** 窗外的夜色：一块深蓝背景加几颗远处的灯 */
function buildNight(): THREE.Mesh {
  const g = new Vox([-3.0, 1.4, -3.9], [1.0, 3.0, -3.6], 0.1);
  g.box(-3.0, 1.4, -3.9, 1.0, 3.0, -3.6, (x, y, z, i, j, k) => {
    const t = (y - 1.4) / 1.6;
    let c = mix(0x1a2340, 0x05070f, t);
    if (hash3(i, j, k) > 0.985 && y < 2.2) c = 0xffd88a;
    if (hash3(i + 9, j, k) > 0.995) c = 0xbcd6ff;
    return c;
  });
  return new THREE.Mesh(g.toGeometry(), emissiveMat(0.9));
}

function buildLightFixtures(): { group: THREE.Group; mats: THREE.MeshBasicMaterial[]; rows: number[] } {
  const group = new THREE.Group();
  const mats: THREE.MeshBasicMaterial[] = [];
  const rows: number[] = [];
  const zs = [-2.2, -0.2, 1.8, 3.4];
  const xs = [-2.4, 0, 2.4];
  zs.forEach((z, ri) => {
    xs.forEach((x) => {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), fog: false });
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.22), mat);
      box.position.set(x, WS.h - 0.5, z);
      group.add(box);
      // 灯架
      const holder = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.04, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 1 }));
      holder.position.set(x, WS.h - 0.44, z);
      group.add(holder);
      mats.push(mat);
      rows.push(ri);
    });
  });
  return { group, mats, rows };
}

function buildCNC(): { group: THREE.Group; door: THREE.Object3D; spindle: THREE.Group; blade: THREE.Object3D; panel: THREE.Mesh; vise: THREE.Group } {
  const group = new THREE.Group();
  const body = new Vox([-0.85, 0, -0.65], [0.85, 1.75, 0.65], VS / 2);
  const c1 = 0x3d4f66, c2 = 0x2c3a4d;
  body.box(-0.85, 0, -0.65, 0.85, 1.75, 0.65, noisy(c1, 0.06, 1));
  // 前面开窗腔（加工室）
  body.clearBox(-0.6, 0.75, -0.5, 0.55, 1.5, 0.66);
  body.box(-0.6, 0.72, -0.5, 0.55, 0.78, 0.66, 0x767c85); // 不锈钢台面
  body.box(-0.6, 0.78, -0.5, 0.55, 1.5, -0.46, 0x8d939b); // 内壁
  body.box(-0.6, 1.47, -0.5, 0.55, 1.5, 0.66, 0x6f757d);
  // 下方柜门
  body.box(-0.8, 0.05, 0.6, 0.8, 0.68, 0.66, noisy(c2, 0.06, 2));
  body.box(-0.02, 0.2, 0.66, 0.02, 0.5, 0.7, 0x9a9fa6);
  // 顶部信号灯座
  body.box(0.6, 1.75, -0.1, 0.72, 1.86, 0.02, 0x1f2329);
  // 侧面控制台（右）
  body.box(0.85, 0.9, -0.2, 1.15, 1.42, 0.45, noisy(0x2b3442, 0.06, 5));
  const m = new THREE.Mesh(body.toGeometry(), voxelMaterial({ roughness: 0.6 }));
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);

  // 主轴 + 圆锯片（在加工室内，可上下移动、转动）
  const spindle = new THREE.Group();
  const sp = new Vox([-0.14, -0.3, -0.14], [0.14, 0.3, 0.14], 0.02);
  sp.cylY(0, 0, 0.09, 0.0, 0.3, noisy(0x6e7681, 0.06, 6));
  sp.cylY(0, 0, 0.05, -0.1, 0.0, 0x2a2e34);
  spindle.add(new THREE.Mesh(sp.toGeometry(), voxelMaterial({ roughness: 0.4 })));
  const bladeV = new Vox([-0.2, -0.02, -0.2], [0.2, 0.02, 0.2], 0.01);
  bladeV.cylY(0, 0, 0.18, -0.01, 0.01, (x, y, z, i, j, k) => {
    const a = Math.atan2(z, x);
    const tooth = Math.floor((a + Math.PI) / (TAU / 16)) % 2;
    const r = Math.hypot(x, z);
    return r > 0.165 && tooth === 0 ? 0xdfe3e8 : shade(0xb7bcc3, 0.95 + hash3(i, j, k) * 0.1);
  });
  const blade = new THREE.Mesh(bladeV.toGeometry(), voxelMaterial({ roughness: 0.3 }));
  blade.rotation.x = Math.PI / 2;
  blade.position.set(0, -0.18, 0);
  spindle.add(blade);
  spindle.position.set(-0.1, 1.28, 0.0);
  group.add(spindle);

  // 虎钳（夹住陨石）
  const vise = new THREE.Group();
  const vv = new Vox([-0.2, 0, -0.15], [0.2, 0.16, 0.15], 0.01);
  vv.box(-0.2, 0, -0.15, 0.2, 0.05, 0.15, 0x2d3239);
  vv.box(-0.2, 0.05, -0.15, -0.14, 0.15, 0.15, 0x50565f);
  vv.box(0.14, 0.05, -0.15, 0.2, 0.15, 0.15, 0x50565f);
  vv.box(-0.14, 0.02, -0.02, 0.14, 0.05, 0.02, 0x8a9099);
  vise.add(new THREE.Mesh(vv.toGeometry(), voxelMaterial()));
  vise.position.set(-0.1, 0.78, 0.05);
  group.add(vise);

  // 玻璃门（可滑开）
  const door = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.8, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x9ed8ff, transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false }),
  );
  glass.renderOrder = 5;
  const fr = new Vox([-0.62, -0.42, -0.02], [0.62, 0.42, 0.02], 0.02);
  fr.box(-0.62, -0.42, -0.02, 0.62, -0.38, 0.02, 0x20252c);
  fr.box(-0.62, 0.38, -0.02, 0.62, 0.42, 0.02, 0x20252c);
  fr.box(-0.62, -0.42, -0.02, -0.58, 0.42, 0.02, 0x20252c);
  fr.box(0.58, -0.42, -0.02, 0.62, 0.42, 0.02, 0x20252c);
  door.add(glass, new THREE.Mesh(fr.toGeometry(), voxelMaterial()));
  door.position.set(-0.03, 1.13, 0.68);
  group.add(door);

  // 控制面板：一块像素屏
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.13),
    new THREE.MeshBasicMaterial({ map: textTexture("READY", [90, 255, 140]), transparent: true, color: new THREE.Color(1.6, 1.6, 1.6), fog: false }),
  );
  panel.position.set(0.71, 1.36, 0.665);
  group.add(panel);
  // 启动键（前右立柱）
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.03), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.4, 0.5), fog: false }));
  btn.position.set(0.71, 1.14, 0.68);
  btn.name = "startBtn";
  group.add(btn);
  return { group, door, spindle, blade, panel, vise };
}

function buildBenches(): THREE.Mesh {
  const g = new Vox([-4.4, 0, -3.1], [4.4, 2.4, 3.7], VS / 2);
  // 右侧长工作台 + 台钳
  g.box(2.9, 0.82, -2.9, 4.4, 0.9, 1.6, noisy(0x6a5a44, 0.08, 1));
  for (const z of [-2.85, 1.55]) for (const x of [2.95, 4.35]) g.box(x - 0.05, 0, z - 0.05, x + 0.05, 0.82, z + 0.05, 0x2f3338);
  g.box(2.9, 0.4, -2.9, 4.4, 0.44, 1.6, 0x3a3f46);
  // 后墙金属置物架，上面放着一个“黄河站”的小模型
  g.box(-4.4, 0, -3.1, -3.4, 0.05, -2.2, 0x2d3239);
  for (const y of [0.6, 1.2, 1.8]) g.box(-4.35, y, -3.05, -3.45, y + 0.04, -2.25, 0x8a9099);
  for (const [x, z] of [[-4.35, -3.05], [-3.45, -3.05], [-4.35, -2.25], [-3.45, -2.25]] as Array<[number, number]>) g.box(x - 0.02, 0, z - 0.02, x + 0.02, 1.85, z + 0.02, 0x8a9099);
  // 挂在右墙上的工具板（孔板 + 工具剪影）
  g.box(4.35, 1.2, -2.0, 4.42, 2.2, 0.6, 0x9a8a68);
  for (let i = 0; i < 12; i++) {
    const z = -1.9 + i * 0.2, y = 1.3 + (i % 3) * 0.28;
    g.box(4.3, y, z, 4.34, y + 0.22, z + 0.05, [0x3a3f46, 0xb0392b, 0x2f6fb3][i % 3]);
  }
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** 桌上的“黄河站”模型（呼应主线）——一个小车轮 */
function buildStationModel(): THREE.Mesh {
  const g = new Vox([-0.2, 0, -0.2], [0.2, 0.22, 0.2], 0.01);
  g.ringY(0, 0.08, 0, 0.14, 0.05, 0.06, noisy(0xd0d4d9, 0.06, 1));
  g.cylY(0, 0, 0.035, 0.0, 0.16, 0xb0b5bc);
  for (let a = 0; a < 6; a++) {
    const t = (a / 6) * TAU;
    g.line(0, 0.08, 0, Math.cos(t) * 0.14, 0.08, Math.sin(t) * 0.14, 0.008, 0x8a9099);
  }
  g.line(0, 0.16, 0, 0, 0.22, 0, 0.004, 0xe0872d);
  return new THREE.Mesh(g.toGeometry(), voxelMaterial());
}

export interface WorkshopRig {
  group: THREE.Group;
  lights: THREE.Light[];
  fixtureMats: THREE.MeshBasicMaterial[];
  fixtureRows: number[];
  rowLights: THREE.PointLight[];
  cnc: ReturnType<typeof buildCNC>;
  stone: THREE.Mesh;
  comb: THREE.Mesh;
  rods: THREE.InstancedMesh;
  pins: THREE.InstancedMesh;
  tray: THREE.Group;
  sparks: THREE.PointLight;
  cutter: THREE.Mesh;
  envelope: THREE.Mesh;
  panelTex: (text: string) => void;
}

export function buildWorkshop(): WorkshopRig {
  const group = new THREE.Group();
  group.add(buildShell(), buildNight());
  const fx = buildLightFixtures();
  group.add(fx.group);
  const cnc = buildCNC();
  cnc.group.position.set(0, 0, -0.2);
  group.add(cnc.group);
  const benches = buildBenches();
  group.add(benches);
  const model = buildStationModel();
  model.position.set(-3.9, 1.84, -2.65);
  model.scale.setScalar(2.2);
  group.add(model);

  const lights: THREE.Light[] = [];
  // 每排一盏冷白点光（配合日光灯依次点亮）
  const rowLights: THREE.PointLight[] = [];
  [-2.2, -0.2, 1.8, 3.4].forEach((z) => {
    const l = new THREE.PointLight(0xdfeeff, 0, 9, 2);
    l.position.set(0, WS.h - 0.7, z);
    group.add(l);
    rowLights.push(l);
    lights.push(l);
  });
  const amb = new THREE.AmbientLight(0x243044, 0.6);
  const hemi = new THREE.HemisphereLight(0x8fb2ff, 0x1c1e22, 0.35);
  group.add(amb, hemi);
  lights.push(amb, hemi);

  // 机床内的加工件：石头 → 梳状 → 杆束 → 小段
  const stone = meteoriteMesh(0.17, 70, 0.0095, false);
  stone.position.set(-0.1, 0.78 + 0.12, 0.05);
  group.add(stone);
  // 梳状：6×6 的细杆矩阵，根部连在一起
  const comb = (() => {
    const g = new Vox([-0.1, 0, -0.1], [0.1, 0.16, 0.1], 0.006);
    g.box(-0.1, 0, -0.1, 0.1, 0.012, 0.1, 0x3a3835);
    for (let i = 0; i < 6; i++) for (let k = 0; k < 6; k++) {
      const x = -0.075 + i * 0.03, z = -0.075 + k * 0.03;
      g.box(x - 0.011, 0.012, z - 0.011, x + 0.011, 0.16, z + 0.011, noisy(0x4a4744, 0.1, i * 6 + k));
    }
    return new THREE.Mesh(g.toGeometry(), voxelMaterial({ roughness: 0.5 }));
  })();
  comb.position.set(-0.1, 0.78 + 0.02, 0.05);
  group.add(comb);
  // 杆（36 根，散在托盘里）与小段（36 粒，整齐排成 6×6）
  const rodGeo = new THREE.BoxGeometry(0.014, 0.014, 0.16);
  const rods = new THREE.InstancedMesh(rodGeo, new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.45, metalness: 0.3 }), 36);
  const pinGeo = new THREE.BoxGeometry(0.016, 0.016, 0.028);
  const pins = new THREE.InstancedMesh(pinGeo, new THREE.MeshStandardMaterial({ color: 0xa6abb2, roughness: 0.4, metalness: 0.3 }), 36);
  rods.frustumCulled = false; pins.frustumCulled = false;
  const tray = new THREE.Group();
  const tv = new Vox([-0.16, 0, -0.16], [0.16, 0.03, 0.16], 0.008);
  tv.box(-0.16, 0, -0.16, 0.16, 0.012, 0.16, 0x2b6cb0);
  tv.box(-0.16, 0, -0.16, -0.15, 0.03, 0.16, 0x2b6cb0);
  tv.box(0.15, 0, -0.16, 0.16, 0.03, 0.16, 0x2b6cb0);
  tv.box(-0.16, 0, -0.16, 0.16, 0.03, -0.15, 0x2b6cb0);
  tv.box(-0.16, 0, 0.15, 0.16, 0.03, 0.16, 0x2b6cb0);
  tray.add(new THREE.Mesh(tv.toGeometry(), voxelMaterial()), rods, pins);
  tray.position.set(0.45, 0.78, 0.15);
  group.add(tray);

  // 切割火花的暖光
  const sparks = new THREE.PointLight(0xffb060, 0, 1.6, 2);
  sparks.position.set(-0.1, 1.05, 0.1);
  group.add(sparks);

  // 被拆下的“石材专用刀具”
  const cutter = (() => {
    const g = new Vox([-0.05, 0, -0.05], [0.05, 0.14, 0.05], 0.006);
    g.cylY(0, 0, 0.022, 0.0, 0.1, 0x9aa0a8);
    g.cylY(0, 0, 0.036, 0.1, 0.14, 0x2d3239);
    g.box(-0.022, 0.0, -0.004, 0.022, 0.012, 0.004, 0xd7b12a); // 金刚石刃
    return new THREE.Mesh(g.toGeometry(), voxelMaterial({ roughness: 0.4 }));
  })();
  cutter.visible = false;
  group.add(cutter);
  // 装碎屑的信封
  const envelope = (() => {
    const g = new Vox([-0.09, 0, -0.06], [0.09, 0.02, 0.06], 0.005);
    g.box(-0.09, 0, -0.06, 0.09, 0.02, 0.06, 0xd8c9a3);
    g.box(-0.09, 0.015, -0.06, 0.09, 0.02, -0.0, 0xc4b58c);
    return new THREE.Mesh(g.toGeometry(), voxelMaterial());
  })();
  envelope.position.set(0.55, 0.9, 0.55);
  envelope.visible = false;
  group.add(envelope);

  // 控制面板文字（重建纹理即可）
  const panelMat = cnc.panel.material as THREE.MeshBasicMaterial;
  let lastText = "READY";
  const panelTex = (text: string) => {
    if (text === lastText) return;
    lastText = text;
    panelMat.map?.dispose();
    panelMat.map = textTexture(text, text.includes("36/36") ? [255, 214, 90] : [90, 255, 140]);
    panelMat.needsUpdate = true;
    cnc.panel.scale.x = Math.max(0.7, Math.min(1.6, text.length / 6));
  };

  return {
    group, lights, fixtureMats: fx.mats, fixtureRows: fx.rows, rowLights, cnc, stone, comb, rods, pins, tray, sparks, cutter, envelope, panelTex,
  };
}

export { smooth, seg, clamp, lerp };
