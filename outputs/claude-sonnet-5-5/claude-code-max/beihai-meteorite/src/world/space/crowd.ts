// 合影人群：30 人 + 摄影师。出舱 → 排三排 → 面罩渐次透明 → 中弹/惊恐 → 全速返航。
// 所有状态都是叙事时钟 τ 的纯函数（无累加），拖动时间轴与正常播放完全一致。
import * as THREE from "three";
import { Actor, blinkAt } from "../../chars/actor";
import type { Look, Expr } from "../../chars/faces";
import { spaceSuit, type SuitVariant, type VisorState } from "../../chars/outfits";
import { floatUpright, thrust, panic, lerpPose, type Pose } from "../../chars/poses";
import { mountMeters, backpackMesh } from "../../chars/props";
import { hash1, mulberry32, smooth, clamp, lerp } from "../../util/math";
import { HATCH, WALL_N, WALL_HEADING, GROUP_CENTER } from "./geometry";
import { HIT_PLAN, hitTime, SHUTTER_T, type HitSpot } from "./schedule";

export type Role = "general" | "engineer" | "designer" | "photographer" | "crew";

export interface HitEvent {
  member: CrowdMember;
  t: number;
  spot: HitSpot;
  bullet: number;
}

export interface CrowdMember {
  actor: Actor;
  role: Role;
  index: number;
  row: 0 | 1 | 2;
  /** 队形局部位置：X 横向（摄影师的右手）、Y 竖直、Z 向外（朝章北海） */
  slot: THREE.Vector3;
  exitAt: number;
  visorAt: number;
  /** 首次中弹时刻；<0 = 未中弹 */
  hitAt: number;
  /** 被拖回的时刻（受伤者 & 搀扶者）；<0 = 否 */
  dragAt: number;
  /** 搀扶者所搀扶的对象 */
  helps: CrowdMember | null;
  seed: number;
  suitKey: string;
  suit: SuitVariant;
}

/** 叙事时间点（τ 秒） */
export const CROWD_T = {
  hatchGreen: 19.0,
  hatchOpen: 20.6,
  firstExit: 23.5,
  lastExit: 32.5,
  formed: 46.0,
  visorStart: 48.0,
  visorEnd: 62.0,
  shutter: SHUTTER_T,
  /** 大家开始返航 */
  retreat: 113.2,
  hatchClose: 131.0,
};

const SKINS = ["#f0c9a2", "#e2b48c", "#cf9f77", "#b98560", "#8d6242"];
const HAIRS = ["#15110f", "#2a1e17", "#4a3427", "#7a6a58", "#b8b6b0"];
const STYLES: Look["hairStyle"][] = ["crop", "short", "swept", "long", "bun", "receding", "short", "crop"];

function crewLook(i: number): Look {
  const r = mulberry32(1000 + i * 17);
  const skin = SKINS[Math.floor(r() * SKINS.length)];
  const hair = HAIRS[Math.floor(r() * HAIRS.length)];
  const style = STYLES[Math.floor(r() * STYLES.length)];
  return {
    skin,
    skinDark: "#a57550",
    hair,
    hairDark: hair === "#15110f" ? "#0a0908" : "#2b2622",
    hairStyle: style,
    brow: hair,
    lips: "#9a5a4c",
    glasses: r() < 0.28 ? "#2a2a30" : undefined,
    beard: style !== "long" && style !== "bun" && r() < 0.14 ? hair : undefined,
    age: r() < 0.5 ? 1 : 0,
    torso: "#c8ccd0",
    legs: "#c8ccd0",
  };
}

