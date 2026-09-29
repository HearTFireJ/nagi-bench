// 黄河空间站：车轮形主体（粗体素）+ 气闸模块（细体素、三段折面外壁）+ 太空电梯缆绳。
import * as THREE from "three";
import { voxelMaterial } from "@agentbench/voxel-kit";
import { Vox, noisy } from "../../util/vox";
import { hash2, hash3, TAU, DEG } from "../../util/math";
import { shade } from "../../util/color";
import { glowSprite } from "../../util/glow";
import { STATION, RING_R, RING_W, RING_T, HATCH, WALL_HEADING } from "./geometry";

function emissiveMat(scale = 1.4): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  m.color.setScalar(scale);
  return m;
}

export interface StationRig {
  /** 粗体素车轮站（原点 = 站中心，世界系放置） */
  root: THREE.Group;
  /** 气闸模块：局部系原点在 HATCH，+Z 指向外法线 */
  lock: THREE.Group;
  door: THREE.Object3D;
  chamberLight: THREE.PointLight;
  chamberGlow: THREE.Mesh;
  indicator: THREE.Mesh;
  indicatorGlow: THREE.Sprite;
  beacons: Array<{ sprite: THREE.Sprite; phase: number; color: number }>;
  /** open: 0..1 门开度；green: 0..1 指示灯由红变绿；lit: 气闸内灯光强度 0..1 */
  setHatch(open: number, green: number, lit: number): void;
  setTime(t: number): void;
}

function buildRing(): { hull: THREE.Mesh; windows: THREE.Mesh } {
  const half = RING_R + RING_T / 2 + 2;
  const g = new Vox([-half, -RING_W / 2 - 1, -half], [half, RING_W / 2 + 1, half], 1);
  const rOut = RING_R + RING_T / 2;
  const rIn = RING_R - RING_T / 2;
  g.ringY(0, 0, 0, RING_R, RING_T, RING_W, (x, y, z, i, j, k) => {
    const d = Math.hypot(x, z);
    const ang = Math.atan2(z, x);
    const outer = d > rOut - 1.2;
    const inner = d < rIn + 1.2;
    const top = Math.abs(y) > RING_W / 2 - 1.2;
    const panel = Math.floor(ang / (TAU / 96));
    let c = shade(0xd0d4d9, 0.93 + hash2(panel, Math.floor((y + 20) / 6)) * 0.11);
    if (outer || inner) {
      if (Math.abs(y) > RING_W / 2 - 3.6 && Math.abs(y) < RING_W / 2 - 2.0) c = 0xe0872d;
      const f = (ang / (TAU / 96)) % 1;
      if (Math.abs(f) < 0.05 || Math.abs(f - 1) < 0.05) c = shade(c, 0.74);
    }
    if (top) c = shade(0xb2b8c0, 0.94 + hash3(i, j, k) * 0.1);
    if (inner && !top) c = shade(c, 0.82);
    return c;
  });
  // 窗：内外壁各两排，挖出后放进自发光层
  const windows = g.split((x, y, z) => {
    const d = Math.hypot(x, z);
    const onOuter = d > rOut - 1.0 && d <= rOut + 0.2;
    const onInner = d < rIn + 1.0 && d >= rIn - 0.2;
    if (!onOuter && !onInner) return null;
    const row = Math.round(y);
    if (!(row === 5 || row === 4 || row === -6 || row === -5)) return null;
    const ang = Math.atan2(z, x);
    const bin = Math.floor(ang / (TAU / 300));
    if (bin % 3 !== 0) return null;
    if (hash2(bin, row) < 0.18) return null;
    return hash2(bin, 9) > 0.5 ? 0xffd88c : 0xffc46a;
  });
  // 六根辐条
  for (let a = 0; a < 6; a++) {
    const ang = a * 60 * DEG + 15 * DEG;
    g.line(Math.cos(ang) * 12, 0, Math.sin(ang) * 12, Math.cos(ang) * (rIn + 1), 0, Math.sin(ang) * (rIn + 1), 3.4, noisy(0xb9bec6, 0.06, a));
  }
  const hull = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  const win = new THREE.Mesh(windows.toGeometry(), emissiveMat(1.5));
  return { hull, windows: win };
}

