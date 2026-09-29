// 第二幕的两个世界：模型车间（数控机床把陨石切成三十六粒小柱）与地下室（把它们做成子弹、试射）。
// 所有状态都是本段局部时间 lt 的纯函数。
import * as THREE from "three";
import { voxelMaterial } from "@agentbench/voxel-kit";
import { Actor, blinkAt } from "../../chars/actor";
import { ZHANG_LOOK } from "../../chars/cast";
import { zhangWorkshop, zhangBasement } from "../../chars/outfits";
import { stand, breathe, stride, addPose, lerpPose, overBench, aim, type Pose } from "../../chars/poses";
import { mountMeters, mountPx, pistolMesh, PISTOL_HOLD } from "../../chars/props";
import type { World } from "../../film/types";
import { pathAt, walkAmount, type WP } from "../../film/motion";
import { ParticleField } from "../../film/particles";
import { smooth, seg, lerp, pulse, hash3, hash1 } from "../../util/math";
import { Vox } from "../../util/vox";
import { buildWorkshop, type WorkshopRig } from "./workshop";
import { buildBasement, buildCase, ROUND_S, type BasementRig } from "./basement";
import { pliersMesh, glueTubeMesh, tweezersMesh, magazineMesh, knifeMesh } from "./tools";
import { bundleMesh } from "../courtyard/handprops";

const NORTH = Math.PI;
const SOUTH = 0;
const EAST = Math.PI / 2;

/** 本段的关键时刻（lt，秒） */
export const MK = {
  // —— 车间 ——
  // 日光灯按“离门近 → 远”依次亮起（索引 = 行号，row0 最靠里）
  rows: [2.9, 2.1, 1.3, 0.5],
  stoneIn: 6.3,
  startBtn: 8.3,
  cut: [9.3, 10.5] as [number, number],
  comb: [10.5, 12.1] as [number, number],
  rods: [12.1, 13.7] as [number, number],
  pins: [13.7, 15.4] as [number, number],
  wsEnd: 21.0,
  // —— 地下室 ——
  doorOpen: [21.2, 22.4] as [number, number],
  bulbOn: 23.4,
  pull: [26.2, 29.0] as [number, number],
  glue: [29.0, 31.4] as [number, number],
  lapse: [31.4, 34.6] as [number, number],
  load: [35.6, 38.4] as [number, number],
  shots: [40.7, 42.1, 43.5, 44.9],
  unwrap: [48.8, 51.6] as [number, number],
  gravel: [53.6, 56.0] as [number, number],
  pack: [56.4, 60.4] as [number, number],
  bulbOff: 60.9,
};

export const WS_ZHANG: WP[] = [
  { t: 0, x: 3.7, z: 3.9, h: NORTH },
  { t: 0.3, x: 3.7, z: 3.9, h: NORTH },
  { t: 5.2, x: 0.2, z: 1.2, h: NORTH },
  { t: 9.0, x: 0.2, z: 1.2, h: NORTH },
  { t: 10.4, x: 1.7, z: 1.9, h: -2.6 },
  { t: 16.0, x: 1.7, z: 1.9, h: -2.6 },
  { t: 17.0, x: 0.35, z: 1.2, h: NORTH },
  { t: 19.2, x: 0.35, z: 1.2, h: NORTH },
  { t: 19.8, x: 0.35, z: 1.2, h: EAST },
  { t: 21.6, x: 3.7, z: 3.9, h: EAST },
];
export const BM_ZHANG: WP[] = [
  { t: 0, x: 0, z: 3.6, h: NORTH },
  { t: 22.0, x: 0.0, z: 3.6, h: NORTH },
  { t: 24.6, x: -0.9, z: 1.75, h: NORTH },
  { t: 25.6, x: -1.3, z: 1.2, h: NORTH },
  { t: 38.2, x: -1.3, z: 1.2, h: NORTH },
  { t: 40.0, x: 0.4, z: 1.25, h: NORTH },
  { t: 46.0, x: 0.4, z: 1.25, h: NORTH },
  { t: 47.8, x: 0.4, z: -0.95, h: NORTH },
  { t: 56.4, x: 0.4, z: -0.95, h: NORTH },
  { t: 57.6, x: -1.3, z: 1.2, h: NORTH },
  { t: 60.6, x: -1.3, z: 1.2, h: NORTH },
  { t: 61.8, x: 0.0, z: 3.4, h: SOUTH },
];

/** 每发弹药的处理进度（纯函数，画面与声音共用同一份时间）：拔弹头 off、粘上陨石小段 on（本段局部时间） */
export function roundTimes(i: number): { off: number; on: number } {
  if (i === 0) return { off: 27.4, on: 30.4 };
  if (i === 1) return { off: 28.5, on: 30.9 };
  const k = (i - 2) / 33;
  return { off: MK.lapse[0] + k * 2.2 + hash3(i, 1, 1) * 0.15, on: MK.lapse[0] + 0.6 + k * 2.6 + hash3(i, 2, 1) * 0.15 };
}

