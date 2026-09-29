// 一号基地：舱室（他把定位单元留下）与外景（他从气闸飘出，向黄河站飞去）。
// 天穹（地球/太阳/星空）直接复用太空世界的 bg 场景（同一个 Scene 引用，零额外内存）。
import * as THREE from "three";
import { voxelMaterial } from "@agentbench/voxel-kit";
import { Actor, blinkAt } from "../../chars/actor";
import { ZHANG_LOOK, ZHANG_SUIT } from "../../chars/cast";
import { suitSkin } from "../space/crowd";
import { backpackMesh, mountMeters } from "../../chars/props";
import { stand, breathe, stride, lerpPose, floatUpright, addPose, overBench, type Pose } from "../../chars/poses";
import { pathAt, walkAmount, type WP } from "../../film/motion";
import type { World } from "../../film/types";
import { ParticleField } from "../../film/particles";
import { Vox, noisy } from "../../util/vox";
import { hash2, hash3, smooth, seg, TAU, DEG } from "../../util/math";
import { shade } from "../../util/color";
import { glowSprite } from "../../util/glow";
import { textTexture } from "../../util/pixelfont";
import { sunDirAt } from "../space/geometry";

const VS = 0.0625;

function emissiveMat(scale = 1.5): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  m.color.setScalar(scale);
  return m;
}

/** 父亲的照片：一位戴大檐帽、穿深色制服的中年军人（20×24 像素肖像） */
const PORTRAIT_ROWS = [
  "....................",
  "....................",
  "....cccccccccccc....",
  "....cccccccccccc....",
  "....cccccrgccccc....",
  "....CCCCCggCCCCC....",
  "...bbbbbbbbbbbbbb...",
  "....bSSSSSSSSSSb....",
  ".....skkksskkks.....",
  "....sswksssskwss....",
  "....sssssSSsssss....",
  "....sssssSSsssss....",
  ".....sssmmmmsss.....",
  "......ssssssss......",
  ".......SSSSSS.......",
  "......wwssssww......",
  "..uuuuuwwnnwwuuuuu..",
  "..ggguuuwnnwuuuggg..",
  "..uuuuuuunnuuuuuuu..",
  "..uuuuuuunnuurgbuu..",
  "..uuuuuuunnuuuuuuu..",
  "..uuuuuuunnuuuuuuu..",
  "..UUUUUUUnnUUUUUUU..",
  "..UUUUUUUnnUUUUUUU..",
];
const PORTRAIT_PAL: Record<string, number> = {
  ".": 0x7d858e, c: 0x1d2636, C: 0x2f3c56, b: 0x0e131b, g: 0xd8b64a, r: 0xb02a2a, s: 0xdcb48f, S: 0xbf9673,
  k: 0x2a1a14, w: 0xeeeae0, m: 0x9a5a4a, u: 0x223047, U: 0x1a2436, n: 0x141820, B: 0x5b626b,
};

