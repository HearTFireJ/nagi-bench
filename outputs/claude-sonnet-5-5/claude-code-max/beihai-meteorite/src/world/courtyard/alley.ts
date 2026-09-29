// 胡同：黄昏，青砖墙，红漆大门，槐树，自行车，冬储白菜。窗里透出一台收音机的暖光。
import * as THREE from "three";
import { voxelMaterial } from "@agentbench/voxel-kit";
import { Vox, noisy } from "../../util/vox";
import { hash2, hash3, noise3, fbm3, TAU, clamp, lerp } from "../../util/math";
import { mix, shade } from "../../util/color";
import { glowSprite } from "../../util/glow";

export const ALLEY = { half: 2.2, z0: -18, z1: 16, wallH: 3.2, gateZ: -8.0, gateW: 1.7 };

function emissiveMat(scale = 1.5): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  m.color.setScalar(scale);
  return m;
}

function brickColor(x: number, y: number, z: number, i: number, j: number, k: number, along: number): number {
  const course = Math.floor(y / 0.095);
  const off = course % 2 ? 0.11 : 0;
  const u = (along + off) / 0.22;
  const fu = u - Math.floor(u);
  const fy = y / 0.095 - course;
  const brick = Math.floor(u) * 7 + course * 13;
  let c = mix(0x8a9298, 0x6d757c, hash2(brick, 5));
  if (hash2(brick, 9) > 0.93) c = mix(c, 0x8a8470, 0.5); // 泛黄的旧砖
  if (fu < 0.05 || fy < 0.09) c = shade(c, 0.66); // 灰缝
  return shade(c, 0.93 + hash3(i, j, k) * 0.12);
}

