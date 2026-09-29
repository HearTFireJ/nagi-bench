// 第一幕：胡同深处的四合院（约 90s）。暖、旧、慢——一个守着自己小世界的人，和一个来买石头的人。
// 视觉策略：长镜头 + 切入镜头（放大镜、茶杯、显微镜、桌面）；正反打时用桌子做“柜台”；
// 台词驱动口型（mouthOpen 读取语音清单）。
// 机位约定：方块人的头有 0.45m 宽 —— 特写镜头要留足距离（50mm 镜头 2.4m 外才是头部特写）。
import type { Shot } from "@agentbench/cinematic-player";
import type { FilmContext } from "../types";
import { makeShot, camLerp, handheld, addV, type V3, type CamPose } from "../shotkit";
import { smooth, lerp, seg } from "../../util/math";
import type { CourtyardWorlds } from "../../world/courtyard/world";
import { DUR } from "../timing";
import * as THREE from "three";

const P = (x: number, y: number, z: number): V3 => [x, y, z];
const tmpV = new THREE.Vector3();

export function buildCourtyard(ctx: FilmContext, W: CourtyardWorlds, t0: number): Shot<FilmContext>[] {
  const shots: Shot<FilmContext>[] = [];
  const room = W.room;
  const alley = W.alley;
  const micro = W.micro;
  const tint: [number, number] = [0x2a1808, 0.07];
  const hand = (a: typeof W.zhangR, d: V3 = [0, 0, 0]): V3 => {
    a.figure.anchors.handR.getWorldPosition(tmpV);
    return [tmpV.x + d[0], tmpV.y + d[1], tmpV.z + d[2]];
  };

  /** 房间镜头的工厂：自动设置世界时间与叠色 */
  const R = (
    id: string, a: number, b: number,
    cam: (lt: number, p: number) => CamPose,
    opts: { exposure?: number; vignette?: number; fadeIn?: number; fadeOut?: number; hideZhang?: boolean; grain?: number } = {},
  ) =>
    shots.push(
      makeShot(ctx, {
        id, start: t0 + a, dur: b - a, world: room,
        update: (t) => {
          W.setRoom(t - t0);
          if (opts.hideZhang) W.zhangR.show(false);
        },
        cam: (lt, p) => cam(lt, p),
        exposure: opts.exposure ?? 1.05,
        vignette: opts.vignette ?? 0.55,
        grain: opts.grain ?? 0.5,
        tint,
        fadeIn: opts.fadeIn,
        fadeOut: opts.fadeOut,
      }),
    );

  // ------------------------------------------------------------------
  // C1 胡同：黄昏，他走向巷子深处
  // ------------------------------------------------------------------
  shots.push(
    makeShot(ctx, {
      id: "c1-alley", start: t0, dur: 6.4, world: alley,
      update: (t) => W.setAlley(t - t0),
      cam: (lt, p) => {
        const pos = P(lerp(0.15, 0.5, p), lerp(1.15, 1.35, p), lerp(9.6, 3.6, smooth(p)));
        const look = P(0.45, 1.45, -9);
        return { pos: addV(pos, handheld(lt, 0.006, 0.6)), look, lens: lerp(50, 62, p), near: 0.1, far: 200 };
      },
      exposure: 1.1, vignette: 0.55, tint: [0x301a08, 0.06], fadeIn: 1.0,
    }),
  );
  // C2 大门：敲门
  shots.push(
    makeShot(ctx, {
      id: "c2-gate", start: t0 + 6.4, dur: 4.8, world: alley,
      update: (t) => W.setAlley(t - t0),
      cam: (lt, p) => {
        const pos = P(lerp(-1.8, -1.2, smooth(p)), lerp(1.45, 1.5, p), lerp(-5.6, -6.2, p));
        const look = P(lerp(1.9, 2.2, p), 1.5, -7.95);
        return { pos: addV(pos, handheld(lt, 0.006, 0.7)), look, lens: 38, near: 0.1, far: 200 };
      },
      exposure: 1.1, vignette: 0.6, tint: [0x301a08, 0.06],
    }),
  );

  // ------------------------------------------------------------------
  // C3 主观镜头：门槛后的小型地质博物馆
  // ------------------------------------------------------------------
  R("c3-enter", 11.2, 19.0, (lt, p) => {
    const a: CamPose = { pos: P(3.55, 1.66, 1.75), look: P(0.6, 1.35, -1.6), lens: 22 };
    const b: CamPose = { pos: P(1.6, 1.62, 0.7), look: P(0.4, 1.4, -1.7), lens: 30 };
    const c = camLerp(a, b, smooth(p));
    return { ...c, pos: addV(c.pos, handheld(lt, 0.012, 0.8)), near: 0.05, far: 60 };
  }, { hideZhang: true, fadeIn: 0.6 });

  // C4a 展柜的细节：冷白射灯下的石头，章北海的背影在右侧
  R("c4a-cabinet", 19.0, 22.2, (lt, p) => {
    const pos = P(lerp(0.8, 1.15, smooth(p)), 1.55, lerp(1.25, 1.05, p));
    return { pos, look: P(2.4, 1.5, -2.3), lens: lerp(30, 36, p), near: 0.05, far: 60 };
  });
  // C4b 收藏者在灯下用放大镜端详
  R("c4b-loupe", 22.2, 25.4, (lt, p) => {
    // 从放大镜的高度略仰拍他的脸，暖色台灯从下往上打亮
    const pos = P(lerp(1.6, 1.3, p), 1.28, lerp(1.7, 1.4, p));
    return { pos, look: P(0.36, 1.5, -1.6), lens: lerp(45, 52, p), near: 0.05, far: 60 };
  });
  // C4c 章北海的脸（暖意稍纵即逝）
  R("c4c-zhang", 25.4, 28.6, (lt, p) => {
    const pos = P(lerp(1.4, 1.25, p), 1.66, lerp(1.7, 1.8, p));
    return { pos, look: P(2.85, 1.64, -1.15), lens: 50, near: 0.05, far: 60 };
  });

  // ------------------------------------------------------------------
  // C5 茶与“您是军人吧”
  // ------------------------------------------------------------------
  R("c5a-pour", 28.6, 31.4, (lt, p) => {
    const pos = P(-1.4, 1.5, lerp(1.3, 1.15, p));
    return { pos, look: P(0.4, 1.3, -1.6), lens: 34, near: 0.05, far: 60 };
  });
  R("c5b-cup", 31.4, 33.2, (lt, p) => {
    const pos = P(-1.5, 1.6, -1.75);
    return { pos, look: P(0.65, 1.52, -0.02), lens: 32, near: 0.05, far: 60 };
  });
  R("c5c-profile", 33.2, 36.6, (lt, p) => {
    const pos = P(lerp(-2.6, -2.35, p), 1.5, -0.95);
    return { pos, look: P(0.42, 1.42, -0.95), lens: 28, near: 0.05, far: 60 };
  });

  // ------------------------------------------------------------------
  // C6 “外星世界”与茶杯
  // ------------------------------------------------------------------
  R("c6a-ask", 36.6, 38.4, (lt, p) => {
    const pos = P(-1.5, 1.6, -1.75);
    return { pos, look: P(0.65, 1.58, -0.02), lens: 42, near: 0.05, far: 60 };
  });
  R("c6b-explain", 38.4, 42.0, (lt, p) => {
    const pos = P(lerp(2.7, 2.55, p), 1.58, lerp(1.9, 1.7, p));
    return { pos, look: P(0.36, 1.55, -1.6), lens: lerp(40, 46, p), near: 0.05, far: 60 };
  });
  // “地球就是一块大陨石。我手里的茶杯，也是。”——同一个镜头里，他把杯子抬到胸前；缓缓推近，脸与杯子同框
  // （方块人的手是 22 厘米宽的大方块，杯子特写只会看到一只巨拳；所以宁可用中近景让“手举杯”读得清楚）
  R("c6c-cup", 42.0, 46.8, (lt, p) => {
    const k = smooth(p);
    const pos = P(lerp(-1.5, -1.05, k), 1.6, lerp(-1.75, -1.3, k));
    return { pos, look: P(lerp(0.65, 0.85, k), lerp(1.58, 1.42, k), -0.02), lens: lerp(36, 46, k), near: 0.05, far: 60 };
  });
  R("c6d-laugh", 46.8, 50.6, (lt, p) => {
    const pos = P(lerp(2.7, 2.55, p), 1.6, lerp(1.7, 1.55, p));
    return { pos, look: P(0.36, 1.6, -1.72), lens: 42, near: 0.05, far: 60 };
  });

  // ------------------------------------------------------------------
  // C7 火星陨石
  // ------------------------------------------------------------------
  R("c7a-walk", 50.6, 53.0, (lt, p) => {
    const pos = P(lerp(-0.4, -0.7, p), 1.42, 2.3);
    return { pos, look: P(lerp(-0.8, -1.5, p), 1.25, -0.9), lens: 28, near: 0.05, far: 60 };
  });
  R("c7b-safe", 53.0, 55.0, (lt, p) => {
    const pos = P(lerp(-0.4, -0.7, p), 1.5, 1.85);
    return { pos, look: P(-2.4, 0.95, 0.0), lens: 28, near: 0.05, far: 60 };
  });
  R("c7c-peek", 55.0, 57.4, (lt, p) => {
    const pos = P(-1.85, 1.5, 0.95);
    return { pos, look: P(-0.5, 1.28, -0.5), lens: 30, near: 0.05, far: 60 };
  });
  // C7d 显微镜下：圆形视野里，火星陨石表面那些小圆坑
  shots.push(
    makeShot(ctx, {
      id: "c7d-micro", start: t0 + 57.4, dur: 4.6, world: micro,
      update: (t) => W.setMicro(t - t0),
      cam: (lt, p) => {
        const dist = lerp(2.6, 1.2, smooth(p));
        return { pos: P(0, dist, 0.001), look: P(0, 0, 0), lens: 50, near: 0.02, far: 20 };
      },
      exposure: 1.0, vignette: 0.2, grain: 0.7,
      fx: (lt, p, o) => {
        o.scope = smooth(seg(lt, 0, 0.3));
        o.reticle = 0;
        o.hud = "X40";
      },
    }),
  );
  R("c7e-proud", 62.0, 64.4, (lt, p) => {
    const pos = P(lerp(2.6, 2.45, p), 1.62, 1.6);
    return { pos, look: P(0.0, 1.6, -1.72), lens: 42, near: 0.05, far: 60 };
  });

  // ------------------------------------------------------------------
  // C8 “要比重大、不易碎、能上车床”→ 铁陨石
  // ------------------------------------------------------------------
  R("c8a-request", 64.4, 68.2, (lt, p) => {
    const pos = P(lerp(-1.6, -1.45, p), 1.6, -1.75);
    return { pos, look: P(0.35, 1.58, -0.02), lens: lerp(38, 46, p), near: 0.05, far: 60 };
  });
  R("c8b-cabinet", 68.2, 70.6, (lt, p) => {
    // 侧前方看他转身、打开后墙柜
    const pos = P(lerp(2.1, 1.8, p), 1.55, lerp(-0.5, -0.7, p));
    return { pos, look: P(0.3, 1.5, -1.95), lens: 28, near: 0.05, far: 60 };
  });
  R("c8c-bench", 70.6, 73.0, (lt, p) => {
    // 桌面上三块铁陨石并排，台灯的暖光
    const pos = P(lerp(1.4, 1.2, p), 1.28, lerp(0.4, 0.3, p));
    return { pos, look: P(0.32, 0.98, -0.8), lens: 28, near: 0.05, far: 60 };
  });

  // ------------------------------------------------------------------
  // C9 价格、付款、“对要送的人的尊重”
  // ------------------------------------------------------------------
  R("c9a-three", 73.0, 75.2, (lt, p) => {
    const pos = P(-1.55, 1.6, -1.75);
    return { pos, look: P(0.32, 1.58, -0.02), lens: 42, near: 0.05, far: 60 };
  });
  R("c9b-price", 75.2, 77.4, (lt, p) => {
    const pos = P(2.7, 1.6, 1.6);
    return { pos, look: P(0.3, 1.58, -1.72), lens: 42, near: 0.05, far: 60 };
  });
  R("c9c-phone", 77.4, 80.0, (lt, p) => {
    // 手机屏幕的二维码（屏幕朝向收藏者一侧）
    const h = hand(W.zhangR, [0, 0.02, 0]);
    return { pos: [h[0] + 0.2, h[1] + 0.1, h[2] - 0.95], look: [h[0], h[1] + 0.02, h[2]], lens: 32, near: 0.05, far: 60 };
  });
  R("c9d-awkward", 80.0, 83.0, (lt, p) => {
    const pos = P(lerp(2.5, 2.3, p), 1.62, lerp(1.7, 1.5, p));
    return { pos, look: P(0.36, 1.66, -1.72), lens: lerp(50, 60, p), near: 0.05, far: 60 };
  });
  R("c9e-respect", 83.0, 87.0, (lt, p) => {
    // 缓推，停在他脸上
    const pos = P(lerp(-1.45, -0.95, smooth(p)), 1.64, lerp(-1.78, -1.68, p));
    return { pos, look: P(0.25, 1.66, -0.02), lens: 55, near: 0.05, far: 60 };
  });
  R("c9f-leave", 87.0, DUR.courtyard, (lt, p) => {
    // 从室内看门口：他拎着布包走向夕阳，收藏者在身后挥手
    const pos = P(lerp(-0.5, -0.8, p), 1.5, lerp(-1.3, -1.1, p));
    return { pos, look: P(3.3, 1.3, 1.5), lens: 30, near: 0.05, far: 60 };
  }, { fadeOut: 0.9 });

  return shots;
}