export class MakingWorlds {
  readonly workshop: World & { rig: WorkshopRig };
  readonly basement: World & { rig: BasementRig };
  readonly zhangW: Actor;
  readonly zhangB: Actor;
  private readonly wsBundle: THREE.Object3D;
  private readonly wsCutterHolder: THREE.Object3D;
  private readonly pliers: THREE.Object3D;
  private readonly glue: THREE.Object3D;
  private readonly tweezers: THREE.Object3D;
  private readonly magazine: THREE.Object3D;
  private readonly knife: THREE.Object3D;
  private readonly pistolHolder: THREE.Object3D;
  private readonly pistol: THREE.Mesh;
  private readonly tablePistol: THREE.Mesh;
  private readonly caseGroup: THREE.Group;
  private readonly pinTray: THREE.Group;
  private readonly wsFx = new ParticleField(1200);
  private readonly bmFx = new ParticleField(1500);
  private readonly dummy = new THREE.Matrix4();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpS = new THREE.Vector3();

  constructor() {
    // ---------- 车间 ----------
    const wRig = buildWorkshop();
    const wScene = new THREE.Scene();
    wScene.add(wRig.group);
    wScene.fog = new THREE.Fog(0x10141c, 8, 22);
    const wFill = new THREE.PointLight(0xdfeaff, 2.4, 8, 2);
    wScene.add(wFill);
    this.workshop = { id: "workshop", scene: wScene, clearColor: 0x06080c, rig: wRig, beforeRender: (c) => wFill.position.copy(c.position) };
    wScene.add(this.wsFx.mesh);

    // ---------- 地下室 ----------
    const bRig = buildBasement();
    const bScene = new THREE.Scene();
    bScene.add(bRig.group);
    bScene.fog = new THREE.Fog(0x0c0b0a, 5, 14);
    const bFill = new THREE.PointLight(0xffd8a8, 2.2, 6, 2);
    bScene.add(bFill);
    this.basement = { id: "basement", scene: bScene, clearColor: 0x030303, rig: bRig, beforeRender: (c) => bFill.position.copy(c.position) };
    bScene.add(this.bmFx.mesh);

    // ---------- 演员 ----------
    this.zhangW = new Actor("章北海·车间", ZHANG_LOOK, { heightM: 1.8, clothes: zhangWorkshop(), castShadow: true });
    this.zhangB = new Actor("章北海·地下室", ZHANG_LOOK, { heightM: 1.8, clothes: zhangBasement(), castShadow: true });
    wScene.add(this.zhangW.root);
    bScene.add(this.zhangB.root);
    this.zhangW.shadows(true, true);
    this.zhangB.shadows(true, true);

    // 车间：布包（三块陨石）
    this.wsBundle = mountMeters(this.zhangW, "handR", bundleMesh(), { pos: [0, -0.1, 2.0] });
    // 车间：取下的刀具（握在左手里，最后揣进口袋）
    this.wsCutterHolder = mountMeters(this.zhangW, "handL", wRig.cutter.clone(), { pos: [0, 0.4, 2.0], rot: [Math.PI / 2, 0, 0] });
    this.wsCutterHolder.visible = false;

    // 地下室手持物
    this.pliers = mountMeters(this.zhangB, "handR", pliersMesh(), { pos: [0, 0.6, 2.6], rot: [0.5, 0, 0] });
    this.glue = mountMeters(this.zhangB, "handL", glueTubeMesh(), { pos: [0, 0.6, 2.6], rot: [0.4, 0, 0] });
    this.tweezers = mountMeters(this.zhangB, "handR", tweezersMesh(), { pos: [0, 0.6, 2.6], rot: [0.5, 0, 0] });
    this.magazine = mountMeters(this.zhangB, "handL", magazineMesh(), { pos: [0, 0.4, 2.4], rot: [0, 0, 0] });
    this.knife = mountMeters(this.zhangB, "handR", knifeMesh(), { pos: [0, 0.4, 2.6], rot: [0.3, 0, 0] });
    this.pistol = pistolMesh(0.42);
    this.pistolHolder = mountPx(this.zhangB, "handR", this.pistol, { pos: PISTOL_HOLD.pos, rot: [0.42, 0, 0] });
    for (const o of [this.pliers, this.glue, this.tweezers, this.magazine, this.knife, this.pistolHolder]) o.visible = false;
    // 桌上的手枪
    this.tablePistol = pistolMesh(0.42);
    this.tablePistol.scale.setScalar(this.zhangB.root.scale.x);
    this.tablePistol.position.set(-0.85, 0.96 + 0.04, 0.6);
    this.tablePistol.rotation.set(0, -1.2, 0);
    bRig.group.add(this.tablePistol);
    // 桌上的空盒（放 32 发用）
    this.caseGroup = buildCase();
    this.caseGroup.position.set(-1.7, 0.92, 0.5);
    bRig.group.add(this.caseGroup);
    // 桌上的脉冲：待用小段托盘
    this.pinTray = new THREE.Group();
    const tv = new Vox([-0.1, 0, -0.08], [0.1, 0.03, 0.08], 0.008);
    tv.box(-0.1, 0, -0.08, 0.1, 0.012, 0.08, 0x2b6cb0);
    tv.box(-0.1, 0, -0.08, 0.1, 0.03, -0.07, 0x2b6cb0);
    tv.box(-0.1, 0, 0.07, 0.1, 0.03, 0.08, 0x2b6cb0);
    tv.box(-0.1, 0, -0.08, -0.09, 0.03, 0.08, 0x2b6cb0);
    tv.box(0.09, 0, -0.08, 0.1, 0.03, 0.08, 0x2b6cb0);
    this.pinTray.add(new THREE.Mesh(tv.toGeometry(), voxelMaterial()));
    this.pinTray.position.set(-0.95, 0.92, 0.32);
    bRig.group.add(this.pinTray);
  }