function buildWalls(): THREE.Mesh {
  const { half, z0, z1, wallH, gateZ, gateW } = ALLEY;
  const t = 0.5;
  const g = new Vox([-half - t, 0, z0], [half + t, wallH + 0.3, z1], 0.0625);
  // 左墙
  g.box(-half - t, 0, z0, -half, wallH, z1, (x, y, z, i, j, k) => {
    if (x > -half - 0.06) return brickColor(x, y, z, i, j, k, z);
    return shade(0x5a6167, 0.9);
  });
  // 右墙（正面朝 -X 一侧可见）
  g.box(half, 0, z0, half + t, wallH, z1, (x, y, z, i, j, k) => (x < half + 0.06 ? brickColor(x, y, z, i, j, k, z) : shade(0x5a6167, 0.9)));
  // 墙帽：深灰瓦片，略外挑
  for (const s of [-1, 1]) {
    const xa = s < 0 ? -half - t - 0.08 : half - 0.08;
    const xb = s < 0 ? -half + 0.08 : half + t + 0.08;
    g.box(xa, wallH, z0, xb, wallH + 0.28, z1, (x, y, z, i, j, k) => {
      const ridge = Math.floor(z / 0.18) % 2 === 0;
      return shade(ridge ? 0x2c3036 : 0x24272c, 0.9 + hash3(i, j, k) * 0.2);
    });
  }
  // 门洞（右墙）
  g.clearBox(half - 0.02, 0, gateZ - gateW / 2, half + t + 0.02, 2.5, gateZ + gateW / 2);
  // 门框、门槛
  const frame = 0x3a1f16;
  g.box(half - 0.04, 0, gateZ - gateW / 2 - 0.12, half + 0.26, 2.62, gateZ - gateW / 2, frame);
  g.box(half - 0.04, 0, gateZ + gateW / 2, half + 0.26, 2.62, gateZ + gateW / 2 + 0.12, frame);
  g.box(half - 0.04, 2.5, gateZ - gateW / 2 - 0.12, half + 0.26, 2.68, gateZ + gateW / 2 + 0.12, frame);
  // 台阶（两级石阶）
  g.box(half - 0.7, 0, gateZ - gateW / 2 - 0.1, half + 0.02, 0.12, gateZ + gateW / 2 + 0.1, noisy(0x74757a, 0.1, 3));
  g.box(half - 0.4, 0, gateZ - gateW / 2 - 0.1, half + 0.02, 0.24, gateZ + gateW / 2 + 0.1, noisy(0x7d7e83, 0.1, 4));
  // 门墩（两侧鼓形石墩，这里用方块）
  for (const s of [-1, 1]) g.box(half - 0.5, 0, gateZ + s * (gateW / 2 + 0.28) - 0.22, half - 0.05, 0.62, gateZ + s * (gateW / 2 + 0.28) + 0.22, noisy(0x84858a, 0.1, 5));
  // 门楼小屋檐（灰瓦坡顶）
  const eaveY = 2.72;
  for (let s = 0; s < 6; s++) {
    const y = eaveY + s * 0.08;
    g.box(half - 0.5 + s * 0.05, y, gateZ - gateW / 2 - 0.5, half + 0.4 - s * 0.02, y + 0.09, gateZ + gateW / 2 + 0.5, (x, yy, z, i, j, k) =>
      shade(Math.floor(z / 0.16) % 2 ? 0x30343a : 0x282b30, 0.9 + hash3(i, j, k) * 0.2),
    );
  }
  // 屋檐下的彩画横梁（红/绿/金）
  g.box(half - 0.1, 2.58, gateZ - gateW / 2 - 0.4, half + 0.34, 2.72, gateZ + gateW / 2 + 0.4, (x, y, z) => (Math.floor(z / 0.18) % 3 === 0 ? 0x2c6b58 : Math.floor(z / 0.18) % 3 === 1 ? 0xb4342b : 0xd6a640));
  // 左墙上的一扇小窗（邻居家，透出暖光）
  g.clearBox(-half - 0.02, 1.3, -3.3, -half + 0.02, 2.1, -2.5);
  g.box(-half - 0.06, 1.24, -3.36, -half + 0.02, 1.3, -2.44, 0x2a2a2e);
  g.box(-half - 0.06, 2.1, -3.36, -half + 0.02, 2.16, -2.44, 0x2a2a2e);
  g.box(-half - 0.06, 1.3, -3.36, -half + 0.02, 2.1, -3.3, 0x2a2a2e);
  g.box(-half - 0.06, 1.3, -2.5, -half + 0.02, 2.1, -2.44, 0x2a2a2e);
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildGround(): THREE.Mesh {
  const { half, z0, z1 } = ALLEY;
  const g = new Vox([-half - 0.6, -0.2, z0], [half + 0.6, 0, z1], 0.0625);
  g.box(-half - 0.6, -0.2, z0, half + 0.6, 0, z1, (x, y, z, i, j, k) => {
    const bx = Math.floor(x / 0.3), bz = Math.floor(z / 0.6);
    const off = bz % 2 ? 0.15 : 0;
    const u = (x + off) / 0.3, fu = u - Math.floor(u);
    const fz = z / 0.6 - bz;
    let c = mix(0x63656a, 0x4d5055, hash2(bx * 3 + bz, bz));
    if (fu < 0.06 || fz < 0.06) c = shade(c, 0.6);
    // 中间走人的地方更磨亮
    if (Math.abs(x) < 0.9) c = shade(c, 1.1);
    return shade(c, 0.92 + hash3(i, j, k) * 0.14);
  });
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.receiveShadow = true;
  return m;
}

function buildGateDoors(): { group: THREE.Group; left: THREE.Group; right: THREE.Group; knockers: THREE.Object3D[] } {
  const { half, gateZ, gateW } = ALLEY;
  const group = new THREE.Group();
  const mk = (sign: number): THREE.Group => {
    const doorW = gateW / 2;
    const g = new Vox([0, 0, -0.04], [doorW, 2.5, 0.04], 0.0625 / 2);
    g.box(0, 0, -0.04, doorW, 2.5, 0.04, (x, y, z, i, j, k) => {
      let c = mix(0x8f2a20, 0x6d1d17, hash2(Math.floor(x * 12), 2));
      // 门钉：黄铜色，网格
      const sx = Math.floor(x / 0.17), sy = Math.floor((y - 0.35) / 0.17);
      const fx = x / 0.17 - sx, fy = (y - 0.35) / 0.17 - sy;
      if (sy >= 0 && sy < 9 && sx >= 0 && sx < 4 && fx > 0.3 && fx < 0.7 && fy > 0.3 && fy < 0.7 && z > 0.02) c = 0xc79b3a;
      if (y > 2.42 || y < 0.06) c = 0x2a1410;
      return shade(c, 0.9 + hash3(i, j, k) * 0.18);
    });
    // 铺首（狮头衔环，黄铜圆盘）
    g.cylZ(doorW * 0.5, 1.3, 0.1, 0.03, 0.07, 0xb8892f);
    g.cylZ(doorW * 0.5, 1.3, 0.05, 0.07, 0.09, 0x7a5a20);
    g.ringY(0, 0, 0, 0.001, 0.001, 0.001, 0x000000);
    const grp = new THREE.Group();
    const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
    m.castShadow = true;
    m.receiveShadow = true;
    grp.add(m);
    return grp;
  };
  const left = mk(-1);
  const right = mk(1);
  // 局部系：门朝 -X（面向胡同），铰链在两侧门框
  // 门板的局部 +Z 是“法线”方向，这里旋转到面向 -X
  const hingeL = new THREE.Group();
  hingeL.position.set(half + 0.08, 0, gateZ - gateW / 2);
  hingeL.rotation.y = -Math.PI / 2;
  hingeL.add(left);
  const hingeR = new THREE.Group();
  hingeR.position.set(half + 0.08, 0, gateZ + gateW / 2);
  hingeR.rotation.y = -Math.PI / 2;
  right.position.x = 0;
  right.scale.x = -1;
  hingeR.add(right);
  group.add(hingeL, hingeR);
  return { group, left: hingeL, right: hingeR, knockers: [] };
}

function buildTree(): THREE.Mesh {
  // 槐树：位于右墙内侧院子里，树冠越过墙头探进胡同
  const g = new Vox([-3, 0, -3], [3, 9, 3], 0.125);
  g.cylY(0, 0, 0.32, 0, 4.2, (x, y, z, i, j, k) => shade(mix(0x3b2f26, 0x4b3d30, hash3(i, j, k)), 0.85 + hash3(i, k, j) * 0.3));
  // 主枝
  const branches: Array<[number, number, number, number, number, number]> = [
    [0, 3.4, 0, -2.4, 5.4, 0.6], [0, 3.8, 0, 1.4, 6.4, -1.0], [0, 4.0, 0, -0.6, 7.2, 1.6], [0, 3.0, 0, -2.0, 4.6, -1.5],
  ];
  for (const [a, b, c, d, e, f] of branches) g.line(a, b, c, d, e, f, 0.16, noisy(0x3f3327, 0.1, 6));
  // 树冠：秋天的黄绿
  const clumps: Array<[number, number, number, number]> = [
    [-2.2, 5.6, 0.6, 1.3], [-1.2, 6.6, -0.5, 1.5], [1.2, 6.9, -0.6, 1.6], [0.2, 7.6, 1.2, 1.4], [-2.0, 4.9, -1.4, 1.2],
    [1.8, 5.9, 0.6, 1.1], [-0.4, 6.0, 0.4, 1.4],
  ];
  for (const [x, y, z, r] of clumps) {
    g.box(x - r, y - r * 0.8, z - r, x + r, y + r * 0.8, z + r, (px, py, pz, i, j, k) => {
      const d = Math.hypot(px - x, (py - y) * 1.25, pz - z) / r;
      if (d > 1 + (hash3(i, j, k) - 0.5) * 0.5) return null;
      const t = hash3(i + 3, j, k);
      return t < 0.5 ? 0x7a8a3a : t < 0.8 ? 0xa39a3a : 0xc4a23a;
    });
  }
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildBicycle(): THREE.Mesh {
  const g = new Vox([-0.05, 0, -0.9], [0.05, 1.1, 0.9], 0.02);
  const dark = 0x1f3a2c;
  for (const cz of [-0.55, 0.55]) {
    // 车轮：环
    for (let a = 0; a < 48; a++) {
      const a0 = (a / 48) * TAU, a1 = ((a + 1) / 48) * TAU;
      g.line(0, 0.34 + Math.sin(a0) * 0.34, cz + Math.cos(a0) * 0.34, 0, 0.34 + Math.sin(a1) * 0.34, cz + Math.cos(a1) * 0.34, 0.012, 0x111114);
    }
    g.line(0, 0.34, cz - 0.34, 0, 0.34, cz + 0.34, 0.006, 0x888c94);
    g.line(0, 0.0, cz, 0, 0.68, cz, 0.006, 0x888c94);
  }
  // 车架
  g.line(0, 0.34, -0.55, 0, 0.62, -0.1, 0.02, dark);
  g.line(0, 0.62, -0.1, 0, 0.7, 0.42, 0.02, dark);
  g.line(0, 0.34, -0.55, 0, 0.34, -0.05, 0.018, dark);
  g.line(0, 0.34, -0.05, 0, 0.62, -0.1, 0.018, dark);
  g.line(0, 0.7, 0.42, 0, 0.34, 0.55, 0.018, dark);
  g.line(0, 0.7, 0.42, 0, 0.95, 0.42, 0.02, dark);
  g.line(0, 0.95, 0.32, 0, 0.95, 0.56, 0.02, 0x22252a); // 车把
  g.box(-0.04, 0.66, -0.22, 0.04, 0.7, -0.02, 0x2a2018); // 车座
  g.box(-0.05, 0.92, -0.7, 0.05, 0.96, -0.66, 0xb02a24); // 尾灯
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.castShadow = true;
  return m;
}

function buildCabbages(): THREE.Mesh {
  // 冬储大白菜：一垛
  const g = new Vox([-0.9, 0, -0.5], [0.9, 0.9, 0.5], 0.04);
  const pos: Array<[number, number, number]> = [];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) pos.push([-0.6 + i * 0.36 + row * 0.18, 0.16 + row * 0.26, (hash2(i, row) - 0.5) * 0.18]);
  for (const [x, y, z] of pos) {
    g.ellipsoid(x, y, z, 0.16, 0.2, 0.15, (px, py, pz, i, j, k) => {
      const t = clamp((py - y + 0.2) / 0.4);
      return shade(mix(0xe4e6c0, 0x86a852, t), 0.9 + hash3(i, j, k) * 0.2);
    });
  }
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.castShadow = true;
  return m;
}

function buildPowerLines(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x0c0c10, fog: true });
  for (const [z, dz] of [[-3, 1.2], [-3.4, 1.4], [3, 0.9]] as Array<[number, number]>) {
    const pts = 22;
    let prev: THREE.Vector3 | null = null;
    for (let i = 0; i <= pts; i++) {
      const u = i / pts;
      const p = new THREE.Vector3(lerp(-2.6, 2.6, u), 3.9 - Math.sin(u * Math.PI) * 0.22, z + u * dz);
      if (prev) {
        const len = prev.distanceTo(p);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 0.02), mat);
        seg.position.copy(prev).add(p).multiplyScalar(0.5);
        seg.rotation.z = Math.atan2(p.y - prev.y, p.x - prev.x);
        g.add(seg);
      }
      prev = p;
    }
  }
  return g;
}