function buildHub(): { hull: THREE.Mesh; lights: THREE.Mesh } {
  const g = new Vox([-24, -30, -24], [24, 46, 24], 1);
  g.cylY(0, 0, 16, -22, 26, (x, y, z, i, j, k) => {
    let c = shade(0xcdd1d6, 0.93 + hash3(i, j, k) * 0.1);
    if (Math.abs(y - 2) < 1.2) c = 0xe0872d;
    if (y < -20) c = 0x8a9099;
    return c;
  });
  g.cylY(0, 0, 9, 26, 32, noisy(0xb9bec6, 0.05, 3));
  g.cylY(0, 0, 3.2, 32, 46, noisy(0xdfe3e7, 0.05, 4));
  g.cylY(0, 0, 6, -30, -22, noisy(0x6f7681, 0.05, 5));
  // 太空电梯终端的对接环
  g.ringY(0, -26, 0, 6, 4, 2, 0xe0872d);
  const lights = g.split((x, y, z) => {
    const d = Math.hypot(x, z);
    if (d < 15 || d > 16.2) return null;
    if (Math.round(y) !== 8 && Math.round(y) !== 14) return null;
    const bin = Math.floor(Math.atan2(z, x) / (TAU / 90));
    return bin % 2 === 0 ? 0xffd88c : null;
  });
  return { hull: new THREE.Mesh(g.toGeometry(), voxelMaterial()), lights: new THREE.Mesh(lights.toGeometry(), emissiveMat(1.5)) };
}

function buildArrays(): THREE.Mesh {
  const g = new Vox([-104, 34, -14], [104, 42, 14], 1);
  const panel = (x: number, y: number, z: number, i: number, j: number, k: number) => {
    const ax = Math.abs(x);
    if (ax < 22) return null;
    const tileX = Math.floor((ax - 22) / 6);
    const tileZ = Math.floor((z + 14) / 4);
    const edge = ((ax - 22) % 6) < 0.9 || ((z + 14) % 4) < 0.9;
    if (y < 38.5 || y > 40.5) return null;
    if (edge) return 0x7d8fc0;
    return (tileX + tileZ) % 2 === 0 ? 0x1b2f68 : 0x263f86;
  };
  g.box(-104, 38.4, -14, 104, 40.6, 14, panel);
  g.box(-22, 36, -1.5, 22, 40, 1.5, noisy(0xb9bec6, 0.05, 8));
  g.box(-104, 38, -0.8, 104, 41, 0.8, noisy(0xb9bec6, 0.05, 9));
  return new THREE.Mesh(g.toGeometry(), voxelMaterial());
}

// ---------------------------------------------------------------------------
// 气闸模块：三段折面外壁（中央 22m + 两侧各 16m，外折 9°）
// ---------------------------------------------------------------------------
const FACET_H = 32;
const FACET_D = 6.5;
const VS = 0.25;

function facetPaint(cx: number, hatchWall: boolean): (x: number, y: number, z: number, i: number, j: number, k: number) => number | null {
  return (x, y, z, i, j, k) => {
    if (z < -0.3) return 0x9aa0a8; // 内部
    const gx = x + cx; // 以中心面为原点的横向坐标（用于图案连续）
    const px = Math.floor(gx / 2);
    const py = Math.floor((y + FACET_H / 2) / 4);
    let c = shade(0x8b929c, 0.92 + hash2(px, py) * 0.13);
    const fx = gx / 2 - Math.floor(gx / 2);
    const fy = (y + FACET_H / 2) / 4 - Math.floor((y + FACET_H / 2) / 4);
    if (fx < 0.05 || fy < 0.03) c = shade(c, 0.68);
    // 铆钉
    if ((fx < 0.1 || fx > 0.9) && (fy < 0.06 || fy > 0.94) && hash3(i, j, k) > 0.2) c = shade(c, 0.6);
    // 橙色饰带
    if (Math.abs(y) > 13.4 && Math.abs(y) < 14.6) c = 0xe0872d;
    if (Math.abs(y) > 14.6) c = 0x8f959d;
    // 中央深色腰线
    if (Math.abs(y - 4.6) < 0.35 || Math.abs(y + 4.6) < 0.35) c = 0x8b929b;
    if (hatchWall) {
      // 舱门周围的危险条纹
      const d = Math.hypot(x, y);
      if (d > 2.1 && d < 2.75) {
        const stripe = Math.floor((Math.atan2(y, x) + Math.PI) / (TAU / 24)) % 2;
        c = stripe === 0 ? 0xf2c230 : 0x1d1f23;
      }
      // “黄河”水纹标识：舱门下方三道蓝色波浪
      if (y < -6 && y > -11 && Math.abs(x) < 8) {
        const wave = Math.sin(x * 1.1) * 0.7;
        const row = Math.floor((y + 11) / 1.2);
        const yy = (y + 11) - row * 1.2 + wave * 0.35;
        if (row < 4 && yy > 0.15 && yy < 0.75) c = row % 2 === 0 ? 0x2f6fd1 : 0x8cc4ff;
      }
    }
    return c;
  };
}