function portraitTexture(): THREE.DataTexture {
  const H = PORTRAIT_ROWS.length;
  const W = PORTRAIT_ROWS[0].length;
  const d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = PORTRAIT_PAL[PORTRAIT_ROWS[y][x]] ?? 0xff00ff;
      const i = ((H - 1 - y) * W + x) * 4;
      d[i] = (c >> 16) & 255;
      d[i + 1] = (c >> 8) & 255;
      d[i + 2] = c & 255;
      d[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export const CABIN = { x0: -1.5, x1: 1.5, z0: -1.8, z1: 1.8, h: 2.5 };
export const CABIN_PATH: WP[] = [
  { t: 0, x: 0.3, z: -0.95, h: Math.PI / 2 },
  { t: 4.7, x: 0.3, z: -0.95, h: Math.PI / 2 },
  { t: 6.6, x: 1.34, z: 0.0, h: Math.PI / 2 },
];

function buildCabinShell(): THREE.Mesh {
  const { x0, x1, z0, z1, h } = CABIN;
  const min: [number, number, number] = [x0 - 0.25, -0.13, z0 - 0.25];
  const max: [number, number, number] = [x1 + 0.25, h + 0.25, z1 + 0.25];
  const g = new Vox(min, max, VS);
  const paint = (x: number, y: number, z: number, i: number, j: number, k: number): number | null => {
    if (y < 0) {
      const t = (Math.floor(x / 0.25) + Math.floor(z / 0.25)) % 2;
      return shade(t ? 0x3c4048 : 0x33373e, 0.94 + hash3(i, j, k) * 0.1);
    }
    if (y > h) return 0xb8bec6;
    const wall = x < x0 || x > x1 || z < z0 || z > z1;
    if (!wall) return null;
    // 舱壁：浅灰面板 + 接缝 + 橙色带
    const u = x < x0 || x > x1 ? z : x;
    const px = Math.floor(u / 0.5), py = Math.floor(y / 0.6);
    let c = shade(0x9aa2ab, 0.92 + hash2(px, py) * 0.12);
    const fx = u / 0.5 - px, fy = y / 0.6 - py;
    if (fx < 0.04 || fy < 0.05) c = shade(c, 0.7);
    if (y > 0.95 && y < 1.05) c = 0xe0872d;
    if (y < 0.15) c = 0x5a6068;
    return c;
  };
  g.box(min[0], min[1], min[2], max[0], max[1], max[2], paint);
  g.clearBox(x0, 0, z0, x1, h, z1);
  // 舷窗（-Z 墙）
  g.clearBox(0.3, 1.15, z0 - 0.3, 1.1, 1.85, z0 + 0.02);
  g.box(0.25, 1.1, z0 - 0.02, 1.15, 1.15, z0 + 0.06, 0x2c3037);
  g.box(0.25, 1.85, z0 - 0.02, 1.15, 1.9, z0 + 0.06, 0x2c3037);
  g.box(0.25, 1.1, z0 - 0.02, 0.3, 1.9, z0 + 0.06, 0x2c3037);
  g.box(1.1, 1.1, z0 - 0.02, 1.15, 1.9, z0 + 0.06, 0x2c3037);
  // 气闸门框（+X 墙，圆形舱口）
  g.clearBox(x1 - 0.02, 0.3, -0.5, x1 + 0.3, 1.5, 0.5);
  g.cylX(0.9, 0.0, 0.62, x1 - 0.06, x1 + 0.02, 0xe0872d, 0.5);
  const m = new THREE.Mesh(g.toGeometry(), voxelMaterial());
  m.receiveShadow = true;
  return m;
}

export interface CabinRig {
  group: THREE.Group;
  lights: THREE.Light[];
  led: THREE.Mesh;
  locator: THREE.Group;
  hatch: THREE.Group;
  photo: THREE.Mesh;
  screen: THREE.Mesh;
  hatchGlow: THREE.Mesh;
  hatchLight: THREE.PointLight;
  lamp: THREE.PointLight;
  ledGlow: THREE.Sprite;
}

function buildCabin(): CabinRig {
  const group = new THREE.Group();
  group.add(buildCabinShell());
  const lights: THREE.Light[] = [];

  // 铺位（左墙）
  const bunk = new Vox([-1.5, 0, -1.5], [-0.5, 0.75, 0.9], VS / 2);
  bunk.box(-1.5, 0.0, -1.5, -0.5, 0.35, 0.9, noisy(0x4a5058, 0.06, 1));
  bunk.box(-1.5, 0.35, -1.5, -0.5, 0.5, 0.9, noisy(0x5c6a4a, 0.1, 2)); // 军绿色床垫
  bunk.box(-1.5, 0.5, -1.5, -0.5, 0.56, -0.7, noisy(0xdfe2e6, 0.06, 3)); // 枕
  bunk.box(-1.5, 0.5, -0.6, -0.5, 0.58, 0.9, noisy(0x4a5c78, 0.1, 4)); // 蓝色毯子
  group.add(new THREE.Mesh(bunk.toGeometry(), voxelMaterial()));

  // 书桌与小架子（右墙，靠近气闸旁）
  const desk = new Vox([0.55, 0, -1.7], [1.5, 1.95, -0.5], VS / 2);
  desk.box(0.55, 0.72, -1.7, 1.5, 0.78, -0.55, noisy(0x6a5a48, 0.08, 5));
  desk.box(0.6, 0.0, -1.7, 0.66, 0.72, -1.62, 0x2c3037);
  desk.box(1.44, 0.0, -1.7, 1.5, 0.72, -1.62, 0x2c3037);
  desk.box(0.6, 0.0, -0.62, 0.66, 0.72, -0.55, 0x2c3037);
  desk.box(1.44, 0.0, -0.62, 1.5, 0.72, -0.55, 0x2c3037);
  desk.box(0.6, 1.35, -1.7, 1.5, 1.4, -1.35, noisy(0x6a5a48, 0.08, 6)); // 搁架
  group.add(new THREE.Mesh(desk.toGeometry(), voxelMaterial()));

  // 小显示屏
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.18),
    new THREE.MeshBasicMaterial({ map: textTexture("EVA 12:00", [90, 220, 255]), transparent: true, color: new THREE.Color(1.5, 1.5, 1.5), fog: false }),
  );
  screen.position.set(1.05, 1.02, -1.45);
  screen.rotation.x = -0.25;
  group.add(screen);

  // 父亲的照片（搁架上的小相框）
  const frame = new Vox([-0.09, 0, -0.02], [0.09, 0.21, 0.02], 0.008);
  frame.box(-0.09, 0, -0.02, 0.09, 0.21, 0.02, 0x2a1f16);
  const fm = new THREE.Mesh(frame.toGeometry(), voxelMaterial());
  fm.position.set(0.7, 1.4, -1.55);
  fm.rotation.x = 0.12;
  group.add(fm);
  const photo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, 0.18),
    new THREE.MeshBasicMaterial({ map: portraitTexture(), color: new THREE.Color(1.15, 1.15, 1.15), fog: false }),
  );
  photo.position.set(0.7, 1.505, -1.512);
  photo.rotation.x = 0.12;
  group.add(photo);

  // 定位单元：一个小方块，绿灯规律闪烁（放在桌面上）
  const locator = new THREE.Group();
  const lv = new Vox([-0.05, 0, -0.035], [0.05, 0.035, 0.035], 0.006);
  lv.box(-0.05, 0, -0.035, 0.05, 0.035, 0.035, noisy(0x3a3f46, 0.06, 7));
  lv.box(-0.045, 0.03, -0.03, 0.045, 0.036, 0.03, 0x1f2329);
  locator.add(new THREE.Mesh(lv.toGeometry(), voxelMaterial()));
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.008, 0.014), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 3, 0.6), fog: false }));
  led.position.set(0.025, 0.038, 0);
  locator.add(led);
  const ledGlow = glowSprite(0x40ff80, 0.22, 0.8);
  ledGlow.position.copy(led.position).add(new THREE.Vector3(0, 0.03, 0));
  locator.add(ledGlow);
  locator.position.set(0.86, 0.78, -0.64);
  group.add(locator);

  // 气闸舱门（圆形，可绕铰链打开）
  const hatch = new THREE.Group();
  hatch.position.set(CABIN.x1 - 0.03, 0.9, 0.5);
  const hd = new Vox([-0.04, -0.6, -0.6], [0.04, 0.6, 0.6], 0.03);
  hd.cylX(0, 0, 0.57, -0.04, 0.04, (x, y, z, i, j, k) => (Math.hypot(y, z) > 0.5 ? 0xe0872d : shade(0xc7ccd2, 0.94 + hash3(i, j, k) * 0.1)));
  hd.cylX(0, 0, 0.09, 0.03, 0.06, 0x50565f);
  const hm = new THREE.Mesh(hd.toGeometry(), voxelMaterial());
  hm.position.set(0, 0, -0.55);
  hatch.add(hm);
  group.add(hatch);

  // 灯光：冷白顶灯 + 桌面的暖色小灯 + 舷窗透进来的蓝色地球光
  const ceil = new THREE.PointLight(0xdfeaff, 5, 6, 2);
  ceil.position.set(0, 2.3, 0);
  const lamp = new THREE.PointLight(0xffc27a, 6, 3, 2);
  lamp.position.set(1.0, 1.25, -1.2);
  const win = new THREE.PointLight(0x6a9cff, 4, 4, 2);
  win.position.set(0.6, 1.5, -1.5);
  const amb = new THREE.AmbientLight(0x2a3346, 0.8);
  const hatchLight = new THREE.PointLight(0xffd9a8, 0, 6, 2);
  hatchLight.position.set(CABIN.x1 - 0.2, 1.0, 0.0);
  group.add(ceil, lamp, win, amb, hatchLight);
  lights.push(ceil, lamp, win, amb, hatchLight);
  // 舱口外的强光（阳光照进气闸）：自发光平面，透过打开的舱口可见
  const hatchGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.7, 2.0), fog: false }),
  );
  hatchGlow.position.set(CABIN.x1 + 0.5, 0.9, 0);
  hatchGlow.rotation.y = -Math.PI / 2;
  hatchGlow.visible = false;
  group.add(hatchGlow);
  // 顶灯灯带
  const strip = new Vox([-0.9, 2.4, -1.2], [0.9, 2.46, 1.2], 0.03);
  strip.box(-0.9, 2.4, -0.1, 0.9, 2.46, 0.1, 0xeef4ff);
  strip.box(-0.9, 2.4, -1.1, 0.9, 2.46, -0.9, 0xeef4ff);
  strip.box(-0.9, 2.4, 0.9, 0.9, 2.46, 1.1, 0xeef4ff);
  group.add(new THREE.Mesh(strip.toGeometry(), emissiveMat(2.2)));
  return { group, lights, led, locator, hatch, photo, screen, hatchGlow, hatchLight, lamp, ledGlow };
}

