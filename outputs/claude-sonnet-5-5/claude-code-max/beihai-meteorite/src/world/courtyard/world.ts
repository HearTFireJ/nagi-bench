// 四合院段的三个“世界”：胡同（alley）、正房（room）、显微镜视野（micro），
// 以及两位主角的表演：章北海（民用夹克）与收藏者（对襟褂）。
// 所有状态都是本段局部时间 lt（秒，0 = 序列开始）的纯函数。
import * as THREE from "three";
import { voxelMaterial } from "@agentbench/voxel-kit";
import { Actor, blinkAt } from "../../chars/actor";
import { ZHANG_LOOK, COLLECTOR_LOOK } from "../../chars/cast";
import { zhangCivilian, collectorOutfit } from "../../chars/outfits";
import { stand, breathe, stride, addPose, compose, overBench, laugh, wave, lerpPose, idle, type Pose } from "../../chars/poses";
import { mountMeters } from "../../chars/props";
import type { World } from "../../film/types";
import { pathAt, walkAmount, type WP } from "../../film/motion";
import { ParticleField } from "../../film/particles";
import { smooth, seg, lerp } from "../../util/math";
import { mouthOpen } from "../../voice/lookup";
import { T } from "../../film/timing";
import { buildAlley, ALLEY, type AlleyRig } from "./alley";
import { buildRoom, type RoomRig } from "./room";
import { loupeMesh, cupMesh, teapotMesh, phoneMesh, bundleMesh } from "./handprops";
import { marsSurface } from "./rocks";
import { Vox } from "../../util/vox";

const ABS = T.courtyard;
const NORTH = Math.PI; // 面向 -Z
const SOUTH = 0; // 面向 +Z
const EAST = Math.PI / 2;
const WEST = -Math.PI / 2;

/** 房间里各个表演点位 */
export const RM = {
  doorOut: { x: 4.4, z: 1.6 },
  door: { x: 3.1, z: 1.6 },
  bench: { x: 0.35, z: -0.95 },
  zhangStand: { x: 0.25, z: -0.02 },
  collectorStand: { x: 0.35, z: -1.72 },
  scope: { x: -0.45, z: -0.02 },
  safe: { x: -1.95, z: 0.05 },
};

// ---------- 章北海（房间）路线 ----------
export const ZHANG_ROOM: WP[] = [
  { t: 0, x: RM.doorOut.x, z: RM.doorOut.z, h: WEST },
  { t: 11.4, x: RM.doorOut.x, z: RM.doorOut.z, h: WEST },
  { t: 12.4, x: RM.door.x, z: RM.door.z, h: WEST },
  { t: 15.8, x: 2.85, z: -1.15, h: NORTH },
  { t: 24.4, x: 2.85, z: -1.15, h: NORTH },
  { t: 25.4, x: 2.85, z: -1.15, h: -0.5 },
  { t: 27.4, x: 2.85, z: -1.15, h: -0.5 },
  { t: 29.6, x: RM.zhangStand.x + 0.4, z: RM.zhangStand.z, h: NORTH },
  { t: 52.4, x: RM.zhangStand.x + 0.4, z: RM.zhangStand.z, h: NORTH },
  { t: 54.6, x: RM.scope.x, z: RM.scope.z, h: NORTH },
  { t: 62.0, x: RM.scope.x, z: RM.scope.z, h: NORTH },
  { t: 63.6, x: RM.zhangStand.x, z: RM.zhangStand.z, h: NORTH },
  { t: 86.9, x: RM.zhangStand.x, z: RM.zhangStand.z, h: NORTH },
  { t: 90.4, x: RM.door.x, z: RM.door.z, h: EAST },
  { t: 93.5, x: RM.door.x + 1.2, z: RM.door.z, h: EAST },
];

