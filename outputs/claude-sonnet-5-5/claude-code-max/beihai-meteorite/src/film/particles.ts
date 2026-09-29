// 确定性方块粒子：每个粒子的位置都是“出生时刻”和“年龄”的纯函数，因此拖动时间轴/回放结果完全一致。
import * as THREE from "three";
import { hash3, lerp, smooth } from "../util/math";

export interface EmitterSpec {
  /** 种子（区分不同发射器的随机序列） */
  id: number;
  /** 发射时间段（秒，叙事时钟）；t1 = t0 表示一次性爆发 */
  t0: number;
  t1: number;
  count: number;
  /** 出生时刻的发射点（世界坐标）；可随人物运动 */
  origin: (t: number, out: THREE.Vector3) => void;
  /** 主方向（世界，单位向量）；可随时间变化 */
  dir: THREE.Vector3 | ((t: number, out: THREE.Vector3) => void);
  /** 圆锥半角（弧度） */
  cone: number;
  speed: [number, number];
  life: [number, number];
  size: [number, number];
  colorA: [number, number, number];
  colorB: [number, number, number];
  /** 缩放随寿命衰减的指数（1 线性，<1 更慢收缩） */
  shrink?: number;
  /** 速度阻尼时间常数（秒），0 = 无（真空） */
  drag?: number;
  /** 闪烁强度（冰晶反光） */
  sparkle?: number;
  /** 继承发射体的速度（例如人物在飞行时喷出的尾焰） */
  inherit?: (t: number, out: THREE.Vector3) => void;
  /** 额外的世界加速度（例如气体反冲） */
  accel?: THREE.Vector3;
}

const tmpO = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpI = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const tmpE = new THREE.Euler();

export class ParticleField {
  readonly mesh: THREE.InstancedMesh;
  readonly emitters: EmitterSpec[] = [];
  private readonly max: number;

  constructor(max = 3000) {
    this.max = max;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ fog: false, toneMapped: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    // 预先创建 instanceColor
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, tmpC.setRGB(1, 1, 1));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  }

  add(e: EmitterSpec): void {
    this.emitters.push(e);
  }

  /** 把 t 时刻所有活着的粒子写入实例缓冲 */
  update(t: number): void {
    let n = 0;
    const mesh = this.mesh;
    for (const e of this.emitters) {
      if (t < e.t0) continue;
      const maxLife = e.life[1];
      if (t > e.t1 + maxLife) continue;
      const span = e.t1 - e.t0;
      for (let k = 0; k < e.count; k++) {
        if (n >= this.max) break;
        const birth = span > 0 ? e.t0 + (span * (k + hash3(e.id, k, 1) * 0.9)) / e.count : e.t0;
        const age = t - birth;
        if (age < 0) continue;
        const life = lerp(e.life[0], e.life[1], hash3(e.id, k, 2));
        if (age >= life) continue;
        // 出生位置与方向
        e.origin(birth, tmpO);
        if (typeof e.dir === "function") e.dir(birth, tmpD);
        else tmpD.copy(e.dir);
        // 圆锥内随机偏转
        const a1 = hash3(e.id, k, 3) * Math.PI * 2;
        const a2 = Math.sqrt(hash3(e.id, k, 4)) * e.cone;
        // 构造与 tmpD 垂直的基
        tmpU.set(Math.abs(tmpD.y) < 0.9 ? 0 : 1, Math.abs(tmpD.y) < 0.9 ? 1 : 0, 0).cross(tmpD).normalize();
        tmpW.crossVectors(tmpD, tmpU);
        tmpV
          .copy(tmpD)
          .multiplyScalar(Math.cos(a2))
          .addScaledVector(tmpU, Math.sin(a2) * Math.cos(a1))
          .addScaledVector(tmpW, Math.sin(a2) * Math.sin(a1));
        const speed = lerp(e.speed[0], e.speed[1], hash3(e.id, k, 5));
        tmpV.multiplyScalar(speed);
        if (e.inherit) {
          e.inherit(birth, tmpI);
          tmpV.add(tmpI);
        }
        let travel: number;
        if (e.drag && e.drag > 0) travel = e.drag * (1 - Math.exp(-age / e.drag));
        else travel = age;
        tmpP.copy(tmpO).addScaledVector(tmpV, travel);
        if (e.accel) tmpP.addScaledVector(e.accel, 0.5 * age * age);
        // 尺寸与颜色
        const u = age / life;
        const base = lerp(e.size[0], e.size[1], hash3(e.id, k, 6));
        const sh = Math.pow(1 - u, e.shrink ?? 1);
        const grow = smooth(age / 0.08); // 出生时略微“弹出”
        const size = base * sh * grow;
        if (size < 1e-4) continue;
        tmpS.set(size, size, size);
        // 任意旋转（随粒子随机，随时间缓转）
        const rx = hash3(e.id, k, 7) * 6.28 + age * (hash3(e.id, k, 8) - 0.5) * 3;
        const ry = hash3(e.id, k, 9) * 6.28 + age * (hash3(e.id, k, 10) - 0.5) * 3;
        tmpE.set(rx, ry, 0);
        tmpQ.setFromEuler(tmpE);
        tmpM.compose(tmpP, tmpQ, tmpS);
        mesh.setMatrixAt(n, tmpM);
        let sp = 1;
        if (e.sparkle) sp = 1 + e.sparkle * Math.sin(age * (9 + hash3(e.id, k, 11) * 12) + k);
        tmpC.setRGB(
          lerp(e.colorA[0], e.colorB[0], u) * sp,
          lerp(e.colorA[1], e.colorB[1], u) * sp,
          lerp(e.colorA[2], e.colorB[2], u) * sp,
        );
        mesh.setColorAt(n, tmpC);
        n++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