// ---------------------------------------------------------------------------
// 一号基地外景：一个小车轮 + 几个舱体
// ---------------------------------------------------------------------------
export const BASE_R = 15;

function buildBaseExterior(): { group: THREE.Group; airlock: THREE.Object3D; hatchDoor: THREE.Object3D; beacons: THREE.Sprite[] } {
  const group = new THREE.Group();
  const half = BASE_R + 6;
  const g = new Vox([-half, -6, -half], [half, 6, half], 0.5);
  g.ringY(0, 0, 0, BASE_R, 3.6, 7, (x, y, z, i, j, k) => {
    const ang = Math.atan2(z, x);
    let c = shade(0xcfd3d8, 0.92 + hash2(Math.floor(ang / (TAU / 40)), Math.floor((y + 4) / 2)) * 0.12);
    if (Math.abs(y) > 2.4 && Math.abs(y) < 3.1) c = 0xe0872d;
    return c;
  });
  for (let a = 0; a < 4; a++) {
    const t = (a / 4) * TAU + 0.4;
    g.line(0, 0, 0, Math.cos(t) * (BASE_R - 1.5), 0, Math.sin(t) * (BASE_R - 1.5), 0.9, noisy(0xb9bec6, 0.06, a));
  }
  g.cylY(0, 0, 2.6, -5, 5, noisy(0xcdd1d6, 0.05, 9));
  // 外壁窗
  const win = g.split((x, y, z) => {
    const d = Math.hypot(x, z);
    if (d < BASE_R + 1.2 || d > BASE_R + 1.9) return null;
    if (Math.round(y) !== 1 && Math.round(y) !== -1) return null;
    return Math.floor(Math.atan2(z, x) / (TAU / 60)) % 3 === 0 ? 0xffd88c : null;
  });
  group.add(new THREE.Mesh(g.toGeometry(), voxelMaterial()), new THREE.Mesh(win.toGeometry(), emissiveMat(1.5)));
  // 气闸凸起（朝 +X，可看见舱口）
  const lock = new Vox([0, -2, -2], [3.2, 2, 2], 0.1);
  lock.box(0, -2, -2, 3.2, 2, 2, noisy(0xc7ccd2, 0.06, 4));
  lock.clearBox(2.6, -1.1, -1.1, 3.3, 1.1, 1.1);
  lock.box(2.5, -1.2, -1.2, 2.6, 1.2, 1.2, 0xe0872d);
  const lockMesh = new THREE.Mesh(lock.toGeometry(), voxelMaterial());
  lockMesh.position.set(BASE_R + 1.5, 0, 0);
  group.add(lockMesh);
  const hatchDoor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 2.1), new THREE.MeshStandardMaterial({ color: 0x9aa1a9, roughness: 0.9 }));
  hatchDoor.position.set(BASE_R + 4.8, 0, 0);
  group.add(hatchDoor);
  // 太阳能帆板
  const arr = new Vox([-2, -0.2, -10], [2, 0.2, 10], 0.25);
  arr.box(-2, -0.2, -10, 2, 0.2, 10, (x, y, z) => (((Math.floor(x / 1) + Math.floor(z / 1)) % 2 === 0) ? 0x1b2f68 : 0x263f86));
  const arrM = new THREE.Mesh(arr.toGeometry(), voxelMaterial());
  arrM.position.set(0, 6.5, 0);
  group.add(arrM);
  const beacons: THREE.Sprite[] = [];
  for (const [x, y, z, c] of [[BASE_R + 4, 3, 2, 0xff4030], [0, 6.6, 9, 0x40ff70]] as Array<[number, number, number, number]>) {
    const s = glowSprite(c, 2.4, 0.9);
    s.position.set(x, y, z);
    group.add(s);
    beacons.push(s);
  }
  return { group, airlock: lockMesh, hatchDoor, beacons };
}