/** 台阶下的一盆植物、煤球炉之类的小物件 */
function buildProps(): THREE.Mesh {
  const g = new Vox([-2.2, 0, -12], [2.2, 1.2, 4], 0.05);
  // 花盆
  for (const [x, z] of [[1.7, -6.2], [1.75, -9.8]] as Array<[number, number]>) {
    g.cylY(x, z, 0.16, 0, 0.26, noisy(0x8a4a30, 0.1, 2));
    g.ellipsoid(x, 0.4, z, 0.2, 0.16, 0.2, noisy(0x2f6a34, 0.15, 3));
  }
  // 门口的旧竹筐 / 水桶
  g.cylY(-1.75, -6, 0.2, 0, 0.5, noisy(0x3c5a7a, 0.08, 4), 0.17);
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.castShadow = true;
  return m;
}

function buildSkyBackdrop(): THREE.Mesh {
  // 巷子尽头的黄昏天空：像素化的色带 + 几朵像素云
  const w = 60, h = 26, vs = 0.5;
  const g = new Vox([-w / 2, 0, 0], [w / 2, h, vs], vs);
  g.box(-w / 2, 0, 0, w / 2, h, vs, (x, y, z, i, j, k) => {
    const t = y / h;
    let c: number;
    if (t < 0.12) c = 0xf6b070;
    else if (t < 0.22) c = 0xe89468;
    else if (t < 0.34) c = 0xc47f7c;
    else if (t < 0.5) c = 0x8a6f96;
    else if (t < 0.7) c = 0x4f5a92;
    else c = 0x27305c;
    // 像素云
    const n = fbm3(x * 0.12, y * 0.35, 3, 3);
    if (t > 0.12 && t < 0.55 && n > 0.62) c = mix(c, 0xf0b9a0, 0.6);
    return c;
  });
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  mat.color.setScalar(1.0);
  const m = new THREE.Mesh(g.toGeometry(), mat);
  m.position.set(0, 0, ALLEY.z0 - 2);
  return m;
}

