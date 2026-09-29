// 第二幕：制作（约 62s）。冷、准、快——车间的数控切割与地下室的子弹改装，用手和工具的特写剪辑推进。
// 不解释：观众自己看出“三十六颗”“弹头被换成陨石”。第一次枪响在狭小的混凝土空间里震耳欲聋。
import * as THREE from "three";
import type { Shot } from "@agentbench/cinematic-player";
import type { FilmContext } from "../types";
import { makeShot, camLerp, handheld, addV, type V3, type CamPose } from "../shotkit";
import { smooth, lerp, seg, pulse } from "../../util/math";
import { MakingWorlds, MK } from "../../world/making/world";
import { DUR } from "../timing";

const P = (x: number, y: number, z: number): V3 => [x, y, z];
const tmp = new THREE.Vector3();

export function buildMaking(ctx: FilmContext, W: MakingWorlds, t0: number): Shot<FilmContext>[] {
  const shots: Shot<FilmContext>[] = [];
  W.buildFx();
  const ws = W.workshop;
  const bm = W.basement;
  const tintW: [number, number] = [0x06283a, 0.08];
  const tintB: [number, number] = [0x2a2010, 0.06];

  const WS = (id: string, a: number, b: number, cam: (lt: number, p: number) => CamPose, o: { exposure?: number; fadeIn?: number; fadeOut?: number; vignette?: number } = {}) =>
    shots.push(
      makeShot(ctx, {
        id, start: t0 + a, dur: b - a, world: ws,
        update: (t) => W.setWorkshop(t - t0),
        cam, exposure: o.exposure ?? 1.1, vignette: o.vignette ?? 0.55, tint: tintW, fadeIn: o.fadeIn, fadeOut: o.fadeOut,
      }),
    );
  const BM = (
    id: string, a: number, b: number, cam: (lt: number, p: number) => CamPose,
    o: { exposure?: number; fadeIn?: number; fadeOut?: number; vignette?: number; flash?: boolean } = {},
  ) =>
    shots.push(
      makeShot(ctx, {
        id, start: t0 + a, dur: b - a, world: bm,
        update: (t) => W.setBasement(t - t0),
        cam, exposure: o.exposure ?? 1.15, vignette: o.vignette ?? 0.6, tint: tintB, fadeIn: o.fadeIn, fadeOut: o.fadeOut,
        fx: o.flash === false ? undefined : (lt, p, ov) => {
          // 枪口火光：白闪叠在画面上，几乎不留余韵
          const f = MK.shots.reduce((s, ts) => s + pulse(a + lt, ts, 0.004, 0.022), 0);
          ov.flash = Math.min(0.55, f * 0.5);
          ov.flashColor = 0xffe6b0;
        },
      }),
    );
  const hand = (side: "R" | "L", d: V3 = [0, 0, 0]): V3 => {
    W.zhangB.figure.anchors[side === "R" ? "handR" : "handL"].getWorldPosition(tmp);
    return [tmp.x + d[0], tmp.y + d[1], tmp.z + d[2]];
  };

  // ------------------------------------------------------------------
  // 车间
  // ------------------------------------------------------------------
  WS("m1-hall", 0, 5.4, (lt, p) => {
    // 高机位：从后墙角俯视整间车间，灯依次亮起，他从门口走向机床
    const pos = P(lerp(-3.9, -3.5, smooth(p)), lerp(2.7, 2.4, p), lerp(3.5, 3.2, p));
    return { pos: addV(pos, handheld(lt, 0.003, 0.5)), look: P(0.8, 1.0, 0.2), lens: 26, near: 0.05, far: 80 };
  }, { fadeIn: 0.8, exposure: 0.95 });
  WS("m2a-load", 5.4, 7.7, (lt, p) => {
    const pos = P(lerp(-1.9, -1.5, p), 1.45, 2.1);
    return { pos, look: P(0.05, 1.15, 0.45), lens: 30, near: 0.05, far: 80 };
  }, { exposure: 0.9 });
  WS("m2b-start", 7.7, 9.4, (lt, p) => {
    const pos = P(2.4, 1.5, 2.0);
    return { pos, look: P(0.5, 1.2, 0.5), lens: 34, near: 0.05, far: 80 };
  }, { exposure: 0.9 });
  WS("m3a-cut", 9.4, 10.9, (lt, p) => {
    const pos = P(lerp(-0.8, -0.3, p), 1.2, 1.8);
    return { pos, look: P(lerp(-0.3, 0.05, p), 0.95, -0.1), lens: 40, near: 0.05, far: 80 };
  }, { exposure: 0.85 });
  WS("m3b-comb", 10.9, 12.4, (lt, p) => {
    const pos = P(-0.55, lerp(1.2, 1.1, p), 1.75);
    return { pos, look: P(-0.1, 0.95, -0.1), lens: 46, near: 0.05, far: 80 };
  }, { exposure: 0.85 });
  WS("m3c-rods", 12.4, 14.0, (lt, p) => {
    const pos = P(lerp(0.15, 0.4, p), 1.0, 1.75);
    return { pos, look: P(0.45, 0.85, 0.15), lens: 40, near: 0.05, far: 80 };
  }, { exposure: 0.85 });
  WS("m3d-count", 14.0, 15.6, (lt, p) => {
    const a: CamPose = { pos: P(1.6, 1.55, 1.7), look: P(0.62, 1.34, 0.46), lens: 40 };
    const b: CamPose = { pos: P(0.6, 1.05, 1.7), look: P(0.45, 0.85, 0.15), lens: 44 };
    return { ...camLerp(a, b, smooth(p)), near: 0.05, far: 80 };
  }, { exposure: 0.85 });
  WS("m3e-tray", 15.6, 17.0, (lt, p) => {
    const pos = P(lerp(0.4, 0.45, p), lerp(1.15, 1.0, smooth(p)), 1.45);
    return { pos, look: P(0.45, 0.82, 0.14), lens: 44, near: 0.05, far: 80 };
  }, { exposure: 0.85 });
  WS("m4a-tool", 17.0, 18.9, (lt, p) => {
    const pos = P(lerp(-1.4, -1.0, p), 1.4, 1.9);
    return { pos, look: P(0.3, 1.05, 0.5), lens: 30, near: 0.05, far: 80 };
  }, { exposure: 0.9 });
  WS("m4b-exit", 18.9, 21.0, (lt, p) => {
    const pos = P(3.9, 1.7, -2.9);
    return { pos, look: P(2.4, 1.2, 3.5), lens: 26, near: 0.05, far: 80 };
  }, { fadeOut: 0.7, exposure: 1.0 });

  // ------------------------------------------------------------------
  // 地下室
  // ------------------------------------------------------------------
  BM("n1-door", 21.0, 25.6, (lt, p) => {
    const pos = P(lerp(0.6, 0.3, p), 1.45, -1.9);
    return { pos: addV(pos, handheld(lt, 0.004, 0.5)), look: P(0.0, 1.2, 2.9), lens: 26, near: 0.05, far: 40 };
  }, { fadeIn: 0.6, flash: false });
  BM("n2-pull", 25.6, 29.0, (lt, p) => {
    // 桌子西端的侧面：钳子、手、弹头一起入画
    const pos = P(lerp(-2.25, -2.15, p), 1.3, lerp(0.75, 0.55, p));
    return { pos, look: P(-1.2, 1.0, 0.5), lens: 38, near: 0.03, far: 40 };
  }, { flash: false });
  BM("n3-glue", 29.0, 31.4, (lt, p) => {
    const pos = P(lerp(-0.4, -0.5, p), 1.3, lerp(0.3, 0.5, p));
    return { pos, look: P(-1.2, 1.0, 0.45), lens: 36, near: 0.03, far: 40 };
  }, { flash: false });
  BM("n4-lapse", 31.4, 34.6, (lt, p) => {
    // 隔着桌子从对面看：前景是那一排排被换了头的子弹，后面是他专注的脸
    const pos = P(lerp(-1.6, -1.0, smooth(p)), lerp(1.22, 1.18, p), -0.4);
    return { pos, look: P(-1.2, 1.05, 0.5), lens: 34, near: 0.03, far: 40 };
  }, { flash: false });
  BM("n5-load", 34.6, 38.4, (lt, p) => {
    const pos = P(lerp(-2.05, -1.9, p), 1.5, lerp(-0.6, -0.45, p));
    return { pos, look: P(-1.3, 1.3, 1.0), lens: 32, near: 0.03, far: 40 };
  }, { flash: false });
  BM("n6-fire-a", 38.4, 42.7, (lt, p) => {
    const pos = P(lerp(2.25, 2.1, p), 1.6, 2.85);
    return { pos, look: P(0.0, 1.2, -0.8), lens: 22, near: 0.05, far: 40 };
  });
  BM("n7-fire-b", 42.7, 46.6, (lt, p) => {
    // 侧面：靶子在左，枪手在右，弹道横过画面
    const pos = P(lerp(-1.9, -1.75, p), 1.4, lerp(0.15, 0.1, p));
    return { pos, look: P(0.4, 1.2, -0.35), lens: 27, near: 0.05, far: 40 };
  });
  BM("n8-smoke", 46.6, 48.8, (lt, p) => {
    const pos = P(lerp(-1.7, -1.5, p), 1.05, 1.2);
    return { pos, look: P(0.3, 1.35, -0.6), lens: 26, near: 0.05, far: 40 };
  }, { flash: false });
  BM("n9-unwrap", 48.8, 53.4, (lt, p) => {
    const pos = P(lerp(-1.05, -0.8, p), 1.4, lerp(-0.4, -0.55, p));
    return { pos, look: P(0.55, 1.2, -1.55), lens: 30, near: 0.03, far: 40 };
  }, { flash: false });
  BM("n10-gravel", 53.4, 56.4, (lt, p) => {
    const h = hand("R");
    return { pos: [h[0] - 0.2, h[1] + 0.75, h[2] - 0.3], look: [h[0], h[1] + 0.02, h[2]], lens: 36, near: 0.03, far: 40 };
  }, { flash: false });
  BM("n11-pack", 56.4, DUR.making, (lt, p) => {
    const a: CamPose = { pos: P(-1.95, 1.6, -0.3), look: P(-1.5, 0.98, 0.5), lens: 32 };
    const b: CamPose = { pos: P(0.5, 1.3, -1.7), look: P(0.0, 1.2, 3.0), lens: 26 };
    const c = camLerp(a, b, smooth(seg(lt, 3.0, 5.0)));
    return { ...c, near: 0.03, far: 40 };
  }, { fadeOut: 0.6, flash: false });

  return shots;
}