export class BaseWorlds {
  readonly cabin: World & { rig: CabinRig };
  readonly outside: World;
  readonly zhangC: Actor;
  readonly zhangO: Actor;
  private readonly baseExt: ReturnType<typeof buildBaseExterior>;
  private readonly puffs = new ParticleField(600);
  private readonly sun: THREE.DirectionalLight;
  private readonly earthFill: THREE.HemisphereLight;

  constructor(bg: THREE.Scene) {
    // ---------- 舱室 ----------
    const rig = buildCabin();
    const cScene = new THREE.Scene();
    cScene.add(rig.group);
    const cFill = new THREE.PointLight(0xdfeaff, 2.4, 6, 2);
    cScene.add(cFill);
    this.cabin = {
      id: "cabin", scene: cScene, bg, clearColor: 0x02030a, rig,
      beforeRender: (c) => {
        cFill.position.copy(c.position);
        bg.rotation.set(0, 0, 0);
      },
    };
    // 舷窗朝向：让 -Z 方向的天空对着太阳/地球
    // （bg 是世界固定的；这里通过旋转 bg 把方位 -48° 转到相机的 -Z）
    const yaw = -48 * DEG;
    this.cabin.beforeRender = (c) => {
      cFill.position.copy(c.position);
      bg.rotation.set(0, yaw, 0);
    };

    // ---------- 外景 ----------
    const oScene = new THREE.Scene();
    this.baseExt = buildBaseExterior();
    oScene.add(this.baseExt.group);
    this.sun = new THREE.DirectionalLight(0xffb070, 3.0);
    const sd = sunDirAt(0.9);
    this.sun.position.copy(sd).multiplyScalar(200);
    oScene.add(this.sun, this.sun.target);
    this.earthFill = new THREE.HemisphereLight(0x5f97ff, 0x06080e, 0.9);
    oScene.add(this.earthFill, new THREE.AmbientLight(0x1a2240, 0.7));
    const oFill = new THREE.DirectionalLight(0xcfdcff, 0.5);
    oScene.add(oFill, oFill.target);
    this.outside = {
      id: "base-out", scene: oScene, bg, clearColor: 0x010207,
      beforeRender: (c) => {
        bg.rotation.set(0, 0, 0);
        const f = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
        oFill.position.copy(c.position).addScaledVector(f, -20);
        oFill.target.position.copy(c.position);
        oFill.target.updateMatrixWorld(true);
      },
    };
    oScene.add(this.puffs.mesh);

    // ---------- 演员 ----------
    const suit = suitSkin("zhang", ZHANG_SUIT, { kind: "gold", level: 0 });
    this.zhangC = new Actor("章北海·舱室", ZHANG_LOOK, { heightM: 1.8, clothes: suit, castShadow: false });
    this.zhangO = new Actor("章北海·舱外", ZHANG_LOOK, { heightM: 1.8, clothes: suit, castShadow: false });
    mountMeters(this.zhangC, "back", backpackMesh(), { rot: [0, Math.PI, 0], pos: [0, -1, -3.2] });
    mountMeters(this.zhangO, "back", backpackMesh(), { rot: [0, Math.PI, 0], pos: [0, -1, -3.2] });
    cScene.add(this.zhangC.root);
    oScene.add(this.zhangO.root);

    // 舱外推力尾焰
    const dir = new THREE.Vector3(1, 0, 0);
    this.puffs.add({
      id: 2001, t0: 3.2, t1: 12, count: 160,
      origin: (t, out) => this.outPos(t, out).add(new THREE.Vector3(0, 0.4, 0)),
      dir: dir.clone().negate(), cone: 0.3, speed: [3, 6], life: [1.0, 2.0], size: [0.15, 0.35],
      colorA: [1.8, 1.8, 2.0], colorB: [0.6, 0.7, 1.0], shrink: 1, drag: 1.5,
    });
    this.puffs.add({
      id: 2002, t0: 1.0, t1: 1.8, count: 14,
      origin: (t, out) => this.outPos(t, out).add(new THREE.Vector3(0, 1.2, 0)),
      dir: new THREE.Vector3(0, 0.3, 1).normalize(), cone: 0.5, speed: [0.8, 1.8], life: [0.8, 1.4], size: [0.05, 0.12],
      colorA: [1.4, 1.4, 1.5], colorB: [0.5, 0.6, 0.9], shrink: 1, drag: 1.2,
    });
  }