  // ------------------------------------------------------------------
  // 车间
  // ------------------------------------------------------------------
  private lightState(lt: number, t0: number): number {
    if (lt < t0) return 0;
    const d = lt - t0;
    if (d < 0.08) return 1.0;
    if (d < 0.2) return 0.05;
    if (d < 0.3) return 1.0;
    if (d < 0.46) return 0.05;
    return 1.0;
  }

  setWorkshop(lt: number): void {
    const r = this.workshop.rig;
    const cnc = r.cnc;
    // ---- 日光灯：依次点亮（闪烁），收工时依次熄灭 ----
    const rowsOff = [19.6, 20.0, 20.4, 20.8];
    for (let i = 0; i < r.fixtureMats.length; i++) {
      const row = r.fixtureRows[i];
      let s = this.lightState(lt, MK.rows[row]);
      // 熄灭：远端先灭（row 0 最远），越靠近门越晚
      if (lt >= rowsOff[row]) s = 0;
      r.fixtureMats[i].color.setRGB(2.6 * s, 2.7 * s, 2.9 * s);
    }
    r.rowLights.forEach((l, row) => {
      let s = this.lightState(lt, MK.rows[row]);
      if (lt >= rowsOff[row]) s = 0;
      l.intensity = 20 * s;
    });

    // ---- 布包 → 陨石入虎钳 ----
    const inBundle = lt < MK.stoneIn - 0.2;
    this.wsBundle.visible = inBundle;
    const cutting = lt >= MK.cut[0] && lt < MK.cut[1];
    r.stone.visible = lt >= MK.stoneIn && lt < MK.comb[0];
    r.comb.visible = lt >= MK.comb[0] && lt < MK.rods[0];
    // ---- 机床门 ----
    const open = smooth(seg(lt, 5.5, 6.3)) * (1 - smooth(seg(lt, 7.3, 8.0)));
    cnc.door.position.x = -0.03 - 1.18 * open;
    // ---- 主轴、锯片 ----
    const cut1 = seg(lt, MK.cut[0], MK.cut[1]);
    const cut2 = seg(lt, MK.comb[0] + 0.1, MK.comb[1] - 0.1);
    const active = cutting || (lt >= MK.comb[0] && lt < MK.comb[1]);
    const down = active ? 1 : 0;
    const sweep = cutting ? lerp(-0.42, 0.22, smooth(cut1)) : lt >= MK.comb[0] && lt < MK.comb[1] ? lerp(0.22, -0.4, smooth(cut2)) : -0.1;
    cnc.spindle.position.set(sweep, lerp(1.28, 1.03, smooth(down)), 0.0);
    const spinning = lt >= MK.startBtn && lt < MK.pins[1];
    cnc.blade.rotation.y = spinning ? lt * 40 : 0;
    // 主轴的前后位置（第二次切削沿 z 方向）
    if (lt >= MK.comb[0] && lt < MK.comb[1]) cnc.spindle.position.z = lerp(-0.1, 0.22, smooth(cut2)) - 0.0;
    cnc.spindle.position.z += 0;
    const bladeWorld = this.tmpV.set(0, 0, 0);
    cnc.blade.getWorldPosition(bladeWorld);

    // ---- 面板文字 ----
    let text = "READY";
    if (lt >= MK.startBtn) text = "RUN 00/36";
    if (lt >= 13.9) text = "RUN 12/36";
    if (lt >= 14.5) text = "RUN 24/36";
    if (lt >= 15.2) text = "RUN 36/36";
    r.panelTex(text);
    (cnc.group.getObjectByName("startBtn") as THREE.Mesh).scale.setScalar(lt >= MK.startBtn ? 1 + 0.4 * Math.sin(lt * 9) : 1);

    // ---- 杆与小段 ----
    const nPins = Math.floor(36 * smooth(seg(lt, MK.pins[0], MK.pins[1])));
    const rodsVisible = lt >= MK.rods[0] && lt < MK.pins[0] + 0.6;
    const m = this.dummy;
    for (let i = 0; i < 36; i++) {
      // 杆：散落在托盘里，略乱
      const rx = ((i % 6) - 2.5) * 0.045 + (hash3(i, 1, 1) - 0.5) * 0.01;
      const rz = (Math.floor(i / 6) - 2.5) * 0.045 + (hash3(i, 2, 1) - 0.5) * 0.02;
      this.tmpQ.setFromEuler(new THREE.Euler(0, (hash3(i, 3, 1) - 0.5) * 0.5, 0));
      this.tmpS.setScalar(rodsVisible && i >= nPins ? 1 : 0.0001);
      m.compose(this.tmpV.set(rx, 0.02, rz), this.tmpQ, this.tmpS);
      r.rods.setMatrixAt(i, m);
      // 小段：整齐 6×6
      const px = ((i % 6) - 2.5) * 0.045;
      const pz = (Math.floor(i / 6) - 2.5) * 0.045;
      this.tmpQ.identity();
      this.tmpS.setScalar(i < nPins ? 1 : 0.0001);
      m.compose(this.tmpV.set(px, 0.022, pz), this.tmpQ, this.tmpS);
      r.pins.setMatrixAt(i, m);
    }
    r.rods.instanceMatrix.needsUpdate = true;
    r.pins.instanceMatrix.needsUpdate = true;

    // ---- 火花光 ----
    const spark = active ? 0.6 + 0.4 * Math.sin(lt * 90) * Math.sin(lt * 37) : 0;
    r.sparks.intensity = 26 * Math.max(0, spark);
    r.sparks.position.set(cnc.spindle.position.x, 0.95, -0.2 + cnc.spindle.position.z + 0.05);

    // ---- 收尾：刀具、信封 ----
    r.cutter.visible = false;
    this.wsCutterHolder.visible = lt >= 18.4 && lt < 20.6;
    r.envelope.visible = lt >= 16.2 && lt < 20.6;

    // ---- 演员 ----
    const st = pathAt(WS_ZHANG, lt);
    const walk = walkAmount(st, WS_ZHANG, lt);
    const z = this.zhangW;
    z.place(st.x, 0, st.z, st.h);
    let pose: Pose = addPose(stride(lt, walk, st.speed / 1.48), breathe(lt, 0.8));
    // 抱着布包
    pose = lerpPose(pose, { ...pose, armR: [-0.85, 0, -0.2], armL: [-0.75, 0, 0.3] }, lt < 6.4 ? 1 : 0);
    // 放石头进虎钳（探向机床）
    const load = smooth(seg(lt, 5.6, 6.3)) * (1 - smooth(seg(lt, 6.9, 7.6)));
    pose = lerpPose(pose, { ...stand(0.28, 0.22, 0), armR: [-1.2, 0, -0.1], armL: [-1.1, 0, 0.15] }, load);
    // 按启动键（机床右前方）
    const press = smooth(seg(lt, 7.9, 8.3)) * (1 - smooth(seg(lt, 8.7, 9.2)));
    pose = lerpPose(pose, { ...stand(0.08, 0.1, -0.3), armR: [-1.35, 0, -0.75] }, press);
    // 注视加工：手背在身后，微微前倾
    const watch = smooth(seg(lt, 10.4, 11)) * (1 - smooth(seg(lt, 16.0, 16.8)));
    pose = lerpPose(pose, { ...stand(0.1, 0.12, 0), armR: [0.25, 0, 0.1], armL: [0.25, 0, -0.1] }, watch * 0.7);
    // 拾碎屑装信封（刷）
    const sweepP = smooth(seg(lt, 17.2, 17.6)) * (1 - smooth(seg(lt, 18.1, 18.5)));
    pose = lerpPose(pose, { ...stand(0.25, 0.3, 0), armR: [-1.05 + Math.sin(lt * 14) * 0.15, 0, -0.1], armL: [-0.8, 0, 0.3] }, sweepP);
    // 拆刀具
    const tool = smooth(seg(lt, 18.3, 18.7)) * (1 - smooth(seg(lt, 19.4, 19.8)));
    pose = lerpPose(pose, { ...stand(0.3, 0.3, 0), armR: [-1.25, 0, -0.1], armL: [-1.2, 0, 0.1] }, tool);
    z.pose(pose);
    z.setExpr(blinkAt(lt, 1.1, 4.5) ? "blink" : lt >= 18.3 && lt < 19.6 ? "stern" : "neutral");
    z.show(lt < 21.4);

    // ---- 粒子：火花/冷却液/铁屑 ----
    this.wsFx.update(lt);
  }

