// 太空中的其他结构：船坞骨架（“巨兽的骨骼”）、漂浮的建材/垃圾、一号基地的远景光点。
import * as THREE from "three";
import { voxelMaterial } from "@agentbench/voxel-kit";
import { Vox, noisy } from "../../util/vox";
import { hash1, hash2, hash3, mulberry32, TAU } from "../../util/math";
import { shade } from "../../util/color";
import { glowSprite } from "../../util/glow";

function emissive(scale = 1.6): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  m.color.setScalar(scale);
  return m;
}

/**
 * 船坞骨架：沿 X 的龙骨 + 一圈圈肋骨（中间粗两端细）+ 纵向桁条，
 * 一端已经铺了几块蒙皮，几盏施工灯。像一具巨兽的骨骼。
 */
export function buildShipyard(): THREE.Group {
  const g = new THREE.Group();
  const L = 560;
  const vs = 3;
  const grid = new Vox([-L / 2, -75, -75], [L / 2, 75, 75], vs);
  const ribCount = 15;
  const radiusAt = (u: number) => 12 + 56 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.65);
  // 龙骨（底部）与顶脊
  for (let x = -L / 2 + 6; x < L / 2 - 6; x += vs) {
    const u = (x + L / 2) / L;
    const r = radiusAt(u);
    grid.box(x, -r - 3, -3, x + vs, -r + 3, 3, noisy(0x6d7580, 0.08, 1));
    grid.box(x, r - 3, -2, x + vs, r + 2, 2, noisy(0x6d7580, 0.08, 2));
  }
  // 肋骨
  for (let i = 0; i < ribCount; i++) {
    const u = (i + 0.7) / (ribCount + 0.4);
    const x = -L / 2 + u * L;
    const r = radiusAt(u);
    const steps = 96;
    for (let s = 0; s < steps; s++) {
      const a0 = (s / steps) * TAU;
      const a1 = ((s + 1) / steps) * TAU;
      grid.line(x, Math.sin(a0) * r, Math.cos(a0) * r, x, Math.sin(a1) * r, Math.cos(a1) * r, 2.3, noisy(0x7d8591, 0.08, 3 + i));
    }
    // 辐条状内撑
    if (i % 3 === 1) {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.4;
        grid.line(x, 0, 0, x, Math.sin(a) * r, Math.cos(a) * r, 1.4, noisy(0x5c636d, 0.06, 4));
      }
    }
  }
  // 纵向桁条
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU;
    let px = -L / 2 + 8;
    let py = Math.sin(a) * radiusAt(0.02);
    let pz = Math.cos(a) * radiusAt(0.02);
    for (let s = 1; s <= 30; s++) {
      const x = -L / 2 + 8 + (s / 30) * (L - 16);
      const r = radiusAt((x + L / 2) / L);
      const y = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      grid.line(px, py, pz, x, y, z, 1.2, noisy(0x5c636d, 0.06, 5));
      px = x; py = y; pz = z;
    }
  }
  // 已铺设的蒙皮（船艏侧一段）
  grid.recolor((x, y, z, c) => {
    const u = (x + L / 2) / L;
    if (u > 0.06 && u < 0.24 && z > 0 && Math.hypot(y, z) > radiusAt(u) - 5) return shade(0xcfd3d8, 0.95 + hash2(Math.floor(x / 6), Math.floor(y / 6)) * 0.1);
    return null;
  });
  const lights = grid.split((x, y, z) => {
    const u = (x + L / 2) / L;
    if (Math.abs(x % 40) > 3 || hash3(Math.floor(x / 40), Math.floor(y / 30), Math.floor(z / 30)) < 0.45) return null;
    const r = Math.hypot(y, z);
    if (r < radiusAt(u) - 2.2 || r > radiusAt(u) + 2.5) return null;
    return 0xffb85a;
  });
  const mesh = new THREE.Mesh(grid.toGeometry(), voxelMaterial());
  const lm = new THREE.Mesh(lights.toGeometry(), emissive(1.8));
  g.add(mesh, lm);
  // 施工大灯（光晕）
  const rnd = mulberry32(5);
  for (let i = 0; i < 9; i++) {
    const s = glowSprite(0xffc070, 34, 0.7);
    const x = -L / 2 + 40 + rnd() * (L - 80);
    const r = radiusAt((x + L / 2) / L);
    const a = rnd() * TAU;
    s.position.set(x, Math.sin(a) * (r + 3), Math.cos(a) * (r + 3));
    g.add(s);
  }
  return g;
}

