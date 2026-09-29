// 太空世界：天穹（地球/太阳/星空）+ 前景（黄河站/合影人群/章北海/船坞/漂浮物/粒子）。
// 一切由叙事时钟 τ 驱动：world.setTau(τ)。
import * as THREE from "three";
import { voxelMaterial } from "@agentbench/voxel-kit";
import { Actor } from "../../chars/actor";
import { ZHANG_LOOK, ZHANG_SUIT } from "../../chars/cast";
import { pistolMesh, scopeMesh, backpackMesh, mountMeters, mountPx, PISTOL_HOLD } from "../../chars/props";
import { aim, lerpPose, floatUpright, addPose, breathe, type Pose } from "../../chars/poses";
import { blinkAt } from "../../chars/actor";
import type { World } from "../../film/types";
import { ParticleField } from "../../film/particles";
import { keyframes } from "../../film/shotkit";
import { DEG, clamp, lerp, smooth, seg, pulse } from "../../util/math";
import { glowSprite } from "../../util/glow";
import { Vox, noisy } from "../../util/vox";
import { buildEarth } from "./earth";
import { buildSun, buildStars } from "./sky";
import { buildStation } from "./station";
import { buildShipyard, buildDebris, buildBaseOneDot } from "./structures";
import { buildCrowd, CROWD_T, suitSkin, visorStateFor, type CrowdRig } from "./crowd";
import { SHOTS, FIRE0 } from "./schedule";
import { EARTH_DIST, SUN_DIST, STAR_DIST, EARTH_VOX, earthCenterDir, sunDirAt, dirAzEl, SUN_AZ, SUN_EL, SUN_R, SHIPYARD, BASE_ONE, GROUP_CENTER, PHOTOGRAPHER, WALL_N, STATION } from "./geometry";

/** 姿态控制小喷（τ，方向：1 顺时针 / -1 逆时针）——声音设计取同一份时间，让“推进器嗤一声”与粒子对齐 */
export const TURN_PUFFS: Array<[number, 1 | -1]> = [
  [-11.9, 1], [-10.1, -1], [-8.1, -1], [-6.3, 1], [2.0, 1], [4.9, -1], [10.0, -1], [12.9, 1], [17.1, 1], [19.9, -1], [134.5, -1], [137.2, 1],
];

/** 章北海的朝向（方位角，度）随 τ 的关键帧：太阳 ↔ 黄河站 */
const AZ_SUN = -40;
const AZ_STATION = 100;
const AZ_BASE = -72;
export const HEADING_KEYS: Array<[number, number]> = [
  [-40, AZ_SUN], [-11.8, AZ_SUN], [-10.0, AZ_STATION], [-8.0, AZ_STATION], [-6.2, AZ_SUN], [2.0, AZ_SUN],
  [5.0, AZ_STATION], [10.0, AZ_STATION], [13.0, AZ_SUN], [17.0, AZ_SUN], [20.0, AZ_STATION], [134.4, AZ_STATION],
  [137.4, AZ_BASE], [200, AZ_BASE],
];

/** 太阳沉没进度 s：0 = 相切，0.5 = 一半，1 = 完全沉没；负值 = 尚未接触 */
export const SINK_KEYS: Array<[number, number]> = [
  [-40, -1.7], [-26, -1.6], [0, 0.0], [10, 0.5], [24, 0.6], [48, 0.68], [76, 0.8], [108, 0.87], [132, 0.93], [150, 1.03], [200, 1.1],
];

/** 手枪出袋 / 瞄准镜安装 等章北海动作时刻 */
export const ZH_T = {
  releaseScope: 62.0,
  gloveOff: 66.0,
  pistolOut: 70.0,
  scopeMount: 75.0,
  aimUp: 80.0,
  lower: 106.6,
  depart: 137.4,
};

export class SpaceWorld implements World {
  readonly id = "space";
  readonly scene = new THREE.Scene();
  readonly bg = new THREE.Scene();
  readonly clearColor = 0x010207;

  // 天穹
  private earthGroup: THREE.Group;
  private earthLight: THREE.DirectionalLight;
  private sunRig: ReturnType<typeof buildSun>;
  private stars: THREE.Group;