  // ------------------------------------------------------------------
  // 地下室
  // ------------------------------------------------------------------
  /** 第 i 发弹药在桌面架子上的位置（6×6 阵列） */
  private rackPos(i: number, out: THREE.Vector3): THREE.Vector3 {
    const col = i % 6, row = Math.floor(i / 6);
    return out.set(-1.3 + (col - 2.5) * 0.062 + 0.12, 0.92 + 0.0, 0.44 + (row - 2.5) * 0.062 - 0.02);
  }

  /** 每发弹药的处理进度：headOff（拔弹头）与 ironOn（粘上陨石小段）的时刻 */
  private roundTimes(i: number): { off: number; on: number } {
    return roundTimes(i);
  }

  setBasement(lt: number): void {
    const r = this.basement.rig;
    // 演员必须先更新：下面取“手的世界位置”的部分（碎石在掌心）要用这一时刻的姿态，而不是上一帧的
    this.actBasement(lt);
    // ---- 门与灯 ----
    const door = smooth(seg(lt, MK.doorOpen[0], MK.doorOpen[1])) * (1 - smooth(seg(lt, 61.2, 62.0)));
    r.doorLeaf.rotation.y = -door * 1.75;
    r.stairLight.material = r.stairLight.material as THREE.MeshBasicMaterial;
    (r.stairLight.material as THREE.MeshBasicMaterial).opacity = door * 0.85;
    // 灯泡：拉线，闪两下再亮；试射时被震得微晃；最后关灯
    let bulb = lt >= MK.bulbOn ? 1 : 0;
    if (lt >= MK.bulbOn && lt < MK.bulbOn + 0.5) bulb = [1, 0.1, 1, 0.3, 1][Math.floor((lt - MK.bulbOn) / 0.1)] ?? 1;
    if (lt >= MK.bulbOff) bulb = 0;
    let shake = 0;
    for (const s of MK.shots) shake += pulse(lt, s, 0.01, 0.16);
    r.bulbLight.intensity = 34 * bulb * (1 - 0.15 * Math.min(1, shake));
    r.bulbFill.intensity = 5 * bulb;
    (r.bulb.material as THREE.MeshBasicMaterial).color.setRGB(5 * Math.max(0.03, bulb), 3.6 * Math.max(0.03, bulb), 1.8 * Math.max(0.03, bulb));
    (r.glow.material as THREE.SpriteMaterial).opacity = 0.55 * bulb;
    r.bulb.position.x = -0.4 + Math.sin(lt * 6) * 0.03 * Math.min(1, shake);
    r.glow.position.copy(r.bulb.position);

    // ---- 弹药阵列 ----
    let removed = 0;
    for (let i = 0; i < 36; i++) {
      const { off, on } = this.roundTimes(i);
      // 最后 4 发（32~35）在装弹时取走
      const loadedAway = i >= 32 && lt >= MK.load[0] + 0.5 + (i - 32) * 0.35;
      const p = this.rackPos(i, this.tmpV);
      const show = !loadedAway ? 1 : 0.0001;
      const hasCopper = lt < off;
      const hasIron = lt >= on;
      this.tmpQ.identity();
      this.dummy.compose(p, this.tmpQ, this.tmpS.setScalar(show));
      r.rounds.prop.setMatrixAt(i, this.dummy);
      const propTop = p.clone().add(new THREE.Vector3(0, 0.024 * ROUND_S * show, 0));
      this.dummy.compose(propTop, this.tmpQ, this.tmpS.setScalar(hasCopper ? show : 0.0001));
      r.rounds.copper.setMatrixAt(i, this.dummy);
      this.dummy.compose(propTop, this.tmpQ, this.tmpS.setScalar(hasIron ? show : 0.0001));
      r.rounds.iron.setMatrixAt(i, this.dummy);
      if (lt >= off && lt < on) removed++;
    }
    void removed;
    r.rounds.prop.instanceMatrix.needsUpdate = true;
    r.rounds.copper.instanceMatrix.needsUpdate = true;
    r.rounds.iron.instanceMatrix.needsUpdate = true;
    // 桌上道具：手枪在手时隐藏
    const pistolHand = lt >= MK.load[1] - 0.3 && lt < 47.6;
    this.tablePistol.visible = !pistolHand;
    this.caseGroup.visible = lt < MK.pack[1] + 2 && lt >= 0;
    const lid = this.caseGroup.getObjectByName("lidHinge");
    if (lid) lid.rotation.x = -smooth(1 - seg(lt, 59.2, 60.0)) * 1.9 * (lt < 60.0 ? 1 : 0) - (lt < MK.pack[0] ? 1.9 * 0 : 0);
    // 待用小段托盘
    this.pinTray.visible = lt < 34.8;

    // ---- 靶子：弹孔、震动、拆包 ----
    const t = r.target;
    let shockAmt = 0;
    MK.shots.forEach((s) => (shockAmt += pulse(lt, s + 0.02, 0.01, 0.12)));
    t.group.rotation.set(0, 0, Math.sin(lt * 40) * 0.04 * Math.min(1, shockAmt));
    const holesShown = MK.shots.reduce((n, s, i) => n + (lt >= s ? (i === 3 ? 2 : 1) : 0), 0);
    t.holes.forEach((h, i) => (h.visible = i < holesShown));
    const peel = MK.unwrap;
    const layerPeel = [0, 1, 2].map((k) => smooth(seg(lt, peel[0] + k * 0.9, peel[0] + k * 0.9 + 0.7)));
    t.layers.forEach((o, k) => {
      o.visible = layerPeel[k] < 0.999 && lt < 56.5;
      o.position.set(layerPeel[k] * 0.32, layerPeel[k] * 0.1, layerPeel[k] * 0.3);
      o.rotation.z = -layerPeel[k] * 0.8;
    });
    // 孔洞跟随外层一起被揭掉
    if (layerPeel[0] > 0.5) t.holes.forEach((h) => (h.visible = false));
    t.beef.visible = true;
    // 取出碎石：一小堆灰色碎屑（放在他的手掌位置）
    const gv = lt >= MK.gravel[0] && lt < MK.gravel[1] + 1.0;
    t.pieces.visible = gv;
    if (gv) {
      const hp = new THREE.Vector3();
      this.zhangB.figure.anchors.handR.getWorldPosition(hp);
      for (let i = 0; i < 26; i++) {
        const u = smooth(seg(lt, MK.gravel[0] + i * 0.03, MK.gravel[0] + i * 0.03 + 0.5));
        const a = hash3(i, 1, 2) * 6.28, rr = hash3(i, 2, 2) * 0.05;
        this.tmpQ.setFromEuler(new THREE.Euler(hash3(i, 3, 2) * 3, hash3(i, 4, 2) * 3, 0));
        const local = new THREE.Vector3(hp.x - t.group.position.x + Math.cos(a) * rr, hp.y + 0.07 + hash3(i, 5, 2) * 0.012 + (1 - u) * 0.1, hp.z - t.group.position.z + Math.sin(a) * rr);
        this.dummy.compose(local, this.tmpQ, this.tmpS.setScalar(0.6 + hash3(i, 6, 2) * 0.8));
        t.pieces.setMatrixAt(i, this.dummy);
      }
      t.pieces.instanceMatrix.needsUpdate = true;
    }

    // ---- 枪口火光灯（取枪口世界位置；演员已在函数开头更新）----
    const flash = MK.shots.reduce((s, ts) => s + pulse(lt, ts, 0.005, 0.03), 0);
    const muzzle = this.muzzleWorld();
    r.flashLight.position.copy(muzzle);
    r.flashLight.intensity = 120 * Math.min(1.3, flash);

    this.bmFx.update(lt);
  }

  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.zhangB.root.updateMatrixWorld(true);
    out.set(0, 0.42, 6.6 * 0.42);
    this.pistol.localToWorld(out);
    return out;
  }

  private actBasement(lt: number): void {
    const z = this.zhangB;
    const st = pathAt(BM_ZHANG, lt);
    const walk = walkAmount(st, BM_ZHANG, lt);
    z.place(st.x, 0, st.z, st.h);
    z.show(lt >= 21.8 && lt < 62.4);
    let pose: Pose = addPose(stride(lt, walk, st.speed / 1.48), breathe(lt, 0.7));

    // ---- 桌边：伏案拆弹头、粘小段 ----
    const atTable = smooth(seg(lt, 25.6, 26.2)) * (1 - smooth(seg(lt, 35.4, 36.0)));
    const jitter = Math.sin(lt * 5.3) * 0.02;
    pose = lerpPose(pose, addPose(overBench(0.55 + jitter, -1.15), { armR: [0.0, 0, 0.05], armL: [0.0, 0, -0.05] }), atTable);
    // 拆：钳子（右手）夹弹头——出现 pop 的瞬间手往上抬一下
    const popK = [27.4, 28.5].reduce((s, t0) => s + pulse(lt, t0, 0.02, 0.15), 0);
    this.pliers.visible = lt >= 26.2 && lt < 29.2;
    pose = lerpPose(pose, { ...pose, armR: [(pose.armR?.[0] ?? 0) - popK * 0.18, 0, pose.armR?.[2] ?? 0] }, 1);
    // 粘：胶管（左手）+ 镊子（右手）
    this.glue.visible = lt >= 29.0 && lt < 31.6;
    this.tweezers.visible = lt >= 29.6 && lt < 34.8;
    // ---- 装弹夹、枪入手 ----
    const loading = smooth(seg(lt, MK.load[0], MK.load[0] + 0.6)) * (1 - smooth(seg(lt, MK.load[1] - 0.6, MK.load[1])));
    this.magazine.visible = lt >= MK.load[0] && lt < MK.load[1] - 0.2;
    pose = lerpPose(pose, { ...stand(0.1, 0.35, 0), armR: [-1.05, 0, -0.25], armL: [-1.0, 0, 0.3] }, loading);
    this.pistolHolder.visible = lt >= MK.load[1] - 0.3 && lt < 47.7;
    // ---- 瞄准试射（双手持枪，四发） ----
    const aiming = smooth(seg(lt, 39.4, 40.4)) * (1 - smooth(seg(lt, 46.0, 47.0)));
    let kick = 0;
    for (const s of MK.shots) kick += pulse(lt, s, 0.012, 0.11);
    const aimP = aim(-0.03, 0);
    const recoil: Pose = { armR: [-kick * 0.14, 0, 0], armL: [-kick * 0.14, 0, 0], neck: [kick * 0.05, 0, 0], hips: [-kick * 0.03, 0, 0] };
    const aimPose = addPose(aimP, recoil);
    pose = lerpPose(pose, { ...pose, ...aimPose }, aiming);
    // ---- 走近靶子：拆包（弯腰、双手撕开外层）、切牛肉、握碎石 ----
    const at = smooth(seg(lt, 48.0, 48.6)) * (1 - smooth(seg(lt, 52.6, 53.0)));
    pose = lerpPose(pose, { ...stand(0.22, 0.35, 0), armR: [-1.2 + Math.sin(lt * 4) * 0.08, 0, -0.15], armL: [-1.1, 0, 0.2] }, at);
    this.knife.visible = lt >= 52.0 && lt < 54.0;
    const cutK = smooth(seg(lt, 52.2, 52.6)) * (1 - smooth(seg(lt, 53.4, 53.8)));
    pose = lerpPose(pose, { ...stand(0.25, 0.35, 0), armR: [-1.3 + Math.sin(lt * 9) * 0.1, 0, -0.15], armL: [-1.0, 0, 0.3] }, cutK);
    // 掌心托着碎石，凝视
    const palm = smooth(seg(lt, 53.6, 54.2)) * (1 - smooth(seg(lt, 56.0, 56.6)));
    pose = lerpPose(pose, { ...stand(0.12, 0.42, 0), armR: [-1.45, 0, -0.32], armL: [-0.4, 0, 0.1] }, palm);
    // ---- 装箱 ----
    const packK = smooth(seg(lt, 57.4, 58.0)) * (1 - smooth(seg(lt, 60.2, 60.8)));
    pose = lerpPose(pose, addPose(overBench(0.4, -1.1), {}), packK);
    z.pose(pose);
    // 表情：专注
    let expr: "neutral" | "stern" | "blink" | "squint" = "stern";
    if (aiming > 0.5) expr = "squint";
    else if (blinkAt(lt, 3.3, 4.2)) expr = "blink";
    z.setExpr(expr);
  }

  // 由外部（序列）在需要时调用：设置发射器（一次性构建）
  private fxBuilt = false;
  buildFx(): void {
    if (this.fxBuilt) return;
    this.fxBuilt = true;
    const W = this.wsFx, B = this.bmFx;
    let id = 900;
    // ---- 车间：火花、冷却液、铁屑 ----
    const blade = (): THREE.Vector3 => new THREE.Vector3(-0.1, 0.92, -0.2);
    const cutOrigin = (t: number, out: THREE.Vector3) => {
      const sweep = t < MK.cut[1] ? lerp(-0.42, 0.22, smooth(seg(t, MK.cut[0], MK.cut[1]))) : lerp(0.22, -0.4, smooth(seg(t, MK.comb[0] + 0.1, MK.comb[1] - 0.1)));
      const dz = t >= MK.comb[0] ? lerp(-0.1, 0.22, smooth(seg(t, MK.comb[0] + 0.1, MK.comb[1] - 0.1))) : 0;
      out.set(sweep, 0.88, -0.2 + 0.05 + dz);
    };
    for (const [a, b] of [[MK.cut[0], MK.cut[1]], [MK.comb[0] + 0.1, MK.comb[1] - 0.1]] as Array<[number, number]>) {
      W.add({
        id: id++, t0: a, t1: b, count: 90, origin: cutOrigin, dir: new THREE.Vector3(0.2, 0.7, 0.9).normalize(), cone: 0.9,
        speed: [1.5, 4], life: [0.25, 0.6], size: [0.008, 0.02], colorA: [4, 3.2, 1.4], colorB: [1.6, 0.6, 0.15], shrink: 1,
        accel: new THREE.Vector3(0, -9.8, 0),
      });
      W.add({
        id: id++, t0: a, t1: b, count: 60, origin: cutOrigin, dir: new THREE.Vector3(0, 0.5, 1).normalize(), cone: 0.7,
        speed: [0.6, 1.6], life: [0.5, 1.0], size: [0.01, 0.03], colorA: [0.5, 1.2, 1.5], colorB: [0.2, 0.5, 0.7], shrink: 0.8,
        accel: new THREE.Vector3(0, -6, 0),
      });
      W.add({
        id: id++, t0: a, t1: b + 0.4, count: 40, origin: cutOrigin, dir: new THREE.Vector3(0, 0.2, 1).normalize(), cone: 1.2,
        speed: [0.3, 1.0], life: [0.6, 1.2], size: [0.008, 0.016], colorA: [0.35, 0.35, 0.38], colorB: [0.2, 0.2, 0.22], shrink: 0.4,
        accel: new THREE.Vector3(0, -9.8, 0),
      });
    }
    void blade;
    // ---- 地下室：枪口火光、烟、灰尘、布屑 ----
    // 粒子的“出生位置”必须是开枪那一刻的枪口位置，而不是当前时刻的：预先对每一枪的时刻采样一次
    const samples = MK.shots.map((s) => {
      this.actBasement(s);
      this.zhangB.root.updateMatrixWorld(true);
      const p = this.muzzleWorld(new THREE.Vector3());
      const d = new THREE.Vector3(0, 0, 1).transformDirection(this.pistol.matrixWorld);
      return { p, d };
    });
    MK.shots.forEach((s, si) => {
      const muzzle = (_t: number, out: THREE.Vector3) => out.copy(samples[si].p);
      const forward = (_t: number, out: THREE.Vector3) => out.copy(samples[si].d);
      B.add({
        id: id++, t0: s, t1: s, count: 16, origin: muzzle, dir: forward, cone: 0.5, speed: [4, 12], life: [0.05, 0.12], size: [0.01, 0.034],
        colorA: [4.5, 3.6, 1.8], colorB: [2, 0.8, 0.2], shrink: 1,
      });
      B.add({
        id: id++, t0: s + 0.02, t1: s + 0.5, count: 80, origin: muzzle, dir: forward, cone: 1.0, speed: [0.4, 2.2], life: [4, 8], size: [0.03, 0.09],
        colorA: [0.14, 0.135, 0.13], colorB: [0.04, 0.04, 0.04], shrink: 0.35, drag: 1.6,
        accel: new THREE.Vector3(0, 0.05, 0),
      });
      // 靶子上的灰尘与布屑
      const tgt = (_t: number, out: THREE.Vector3) => out.set(0.4 + 0.02, 1.0, -1.72);
      B.add({
        id: id++, t0: s + 0.06, t1: s + 0.3, count: 28, origin: tgt, dir: new THREE.Vector3(0, 0.1, 1), cone: 1.3, speed: [0.6, 2.2], life: [0.8, 2.0], size: [0.012, 0.035],
        colorA: [0.55, 0.52, 0.48], colorB: [0.16, 0.16, 0.16], shrink: 0.6, drag: 1.2,
      });
      B.add({
        id: id++, t0: s + 0.06, t1: s + 0.3, count: 10, origin: tgt, dir: new THREE.Vector3(0, 0.3, 1), cone: 0.6, speed: [1.2, 3], life: [1.2, 2.4], size: [0.008, 0.03],
        colorA: [0.7, 0.7, 0.7], colorB: [0.5, 0.5, 0.5], shrink: 0.3, accel: new THREE.Vector3(0, -4, 0),
      });
    });
    // 悬浮的硝烟薄雾（灯下）
    B.add({
      id: id++, t0: MK.shots[0], t1: MK.shots[3] + 4, count: 110, origin: (_t, out) => out.set(0.4 + (hash3(0, 0, 0) - 0.5) * 0.4, 1.7, 0.0), dir: new THREE.Vector3(0, 0, -1),
      cone: 1.4, speed: [0.05, 0.25], life: [6, 10], size: [0.05, 0.16], colorA: [0.1, 0.1, 0.095], colorB: [0.03, 0.03, 0.03], shrink: 0.25,
    });
    void hash1;
  }
}