export function buildStation(): StationRig {
  const root = new THREE.Group();
  root.position.copy(STATION);

  const ring = buildRing();
  const hub = buildHub();
  const arrays = buildArrays();
  root.add(ring.hull, ring.windows, hub.hull, hub.lights, arrays);

  // 缆绳：3m 宽的长方体，向下延伸 32 公里（细而亮的“线”）
  const tetherLen = 32000;
  const tether = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, tetherLen, 2.6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.62, 0.78), fog: false }),
  );
  tether.position.set(0, -30 - tetherLen / 2, 0);
  root.add(tether);
  // 塔顶天线
  const beacons: StationRig["beacons"] = [];
  const addBeacon = (pos: THREE.Vector3, color: number, size: number, phase: number) => {
    const s = glowSprite(color, size, 0.95);
    s.position.copy(pos);
    root.add(s);
    beacons.push({ sprite: s, phase, color });
  };
  addBeacon(new THREE.Vector3(0, 47, 0), 0xff4030, 26, 0);
  addBeacon(new THREE.Vector3(RING_R + 8, 12, 0), 0xff4030, 20, 1.3);
  addBeacon(new THREE.Vector3(-(RING_R + 8), 12, 0), 0x40ff70, 20, 0.6);
  addBeacon(new THREE.Vector3(0, 12, RING_R + 8), 0xffffff, 18, 2.2);
  addBeacon(new THREE.Vector3(0, 12, -(RING_R + 8)), 0xffffff, 18, 1.7);
  addBeacon(new THREE.Vector3(96, 41, 0), 0xffb060, 16, 0.2);
  addBeacon(new THREE.Vector3(-96, 41, 0), 0xffb060, 16, 0.9);

  // ---- 气闸模块 ----
  const lock = new THREE.Group();
  lock.position.copy(HATCH);
  lock.rotation.y = WALL_HEADING;

  const facets: Array<{ x0: number; x1: number; cx: number; rot: number; hinge: number; hatch: boolean }> = [
    { x0: -11, x1: 11, cx: 0, rot: 0, hinge: 0, hatch: true },
    { x0: 0, x1: 16, cx: 11, rot: 9 * DEG, hinge: 11, hatch: false },
    { x0: -16, x1: 0, cx: -11, rot: -9 * DEG, hinge: -11, hatch: false },
  ];
  const lockWindows: THREE.Mesh[] = [];
  for (const f of facets) {
    const g = new Vox([f.x0, -FACET_H / 2, -FACET_D], [f.x1, FACET_H / 2, 0], VS);
    // 侧面折面的图案横向坐标 = 局部 x + 铰链位置，使接缝在折角处连续
    g.box(f.x0, -FACET_H / 2, -FACET_D, f.x1, FACET_H / 2, 0, facetPaint(f.hatch ? 0 : f.hinge, f.hatch));
    if (f.hatch) {
      // 挖出气闸腔并加白色内衬
      g.clearBox(-1.75, -1.75, -5.4, 1.75, 1.75, 0.01);
      g.recolor((x, y, z, c) => {
        if (z < -0.05 && Math.abs(x) < 2.3 && Math.abs(y) < 2.3 && Math.hypot(x, y) < 3.2) return shade(0xf1f4f7, 0.92 + hash2(Math.floor(x * 4), Math.floor(y * 4)) * 0.08);
        return null;
      });
      const inner = g.split((x, y, z) => {
        // 舱内灯带：腔体上下两条
        if (z < -0.6 && z > -5.2 && Math.abs(x) < 1.9 && (Math.abs(y - 1.86) < 0.13 || Math.abs(y + 1.86) < 0.13)) return 0xe6f4ff;
        return null;
      });
      const em = new THREE.Mesh(inner.toGeometry(), emissiveMat(2.2));
      const mesh = new THREE.Mesh(g.toGeometry(), voxelMaterial());
      mesh.receiveShadow = true;
      lock.add(mesh, em);
    } else {
      const win = g.split((x, y, z) => {
        if (z < -0.26) return null;
        const row = Math.round(y);
        if (row !== 7 && row !== -8 && row !== 8 && row !== -9) return null;
        const bin = Math.floor(x / 3);
        const fx = x / 3 - bin;
        if (fx > 0.55) return null;
        if (hash2(bin, row) < 0.2) return null;
        return 0xffd58a;
      });
      const holder = new THREE.Group();
      holder.position.set(f.hinge, 0, 0);
      holder.rotation.y = f.rot;
      const mesh = new THREE.Mesh(g.toGeometry(), voxelMaterial());
      mesh.position.x = 0;
      mesh.receiveShadow = true;
      const wm = new THREE.Mesh(win.toGeometry(), emissiveMat(1.5));
      holder.add(mesh, wm);
      lock.add(holder);
      lockWindows.push(wm);
    }
  }

  // 舱门（滑动圆盘）与门框
  const dg = new Vox([-2.0, -2.0, -0.3], [2.0, 2.0, 0.3], 0.1);
  dg.cylZ(0, 0, 1.85, -0.3, 0.3, (x, y) => {
    const d = Math.hypot(x, y);
    if (d > 1.65) return 0xe0872d;
    if (Math.abs(x) < 0.12 || Math.abs(y) < 0.12) return 0x777d86;
    return shade(0xcfd4da, 0.94 + hash2(Math.floor(x * 5), Math.floor(y * 5)) * 0.08);
  });
  dg.cylZ(0, 0, 0.32, 0.1, 0.3, 0x4d545e);
  const door = new THREE.Mesh(dg.toGeometry(), voxelMaterial());
  door.position.set(0, 0, 0.32);
  door.castShadow = true;
  lock.add(door);

  // 指示灯
  const indicator = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.6, 0.35),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.3), fog: false }),
  );
  indicator.position.set(0, 3.9, 0.2);
  const indicatorGlow = glowSprite(0xff3a2a, 7, 0.9);
  indicatorGlow.position.set(0, 3.9, 1.2);
  lock.add(indicator, indicatorGlow);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 0.2), new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 1 }));
  plate.position.set(0, 3.9, 0.05);
  lock.add(plate);

  // 舱内光：门开时向外泄出
  const chamberLight = new THREE.PointLight(0xdcefff, 0, 70, 2);
  chamberLight.position.set(0, 0, 1.6);
  lock.add(chamberLight);
  const chamberGlow = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 3.4, 0.2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 2.0, 2.2), fog: false }),
  );
  chamberGlow.position.set(0, 0, -5.3);
  lock.add(chamberGlow);
  chamberGlow.visible = false;

  const rig: StationRig = {
    root, lock, door, chamberLight, chamberGlow, indicator, indicatorGlow, beacons,
    setHatch(open, green, lit) {
      const o = open < 0 ? 0 : open > 1 ? 1 : open;
      door.position.x = -3.9 * o;
      const im = indicator.material as THREE.MeshBasicMaterial;
      const g2 = green < 0 ? 0 : green > 1 ? 1 : green;
      im.color.setRGB(3 * (1 - g2) + 0.3 * g2, 0.4 * (1 - g2) + 2.8 * g2, 0.3 * (1 - g2) + 0.6 * g2);
      const sm = indicatorGlow.material as THREE.SpriteMaterial;
      sm.color.setRGB(1 * (1 - g2) + 0.2 * g2, 0.25 * (1 - g2) + 1.0 * g2, 0.18 * (1 - g2) + 0.3 * g2);
      chamberLight.intensity = 240 * lit;
      chamberGlow.visible = o > 0.02;
    },
    setTime(t) {
      for (const b of beacons) {
        const on = Math.sin(t * 2.6 + b.phase * 3.1) > 0.35 ? 1 : 0.12;
        (b.sprite.material as THREE.SpriteMaterial).opacity = 0.95 * on;
      }
    },
  };
  return rig;
}