  // 前景光
  readonly sunLight: THREE.DirectionalLight;
  readonly earthFill: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;
  /** 随相机走的柔和补光（“地球光”的电影化替身），只为让脸与手可读 */
  readonly camFill: THREE.DirectionalLight;
  readonly flashLight: THREE.PointLight;
  readonly shutterLight: THREE.PointLight;
  private shutterGlow: THREE.Sprite;
  private muzzleGlow: THREE.Sprite;

  readonly station = buildStation();
  readonly crowd: CrowdRig;
  readonly zhang: Actor;
  readonly particles = new ParticleField(3600);
  private shipyard: THREE.Group;
  private baseDot: THREE.Group;
  private debris: ReturnType<typeof buildDebris>;

  // 章北海的道具
  private pistol: THREE.Mesh;
  private pistolScope: THREE.Mesh;
  private heldScope: THREE.Object3D;
  private floatScope: THREE.Mesh;
  private glove: THREE.Mesh;
  readonly zhangPos = new THREE.Vector3();
  private tau = 0;
  private scopeHidden = false;

  constructor() {
    // ---------- 天穹 ----------
    const e = earthCenterDir();
    // 行星→观察者 = -e；行星→光源方向：艺术化，使可见半球约 60% 受光（偏向太阳一侧）
    const s0 = dirAzEl(SUN_AZ, SUN_EL);
    const az = SUN_AZ * DEG;
    const right = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const upV = new THREE.Vector3().crossVectors(right, s0.clone().negate()).normalize();
    if (upV.y < 0) upV.negate();
    const lightDir = right.clone().multiplyScalar(0.95).addScaledVector(upV, 0.3).addScaledVector(e, -0.42).normalize();
    const earth = buildEarth({ radiusVox: EARTH_VOX, voxel: 1, viewDir: e.clone().negate(), lightDir, subLon: 105 });
    earth.group.position.copy(e).multiplyScalar(EARTH_DIST);
    this.earthGroup = earth.group;
    this.bg.add(this.earthGroup);
    this.sunRig = buildSun(5, (SUN_DIST * Math.tan(SUN_R * DEG)) / 5);
    this.bg.add(this.sunRig.group);
    this.stars = buildStars(STAR_DIST);
    this.bg.add(this.stars);
    this.earthLight = new THREE.DirectionalLight(0xffd8b0, 9);
    this.earthLight.position.copy(lightDir).multiplyScalar(100).add(this.earthGroup.position);
    this.earthLight.target.position.copy(this.earthGroup.position);
    this.bg.add(this.earthLight, this.earthLight.target);
    this.bg.add(new THREE.AmbientLight(0x6f92d0, 2.6));

    // ---------- 前景光 ----------
    this.sunLight = new THREE.DirectionalLight(0xffe8d0, 4.2);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    const sc = this.sunLight.shadow.camera;
    sc.left = -46; sc.right = 46; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 400;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.06;
    this.scene.add(this.sunLight, this.sunLight.target);
    this.earthFill = new THREE.HemisphereLight(0x5f97ff, 0x06080e, 0.7);
    this.earthFill.position.copy(e);
    this.scene.add(this.earthFill);
    this.ambient = new THREE.AmbientLight(0x1a2240, 0.55);
    this.scene.add(this.ambient);
    this.camFill = new THREE.DirectionalLight(0xcfdcff, 0.5);
    this.scene.add(this.camFill, this.camFill.target);

    // ---------- 前景物体 ----------
    this.scene.add(this.station.root, this.station.lock);
    this.shipyard = buildShipyard();
    this.shipyard.position.copy(SHIPYARD);
    this.shipyard.rotation.y = -0.5;
    this.scene.add(this.shipyard);
    this.baseDot = buildBaseOneDot();
    this.baseDot.position.copy(BASE_ONE);
    this.scene.add(this.baseDot);
    // 漂浮物：章北海周围 + 站体周围
    this.debris = [
      ...buildDebris(16, 11, new THREE.Vector3(0, 0, 0), 90),
      ...buildDebris(22, 12, STATION.clone(), 260),
    ];
    for (const d of this.debris) this.scene.add(d.mesh);

    this.crowd = buildCrowd();
    this.scene.add(this.crowd.group);

    // 章北海
    this.zhang = new Actor("章北海", ZHANG_LOOK, {
      heightM: 1.8, clothes: suitSkin("zhang", ZHANG_SUIT, { kind: "gold", level: 0 }), castShadow: true, expr: "neutral",
    });
    mountMeters(this.zhang, "back", backpackMesh(), { rot: [0, Math.PI, 0], pos: [0, -1, -3.2] });
    this.scene.add(this.zhang.root);
    // 手持瞄准镜（右手）
    this.heldScope = scopeMesh();
    (this.heldScope as THREE.Mesh).castShadow = true;
    const scopeHolder = mountMeters(this.zhang, "handR", this.heldScope, { pos: [0, 0.4, 2.6], rot: [0.42, 0, 0] });
    scopeHolder.name = "heldScopeHolder";
    // 手枪（右手）+ 枪上瞄准镜
    this.pistol = pistolMesh(0.42);
    const pistolHolder = mountPx(this.zhang, "handR", this.pistol, { pos: PISTOL_HOLD.pos, rot: [0.42, 0, 0] });
    pistolHolder.name = "pistolHolder";
    this.pistolScope = scopeMesh();
    this.pistolScope.scale.setScalar(1 / this.zhang.root.scale.x);
    this.pistolScope.position.set(0, 2.9, 1.0);
    this.pistol.add(this.pistolScope);
    // 悬浮的瞄准镜 / 摘下的手套
    this.floatScope = scopeMesh();
    this.floatScope.castShadow = true;
    this.scene.add(this.floatScope);
    const gv = new Vox([-0.11, -0.12, -0.08], [0.11, 0.12, 0.08], 0.03);
    gv.box(-0.1, -0.11, -0.07, 0.1, 0.12, 0.07, noisy(0x3b4048, 0.06, 3));
    gv.box(-0.1, -0.11, -0.07, 0.1, -0.06, 0.07, 0xc8ccd0);
    this.glove = new THREE.Mesh(gv.toGeometry(), voxelMaterial());
    this.scene.add(this.glove);

    // 枪口火焰 / 快门
    this.flashLight = new THREE.PointLight(0xffd9a0, 0, 16, 2);
    this.scene.add(this.flashLight);
    this.muzzleGlow = glowSprite(0xffe0a0, 1.2, 0);
    this.scene.add(this.muzzleGlow);
    this.shutterLight = new THREE.PointLight(0xffffff, 0, 90, 2);
    this.shutterLight.position.copy(PHOTOGRAPHER).add(new THREE.Vector3(0, 0.4, 0));
    this.scene.add(this.shutterLight);
    this.shutterGlow = glowSprite(0xffffff, 6, 0);
    this.shutterGlow.position.copy(this.shutterLight.position).addScaledVector(WALL_N, -0.6);
    this.scene.add(this.shutterGlow);

    this.scene.add(this.particles.mesh);
    this.buildEmitters();
    this.scene.updateMatrixWorld(true);
  }