/** 漂浮的建材与垃圾：翻滚的板、桁架、气瓶、破损的太阳能板 */
export interface Debris {
  mesh: THREE.Object3D;
  base: THREE.Vector3;
  vel: THREE.Vector3;
  axis: THREE.Vector3;
  spin: number;
  phase: number;
}

export function buildDebris(count: number, seed: number, center: THREE.Vector3, radius: number): Debris[] {
  const rnd = mulberry32(seed);
  const out: Debris[] = [];
  const mats = voxelMaterial();
  const kinds: Array<() => THREE.BufferGeometry> = [
    // 板
    () => {
      const g = new Vox([-2.2, -0.15, -1.4], [2.2, 0.15, 1.4], 0.15);
      g.box(-2.2, -0.15, -1.4, 2.2, 0.15, 1.4, (x, y, z, i, j, k) => (((Math.floor(x / 0.7) + Math.floor(z / 0.7)) % 2 === 0) ? shade(0x2a3c7a, 0.9 + hash3(i, j, k) * 0.2) : shade(0x35509e, 0.9 + hash3(i, j, k) * 0.2)));
      return g.toGeometry();
    },
    // 桁架段
    () => {
      const g = new Vox([-2.4, -0.4, -0.4], [2.4, 0.4, 0.4], 0.1);
      for (let x = -2.3; x <= 2.3; x += 0.6) g.line(x, -0.3, -0.3, x + 0.3, 0.3, 0.3, 0.06, 0xb9bec6);
      g.line(-2.4, -0.3, -0.3, 2.4, -0.3, -0.3, 0.07, 0xd0d4d9);
      g.line(-2.4, 0.3, 0.3, 2.4, 0.3, 0.3, 0.07, 0xd0d4d9);
      g.line(-2.4, 0.3, -0.3, 2.4, 0.3, -0.3, 0.07, 0xd0d4d9);
      g.line(-2.4, -0.3, 0.3, 2.4, -0.3, 0.3, 0.07, 0xd0d4d9);
      return g.toGeometry();
    },
    // 气瓶
    () => {
      const g = new Vox([-0.5, -1.0, -0.5], [0.5, 1.0, 0.5], 0.1);
      g.cylY(0, 0, 0.42, -0.8, 0.8, (x, y, z, i, j, k) => shade(y > 0.4 ? 0xdfe3e7 : 0xe0872d, 0.94 + hash3(i, j, k) * 0.1));
      g.cylY(0, 0, 0.16, 0.8, 1.0, 0x7d8591);
      return g.toGeometry();
    },
    // 碎块
    () => {
      const g = new Vox([-0.8, -0.6, -0.8], [0.8, 0.6, 0.8], 0.12);
      g.box(-0.8, -0.6, -0.8, 0.8, 0.6, 0.8, (x, y, z, i, j, k) => (hash3(i, j, k) > 0.28 ? shade(0xb9bec6, 0.8 + hash3(i + 3, j, k) * 0.35) : null));
      return g.toGeometry();
    },
  ];
  for (let i = 0; i < count; i++) {
    const kind = Math.floor(rnd() * kinds.length);
    const m = new THREE.Mesh(kinds[kind](), mats);
    const r = radius * (0.25 + 0.75 * Math.cbrt(rnd()));
    const a = rnd() * TAU;
    const u = rnd() * 2 - 1;
    const s = Math.sqrt(1 - u * u);
    m.scale.setScalar(0.8 + rnd() * 1.8);
    m.castShadow = true;
    out.push({
      mesh: m,
      base: new THREE.Vector3(center.x + Math.cos(a) * s * r, center.y + u * r * 0.55, center.z + Math.sin(a) * s * r),
      vel: new THREE.Vector3((rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.5),
      axis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
      spin: (rnd() - 0.5) * 0.35,
      phase: rnd() * TAU,
    });
  }
  return out;
}

/** 一号基地（远景）：只是远方深渊里一个没有形状的光点 */
export function buildBaseOneDot(): THREE.Group {
  const g = new THREE.Group();
  const s = glowSprite(0xffe2b0, 900, 0.85);
  g.add(s);
  const s2 = glowSprite(0xffffff, 260, 1);
  g.add(s2);
  return g;
}

export { hash1 };
