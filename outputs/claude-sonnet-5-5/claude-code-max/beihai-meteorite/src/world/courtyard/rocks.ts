// 体素岩石与陨石：收藏柜里的“貌不惊人的石头”、三块铁陨石、火星陨石（显微镜下的小圆坑）。
import * as THREE from "three";
import { voxelMaterial } from "@agentbench/voxel-kit";
import { Vox } from "../../util/vox";
import { fbm3, hash3, noise3, TAU } from "../../util/math";
import { mix, shade } from "../../util/color";

export type RockKind = "iron" | "stony" | "pallasite" | "rust" | "black" | "moon" | "agate";

const PALETTE: Record<RockKind, [number, number, number]> = {
  iron: [0x3d403f, 0x505452, 0x74787a],
  stony: [0x5f6062, 0x7d7f80, 0x44464a],
  pallasite: [0x4a4a3a, 0x9aa04a, 0xd08a2a],
  rust: [0x6b3f2b, 0x8a5233, 0xa8683c],
  black: [0x1c1d21, 0x2a2c33, 0x3c4048],
  moon: [0x8d8a86, 0xb3b0aa, 0x6a6863],
  agate: [0x6b4a7a, 0x9b7bb0, 0xd8c8e8],
};

/** 一块不规则岩石：噪声扰动的椭球 + 凹坑（气印）+ 岩壳色 */
export function rockGeometry(diameter: number, kind: RockKind, seed = 1, voxel = 0.016): THREE.BufferGeometry {
  const half = diameter / 2 + voxel * 2;
  const g = new Vox([-half, -half, -half], [half, half, half], voxel);
  const [c0, c1, c2] = PALETTE[kind];
  const rx = diameter * (0.42 + 0.1 * hash3(seed, 1, 1));
  const ry = diameter * (0.34 + 0.12 * hash3(seed, 2, 1));
  const rz = diameter * (0.4 + 0.1 * hash3(seed, 3, 1));
  const R = Math.max(rx, ry, rz);
  g.box(-half, -half, -half, half, half, half, (x, y, z, i, j, k) => {
    const dx = x / rx, dy = y / ry, dz = z / rz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // 表面起伏 + 气印（凹坑）
    const bump = (fbm3(x * 16 + seed * 5, y * 16, z * 16, 2) - 0.5) * 0.3;
    const dent = Math.max(0, 0.13 - Math.abs(noise3(x * 26 + seed, y * 26, z * 26) - 0.5)) * 0.9;
    if (d + bump + dent * 0.5 > 1) return null;
    const t = hash3(i, j, k);
    let c = t < 0.55 ? c0 : t < 0.88 ? c1 : c2;
    // 上表面偏亮（受灯光），下部偏暗
    c = shade(c, 0.86 + 0.28 * (y / R + 0.5) * 0.6 + (hash3(i + 7, j, k) - 0.5) * 0.16);
    if (kind === "pallasite" && hash3(i, j + 3, k) > 0.82) c = 0xd9903a;
    return c;
  });
  return g.toGeometry();
}

/** 维斯台登条纹切片：三组交错的亮条纹（镍纹石/锥纹石），银灰底 */
export function widmanstattenSlab(w = 0.16, h = 0.12, t = 0.02, voxel = 0.008): THREE.BufferGeometry {
  const g = new Vox([-w / 2, 0, -h / 2], [w / 2, t, h / 2], voxel);
  g.box(-w / 2, 0, -h / 2, w / 2, t, h / 2, (x, y, z, i, j, k) => {
    if (y < t - voxel * 1.1) return 0x4a4744; // 侧面/内部
    const a = Math.sin((x * 0.866 + z * 0.5) * 210 + noise3(x * 10, 1, z * 10) * 3);
    const b = Math.sin((x * -0.866 + z * 0.5) * 210 + noise3(x * 10, 2, z * 10) * 3);
    const c = Math.sin(z * 190 + noise3(x * 12, 3, z * 12) * 3);
    let v = 0.35 + 0.28 * (a > 0.72 ? 1 : 0) + 0.28 * (b > 0.72 ? 1 : 0) + 0.2 * (c > 0.8 ? 1 : 0);
    v += (hash3(i, j, k) - 0.5) * 0.08;
    return mix(0x55524e, 0xd8d6d0, Math.max(0, Math.min(1, v)));
  });
  return g.toGeometry();
}

/** 维斯台登条纹的亮度（0..1）：三组交错细条纹 */
function etch(u: number, v: number, seed: number): number {
  const a = Math.sin((u * 0.866 + v * 0.5) * 210 + noise3(u * 10, seed, v * 10) * 3);
  const b = Math.sin((u * -0.866 + v * 0.5) * 210 + noise3(u * 10, seed + 1, v * 10) * 3);
  const c = Math.sin(v * 190 + noise3(u * 12, seed + 2, v * 12) * 3);
  return Math.max(0, Math.min(1, 0.35 + 0.28 * (a > 0.72 ? 1 : 0) + 0.28 * (b > 0.72 ? 1 : 0) + 0.2 * (c > 0.8 ? 1 : 0)));
}