  // ---------------------------------------------------------------------
  // 状态函数
  // ---------------------------------------------------------------------
  azAt(tau: number): number {
    return keyframes(tau, HEADING_KEYS);
  }
  sinkAt(tau: number): number {
    return keyframes(tau, SINK_KEYS, (x) => x);
  }
  zhangPosAt(tau: number, out = new THREE.Vector3()): THREE.Vector3 {
    if (tau <= ZH_T.depart) return out.set(0, 0, 0);
    const dt = tau - ZH_T.depart;
    // 推进器加速离去：朝一号基地方向
    const d = dirAzEl(AZ_BASE, -0.6);
    const dist = 0.5 * 6.0 * dt * dt + 1.0 * dt;
    return out.copy(d).multiplyScalar(dist);
  }

  /** 章北海眼睛位置（世界） */
  eyeAt(tau: number, out = new THREE.Vector3()): THREE.Vector3 {
    this.zhangPosAt(tau, out);
    const az = this.azAt(tau) * DEG;
    out.y += 1.66;
    out.x += Math.sin(az) * 0.09;
    out.z += -Math.cos(az) * 0.09;
    return out;
  }

  /**
   * 第一人称瞄准镜镜头里，他手里的“镜筒”道具必须隐藏（否则会挡住画面）。
   * 立即生效——不依赖与 setTau 的调用先后（否则跳转后的第一帧会用上一个镜头留下的标志）。
   */
  setScopeHidden(h: boolean): void {
    this.scopeHidden = h;
    this.applyHeldScope();
  }