const GENERAL: Look = {
  skin: "#dcb58f", skinDark: "#b08862", hair: "#ecebe6", hairDark: "#c9c8c2", hairStyle: "short", brow: "#dad8d2",
  lips: "#a5655a", mustache: "#ecebe6", age: 2, torso: "#c8ccd0", legs: "#c8ccd0",
};
const ENGINEER: Look = {
  skin: "#e6bd98", skinDark: "#b98e68", hair: "#2a2420", hairDark: "#6f6a66", hairStyle: "bun", brow: "#2a2420",
  lips: "#b0554e", glasses: "#7b4a3a", age: 1, torso: "#c8ccd0", legs: "#c8ccd0",
};
const DESIGNER: Look = {
  skin: "#c99b73", skinDark: "#9d7250", hair: "#26211e", hairDark: "#1a1614", hairStyle: "bald", brow: "#26211e",
  lips: "#9a5a4c", beard: "#2f2a27", age: 1, torso: "#c8ccd0", legs: "#c8ccd0",
};
const PHOTOG: Look = {
  skin: "#e3b993", skinDark: "#b48c68", hair: "#4a3427", hairDark: "#2e2018", hairStyle: "swept", brow: "#3a2a20",
  lips: "#a5655a", torso: "#c8ccd0", legs: "#c8ccd0",
};

const VARIANTS: SuitVariant[] = [
  { trim: "#d64545", patch: "#c0392b", lamp: "#f2b544" },
  { trim: "#2f6fd1", patch: "#c0392b", lamp: "#f2b544" },
  { trim: "#e0872d", patch: "#2f6fd1", lamp: "#f2b544" },
  { trim: "#3ab26e", patch: "#c0392b", lamp: "#e8e8e0" },
];
const VARIANT_VIP: SuitVariant = { trim: "#c9a227", patch: "#c0392b", lamp: "#ffd76a", led: "#e0c040" };
const VARIANT_PHOTOG: SuitVariant = { trim: "#e8e8e0", patch: "#2f6fd1", lamp: "#e8e8e0" };

// ---- 面罩纹理缓存：套装变体 × 状态 ----
const suitCache = new Map<string, ReturnType<typeof spaceSuit>>();
export function suitSkin(key: string, variant: SuitVariant, visor: VisorState) {
  const k = `${key}|${visor.kind}|${visor.kind === "gold" ? visor.level.toFixed(2) : ""}`;
  let s = suitCache.get(k);
  if (!s) {
    s = spaceSuit(variant, visor);
    suitCache.set(k, s);
  }
  return s;
}
export const VISOR_LEVELS = [1, 0.75, 0.5, 0.25, 0];
export function visorStateFor(gold01: number): VisorState {
  let best = VISOR_LEVELS[0];
  for (const l of VISOR_LEVELS) if (Math.abs(l - gold01) < Math.abs(best - gold01)) best = l;
  return { kind: "gold", level: best };
}

/** 队伍局部 +X（摄影师视角的右手） */
const RIGHT = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), WALL_N).normalize();

/** 三排：前排 8（3 位目标居中）、中排 10、后排 12 */
function layout(): Array<{ row: 0 | 1 | 2; x: number; y: number; z: number }> {
  const slots: Array<{ row: 0 | 1 | 2; x: number; y: number; z: number }> = [];
  const rows: Array<[0 | 1 | 2, number, number, number]> = [
    [0, 8, 0.0, 0.0],
    [1, 10, 0.95, -2.1],
    [2, 12, 1.9, -4.2],
  ];
  for (const [row, n, y, z] of rows) {
    const spacing = 1.72;
    // 后排相对前排错开半个身位（不同排的头不在一条竖线上）
    for (let i = 0; i < n; i++) slots.push({ row, x: (i - (n - 1) / 2) * spacing + (row === 1 ? 0.0 : 0), y, z });
  }
  return slots;
}