// ---------- 收藏者路线 ----------
const COLLECTOR_ROOM: WP[] = [
  { t: 0, x: RM.collectorStand.x, z: RM.collectorStand.z, h: SOUTH },
  { t: 92, x: RM.collectorStand.x, z: RM.collectorStand.z, h: SOUTH },
];
// 去保险柜取火星陨石、再回到显微镜后面
export const COLLECTOR_SAFE: WP[] = [
  { t: 50.0, x: RM.collectorStand.x, z: RM.collectorStand.z, h: SOUTH },
  { t: 51.4, x: -1.2, z: -1.55, h: WEST },
  { t: 53.0, x: RM.safe.x, z: RM.safe.z, h: WEST },
  { t: 54.4, x: RM.safe.x, z: RM.safe.z, h: WEST },
  { t: 56.0, x: -0.55, z: -1.72, h: SOUTH },
  { t: 62.8, x: -0.55, z: -1.72, h: SOUTH },
  { t: 64.4, x: RM.collectorStand.x, z: RM.collectorStand.z, h: SOUTH },
];

export const ALLEY_ZHANG: WP[] = [
  { t: 0, x: 0.35, z: 1.6, h: NORTH },
  { t: 6.4, x: 0.55, z: ALLEY.gateZ + 1.0, h: NORTH },
  { t: 7.4, x: ALLEY.half - 0.75, z: ALLEY.gateZ + 0.1, h: EAST },
  { t: 12, x: ALLEY.half - 0.75, z: ALLEY.gateZ + 0.1, h: EAST },
];

export class CourtyardWorlds {
  readonly alley: World & { rig: AlleyRig };
  readonly room: World & { rig: RoomRig };
  readonly micro: World;

  readonly zhangA: Actor;
  readonly zhangR: Actor;
  readonly collector: Actor;
  private readonly loupe: THREE.Object3D;
  private readonly handCup: THREE.Object3D;
  private readonly handPot: THREE.Object3D;
  private readonly zhangCup: THREE.Object3D;
  private readonly phone: THREE.Object3D;
  private readonly bundle: THREE.Object3D;
  private readonly boxInHand: THREE.Object3D;
  private readonly steam = new ParticleField(200);
  private readonly microMesh: THREE.Mesh;
  private readonly microLight: THREE.DirectionalLight;