/**
 * 铁陨石：圆润的暗色金属块，表面是浅浅的“指印”凹坑（气印），
 * 其中一面被切开抛光并腐蚀，露出银亮的维斯台登条纹。
 */
export function meteoriteGeometry(diameter: number, seed = 1, voxel = 0.011, cut = true): THREE.BufferGeometry {
  const half = diameter / 2 + voxel * 2;
  const g = new Vox([-half, -half, -half], [half, half, half], voxel);
  const rx = diameter * 0.5, ry = diameter * 0.4, rz = diameter * 0.46;
  // 若干指印凹坑（单位方向 + 半径）
  const dents: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 9; i++) {
    const a = hash3(seed, i, 1) * TAU, u = hash3(seed, i, 2) * 2 - 1, s2 = Math.sqrt(1 - u * u);
    dents.push([s2 * Math.cos(a), u, s2 * Math.sin(a), 0.34 + hash3(seed, i, 3) * 0.22]);
  }
  const cutX = rx * 0.36;
  g.box(-half, -half, -half, half, half, half, (x, y, z, i, j, k) => {
    const p = 2.6;
    const d = Math.pow(Math.pow(Math.abs(x) / rx, p) + Math.pow(Math.abs(y) / ry, p) + Math.pow(Math.abs(z) / rz, p), 1 / p);
    const l = Math.hypot(x, y, z) || 1;
    let bump = (fbm3(x * 12 + seed * 3, y * 12, z * 12, 2) - 0.5) * 0.14;
    for (const [dx, dy, dz, r] of dents) {
      const cosA = (x * dx + y * dy + z * dz) / l;
      const ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
      if (ang < r) bump += (1 - ang / r) * 0.1;
    }
    if (d + bump > 1) return null;
    if (cut && x > cutX) return null;
    // 切面：贴着切割平面的一层
    if (cut && x > cutX - voxel * 1.3) {
      const v = etch(y, z, seed);
      const c = mix(0x5b5a58, 0xe4e2dc, v);
      return shade(c, 0.95 + hash3(i, j, k) * 0.1);
    }
    const t = hash3(i, j, k);
    let c = t < 0.6 ? 0x33322f : t < 0.9 ? 0x46443f : 0x5a554d;
    if (hash3(i + 5, j, k) > 0.965) c = 0x6a4a2e; // 一点点锈
    return shade(c, 0.85 + 0.3 * (y / ry + 1) * 0.5);
  });
  return g.toGeometry();
}

export function meteoriteMesh(diameter: number, seed = 1, voxel = 0.011, cut = true): THREE.Mesh {
  const m = new THREE.Mesh(meteoriteGeometry(diameter, seed, voxel, cut), voxelMaterial({ roughness: 0.55 }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function rockMesh(diameter: number, kind: RockKind, seed = 1, voxel = 0.016): THREE.Mesh {
  const m = new THREE.Mesh(rockGeometry(diameter, kind, seed, voxel), voxelMaterial({ roughness: 0.75 }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * 火星陨石（显微镜视野）：一片红褐色的“地貌”，散布着圆形小坑——可能是微生物的化石。
 * 以体素地形构建，俯视时是一圈圈同心的坑。
 */
export function marsSurface(size = 64): THREE.BufferGeometry {
  const g = new Vox([-size / 2, 0, -size / 2], [size / 2, 8, size / 2], 1);
  // 圆坑的位置
  const pits: Array<[number, number, number]> = [];
  for (let i = 0; i < 26; i++) {
    const a = hash3(i, 1, 1) * size - size / 2;
    const b = hash3(i, 2, 1) * size - size / 2;
    const r = 1.6 + hash3(i, 3, 1) * 3.4;
    pits.push([a, b, r]);
  }
  g.box(-size / 2, 0, -size / 2, size / 2, 8, size / 2, (x, y, z, i, j, k) => {
    // 地面高度：噪声起伏，小坑处下陷
    let h = 4.2 + (fbm3(x * 0.09, 3, z * 0.09, 3) - 0.5) * 3.6;
    let inPit = 0;
    for (const [px, pz, r] of pits) {
      const d = Math.hypot(x - px, z - pz);
      if (d < r) {
        h -= (1 - d / r) * 2.6 + 0.6;
        inPit = 1;
      } else if (d < r + 1.0) {
        h += 0.6; // 坑沿隆起
      }
    }
    if (y > h) return null;
    const top = y > h - 1.2;
    let c = mix(0x8c3f24, 0xb5643a, fbm3(x * 0.2, y * 0.2, z * 0.2, 2));
    if (top && inPit) c = mix(c, 0x3a140e, 0.6);
    if (top && !inPit && y > h - 0.6 && hash3(i, k, 4) > 0.4) c = mix(c, 0xd89a6a, 0.35);
    if (top && !inPit && hash3(i, k, 9) > 0.93) c = 0xd8b088;
    return shade(c, 0.9 + hash3(i, j, k) * 0.2);
  });
  return g.toGeometry();
}

export { TAU };