export interface CrowdRig {
  members: CrowdMember[];
  all: CrowdMember[];
  group: THREE.Group;
  photographer: CrowdMember;
  general: CrowdMember;
  engineer: CrowdMember;
  designer: CrowdMember;
  hits: HitEvent[];
  toWorld(local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3;
  update(tau: number): void;
  posAt(m: CrowdMember, tau: number, out: THREE.Vector3): THREE.Vector3;
  chestAt(m: CrowdMember, tau: number, out: THREE.Vector3): THREE.Vector3;
  headAt(m: CrowdMember, tau: number, out: THREE.Vector3): THREE.Vector3;
  nozzleAt(m: CrowdMember, tau: number, out: THREE.Vector3): THREE.Vector3;
  velAt(m: CrowdMember, tau: number, out: THREE.Vector3): THREE.Vector3;
  retreatStart(m: CrowdMember): number;
}

export function buildCrowd(): CrowdRig {
  const group = new THREE.Group();
  const members: CrowdMember[] = [];
  const slots = layout();

  let crewN = 0;
  slots.forEach((s, i) => {
    let look: Look;
    let role: Role = "crew";
    let key = "";
    let suit: SuitVariant;
    if (s.row === 0 && i === 3) { look = ENGINEER; role = "engineer"; key = "vip"; suit = VARIANT_VIP; }
    else if (s.row === 0 && i === 4) { look = GENERAL; role = "general"; key = "vip"; suit = VARIANT_VIP; }
    else if (s.row === 0 && i === 5) { look = DESIGNER; role = "designer"; key = "vip"; suit = VARIANT_VIP; }
    else {
      look = crewLook(i);
      const v = crewN % VARIANTS.length;
      key = "crew" + v;
      suit = VARIANTS[v];
      crewN++;
    }
    const actor = new Actor(`crowd${i}`, look, {
      heightM: 1.66 + hash1(i * 7 + 3) * 0.2,
      clothes: suitSkin(key, suit, { kind: "gold", level: 1 }),
      castShadow: true,
      expr: "neutral",
    });
    mountMeters(actor, "back", backpackMesh(), { rot: [0, Math.PI, 0], pos: [0, -1, -3.2] });
    members.push({
      actor, role, index: i, row: s.row, slot: new THREE.Vector3(s.x, s.y, s.z),
      exitAt: 0, visorAt: 0, hitAt: -1, dragAt: -1, helps: null, seed: i, suitKey: key, suit,
    });
    group.add(actor.root);
  });

  const photoActor = new Actor("photographer", PHOTOG, {
    heightM: 1.78, clothes: suitSkin("photo", VARIANT_PHOTOG, { kind: "gold", level: 1 }), castShadow: true,
  });
  mountMeters(photoActor, "back", backpackMesh(), { rot: [0, Math.PI, 0], pos: [0, -1, -3.2] });
  const photographer: CrowdMember = {
    actor: photoActor, role: "photographer", index: 99, row: 0, slot: new THREE.Vector3(1.4, 0.5, 46),
    exitAt: 21.5, visorAt: CROWD_T.visorStart + 1.5, hitAt: -1, dragAt: -1, helps: null, seed: 99, suitKey: "photo", suit: VARIANT_PHOTOG,
  };
  group.add(photoActor.root);

  const general = members.find((m) => m.role === "general")!;
  const engineer = members.find((m) => m.role === "engineer")!;
  const designer = members.find((m) => m.role === "designer")!;

  // ---- 出舱顺序（前排先，从中间向两侧）与面罩时刻 ----
  const order = members
    .map((m, i) => ({ m, i, k: m.row * 100 + Math.abs(m.slot.x) * 3 + hash1(i) }))
    .sort((a, b) => a.k - b.k);
  order.forEach((o, n) => {
    o.m.exitAt = CROWD_T.firstExit + (n / (order.length - 1)) * (CROWD_T.lastExit - CROWD_T.firstExit);
    o.m.visorAt = CROWD_T.visorStart + hash1(o.i * 13 + 5) * (CROWD_T.visorEnd - CROWD_T.visorStart - 4);
  });
  // 三位目标最后转透明，便于集中“揭面”
  general.visorAt = CROWD_T.visorStart + 7.5;
  engineer.visorAt = CROWD_T.visorStart + 9.5;
  designer.visorAt = CROWD_T.visorStart + 11.5;

  // ---- 命中计划 ----
  const byA = members.find((m) => m.row === 1 && Math.abs(m.slot.x - general.slot.x) < 1.0)!;
  const byB = members.find((m) => m.row === 1 && Math.abs(m.slot.x - designer.slot.x) < 1.0 && m !== byA)!;
  const who: Record<string, CrowdMember> = { gen: general, eng: engineer, des: designer, byA, byB };
  const hits: HitEvent[] = HIT_PLAN.map((h) => ({ member: who[h.who], t: hitTime(h), spot: h.spot, bullet: h.bullet }));
  for (const h of hits) if (h.member.hitAt < 0 || h.t < h.member.hitAt) h.member.hitAt = h.t;

  // ---- 搀扶：每位伤者由一位邻座同伴拖回 ----
  const wounded = [general, engineer, designer, byA, byB];
  const helpers = new Set<CrowdMember>();
  for (const w of wounded) {
    const buddy = members
      .filter((m) => !wounded.includes(m) && !helpers.has(m) && m.row <= 1)
      .sort((a, b) => a.slot.distanceTo(w.slot) - b.slot.distanceTo(w.slot))[0];
    if (buddy) {
      helpers.add(buddy);
      buddy.helps = w;
    }
  }
  const retreatOf = (m: CrowdMember): number => {
    if (m.role === "photographer") return CROWD_T.retreat + 2.0;
    if (wounded.includes(m)) return CROWD_T.retreat + 1.6 + hash1(m.index) * 0.4;
    if (m.helps) return CROWD_T.retreat + 1.2 + hash1(m.index) * 0.4;
    return CROWD_T.retreat + hash1(m.index * 5 + 2) * 0.9;
  };
  for (const w of wounded) w.dragAt = retreatOf(w);

  // ---- 位置函数 ----
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  /** update() 专用的输出向量：不能与内部临时量 A/B/C 混用（曾因别名导致位置被覆盖） */
  const POS = new THREE.Vector3();

  const toWorld = (local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 =>
    out.copy(GROUP_CENTER).addScaledVector(RIGHT, local.x).addScaledVector(WALL_N, local.z).add(A.set(0, local.y, 0));

  const wobble = (m: CrowdMember, tau: number, out: THREE.Vector3): THREE.Vector3 => {
    const a = tau * 0.31 + m.seed * 1.7;
    return out.set(Math.sin(a) * 0.12 + Math.sin(a * 2.3) * 0.05, Math.sin(a * 0.8 + 1) * 0.1, Math.cos(a * 0.7) * 0.1);
  };

  /** 队形中的位置（未中弹/未返航）——含出舱路径 */
  const formationPos = (m: CrowdMember, tau: number, out: THREE.Vector3): THREE.Vector3 => {
    if (m.role === "photographer") {
      toWorld(m.slot, out);
      return out.add(wobble(m, tau, B));
    }
    const dt = tau - m.exitAt;
    const dur = 10.5 + hash1(m.index + 40) * 1.6;
    const u = clamp(dt / dur);
    const eased = 1 - (1 - u) * (1 - u);
    // 起点：气闸腔内；终点：队形槽位。局部系：相对 HATCH 的 (x 横, y 竖, z 向外)
    const zNow = lerp(-3.4, 34 + m.slot.z, eased);
    const lat = smooth(clamp((dt - 0.8) / (dur * 0.85)));
    const x = m.slot.x * lat;
    const y = lerp((hash1(m.index * 3 + 1) - 0.5) * 0.6, m.slot.y, lat);
    out.copy(HATCH).addScaledVector(RIGHT, x).addScaledVector(WALL_N, zNow).add(A.set(0, y, 0));
    if (u >= 1) out.add(wobble(m, tau, B));
    else out.add(wobble(m, tau, B).multiplyScalar(u));
    return out;
  };

  /** 中弹后的漂移：气体反冲带来的缓慢位移 + 翻滚 */
  const hitVel = (m: CrowdMember, out: THREE.Vector3): THREE.Vector3 => {
    const s = m.seed;
    return out.set(Math.sin(s * 2.1) * 0.55, (s % 2 ? 0.32 : -0.28), 0.62 + (s % 3) * 0.12);
  };

  const posBeforeRetreat = (m: CrowdMember, tau: number, out: THREE.Vector3): THREE.Vector3 => {
    formationPos(m, tau, out);
    if (m.hitAt >= 0 && tau > m.hitAt) out.addScaledVector(hitVel(m, C), tau - m.hitAt);
    return out;
  };

  const HATCH_IN = HATCH.clone().addScaledVector(WALL_N, -1.4);

  const posAt = (m: CrowdMember, tau: number, out: THREE.Vector3): THREE.Vector3 => {
    if (m.role === "photographer" && tau < CROWD_T.retreat + 2.0) {
      return posBeforeRetreat(m, tau, out);
    }
    const rs = retreatOf(m);
    if (tau <= rs) return posBeforeRetreat(m, tau, out);
    const dt = tau - rs;
    const start = posBeforeRetreat(m, rs, new THREE.Vector3());
    const T = m.dragAt >= 0 ? 8.6 : m.helps ? 8.6 : 6.4 + hash1(m.index) * 0.8;
    const u = clamp(dt / T);
    let target = HATCH_IN;
    // 搀扶者：与伤者并排行进
    let offset = new THREE.Vector3();
    if (m.helps) {
      offset = new THREE.Vector3().copy(RIGHT).multiplyScalar(0.85);
      const w = m.helps;
      const wStart = posBeforeRetreat(w, retreatOf(w), new THREE.Vector3());
      // 先靠近伤者（前 1.2s），再一起返航
      const near = smooth(dt / 1.2);
      const base = new THREE.Vector3().lerpVectors(start, wStart.clone().add(offset), near);
      const start2 = base;
      return out.lerpVectors(start2, target, u * u);
    }
    void target;
    out.lerpVectors(start, HATCH_IN, u * u);
    if (u > 0.98 && !(m.role === "photographer")) out.copy(HATCH_IN).addScaledVector(WALL_N, -3 * (u - 0.98) * 50);
    return out;
  };

  const rig: CrowdRig = {
    members,
    all: [...members, photographer],
    group,
    photographer,
    general,
    engineer,
    designer,
    hits,
    toWorld,
    retreatStart: retreatOf,
    posAt,
    chestAt(m, tau, out) {
      posAt(m, tau, out);
      const h = m.actor.root.scale.x * 33;
      return out.add(A.set(0, h * 0.62, 0));
    },
    headAt(m, tau, out) {
      posAt(m, tau, out);
      const h = m.actor.root.scale.x * 33;
      return out.add(A.set(0, h * 0.93, 0));
    },
    nozzleAt(m, tau, out) {
      posAt(m, tau, out);
      return out.add(A.set(0, m.actor.root.scale.x * 8, 0)).addScaledVector(WALL_N, 0);
    },
    velAt(m, tau, out) {
      const a = posAt(m, tau - 0.05, new THREE.Vector3());
      const b = posAt(m, tau + 0.05, new THREE.Vector3());
      return out.subVectors(b, a).multiplyScalar(10);
    },
    update(tau) {
      for (const m of rig.all) {
        const a = m.actor;
        const isPhoto = m.role === "photographer";
        const shown = isPhoto ? tau > 0 : tau >= m.exitAt;
        a.root.visible = shown;
        if (!shown) continue;
        // 已进入气闸（返航完成）后隐藏
        const rs = retreatOf(m);
        const T = m.dragAt >= 0 || m.helps ? 8.6 : 6.4 + hash1(m.index) * 0.8;
        if (tau > rs + T) {
          a.root.visible = false;
          continue;
        }

        posAt(m, tau, POS);
        a.root.position.copy(POS);

        const retreating = tau > rs;
        const wasHit = m.hitAt >= 0 && tau > m.hitAt;
        let heading = isPhoto ? WALL_HEADING + Math.PI : WALL_HEADING;
        let pose: Pose;

        if (retreating) {
          const v = rig.velAt(m, tau, C);
          if (v.lengthSq() > 1e-4) heading = Math.atan2(v.x, v.z);
          else heading = Math.atan2(-WALL_N.x, -WALL_N.z);
          const blend = smooth((tau - rs) / 0.7);
          pose = lerpPose(wasHit ? panic(tau, m.seed) : floatUpright(tau, m.seed), thrust(tau, m.seed), blend);
          if (m.helps) pose = { ...pose, armR: [-1.2, 0, -0.5], armL: [-1.2, 0, 0.5] }; // 搀扶
          a.root.rotation.set(0, heading, 0);
        } else if (isPhoto) {
          const f = floatUpright(tau, m.seed);
          pose = { ...f, armR: [-1.45, 0, -0.05], armL: [-1.2, 0, 0.4], neck: [0.02, 0, 0] };
          a.root.rotation.set(0, heading, 0);
        } else {
          const dt = tau - m.exitAt;
          const flyOut = 1 - smooth((dt - 1) / 9);
          pose = lerpPose(floatUpright(tau, m.seed), thrust(tau, m.seed * 0.7), 0.7 * flyOut);
          if (wasHit) {
            const k = tau - (m.hitAt as number);
            pose = lerpPose(pose, panic(tau, m.seed), smooth(k / 0.5));
            a.root.rotation.set(k * 0.5 * (m.seed % 2 ? 1 : -1), heading, k * 0.42);
          } else {
            // 排队时的小动作：左右张望
            const look = Math.sin(tau * 0.5 + m.seed * 2.3) * 0.3;
            pose = { ...pose, neck: [0.02, look, 0] };
            a.root.rotation.set(0, heading, 0);
          }
        }
        a.pose(pose);

        // 面罩
        let visor: VisorState;
        const vip = m.role === "general" || m.role === "engineer" || m.role === "designer";
        const visorHit = hits.find((h) => h.member === m && h.spot === "visor");
        if (vip && visorHit && tau >= visorHit.t + 0.15) visor = { kind: "bloody" };
        else if (!vip && m.hitAt >= 0 && tau >= m.hitAt + 0.6) visor = { kind: "cracked" };
        else visor = visorStateFor(1 - clamp((tau - m.visorAt) / 2.6));
        a.setClothes(
          suitSkin(m.suitKey, m.suit, visor),
          `${m.suitKey}|${visor.kind}|${visor.kind === "gold" ? visor.level : ""}`,
        );

        // 表情
        let expr: Expr = "neutral";
        const open = tau > m.visorAt + 2.6;
        if (isPhoto) {
          expr = tau > 70 ? (Math.sin(tau * 2.2) > 0.7 ? "talk" : "smile") : "neutral";
          if (tau > CROWD_T.shutter - 2.6 && tau < CROWD_T.shutter + 0.4) expr = "smile";
          else if (tau >= CROWD_T.shutter + 0.4) expr = "shout";
        } else if (m.hitAt >= 0 && tau > m.hitAt - 0.05) {
          expr = "shout";
        } else if (tau > CROWD_T.shutter + 0.5) {
          expr = open ? "shock" : "neutral";
        } else if (open) {
          const cyc = Math.floor(tau / 3.1 + m.seed * 0.37) % 7;
          expr = cyc === 0 ? "laugh" : cyc === 1 || cyc === 4 ? "smile" : cyc === 2 ? "talk" : "neutral";
          if (m.role === "general" && tau > 68 && tau < CROWD_T.shutter - 3) expr = Math.sin(tau * 1.7) > 0.2 ? "laugh" : "smile";
          if (tau > CROWD_T.shutter - 3 && tau < CROWD_T.shutter + 0.5 && !vip) expr = "smile";
          if (blinkAt(tau, m.seed) && (expr === "neutral" || expr === "smile")) expr = "blink";
        }
        a.setExpr(expr);
      }
    },
  };
  return rig;
}