  constructor() {
    // ---------- 胡同 ----------
    const aRig = buildAlley();
    const aScene = new THREE.Scene();
    aScene.add(aRig.group);
    aScene.fog = new THREE.Fog(0x3c2e3e, 9, 44);
    const alleyFill = new THREE.PointLight(0xffe6c8, 2.4, 9, 2);
    aScene.add(alleyFill);
    this.alley = { id: "alley", scene: aScene, clearColor: 0x1c2140, rig: aRig, beforeRender: (cam) => alleyFill.position.copy(cam.position) };

    // ---------- 正房 ----------
    const rRig = buildRoom();
    const rScene = new THREE.Scene();
    rScene.add(rRig.group);
    rScene.fog = new THREE.Fog(0x120c08, 7, 18);
    const roomFill = new THREE.PointLight(0xffdcb8, 3.2, 8, 2);
    rScene.add(roomFill);
    this.room = { id: "room", scene: rScene, clearColor: 0x0a0806, rig: rRig, beforeRender: (cam) => roomFill.position.copy(cam.position) };

    // ---------- 显微镜视野 ----------
    const mScene = new THREE.Scene();
    this.microMesh = new THREE.Mesh(marsSurface(64), voxelMaterial({ roughness: 1 }));
    this.microMesh.scale.setScalar(0.02);
    mScene.add(this.microMesh);
    this.microLight = new THREE.DirectionalLight(0xffe0c0, 3.6);
    this.microLight.position.set(0.8, 1.3, 0.5);
    mScene.add(this.microLight, new THREE.AmbientLight(0xa0684e, 2.0));
    this.micro = { id: "micro", scene: mScene, clearColor: 0x050302 };

    // ---------- 演员 ----------
    const civ = zhangCivilian();
    this.zhangA = new Actor("章北海·胡同", ZHANG_LOOK, { heightM: 1.8, clothes: civ, castShadow: true });
    this.zhangR = new Actor("章北海·正房", ZHANG_LOOK, { heightM: 1.8, clothes: civ, castShadow: true });
    this.collector = new Actor("收藏者", COLLECTOR_LOOK, {
      heightM: 1.72, arm: "slim", clothes: collectorOutfit(), castShadow: true, expr: "smile",
    });
    aScene.add(this.zhangA.root);
    rScene.add(this.zhangR.root, this.collector.root);
    this.zhangA.shadows(true, true);
    this.zhangR.shadows(true, true);
    this.collector.shadows(true, true);

    // ---------- 手持物 ----------
    this.loupe = mountMeters(this.collector, "handL", loupeMesh(), { pos: [0, 0.4, 2.0], rot: [0.5, 0, 0] });
    this.handCup = mountMeters(this.collector, "handR", cupMesh(), { pos: [0, 0.5, 2.6], rot: [0.0, 0, 0] });
    this.handPot = mountMeters(this.collector, "handR", teapotMesh(), { pos: [0, 0.3, 2.8], rot: [0.0, 1.57, 0] });
    this.zhangCup = mountMeters(this.zhangR, "handR", cupMesh(), { pos: [0, 0.5, 2.6], rot: [0, 0, 0] });
    this.phone = mountMeters(this.zhangR, "handR", phoneMesh(), { pos: [0, 0.6, 2.9], rot: [-0.25, 0, 0] });
    this.bundle = mountMeters(this.zhangR, "handR", bundleMesh(), { pos: [0, -0.1, 2.0], rot: [0, 0, 0] });
    // 火星陨石小盒
    const bx = new Vox([-0.05, 0, -0.04], [0.05, 0.03, 0.04], 0.005);
    bx.box(-0.05, 0, -0.04, 0.05, 0.03, 0.04, 0x1a1a20);
    bx.box(-0.045, 0.02, -0.035, 0.045, 0.03, 0.035, 0x7a1f2a);
    this.boxInHand = mountMeters(this.collector, "handL", new THREE.Mesh(bx.toGeometry(), voxelMaterial()), { pos: [0, 0.5, 2.4], rot: [0, 0, 0] });
    for (const o of [this.loupe, this.handCup, this.handPot, this.zhangCup, this.phone, this.bundle, this.boxInHand]) o.visible = false;

    // 茶杯上的热气
    rScene.add(this.steam.mesh);
    const cupPos = new THREE.Vector3(1.37, rRig.benchTopY + 0.08, -0.89);
    for (let k = 0; k < 2; k++) {
      this.steam.add({
        id: 500 + k, t0: 0, t1: 200, count: 90,
        origin: (_t, out) => out.copy(cupPos).add(new THREE.Vector3(k * -0.0, 0, k * -0.13)),
        dir: new THREE.Vector3(0, 1, 0), cone: 0.25, speed: [0.05, 0.09], life: [3.2, 4.4], size: [0.012, 0.024],
        colorA: [0.55, 0.5, 0.42], colorB: [0.15, 0.13, 0.1], shrink: 0.8,
      });
    }
    // 初始不可见
    this.zhangA.show(false);
  }

  // ------------------------------------------------------------------
  // 胡同
  // ------------------------------------------------------------------
  setAlley(lt: number): void {
    const a = this.alley.rig;
    // 灯笼轻微闪烁
    a.lantern.intensity = 14 * (0.92 + 0.08 * Math.sin(lt * 7.3) * Math.sin(lt * 2.1));
    a.updateLeaves(lt);
    // 大门：0..8.6 关闭，随后被从里面拉开一线（9.8 起）
    const open = smooth(seg(lt, 9.4, 10.6)) * 0.8;
    a.doors.left.rotation.y = -Math.PI / 2 - open;
    a.doors.right.rotation.y = -Math.PI / 2 + open;

    const st = pathAt(ALLEY_ZHANG, lt);
    const walk = walkAmount(st, ALLEY_ZHANG, lt);
    const z = this.zhangA;
    z.place(st.x, 0, st.z, st.h);
    // 敲门：7.7 与 8.5 各一下
    const knock = Math.max(pulseK(lt, 7.75), pulseK(lt, 8.55));
    let pose: Pose = addPose(stride(lt * 1.0, walk, 0.72), breathe(lt, 0.7));
    pose = lerpPose(pose, { ...pose, armR: [-1.0 - knock * 0.35, 0, -0.1], neck: [0.05, 0, 0] }, smooth(seg(lt, 7.4, 7.7)) * (1 - smooth(seg(lt, 9.0, 9.5))));
    z.pose(pose);
    z.setExpr("neutral");
    z.show(true);
  }