  /** 舱外：章北海位置（局部时间 lt：0 = 舱外镜头起点） */
  outPos(lt: number, out: THREE.Vector3): THREE.Vector3 {
    // 0.9~3.0 从气闸飘出；3.2 起推进器点火，沿 +X 加速离去
    const x0 = BASE_R + 3.8;
    const drift = smooth(seg(lt, 0.9, 3.0)) * 2.4;
    const dt = Math.max(0, lt - 3.2);
    return out.set(x0 - 1.8 + drift + 0.5 * 8.0 * dt * dt, 0, 0);
  }

  /** 结尾：他已离开。空无一人的舱室——桌上的绿灯仍在规律地闪，父亲的照片望着舷窗外的落日 */
  setCabinEmpty(lt: number): void {
    const rig = this.cabin.rig;
    (rig.led.material as THREE.MeshBasicMaterial).color.setRGB(0.2, 3 * (Math.sin(lt * 5) > 0 ? 1 : 0.12), 0.6);
    rig.hatch.rotation.y = 0;
    rig.hatchGlow.visible = false;
    rig.hatchLight.intensity = 0;
    rig.locator.position.set(0.86, 0.78, -0.64);
    rig.locator.visible = true;
    this.zhangC.show(false);
    // 夜间模式：顶灯几乎熄灭，只剩桌面的暖灯与舷窗外的蓝光
    const [ceil, lamp, win, amb] = rig.lights as [THREE.PointLight, THREE.PointLight, THREE.PointLight, THREE.AmbientLight];
    rig.ledGlow.scale.setScalar(0.55);
    ceil.intensity = 1.0;
    lamp.intensity = 3.2;
    win.intensity = 5;
    amb.intensity = 0.45;
  }