export interface AlleyRig {
  group: THREE.Group;
  doors: ReturnType<typeof buildGateDoors>;
  lantern: THREE.PointLight;
  lanternGlow: THREE.Sprite;
  windowLight: THREE.PointLight;
  sun: THREE.DirectionalLight;
  lights: THREE.Light[];
  leaves: THREE.InstancedMesh;
  updateLeaves(t: number): void;
}

export function buildAlley(): AlleyRig {
  const group = new THREE.Group();
  const lights: THREE.Light[] = [];
  group.add(buildGround(), buildWalls(), buildSkyBackdrop());
  const doors = buildGateDoors();
  group.add(doors.group);
  const tree = buildTree();
  tree.position.set(ALLEY.half + 3.2, 0, ALLEY.gateZ + 3.5);
  group.add(tree);
  const bike = buildBicycle();
  bike.position.set(-ALLEY.half + 0.12, 0, -3.2);
  bike.rotation.y = 0.12;
  group.add(bike);
  const cab = buildCabbages();
  cab.position.set(-ALLEY.half + 0.55, 0, 3.4);
  group.add(cab);
  group.add(buildPowerLines());
  group.add(buildProps());

  // 灯笼
  const lan = new Vox([-0.16, 0, -0.16], [0.16, 0.5, 0.16], 0.03);
  lan.ellipsoid(0, 0.25, 0, 0.15, 0.2, 0.15, (x, y, z, i, j, k) => shade(mix(0xd4321e, 0xff6a30, hash3(i, j, k)), 1));
  lan.box(-0.06, 0.46, -0.06, 0.06, 0.5, 0.06, 0x3a2a12);
  const lanM = new THREE.Mesh(lan.toGeometry(), emissiveMat(1.5));
  lanM.position.set(ALLEY.half - 0.5, 2.05, ALLEY.gateZ + ALLEY.gateW / 2 + 0.35);
  const lantern = new THREE.PointLight(0xff6a30, 14, 6, 2);
  lantern.position.copy(lanM.position).add(new THREE.Vector3(-0.15, 0.2, 0));
  const lanternGlow = glowSprite(0xff6a30, 1.4, 0.7);
  lanternGlow.position.copy(lanM.position).add(new THREE.Vector3(0, 0.25, 0));
  group.add(lanM, lantern, lanternGlow);
  lights.push(lantern);

  // 窗里的暖光
  const winM = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.75), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.4, 0.7), fog: false }));
  winM.position.set(-ALLEY.half + 0.02, 1.7, -2.9);
  group.add(winM);
  const windowLight = new THREE.PointLight(0xffb060, 22, 6, 2);
  windowLight.position.set(-ALLEY.half + 0.6, 1.7, -2.9);
  group.add(windowLight);
  lights.push(windowLight);

  // 夕阳：从巷子尽头低角度射来
  const sun = new THREE.DirectionalLight(0xffa868, 3.2);
  sun.position.set(-3, 3.6, -20);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 60;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  group.add(sun, sun.target);
  lights.push(sun);
  const hemi = new THREE.HemisphereLight(0x7488c4, 0x2a2018, 1.5);
  group.add(hemi);
  lights.push(hemi);

  // 飘落的槐叶
  const leafGeo = new THREE.BoxGeometry(0.06, 0.012, 0.045);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.42, 0.14), fog: true }), 22);
  leaves.frustumCulled = false;
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const updateLeaves = (t: number) => {
    for (let i = 0; i < 22; i++) {
      const life = 9 + hash2(i, 1) * 5;
      const ph = (t / life + hash2(i, 2)) % 1;
      const x0 = ALLEY.half - 0.4 + (hash2(i, 3) - 0.5) * 1.4;
      const z0 = ALLEY.gateZ + (hash2(i, 4) - 0.5) * 8;
      const p = new THREE.Vector3(x0 - ph * 1.6 + Math.sin(ph * 9 + i) * 0.25, 3.6 - ph * 3.5, z0 + Math.cos(ph * 7 + i) * 0.3);
      e.set(ph * 9 + i, ph * 7, ph * 5);
      q.setFromEuler(e);
      mtx.compose(p, q, new THREE.Vector3(1, 1, 1));
      leaves.setMatrixAt(i, mtx);
    }
    leaves.instanceMatrix.needsUpdate = true;
  };
  updateLeaves(0);
  group.add(leaves);

  return { group, doors, lantern, lanternGlow, windowLight, sun, lights, leaves, updateLeaves };
}

export { noise3 };
