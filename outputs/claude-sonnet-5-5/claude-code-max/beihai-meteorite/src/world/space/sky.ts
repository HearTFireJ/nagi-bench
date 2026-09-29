// 天穹元素：太阳（体素圆盘 + 阶梯状辉光 = “像素级泛光”）与星空。
import * as THREE from "three";
import { buildVoxelGeometry } from "@agentbench/voxel-kit";
import { mulberry32, TAU } from "../../util/math";

export interface SunRig {
  /** 朝向原点（相机）的整体组 */
  group: THREE.Group;
  core: THREE.Mesh;
  glows: THREE.Mesh[];
  streaks: THREE.Mesh[];
  radius: number;
  setGlow(k: number): void;
}

/** 单层体素圆盘（1 体素厚），正对相机时只显示正面 → 干净的像素块辉光 */
function voxelDisc(radiusVox: number, voxel: number): THREE.BufferGeometry {
  const span = radiusVox * 2 + 1;
  const c = radiusVox + 0.5;
  return buildVoxelGeometry(
    {
      size: [span, span, 1],
      at(x, y) {
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        return dx * dx + dy * dy <= (radiusVox + 0.35) * (radiusVox + 0.35) ? 0xffffff : null;
      },
    },
    { voxel },
  );
}

/** 体素太阳。radiusVox 体素半径，voxel 体素尺寸 → 世界半径 = radiusVox*voxel */
export function buildSun(radiusVox = 5, voxel = 2): SunRig {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    voxelDisc(radiusVox, voxel),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 5.6, 3.4), fog: false }),
  );
  group.add(core);

  const glows: THREE.Mesh[] = [];
  const shells: Array<[number, number, number]> = [
    [radiusVox * 1.35, 0xffd08a, 0.55],
    [radiusVox * 1.75, 0xffb060, 0.34],
    [radiusVox * 2.4, 0xff9440, 0.22],
    [radiusVox * 3.4, 0xff8034, 0.14],
    [radiusVox * 5, 0xff6a2a, 0.085],
    [radiusVox * 7.4, 0xff5a25, 0.05],
    [radiusVox * 11, 0xff4f22, 0.032],
    [radiusVox * 16, 0xff4420, 0.02],
  ];
  shells.forEach(([r, c, a], i) => {
    const m = new THREE.Mesh(
      voxelDisc(Math.round(r), voxel),
      new THREE.MeshBasicMaterial({
        color: c,
        transparent: true,
        opacity: a,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    m.position.z = -0.01 * (i + 1); // 略微错开避免共面
    m.userData.baseOpacity = a;
    glows.push(m);
    group.add(m);
  });

  // 变形镜头式的横向光芒（细长方块，加法混合）
  const streaks: THREE.Mesh[] = [];
  const streakMat = (c: number, a: number) => {
    const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: a, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    m.userData.baseOpacity = a;
    return m;
  };
  const w = radiusVox * voxel;
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(w * 36, voxel * 0.8, voxel * 0.5), streakMat(0xffb070, 0.42));
  const s2 = new THREE.Mesh(new THREE.BoxGeometry(w * 16, voxel * 2, voxel * 0.5), streakMat(0xffa860, 0.2));
  const s3 = new THREE.Mesh(new THREE.BoxGeometry(voxel * 0.8, w * 10, voxel * 0.5), streakMat(0xffb070, 0.14));
  streaks.push(s1, s2, s3);
  group.add(s1, s2, s3);

  const rig: SunRig = {
    group, core, glows, streaks, radius: w,
    setGlow(k: number) {
      for (const g of glows) (g.material as THREE.MeshBasicMaterial).opacity = g.userData.baseOpacity * k;
      for (const s of streaks) (s.material as THREE.MeshBasicMaterial).opacity = (s.material as THREE.MeshBasicMaterial).userData.baseOpacity * k;
    },
  };
  return rig;
}

/** 星空：方块点（WebGL 点默认就是方的）+ 银河带 + 少量更亮的“体素星” */
export function buildStars(radius = 2400, seed = 7): THREE.Group {
  const g = new THREE.Group();
  const rnd = mulberry32(seed);

  const pts: number[] = [];
  const cols: number[] = [];
  const push = (x: number, y: number, z: number, br: number, tint: number) => {
    const l = Math.hypot(x, y, z) || 1;
    pts.push((x / l) * radius, (y / l) * radius, (z / l) * radius);
    const c = new THREE.Color();
    if (tint < 0.15) c.setRGB(1.0, 0.72, 0.55);
    else if (tint < 0.35) c.setRGB(0.66, 0.78, 1.0);
    else c.setRGB(1, 0.98, 0.94);
    cols.push(c.r * br, c.g * br, c.b * br);
  };
  // 均匀分布的背景星
  for (let i = 0; i < 2600; i++) {
    const u = rnd() * 2 - 1;
    const a = rnd() * TAU;
    const s = Math.sqrt(1 - u * u);
    const br = 0.3 + Math.pow(rnd(), 3) * 1.8;
    push(s * Math.cos(a), u, s * Math.sin(a), br, rnd());
  }
  // 银河带：沿一个倾斜大圆聚集
  const nrm = new THREE.Vector3(0.35, 0.86, -0.36).normalize();
  const t1 = new THREE.Vector3().crossVectors(nrm, new THREE.Vector3(0, 0, 1)).normalize();
  const t2 = new THREE.Vector3().crossVectors(nrm, t1).normalize();
  for (let i = 0; i < 3200; i++) {
    const a = rnd() * TAU;
    const spread = (rnd() + rnd() + rnd() - 1.5) * 0.16;
    const p = new THREE.Vector3()
      .addScaledVector(t1, Math.cos(a))
      .addScaledVector(t2, Math.sin(a))
      .addScaledVector(nrm, spread);
    push(p.x, p.y, p.z, 0.22 + rnd() * 0.5, 0.3 + rnd() * 0.3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  const mat = new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, fog: false });
  g.add(new THREE.Points(geo, mat));

  // 亮星：小方块
  const bigGeo = new THREE.BoxGeometry(1, 1, 1);
  const bigMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.2), fog: false });
  for (let i = 0; i < 46; i++) {
    const u = rnd() * 2 - 1;
    const a = rnd() * TAU;
    const s = Math.sqrt(1 - u * u);
    const m = new THREE.Mesh(bigGeo, bigMat);
    m.position.set(s * Math.cos(a), u, s * Math.sin(a)).multiplyScalar(radius * 0.98);
    m.scale.setScalar(2.2 + rnd() * 2.6);
    g.add(m);
  }
  return g;
}