  // ------------------------------------------------------------------
  // 正房
  // ------------------------------------------------------------------
  setRoom(lt: number): void {
    const r = this.room.rig;
    const tAbs = ABS + lt;
    r.updateDust(lt);
    // 台灯微微呼吸
    r.lamp.spot.intensity = 40 * (0.97 + 0.03 * Math.sin(lt * 3.1));
    // 窗光缓慢变化（黄昏）
    r.windowLight.intensity = 150 * (1 - 0.35 * smooth(seg(lt, 0, 90)));

    // ---- 英雄石头与桌面物件 ----
    const hs = r.heroStones;
    // 起初桌上有一块小石头在灯下（他在放大镜下看它）
    hs.small.visible = lt < 60 || (lt >= 66.4);
    hs.small.position.set(0.28, r.benchTopY + 0.045, -1.1);
    if (lt >= 66.4) hs.small.position.set(-0.32, r.benchTopY + 0.045, -0.7);
    const drop = [68.7, 69.2, 69.7];
    hs.big.forEach((b, i) => {
      b.visible = lt >= drop[i];
      const dt = lt - drop[i];
      // 落下时的小反弹
      const bounce = dt >= 0 && dt < 0.25 ? Math.abs(Math.sin(dt * 12.5)) * 0.03 * (1 - dt / 0.25) : 0;
      b.position.y = r.benchTopY + 0.075 + bounce;
    });
    hs.slab.visible = lt >= 70.2;
    // 茶具上的杯子：两只，他递出一只
    const cups = r.teaSet.children.filter((c) => c.name === "cup");
    if (cups[0]) cups[0].visible = !(lt >= 31.4 && lt < 60);
    // 台面茶壶在倒茶时隐藏
    const pot = r.teaSet.children[1];
    const pouring = lt >= 28.6 && lt < 31.2;
    if (pot) pot.visible = !pouring;

    // ---- 保险柜与火星小盒 ----
    const safeDoor = smooth(seg(lt, 53.1, 54.0)) * (1 - smooth(seg(lt, 54.4, 55.3)));
    r.safe.door.rotation.y = -safeDoor * 1.7;
    const marsBox = r.safe.group.getObjectByName("marsBox");
    if (marsBox) marsBox.visible = lt < 54.0;
    // 火星小盒在收藏者手里 → 显微镜台上
    const boxHeld = lt >= 54.0 && lt < 57.1;
    this.boxInHand.visible = boxHeld;

    // ---- 演员 ----
    this.actZhangRoom(lt, tAbs);
    this.actCollector(lt, tAbs);

    // 热气
    this.steam.update(lt);
  }

  private actZhangRoom(lt: number, tAbs: number): void {
    const z = this.zhangR;
    const st = pathAt(ZHANG_ROOM, lt);
    const walk = walkAmount(st, ZHANG_ROOM, lt);
    z.place(st.x, 0, st.z, st.h);
    z.show(lt >= 11.3);

    let pose: Pose = stride(lt * 1.0, walk, 0.66);
    pose = addPose(pose, breathe(lt, 0.8));
    // 在展柜前驻足：低头/转头看
    const look = smooth(seg(lt, 17.2, 18.4)) * (1 - smooth(seg(lt, 24.0, 25.4)));
    pose = lerpPose(pose, { ...pose, neck: [0.06, 0.55, 0], hips: [0, 0.18, 0] }, look);
    // 接茶：31.6 起右手端杯（胸前）
    const holdCup = smooth(seg(lt, 31.4, 32.4));
    this.zhangCup.visible = lt >= 31.6 && lt < 66;
    pose = lerpPose(pose, { ...pose, armR: [-1.15, 0, -0.18] }, holdCup * (1 - smooth(seg(lt, 60.5, 61.5))));
    // 喝茶/举杯示意（“茶杯也是陨石”那一刻，把杯子略抬）
    const raise = smooth(seg(lt, 44.6, 45.4)) * (1 - smooth(seg(lt, 47.0, 47.8)));
    pose = lerpPose(pose, { ...pose, armR: [-1.6, 0, -0.1], neck: [0.1, 0, 0] }, raise);
    // 显微镜：身体前倾，对着目镜
    const peek = smooth(seg(lt, 56.5, 57.3)) * (1 - smooth(seg(lt, 61.6, 62.4)));
    pose = lerpPose(pose, overBench(0.6, -1.1), peek);
    // 看着石头：略低头
    const eye = smooth(seg(lt, 69.0, 69.8)) * (1 - smooth(seg(lt, 75.6, 76.6)));
    pose = lerpPose(pose, { ...pose, neck: [0.28, 0, 0], hips: [0.06, 0, 0] }, eye);
    // 手机付款
    const pay = smooth(seg(lt, 76.6, 77.6)) * (1 - smooth(seg(lt, 81.8, 82.8)));
    this.phone.visible = lt >= 76.8 && lt < 82.9;
    pose = lerpPose(pose, { ...pose, armR: [-1.25, 0, -0.35], armL: [-0.5, 0, 0.1], neck: [0.2, 0, 0] }, pay);
    // 收起石头装袋、离开
    this.bundle.visible = lt >= 86.5;
    const carry = smooth(seg(lt, 86.0, 86.9));
    pose = lerpPose(pose, { ...pose, armR: [-0.6, 0, -0.15], armL: [-0.6, 0, 0.15] }, carry);
    z.pose(pose);
    // 表情：说话时开合口
    const speaking = mouthOpen("章北海", tAbs);
    let expr: "neutral" | "talk" | "blink" | "stern" = "neutral";
    if (speaking) expr = "talk";
    else if (lt >= 82.2 && lt < 88) expr = "stern";
    else if (blinkAt(lt, 2.2, 4.1)) expr = "blink";
    z.setExpr(expr);
  }