  private applyHeldScope(): void {
    const holder = this.zhang.figure.anchors.handR.getObjectByName("heldScopeHolder");
    if (holder) holder.visible = !this.scopeHidden && this.tau < ZH_T.releaseScope;
  }

  /** 让补光沿着相机朝向照过去（光从相机背后来） */
  beforeRender(camera: THREE.Camera): void {
    // 天穹场景与一号基地共用：这里保证方位复位
    this.bg.rotation.set(0, 0, 0);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    this.camFill.position.copy(camera.position).addScaledVector(f, -20);
    this.camFill.target.position.copy(camera.position);
    this.camFill.target.updateMatrixWorld(true);
  }

  /** 过渡镜头用：改变船坞骨架的朝向（每次 setTau 会复位，所以镜头之间互不影响） */
  setShipyardYaw(y: number): void {
    this.shipyard.rotation.y = y;
    this.shipyard.updateMatrixWorld(true);
  }

  setTau(tau: number): void {
    this.tau = tau;
    // 每次都先回到默认值，再由镜头覆盖：镜头之间不会互相“遗留”灯光状态（跳转后的画面与顺序播放一致）
    this.ambient.intensity = 0.55;
    this.camFill.intensity = 0.5;
    this.shipyard.rotation.y = -0.5;
    const s = this.sinkAt(tau);
    const h = 1 - 2 * s;

    // ---- 太阳与光 ----
    const sd = sunDirAt(h);
    this.sunRig.group.position.copy(sd).multiplyScalar(SUN_DIST);
    this.sunRig.group.lookAt(0, 0, 0);
    // 前景太阳光：方向随太阳；强度随沉没而衰减、颜色偏红
    const fall = 1 - smooth(seg(s, 0.55, 1.02));
    const I = 3.2 * fall;
    this.sunLight.intensity = I;
    const warm = smooth(seg(s, -1.5, 0.95));
    this.sunLight.color.setRGB(1.0, lerp(0.95, 0.5, warm), lerp(0.88, 0.22, warm));
    this.sunLight.position.copy(GROUP_CENTER).addScaledVector(sd, 150);
    this.sunLight.target.position.copy(GROUP_CENTER);
    this.sunLight.target.updateMatrixWorld(true);
    this.earthLight.intensity = 2.2 + 4.6 * fall;
    this.earthLight.color.setRGB(1, lerp(0.85, 0.5, smooth(seg(s, 0, 1))), lerp(0.7, 0.3, smooth(seg(s, 0, 1))));
    this.sunRig.setGlow(clamp(1.15 - Math.max(0, s - 0.7) * 2.2, 0.1, 1.1));
    this.earthFill.intensity = 0.7 + 0.9 * smooth(seg(s, 0.4, 1));

    // ---- 空间站 ----
    const open = seg(tau, CROWD_T.hatchOpen, CROWD_T.hatchOpen + 3.4) * (1 - seg(tau, CROWD_T.hatchClose, CROWD_T.hatchClose + 2.4));
    const green = tau >= CROWD_T.hatchGreen && tau < CROWD_T.hatchClose ? 1 : 0;
    this.station.setHatch(open, green, open);
    this.station.setTime(tau);

    // ---- 漂浮物 ----
    for (const d of this.debris) {
      d.mesh.position.copy(d.base).addScaledVector(d.vel, tau);
      d.mesh.quaternion.setFromAxisAngle(d.axis, d.phase + d.spin * tau);
    }

    // ---- 人群 ----
    this.crowd.update(tau);

    // ---- 章北海 ----
    this.updateZhang(tau);

    // ---- 快门 ----
    const sh = pulse(tau, CROWD_T.shutter, 0.01, 0.07);
    this.shutterLight.intensity = 9000 * sh;
    (this.shutterGlow.material as THREE.SpriteMaterial).opacity = Math.min(1, sh * 1.4);

    // ---- 粒子 ----
    this.particles.update(tau);
    this.scene.updateMatrixWorld(true);
  }

