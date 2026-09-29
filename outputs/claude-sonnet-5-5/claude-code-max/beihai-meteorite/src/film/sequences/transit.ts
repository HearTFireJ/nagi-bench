// 过渡（16s）：一号基地——他把定位单元留在舱里；出舱，向黄河站飞去；掠过船坞骨架。
// 与冷开场、四合院/车间形成温度反差：这里是冷白的舱壁、蓝色的地球光，桌上一点绿色的呼吸灯。
// 父亲的照片在这里第一次出现——给最后那句“在父亲投下的目光里”埋下种子。
import * as THREE from "three";
import type { Shot } from "@agentbench/cinematic-player";
import type { FilmContext } from "../types";
import { makeShot, handheld, addV, lerpV, type V3, type CamPose } from "../shotkit";
import { smooth, lerp, seg, DEG } from "../../util/math";
import type { BaseWorlds } from "../../world/base/base";
import type { SpaceWorld } from "../../world/space/spaceworld";
import { SHIPYARD, sunDirAt } from "../../world/space/geometry";
import { DUR } from "../timing";

const P = (x: number, y: number, z: number): V3 => [x, y, z];
const UP = new THREE.Vector3(0, 1, 0);
/** 过渡段的天空时刻：太阳还在地球边缘上方约 6°（落日之前） */
const SKY_TAU = -30;

export function buildTransit(ctx: FilmContext, B: BaseWorlds, S: SpaceWorld, t0: number): Shot<FilmContext>[] {
  const shots: Shot<FilmContext>[] = [];
  const cab = B.cabin;
  const out = B.outside;

  const cabinShot = (id: string, a: number, b: number, cam: (lt: number, p: number) => CamPose, o: { fadeIn?: number; exposure?: number } = {}) =>
    shots.push(
      makeShot(ctx, {
        id, start: t0 + a, dur: b - a, world: cab,
        update: (t) => {
          S.setTau(SKY_TAU);
          B.setCabin(t - t0);
        },
        cam, exposure: o.exposure ?? 1.0, vignette: 0.6, tint: [0x0a1a2a, 0.06], fadeIn: o.fadeIn,
      }),
    );

  // 1a —— 冷白的舱室里，他手里托着那枚小小的定位单元（绿灯规律地闪）。从桌子对面看他
  cabinShot("t1a-hold", 0, 2.4, (lt) => {
    const pos = addV(P(1.42, 1.22, -0.12), handheld(lt, 0.004, 0.5));
    return { pos, look: P(0.5, 1.2, -0.75), lens: 17, near: 0.03, far: 40 };
  }, { fadeIn: 0.8 });
  // 1b —— 桌面特写：从桌子的另一侧看过去——手抽走，绿灯独自留在画面里，左边是“EVA 12:00”的小屏幕
  cabinShot("t1b-place", 2.4, 3.6, (lt, p) => {
    const pos = lerpV(P(0.72, 1.12, -1.3), P(0.8, 1.0, -1.22), smooth(p));
    return { pos: addV(pos, handheld(lt, 0.003, 0.5)), look: P(0.84, 0.82, -0.66), lens: lerp(36, 46, smooth(p)), near: 0.03, far: 40 };
  });
  // 2 —— 搁架上父亲的照片，背后是舷窗外的星空（推近）
  cabinShot("t2-photo", 3.6, 5.5, (lt, p) => {
    const pos = lerpV(P(1.0, 1.52, -0.66), P(0.9, 1.5, -0.9), smooth(p));
    return { pos, look: P(0.7, 1.5, -1.512), lens: lerp(30, 38, smooth(p)), near: 0.03, far: 40 };
  });
  // 3 —— 舱口打开，白光涌进来；他走向那道光
  cabinShot("t3-hatch", 5.5, 6.6, (lt, p) => {
    const pos = lerpV(P(-0.95, 1.28, 1.2), P(-0.8, 1.3, 1.0), smooth(p));
    return { pos, look: P(1.4, 1.05, 0.0), lens: 18, near: 0.03, far: 40 };
  });

  // 4 —— 舱外：外闸门升起，他飘出来，推进器点火，缩成一个亮点
  // 机位在基地侧后方：光与家留在画面左边，他飞向右边那片什么也没有的黑暗
  shots.push(
    makeShot(ctx, {
      id: "t4-depart", start: t0 + 6.6, dur: 5.2, world: out,
      update: (t) => {
        S.setTau(SKY_TAU);
        B.setOutside(t - (t0 + 6.6));
      },
      cam: (lt, p) => {
        const zp = B.outPos(lt, new THREE.Vector3());
        const follow = smooth(seg(lt, 2.6, 5.0));
        const pos = P(lerp(36, 39, smooth(p)), 3, 30);
        const look = P(lerp(24, zp.x + 2, follow), lerp(0.5, zp.y + 0.3, follow), 0);
        return { pos, look, lens: lerp(30, 40, smooth(p)), near: 0.2, far: 250000 };
      },
      exposure: 1.0, vignette: 0.6, grain: 0.5,
    }),
  );

  // 5 —— 船坞：一具巨兽的骨骼，逆着落日与地球的边缘。人类才刚走到海边。
  const L0 = sunDirAt(2.7);
  shots.push(
    makeShot(ctx, {
      id: "t5-shipyard", start: t0 + 11.8, dur: DUR.transit - 11.8, world: S,
      update: () => {
        S.setTau(SKY_TAU);
        S.setScopeHidden(false);
        S.setShipyardYaw(0.95);
      },
      cam: (lt, p) => {
        const L = L0.clone().applyAxisAngle(UP, (lerp(-3.5, -1.5, p)) * DEG);
        const R = new THREE.Vector3().crossVectors(L, UP).normalize();
        const dist = lerp(1300, 1000, smooth(p));
        const pos = SHIPYARD.clone().addScaledVector(L, -dist).addScaledVector(R, lerp(-40, 30, p)).add(new THREE.Vector3(0, 0, 0));
        const look = pos.clone().addScaledVector(L, 100);
        return { pos: [pos.x, pos.y, pos.z], look: [look.x, look.y, look.z], lens: lerp(42, 50, smooth(p)), near: 2, far: 250000 };
      },
      exposure: 0.95, vignette: 0.6, fadeOut: 0.5,
    }),
  );
  return shots;
}