  private actCollector(lt: number, tAbs: number): void {
    const c = this.collector;
    // 位置：默认在台后；50~64 去保险柜；64~ 回台后
    let st = pathAt(COLLECTOR_ROOM, lt);
    let walk = 0;
    if (lt >= 50.2 && lt <= 64.4) {
      st = pathAt(COLLECTOR_SAFE, lt);
      walk = walkAmount(st, COLLECTOR_SAFE, lt);
    }
    // 取铁陨石时转身面向后柜（面向 -Z）
    let heading = st.h;
    const turnBack = smooth(seg(lt, 66.3, 67.0)) * (1 - smooth(seg(lt, 69.8, 70.5)));
    heading = lerp(heading, NORTH, turnBack);
    c.place(st.x, 0, st.z, heading);

    let pose: Pose = stride(lt * 1.0, walk, 0.66);
    pose = addPose(pose, breathe(lt + 0.7, 1.0));

    // ---- 起初：伏案，放大镜下端详一块小石头，哼着小曲 ----
    const bent = 1 - smooth(seg(lt, 11.7, 12.5));
    const bob = Math.sin(lt * 2.4) * 0.03;
    pose = lerpPose(pose, addPose(overBench(0.42 + bob, -1.0), { armL: [-0.15, 0, 0] }), bent);
    this.loupe.visible = lt < 12.4 || (lt >= 21.4 && lt < 26.6);
    // 22~26：再次举放大镜端详（C4b）
    const inspect = smooth(seg(lt, 21.6, 22.6)) * (1 - smooth(seg(lt, 25.6, 26.6)));
    pose = lerpPose(pose, addPose(overBench(0.26 + Math.sin(lt * 1.9) * 0.02, -0.95), { neck: [-0.15, 0.1, 0] }), inspect);
    // 12.4~14.6：热情招呼
    const greet = smooth(seg(lt, 12.4, 12.9)) * (1 - smooth(seg(lt, 15.0, 15.8)));
    pose = lerpPose(pose, compose(stand(0, 0, 0), wave(lt, "R", 7), { neck: [0.02, 0.15, 0] }), greet);
    // 28.4~31.6 倒茶；31.6~33.2 递茶
    const pour = smooth(seg(lt, 28.4, 29.2)) * (1 - smooth(seg(lt, 31.0, 31.6)));
    this.handPot.visible = lt >= 28.6 && lt < 31.4;
    pose = lerpPose(pose, { ...stand(0.08, 0.2, 0), armR: [-1.25, 0, -0.15], armL: [-0.2, 0, 0.2] }, pour);
    const offer = smooth(seg(lt, 31.4, 32.0)) * (1 - smooth(seg(lt, 33.0, 33.8)));
    this.handCup.visible = lt >= 31.2 && lt < 32.9;
    pose = lerpPose(pose, { ...stand(0.05, 0, 0), armR: [-1.45, 0, -0.1] }, offer);
    // 讲述：手势
    const explain1 = smooth(seg(lt, 38.4, 39.2)) * (1 - smooth(seg(lt, 41.8, 42.6)));
    pose = lerpPose(pose, { ...stand(0.03, 0, 0), armR: [-0.9, 0, -0.8], armL: [-0.7, 0, 0.7] }, explain1);
    // 笑
    const lol = smooth(seg(lt, 46.5, 46.9)) * (1 - smooth(seg(lt, 49.6, 50.2)));
    pose = lerpPose(pose, laugh(lt, 1), lol);
    // 取保险柜（前倾开门）
    const leanSafe = smooth(seg(lt, 53.0, 53.6)) * (1 - smooth(seg(lt, 54.3, 54.9)));
    pose = lerpPose(pose, { ...stand(0.55, 0.1, 0), armR: [-1.1, 0, -0.2], armL: [-1.0, 0, 0.2] }, leanSafe);
    // 把火星石放到显微镜台上：手向前下
    const place = smooth(seg(lt, 56.1, 56.6)) * (1 - smooth(seg(lt, 57.0, 57.8)));
    pose = lerpPose(pose, { ...stand(0.3, 0.1, 0), armL: [-1.05, 0, 0.1], armR: [-0.3, 0, -0.1] }, place);
    // 自豪：双手叉腰/挺胸
    const proud = smooth(seg(lt, 62.0, 63.0)) * (1 - smooth(seg(lt, 63.8, 64.6)));
    pose = lerpPose(pose, { ...stand(-0.05, -0.1, 0), armR: [-0.25, 0, -0.6], armL: [-0.25, 0, 0.6] }, proud);
    // 转身取石头（面向后柜，右臂向前上）
    const reach = smooth(seg(lt, 67.2, 68.0)) * (1 - smooth(seg(lt, 69.4, 70.0)));
    pose = lerpPose(pose, { ...stand(0.05, 0, 0), armR: [-1.55, 0, -0.15], armL: [-1.3, 0, 0.2] }, reach);
    // 递上石头后的比划
    const show = smooth(seg(lt, 70.4, 71.0)) * (1 - smooth(seg(lt, 73.0, 73.6)));
    pose = lerpPose(pose, { ...stand(0.14, 0.15, 0), armR: [-1.0, 0, -0.35], armL: [-0.6, 0, 0.5] }, show);
    // 尴尬：挠头、笑得局促
    const awk = smooth(seg(lt, 79.6, 80.2)) * (1 - smooth(seg(lt, 83.6, 84.4)));
    pose = lerpPose(pose, { ...stand(0, 0.05, 0.15), armR: [-2.4, 0, -0.55], armL: [-0.15, 0, 0.1] }, awk);
    // 结尾：挥手送别
    const bye = smooth(seg(lt, 87.4, 88.0));
    pose = lerpPose(pose, compose(stand(0, 0, 0), wave(lt, "R", 6)), bye);
    c.pose(pose);

    // 表情
    const speaking = mouthOpen("收藏者", tAbs);
    let expr: "smile" | "talk" | "laugh" | "awkward" | "blink" = "smile";
    if (lt >= 46.6 && lt < 49.8) expr = "laugh";
    else if (lt >= 79.6 && lt < 84.2) expr = speaking ? "talk" : "awkward";
    else if (speaking) expr = "talk";
    else if (blinkAt(lt, 7.3, 3.7)) expr = "blink";
    c.setExpr(expr);
    // 放大镜的位置：在伏案时挪到眼前；在“端详”时也是
    this.loupe.position.z = 2.0;
    void idle;
  }

  // ------------------------------------------------------------------
  // 显微镜
  // ------------------------------------------------------------------
  setMicro(lt: number): void {
    // 缓慢自转的小坑地貌 + 光从侧面掠过，制造“外星世界”的起伏
    this.microMesh.rotation.set(0, lt * 0.05, 0);
    this.microLight.position.set(Math.cos(lt * 0.35) * 1.1, 1.3, Math.sin(lt * 0.35) * 1.1);
  }
}

function pulseK(t: number, t0: number): number {
  const d = t - t0;
  if (d < 0 || d > 0.3) return 0;
  return Math.sin((d / 0.3) * Math.PI);
}