  // ---------------------------------------------------------------------
  // 章北海
  // ---------------------------------------------------------------------
  private updateZhang(tau: number): void {
    const z = this.zhang;
    const az = this.azAt(tau);
    this.zhangPosAt(tau, this.zhangPos);
    z.root.position.copy(this.zhangPos);
    const heading = Math.PI - az * DEG;

    // 基础漂浮
    const calm = (t: number): Pose => {
      const f = floatUpright(t, 3.3);
      return {
        ...f,
        hips: [(f.hips?.[0] ?? 0) * 0.7 - 0.02, f.hips?.[1] ?? 0, f.hips?.[2] ?? 0],
        armR: [0.06, 0, 0.14],
        armL: [0.06, 0, -0.14],
      };
    };
    let pose: Pose = calm(tau);

    // 持镜观察窗口
    const scopeUp =
      Math.max(
        smooth(seg(tau, 4.6, 5.4)) * (1 - smooth(seg(tau, 9.6, 10.4))),
        smooth(seg(tau, 17.0, 18.0)) * (1 - smooth(seg(tau, 28.5, 29.5))),
        smooth(seg(tau, 35.5, 36.5)) * (1 - smooth(seg(tau, 44.0, 45.0))),
        smooth(seg(tau, 49.0, 50.0)) * (1 - smooth(seg(tau, 60.0, 61.0))),
      );
    const scopePose: Pose = { armR: [-2.0, 0, -0.08], neck: [0.02, 0, 0], hips: [-0.05, 0, 0] };
    pose = lerpPose(pose, { ...pose, ...scopePose }, scopeUp);

    // ---- 摘手套、取枪、装镜 ----
    const glovePhase = smooth(seg(tau, ZH_T.releaseScope, ZH_T.releaseScope + 1.2)) * (1 - smooth(seg(tau, ZH_T.pistolOut - 1.5, ZH_T.pistolOut)));
    // 左手够右腕转环：右臂前伸、左臂横过来
    const gloveP: Pose = { armR: [-1.15, -0.1, -0.28], armL: [-1.25, 0.5, 0.55], neck: [0.32, 0.1, 0], hips: [0.06, 0, 0] };
    pose = lerpPose(pose, { ...pose, ...gloveP }, glovePhase);
    // 取枪：右手（裸手）探向腰侧工作袋，再抬起
    const pocket = smooth(seg(tau, ZH_T.pistolOut - 1.5, ZH_T.pistolOut)) * (1 - smooth(seg(tau, ZH_T.scopeMount - 2.4, ZH_T.scopeMount - 1.4)));
    pose = lerpPose(pose, { ...pose, armR: [-0.35, 0, -0.5], armL: [-0.5, 0, 0.3], neck: [0.3, 0.2, 0] }, pocket);
    // 装镜：左手抓住悬浮的瞄准镜按到枪上
    const mount = smooth(seg(tau, ZH_T.scopeMount - 2.4, ZH_T.scopeMount - 1.4)) * (1 - smooth(seg(tau, ZH_T.scopeMount + 1.0, ZH_T.scopeMount + 2.2)));
    pose = lerpPose(pose, { ...pose, armR: [-1.3, 0, -0.2], armL: [-1.45, 0.35, 0.4], neck: [0.28, 0, 0], hips: [0.05, 0, 0] }, mount);

    // ---- 瞄准与后坐力 ----
    const aiming = smooth(seg(tau, ZH_T.aimUp - 2.6, ZH_T.aimUp)) * (1 - smooth(seg(tau, ZH_T.lower, ZH_T.lower + 3.0)));
    let kick = 0;
    for (const sh of SHOTS) kick += pulse(tau, sh.t, 0.012, 0.09);
    const targetIdx = tau < SHOTS[10].t - 0.3 ? 0 : tau < SHOTS[20].t - 0.3 ? 1 : 2;
    const yawAim = [-0.03, 0.0, 0.03][targetIdx];
    // 呼吸摆动（屏息前）
    const sway = Math.sin(tau * 1.9) * 0.008 * (1 - smooth(seg(tau, FIRE0 - 4, FIRE0)));
    const aimP = aim(-0.02 + sway, yawAim);
    const recoilP = (k: number): Pose => ({
      armR: [-k * 0.09, 0, 0], armL: [-k * 0.09, 0, 0], neck: [k * 0.03, 0, 0], hips: [-k * 0.02, 0, 0],
    });
    const aimPose = addPose(aimP, recoilP(kick));
    pose = lerpPose(pose, { ...pose, ...aimPose, neck: [aimPose.neck?.[0] ?? 0, aimPose.neck?.[1] ?? 0, 0.04] }, aiming);
    // 抬枪后的放松/收枪
    const relax = smooth(seg(tau, ZH_T.lower, ZH_T.lower + 3.0));
    if (relax > 0) pose = lerpPose(pose, { ...calm(tau), armR: [-0.6, 0, -0.2], armL: [-0.7, 0, 0.3], neck: [0.1, 0, 0] }, relax * (1 - smooth(seg(tau, ZH_T.depart - 2, ZH_T.depart))));
    // 离去：身体前倾，双臂后掠
    const dep = smooth(seg(tau, ZH_T.depart - 0.5, ZH_T.depart + 1.5));
    pose = lerpPose(pose, { hips: [1.3, 0, 0], neck: [-0.8, 0, 0], armR: [0.25, 0, 0.12], armL: [0.25, 0, -0.12], legR: [-0.05, 0, 0.03], legL: [-0.05, 0, -0.03] }, dep);
    pose = addPose(pose, breathe(tau, 0.6, 1.7));
    z.pose(pose);
    z.root.rotation.set(0, heading, 0);

    // 表情
    let expr: "neutral" | "blink" | "squint" | "stern" | "look" | "serene" = "neutral";
    if (aiming > 0.6) expr = "squint";
    else if (tau > 108 && tau < 122) expr = "stern";
    else if (tau >= 133.0 && tau < 145) expr = "serene";
    if (expr === "neutral" && blinkAt(tau, 5.1, 4.4)) expr = "blink";
    z.setExpr(expr);

    // 面罩：始终透明；右手手套：摘下后用“无手套”变体
    const off = tau >= ZH_T.gloveOff;
    // 面罩：最初是镀金的镜面，随日落渐渐（抖动）变透明，露出他的眼睛
    const visor = visorStateFor(1 - clamp((tau + 16.4) / 3.2));
    z.setClothes(
      suitSkin(off ? "zhangOff" : "zhang", { ...ZHANG_SUIT, gloveOffR: off }, visor),
      `${off ? "off" : "on"}|${visor.kind === "gold" ? visor.level : ""}`,
    );

    // ---- 道具状态 ----
    const holder = z.figure.anchors.handR;
    const pistolHolder = holder.getObjectByName("pistolHolder");
    this.applyHeldScope();
    if (pistolHolder) pistolHolder.visible = tau >= ZH_T.pistolOut + 1.0;
    this.pistolScope.visible = tau >= ZH_T.scopeMount;

    // 悬浮瞄准镜：释放后在他身前漂，装镜时被左手取走
    const fsVisible = tau >= ZH_T.releaseScope && tau < ZH_T.scopeMount;
    this.floatScope.visible = fsVisible;
    if (fsVisible) {
      const dt = tau - ZH_T.releaseScope;
      const azR = az * DEG;
      const fwd = new THREE.Vector3(Math.sin(azR), 0, -Math.cos(azR));
      const rgt = new THREE.Vector3(Math.cos(azR), 0, Math.sin(azR));
      // 从右手位置缓缓漂到胸前偏左
      const p0 = new THREE.Vector3(0, 1.62, 0).addScaledVector(fwd, 0.5).addScaledVector(rgt, -0.2);
      const p1 = new THREE.Vector3(0, 1.32, 0).addScaledVector(fwd, 0.55).addScaledVector(rgt, 0.16);
      const u = smooth(dt / (ZH_T.scopeMount - ZH_T.releaseScope));
      this.floatScope.position.lerpVectors(p0, p1, u).add(this.zhangPos);
      this.floatScope.rotation.set(0.3 + dt * 0.35, azR + Math.PI + 0.6 + dt * 0.28, dt * 0.5);
    }
    // 摘下的手套
    const gVisible = tau >= ZH_T.gloveOff && tau < ZH_T.gloveOff + 22;
    this.glove.visible = gVisible;
    if (gVisible) {
      const dt = tau - ZH_T.gloveOff;
      const azR = az * DEG;
      const fwd = new THREE.Vector3(Math.sin(azR), 0, -Math.cos(azR));
      const rgt = new THREE.Vector3(Math.cos(azR), 0, Math.sin(azR));
      this.glove.position
        .set(0, 1.25, 0)
        .addScaledVector(fwd, 0.5 + dt * 0.11)
        .addScaledVector(rgt, -0.25 - dt * 0.09)
        .add(new THREE.Vector3(0, dt * 0.05, 0))
        .add(this.zhangPos);
      this.glove.rotation.set(dt * 0.9, dt * 0.6, dt * 0.4);
    }

    // 枪口火焰与灯
    let flash = 0;
    for (const sh of SHOTS) flash += pulse(tau, sh.t, 0.006, 0.035);
    this.flashLight.intensity = 220 * Math.min(1.4, flash);
    const muzzle = this.muzzleWorld(tau);
    this.flashLight.position.copy(muzzle);
    (this.muzzleGlow.material as THREE.SpriteMaterial).opacity = Math.min(1, flash * 1.3);
    this.muzzleGlow.position.copy(muzzle);
    this.muzzleGlow.scale.setScalar(0.9 + flash * 0.6);
  }