  setCabin(lt: number): void {
    const rig = this.cabin.rig;
    this.zhangC.show(true);
    {
      const [ceil, lamp, win, amb] = rig.lights as [THREE.PointLight, THREE.PointLight, THREE.PointLight, THREE.AmbientLight];
      rig.ledGlow.scale.setScalar(0.22);
      ceil.intensity = 5;
      lamp.intensity = 6;
      win.intensity = 4;
      amb.intensity = 0.8;
    }
    // LED 规律闪烁
    (rig.led.material as THREE.MeshBasicMaterial).color.setRGB(0.2, 3 * (Math.sin(lt * 5) > 0 ? 1 : 0.12), 0.6);
    // 舱口在 5.6 起打开
    const open = smooth(seg(lt, 5.5, 6.4));
    rig.hatch.rotation.y = -open * 1.7;
    rig.hatchGlow.visible = open > 0.02;
    rig.hatchLight.intensity = 12 * open;
    const z = this.zhangC;
    // 站位：桌前(0.15,-1.0)面向桌子(+X) → 放下定位单元 → 看照片 → 走向舱口(1.0,0.5)
    const st = pathAt(CABIN_PATH, lt);
    const walk = walkAmount(st, CABIN_PATH, lt);
    z.place(st.x, 0, st.z, st.h);
    let pose: Pose = addPose(walk > 0.01 ? stride(lt, walk, 0.6) : stand(0.05, 0.05, 0), breathe(lt, 0.8));
    // 从手腕卸下定位单元 → 放到桌上
    const grab = smooth(seg(lt, 0.4, 1.0)) * (1 - smooth(seg(lt, 2.0, 2.6)));
    pose = lerpPose(pose, { ...pose, armR: [-1.1, 0, -0.4], armL: [-0.9, 0, 0.6], neck: [0.3, 0.1, 0] }, grab);
    const place = smooth(seg(lt, 1.5, 2.1)) * (1 - smooth(seg(lt, 2.9, 3.5)));
    pose = lerpPose(pose, { ...overBench(0.5, -1.0), armL: [-0.5, 0, 0.15] }, place);
    // 看照片（头转向右前方的搁架）
    const look = smooth(seg(lt, 3.1, 3.7)) * (1 - smooth(seg(lt, 4.3, 4.9)));
    pose = lerpPose(pose, { ...pose, neck: [-0.1, 0.6, 0], hips: [0, 0.2, 0] }, look);
    z.pose(pose);
    z.setExpr(blinkAt(lt, 2.3, 3.8) ? "blink" : "stern");
    // 定位单元：先握在手里（跟着手），放下的过程中平滑过渡到桌面上的位置（不出现“跳”）
    const wp = new THREE.Vector3();
    z.root.updateMatrixWorld(true);
    z.figure.anchors.handR.getWorldPosition(wp);
    const carry = 1 - smooth(seg(lt, 1.7, 2.5));
    rig.locator.position.set(0.86, 0.78, -0.64).lerp(wp.add(new THREE.Vector3(0, 0.04, 0)), carry);
    rig.locator.visible = true;
  }

  setOutside(lt: number): void {
    const z = this.zhangO;
    const p = this.outPos(lt, new THREE.Vector3());
    z.place(p.x, p.y, p.z, Math.PI / 2 - 0.0);
    // 气闸门：3.0~3.8 打开
    const door = smooth(seg(lt, 0.3, 1.3));
    this.baseExt.hatchDoor.position.y = door * 2.0;
    let pose: Pose = floatUpright(lt, 1.3);
    const thrust = smooth(seg(lt, 3.0, 3.8));
    pose = lerpPose(pose, { hips: [1.3, 0, 0], neck: [-0.8, 0, 0], armR: [0.25, 0, 0.12], armL: [0.25, 0, -0.12], legR: [-0.05, 0, 0.03], legL: [-0.05, 0, -0.03] }, thrust);
    z.pose(pose);
    z.setExpr("stern");
    // 信标闪烁
    this.baseExt.beacons.forEach((b, i) => ((b.material as THREE.SpriteMaterial).opacity = Math.sin(lt * 2.6 + i * 2) > 0.3 ? 0.95 : 0.12));
    this.puffs.update(lt);
  }
}