  /** 枪口世界位置（用于火焰灯、粒子）——通过场景图取得真实的手枪位置 */
  muzzleWorld(_tau: number, out = new THREE.Vector3()): THREE.Vector3 {
    this.zhang.root.updateMatrixWorld(true);
    out.set(0, 0.0, 0.0);
    // 枪口在手枪局部坐标的前端：voxelModel 以中心为原点，长度 14 个体素 * 0.42
    out.set(0, 1.0 * 0.42, 6.6 * 0.42 * 1.0);
    this.pistol.localToWorld(out);
    return out;
  }

  // ---------------------------------------------------------------------
  // 粒子发射器：命中气体/血冰、推进器、火焰
  // ---------------------------------------------------------------------
  private buildEmitters(): void {
    const P = this.particles;
    const crowd = this.crowd;
    let id = 100;
    const toZhang = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), GROUP_CENTER).normalize();

    // ---- 命中：气体 + 冰晶 ----
    for (const h of crowd.hits) {
      const m = h.member;
      const spotOffset = new THREE.Vector3();
      const scale = m.actor.root.scale.x;
      switch (h.spot) {
        case "chest": spotOffset.set(0.0, scale * 27, 0); break;
        case "belly": spotOffset.set(0.0, scale * 19, 0); break;
        case "shoulder": spotOffset.set(-0.22, scale * 33, 0); break;
        case "arm": spotOffset.set(0.32, scale * 24, 0); break;
        case "pack": spotOffset.set(0.0, scale * 27, 0.32); break;
        case "visor": spotOffset.set(0.0, scale * 43, 0); break;
      }
      const origin = (t: number, out: THREE.Vector3) => {
        crowd.posAt(m, t, out);
        return out.add(spotOffset);
      };
      const big = h.spot === "pack" ? 2.0 : 1;
      // 入口气体（朝章北海方向喷）
      P.add({
        id: id++, t0: h.t, t1: h.t + 0.5, count: Math.round(20 * big), origin,
        dir: toZhang, cone: 0.7, speed: [1.6, 4.2], life: [0.9, 1.9], size: [0.05, 0.14],
        colorA: [1.5, 1.5, 1.6], colorB: [0.5, 0.6, 0.8], shrink: 0.9, drag: 1.4,
      });
      // 出口气体（朝远离章北海方向，更大更猛）
      P.add({
        id: id++, t0: h.t + 0.02, t1: h.t + 0.9, count: Math.round(30 * big), origin,
        dir: toZhang.clone().negate(), cone: 0.9, speed: [2, 6], life: [1.2, 2.6], size: [0.07, 0.22],
        colorA: [1.6, 1.6, 1.7], colorB: [0.45, 0.55, 0.8], shrink: 0.8, drag: 1.6,
      });
      // 持续泄漏
      P.add({
        id: id++, t0: h.t + 0.3, t1: h.t + 2.6, count: 16, origin,
        dir: new THREE.Vector3(0.3, 0.2, 0.9).normalize(), cone: 1.2, speed: [0.8, 2.2], life: [1.0, 2.0], size: [0.04, 0.1],
        colorA: [1.2, 1.2, 1.3], colorB: [0.4, 0.5, 0.75], shrink: 1, drag: 1.2,
      });
      // 血 → 冰晶（较重的命中：胸/面罩/腹）
      if (h.spot === "visor" || h.spot === "chest" || h.spot === "belly") {
        P.add({
          id: id++, t0: h.t + 0.15, t1: h.t + 1.6, count: h.spot === "visor" ? 60 : 30, origin,
          dir: toZhang.clone().negate().add(new THREE.Vector3(0, 0.1, 0)).normalize(), cone: 1.3, speed: [0.8, 3.4], life: [3.4, 6.2],
          size: [0.025, 0.06], colorA: [0.8, 0.04, 0.05], colorB: [1.3, 1.05, 1.15], shrink: 0.4, drag: 2.4, sparkle: 0.7,
        });
      }
    }

    // ---- 返航推进器尾焰（每人一条） ----
    for (const m of crowd.all) {
      const rs = crowd.retreatStart(m);
      const T = 8.8;
      P.add({
        id: id++, t0: rs, t1: rs + T, count: 36,
        origin: (t, out) => crowd.nozzleAt(m, t, out),
        dir: (t, out) => {
          const v = crowd.velAt(m, t, out);
          if (v.lengthSq() < 1e-5) out.set(0, 0, 1);
          out.negate().normalize();
        },
        cone: 0.28, speed: [3, 6], life: [0.8, 1.5], size: [0.12, 0.26],
        colorA: [1.7, 1.75, 1.9], colorB: [0.6, 0.7, 1.0], shrink: 1, drag: 1.4,
      });
    }
    // ---- 出舱时的姿态控制小喷（每人一次短喷） ----
    for (const m of crowd.members) {
      P.add({
        id: id++, t0: m.exitAt + 0.6, t1: m.exitAt + 1.4, count: 10,
        origin: (t, out) => crowd.nozzleAt(m, t, out),
        dir: new THREE.Vector3().copy(WALL_N).negate(), cone: 0.4, speed: [1.5, 3], life: [1.0, 1.8], size: [0.12, 0.28],
        colorA: [1.5, 1.5, 1.6], colorB: [0.5, 0.6, 0.85], shrink: 1, drag: 1.4,
      });
    }
    // ---- 章北海：姿态调整的小喷、出发的大推力 ----
    const zNozzle = (t: number, out: THREE.Vector3) => {
      this.zhangPosAt(t, out);
      return out.add(new THREE.Vector3(0, 0.45, 0));
    };
    const puff = (t0: number, dirv: THREE.Vector3, n = 14) =>
      P.add({
        id: id++, t0, t1: t0 + 0.5, count: n, origin: (t, out) => { this.zhangPosAt(t, out); out.y += 1.3; },
        dir: dirv, cone: 0.5, speed: [0.8, 2], life: [0.9, 1.5], size: [0.07, 0.17],
        colorA: [1.4, 1.4, 1.5], colorB: [0.5, 0.6, 0.9], shrink: 1, drag: 1.2,
      });
    // 每次转身开头/收尾各一记小喷（与 HEADING_KEYS 的转身时段对应）
    const cw = new THREE.Vector3(0.7, 0.1, 0.7).normalize();
    const ccw = new THREE.Vector3(-0.7, 0.1, -0.7).normalize();
    for (const [t0, sign] of TURN_PUFFS) puff(t0, sign > 0 ? cw : ccw, 8);
    const dBase = dirAzEl(AZ_BASE, -0.6);
    P.add({
      id: id++, t0: ZH_T.depart, t1: ZH_T.depart + 18, count: 900, origin: zNozzle,
      dir: dBase.clone().negate(), cone: 0.2, speed: [5, 10], life: [1.0, 2.0], size: [0.035, 0.1],
      colorA: [1.8, 1.8, 2.0], colorB: [0.6, 0.7, 1.0], shrink: 1, drag: 1.5,
    });
    // ---- 枪口火焰粒子 ----
    // 出生位置必须取“开枪那一刻”的枪口：对每一枪预先采样一次姿态
    const samples = SHOTS.map((sh) => {
      this.updateZhang(sh.t);
      this.zhang.root.updateMatrixWorld(true);
      const p = this.muzzleWorld(sh.t, new THREE.Vector3());
      const d = new THREE.Vector3(0, 0, 1).transformDirection(this.pistol.matrixWorld);
      return { p, d };
    });
    SHOTS.forEach((sh, si) => {
      P.add({
        id: id++, t0: sh.t, t1: sh.t, count: 7,
        origin: (_t, out) => out.copy(samples[si].p),
        dir: (_t, out) => out.copy(samples[si].d),
        cone: 0.35, speed: [8, 20], life: [0.05, 0.11], size: [0.06, 0.16],
        colorA: [4, 3.2, 1.6], colorB: [2, 0.8, 0.2], shrink: 1,
      });
    });
  }
}
