// 第三幕：太空主戏（τ = 0..152）。日落，合影，三十发子弹，十秒的等待，一场“陨石雨”。
// 语言：宽阔而寂静的构图 + 瞄准镜圆形视野；开枪段用快切；命中段回到无声。
import * as THREE from "three";
import type { Shot } from "@agentbench/cinematic-player";
import type { FilmContext } from "../types";
import { makeShot, handheld, addV, type V3, type CamPose } from "../shotkit";
import { smooth, lerp, seg, pulse, DEG } from "../../util/math";
import { DUR } from "../timing";
import type { SpaceWorld } from "../../world/space/spaceworld";
import type { BaseWorlds } from "../../world/base/base";
import { SHOTS, SHUTTER_T } from "../../world/space/schedule";
import { GROUP_CENTER, WALL_N, STATION, HATCH } from "../../world/space/geometry";

const V = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
const azDir = (az: number): V3 => [Math.sin(az * DEG), 0, -Math.cos(az * DEG)];
const rightDir = (az: number): V3 => [Math.cos(az * DEG), 0, Math.sin(az * DEG)];
const mul = (v: V3, k: number): V3 => [v[0] * k, v[1] * k, v[2] * k];
const tmpV = new THREE.Vector3();
/** 三位目标在队伍局部坐标里的横向位置（前排第 3/4/5 位）*/
const X_ENG = -0.86;
const X_GEN = 0.86;
const X_DES = 2.58;

export function buildSpaceAct(ctx: FilmContext, S: SpaceWorld, t0: number, B: BaseWorlds | null = null): Shot<FilmContext>[] {
  const shots: Shot<FilmContext>[] = [];
  const tau = (t: number) => t - t0;

  /** 世界坐标：队伍局部 (x 横向, y 竖直, z 朝章北海) */
  const G = (x: number, y: number, z: number): V3 => {
    const r = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), WALL_N).normalize();
    tmpV.copy(GROUP_CENTER).addScaledVector(r, x).addScaledVector(WALL_N, z);
    return [tmpV.x, tmpV.y + y, tmpV.z];
  };

  interface Common { ambient?: number; fill?: number; exposure?: number; vignette?: number; grain?: number; fadeIn?: number; fadeOut?: number; hideScope?: boolean }

  const add = (id: string, a: number, b: number, cam: (lt: number, p: number, tau: number) => CamPose, o: Common = {}, fx?: (lt: number, p: number, o2: import("../types").OverlayState, tau: number) => void) =>
    shots.push(
      makeShot(ctx, {
        id, start: t0 + a, dur: b - a, world: S,
        update: (t) => {
          S.setTau(tau(t));
          S.ambient.intensity = o.ambient ?? 0.55;
          S.camFill.intensity = o.fill ?? 0.5;
          S.setScopeHidden(o.hideScope ?? false);
        },
        cam: (lt, p) => cam(lt, p, tau(t0 + a + lt)),
        exposure: o.exposure ?? 1.0,
        vignette: o.vignette ?? 0.5,
        grain: o.grain ?? 0.5,
        fadeIn: o.fadeIn,
        fadeOut: o.fadeOut,
        fx: fx ? (lt, p, ov) => fx(lt, p, ov, tau(t0 + a + lt)) : undefined,
      }),
    );

  /** 瞄准镜视野：相机在他眼睛处，朝目标看，圆形遮罩 + 十字线 + HUD */
  const scope = (
    id: string, a: number, b: number, target: (lt: number, p: number, tau: number) => V3, lens: (lt: number, p: number) => number,
    o: Common & { hud?: string; sway?: number; recoil?: boolean; flash?: boolean; shutter?: boolean } = {},
  ) =>
    add(id, a, b, (lt, p, ta) => {
      const eye = S.eyeAt(ta);
      const sw = o.sway ?? 1;
      const L = lens(lt, p);
      // 手抖的幅度要按“视野高度”缩放：视野越窄（放大越多），同样的角度抖动对应的米数越小
      const frameH = (5000 * 15.32) / L;
      const h = handheld(lt, frameH * 0.03 * sw, 0.45);
      const tg = target(lt, p, ta);
      return { pos: [eye.x, eye.y, eye.z], look: [tg[0] + h[0], tg[1] + h[1] * 0.6, tg[2] + h[2]], lens: L, near: 100, far: 150000 };
    }, { ambient: 0.4, exposure: 0.8, vignette: 0.25, hideScope: true, ...o }, (lt, p, ov, ta) => {
      ov.scope = smooth(seg(lt, 0, 0.3));
      ov.hud = o.hud ?? "RNG 5012 M";
      const sw = o.sway ?? 1;
      ov.reticleX = Math.sin(ta * 1.3) * 0.004 * sw;
      ov.reticleY = Math.sin(ta * 1.1 + 1) * 0.004 * sw;
      // 快门：摄影师按下的一瞬间——白光一闪（合影被定格成最后一张照片），随后是第一发命中
      if (o.shutter) {
        const f = pulse(ta, SHUTTER_T, 0.006, 0.3);
        ov.flash = Math.max(ov.flash, Math.min(1, f * 1.15));
        ov.flashColor = 0xffffff;
      }
      if (o.recoil) {
        let k = 0;
        for (const s of SHOTS) k += pulse(ta, s.t, 0.01, 0.1);
        ov.reticleY += k * 0.03;
        if (o.flash) {
          let f = 0;
          for (const s of SHOTS) f += pulse(ta, s.t, 0.004, 0.02);
          ov.flash = Math.min(0.28, f * 0.3);
          ov.flashColor = 0xffe0a0;
        }
      }
    });

  /** 以章北海“面朝方向”为参照的手部机位：前 df 米、右 dr 米、上 du 米，看向那只手 */
  const handCam = (ta: number, side: "R" | "L", df: number, dr: number, du: number, lens: number): CamPose => {
    S.zhang.figure.anchors[side === "R" ? "handR" : "handL"].getWorldPosition(tmpV);
    const h = [tmpV.x, tmpV.y, tmpV.z] as V3;
    const az = S.azAt(ta);
    const f = azDir(az), r = rightDir(az);
    return {
      pos: [h[0] + f[0] * df + r[0] * dr, h[1] + du, h[2] + f[2] * df + r[2] * dr],
      look: [h[0], h[1] + 0.02, h[2]], lens, near: 0.05, far: 150000,
    };
  };

  // 便捷：章北海背后的宽景（Rückenfigur），朝方位 az
  const behind = (az: number, dist: number, right: number, up: number, lookUp = 0, zPos: V3 = [0, 0, 0]): { pos: V3; look: V3 } => {
    const pos = addV(addV(addV(zPos, mul(azDir(az), -dist)), mul(rightDir(az), right)), [0, up, 0]);
    const look = addV(addV(pos, mul(azDir(az), 100)), [0, lookUp, 0]);
    return { pos, look };
  };

  // ------------------------------------------------------------------
  // A1 太阳触到了地球（呼应序）——“会开完了，他们会出来合影”
  // ------------------------------------------------------------------
  add("s-a1-echo", 0, 5.2, (lt, p) => {
    const b = behind(-44, lerp(12, 9, smooth(p)), lerp(3.0, 2.6, p), lerp(0.7, 0.4, p), lerp(-0.6, -0.3, p));
    return { pos: addV(b.pos, handheld(lt, 0.006, 0.6)), look: b.look, lens: lerp(50, 58, p), near: 0.2, far: 150000 };
  }, { ambient: 1.4, vignette: 0.55 });

  // A2 瞄准镜里的黄河站（气闸紧闭）
  scope("s-a2-station", 5.2, 9.6, (lt, p) => [STATION.x, STATION.y + 4, STATION.z], (lt, p) => lerp(480, 640, smooth(p)), { sway: 1 });

  // A3 他扭头看太阳：一半沉下去了，像戴在地球上的戒指
  add("s-a3-ring", 9.6, 13.6, (lt, p) => {
    const b = behind(-44, lerp(8, 6.5, smooth(p)), lerp(1.3, 0.9, p), 0.35, lerp(-0.2, 0.2, p));
    return { pos: addV(b.pos, handheld(lt, 0.006, 0.6)), look: b.look, lens: lerp(58, 70, p), near: 0.2, far: 150000 };
  }, { ambient: 1.2, exposure: 0.95 });

  // A4 空旷：一号基地只是远方深渊里一个没有形状的点
  add("s-a4-void", 13.6, 17.8, (lt, p) => {
    const z = S.zhangPosAt(tau(t0 + 13.6 + lt));
    const b = behind(-72, lerp(14, 11, smooth(p)), 3.0, 0.8, lerp(-0.5, -1.0, p), V(z));
    return { pos: addV(b.pos, handheld(lt, 0.006, 0.6)), look: b.look, lens: 32, near: 0.2, far: 250000 };
  }, { ambient: 1.3, exposure: 1.0 });

  // ------------------------------------------------------------------
  // A5 气闸：红灯变绿，门滑开
  // ------------------------------------------------------------------
  scope("s-a5-hatch", 17.8, 24.0, (lt, p) => addV(V(HATCH), [0, 3, 0]), (lt, p) => lerp(3200, 6000, smooth(p)), { sway: 0.8 });

  // A6 一串白色的身影鱼贯而出（瞄准镜）
  scope("s-a6-emerge", 24.0, 31.0, (lt, p) => {
    const h = V(HATCH);
    const w = WALL_N;
    return [h[0] + w.x * lerp(6, 16, p), h[1] + lerp(0.5, 1.5, p), h[2] + w.z * lerp(6, 16, p)];
  }, (lt, p) => lerp(4200, 3600, p), { sway: 0.9 });

  // A7 人的尺度：摄影师视角，队伍在外壁前排开
  add("s-a7-form", 31.0, 38.0, (lt, p) => {
    const pos = G(lerp(-14, -8, smooth(p)), lerp(2.6, 2.2, p), lerp(30, 27, p));
    return { pos, look: G(0, 3.0, 0), lens: 30, near: 0.2, far: 100000 };
  }, { ambient: 0.9 });

  // A8 瞄准镜里看队伍（阴影在外壁上越拉越长）
  scope("s-a8-rows", 38.0, 46.0, (lt, p) => G(lerp(1.5, -1.0, smooth(p)), lerp(1.6, 1.3, p), 0), (lt, p) => lerp(7000, 9000, smooth(p)), { sway: 1.1 });

  // ------------------------------------------------------------------
  // A9 揭面：面罩由金色转透明，露出一张张脸
  // ------------------------------------------------------------------
  add("s-a9-wide", 46.0, 51.0, (lt, p) => {
    const pos = G(lerp(6, 10, smooth(p)), lerp(2.4, 3.2, p), lerp(26, 24, p));
    return { pos, look: G(0, 3.2, 0), lens: 32, near: 0.2, far: 100000 };
  }, { ambient: 0.8, exposure: 1.0 });
  scope("s-a9-faces1", 51.0, 54.6, (lt, p) => G(lerp(-6.0, -1.6, smooth(p)), 1.55, 0), (lt, p) => 30000, { sway: 1.2 });
  scope("s-a9-general", 54.6, 58.2, (lt, p) => G(X_GEN, 1.55, 0), (lt, p) => lerp(70000, 60000, smooth(p)), { sway: 1.4 });
  scope("s-a9-others", 58.2, 62.0, (lt, p) => G(lerp(X_ENG, X_DES, smooth(p)), 1.55, 0), (lt, p) => 32000, { sway: 1.2 });

  // ------------------------------------------------------------------
  // A10 摘手套、取枪、装镜：反复演练过的动作
  // ------------------------------------------------------------------
  add("s-a10-glove", 62.0, 66.5, (lt, p, ta) => {
    // 章北海面前，逆着落日：轮廓光 + 蓝色地球光
    const face = 100;
    const pos = addV(addV(mul(azDir(face), 5.2), mul(rightDir(face), lerp(-1.4, -0.6, p))), [0, 1.25, 0]);
    return { pos, look: [0, 1.05, 0], lens: 40, near: 0.1, far: 150000 };
  }, { ambient: 0.45, exposure: 1.05, hideScope: false });
  add("s-a10-hand", 66.5, 70.0, (lt, p, ta) => handCam(ta, "R", lerp(2.2, 1.8, p), lerp(1.2, 0.9, p), 0.5, 34), { ambient: 0.9, exposure: 1.05, hideScope: false });
  add("s-a10-mount", 70.0, 76.0, (lt, p, ta) => handCam(ta, "R", lerp(1.5, 1.2, p), 0.55, 0.3, 28), { ambient: 0.9, exposure: 1.05, hideScope: false });

  // ------------------------------------------------------------------
  // A11 瞄准：在地球上，最好的狙击枪也打不到五千米
  // ------------------------------------------------------------------
  add("s-a11-raise", 76.0, 82.0, (lt, p, ta) => {
    const face = 100;
    const b = behind(face, lerp(5.5, 3.8, smooth(p)), lerp(1.7, 1.2, p), 0.6, 0.4, [0, 0, 0]);
    return { pos: addV(b.pos, handheld(lt, 0.005, 0.6)), look: [0, 1.5, 0], lens: 34, near: 0.1, far: 150000 };
  }, { ambient: 0.5, exposure: 1.0 });
  scope("s-a11-sweep", 82.0, 90.0, (lt, p) => G(lerp(3.4, X_GEN, smooth(p)), 1.55, 0), (lt, p) => lerp(30000, 48000, smooth(p)), { sway: 1.3 });
  add("s-a11-eye", 90.0, 94.0, (lt, p, ta) => {
    // 特写：他瞄准的那只眼睛（面罩后面，一只眼闭着）
    const face = 100;
    const pos = addV(addV(mul(azDir(face), 2.6), mul(rightDir(face), -0.35)), [0, 1.66, 0]);
    return { pos: addV(pos, handheld(lt, 0.004, 0.6)), look: [0, 1.66, 0], lens: 70, near: 0.05, far: 150000 };
  }, { ambient: 1.2, fill: 1.0, exposure: 1.05, hideScope: false });
  scope("s-a11-wait", 94.0, 98.0, (lt, p) => G(X_GEN, 1.55, 0), () => 48000, { sway: 0.5, hud: "RNG 5012 M" });

  // ------------------------------------------------------------------
  // A13 开枪：三十次枪口火花，寂静里只有手臂里传来的闷震
  // ------------------------------------------------------------------
  add("s-a13-fire-a", 98.0, 100.6, (lt, p, ta) => {
    const b = behind(100, 6.0, 1.8, 0.7, 0.35);
    return { pos: addV(b.pos, handheld(lt, 0.004, 0.5)), look: [0.3, 1.5, 0], lens: 32, near: 0.1, far: 150000 };
  }, { ambient: 0.45 });
  scope("s-a13-scope-a", 100.6, 102.4, (lt, p) => G(X_ENG, 1.55, 0), () => 30000, { sway: 0.4, recoil: true, flash: true });
  add("s-a13-front", 102.4, 104.6, (lt, p, ta) => {
    // 迎着枪口：从他前方 4 米看他——每一次开枪，面罩里亮起一次
    const pos = addV(addV(mul(azDir(100), 4.2), mul(rightDir(100), lerp(-0.7, -1.4, p))), [0, 1.5, 0]);
    return { pos, look: [0, 1.55, 0], lens: 40, near: 0.05, far: 150000 };
  }, { ambient: 0.9, fill: 0.9, exposure: 1.0, hideScope: false });
  scope("s-a13-scope-b", 104.6, 106.0, (lt, p) => G(X_DES, 1.55, 0), () => 30000, { sway: 0.4, recoil: true, flash: true });
  // 弹夹打空：手枪特写
  add("s-a13-empty", 106.0, 108.0, (lt, p, ta) => handCam(ta, "R", 1.3, 0.5, 0.15, 32), { ambient: 0.8, hideScope: false });

  // ------------------------------------------------------------------
  // A15 十秒之后：快门 —— 陨石雨
  // ------------------------------------------------------------------
  scope("s-a15-shutter", 108.0, 110.6, (lt, p, ta) => G(X_GEN, 1.55, 0), (lt, p) => 30000, { sway: 0.3, shutter: true });
  scope("s-a15-general", 110.6, 113.0, (lt, p) => G(X_GEN + 0.3 * lt, 1.5, 0.6 * lt), () => 30000, { sway: 0.2 });
  add("s-a15-panic", 113.0, 117.2, (lt, p, ta) => {
    const pos = G(lerp(-12, -6, smooth(p)), lerp(3.4, 3.0, p), lerp(26, 22, p));
    return { pos, look: G(0, 3.0, 2), lens: 30, near: 0.2, far: 100000 };
  }, { ambient: 0.8 });

  // ------------------------------------------------------------------
  // A16 撤退：白色的尾迹，拖着伤者，冰晶像一场雪
  // ------------------------------------------------------------------
  add("s-a16-retreat", 117.2, 124.0, (lt, p, ta) => {
    const pos = G(lerp(10, 16, smooth(p)), lerp(4.5, 5.5, p), lerp(34, 30, p));
    return { pos, look: G(lerp(0, -2, p), 3.0, lerp(0, -12, p)), lens: 26, near: 0.2, far: 100000 };
  }, { ambient: 0.8 });
  add("s-a16-ice", 124.0, 131.0, (lt, p, ta) => {
    const b = behind(100, lerp(11, 8, smooth(p)), lerp(2.2, 1.6, p), 0.5, lerp(0.0, 0.2, p));
    return { pos: addV(b.pos, handheld(lt, 0.005, 0.6)), look: b.look, lens: 50, near: 0.2, far: 150000 };
  }, { ambient: 0.9 });

  // ------------------------------------------------------------------
  // A17 尾声：他知道这不能保证什么，但他做了他能做的。然后——父亲的目光。
  // ------------------------------------------------------------------
  // 平静的脸：闭上眼，嘴角只动了一点点。镜头贴着他的朝向，不做任何多余的动作
  add("s-a17-face", 131.0, 134.6, (lt, p, ta) => {
    const pos = addV(addV(mul(azDir(100), lerp(3.9, 3.3, smooth(p))), mul(rightDir(100), lerp(-0.7, -0.4, p))), [0, 1.66, 0]);
    return { pos: addV(pos, handheld(lt, 0.004, 0.6)), look: [0, 1.68, 0], lens: lerp(62, 74, smooth(p)), near: 0.05, far: 150000 };
  }, { ambient: 1.5, fill: 1.3, exposure: 1.05, hideScope: false });
  // 他转身离开：镜头留在原地，他缩成一个点，朝一号基地那一点微光飞去
  add("s-a17-leave", 134.6, 139.2, (lt, p, ta) => {
    const z = S.zhangPosAt(ta);
    const pos: V3 = addV(mul(azDir(100), 9), [0, 1.3, 0]);
    return { pos, look: [z.x, z.y + 1.0, z.z], lens: lerp(34, 46, smooth(p)), near: 0.2, far: 250000 };
  }, { ambient: 0.7, exposure: 1.0 });
  // 家：空无一人的舱室——父亲的照片在舷窗前，落日的最后一线光。慢慢拉开，淡出
  if (B) {
    shots.push(
      makeShot(ctx, {
        id: "s-a17-home", start: t0 + 139.2, dur: DUR.space - 139.2, world: B.cabin,
        update: (t) => {
          S.setTau(tau(t));
          B.setCabinEmpty(t - (t0 + 139.2));
        },
        cam: (lt, p) => {
          const k = smooth(seg(p, 0.22, 0.85));
          const pos: V3 = [lerp(0.9, 1.42, k), lerp(1.5, 1.22, k), lerp(-0.9, 0.85, k)];
          const look: V3 = [lerp(0.7, 0.78, k), lerp(1.5, 1.02, k), lerp(-1.512, -1.1, k)];
          return { pos: addV(pos, handheld(lt, 0.002, 0.4)), look, lens: lerp(44, 19, k), near: 0.03, far: 40 };
        },
        exposure: 1.0, vignette: 0.6, tint: [0x0a1a2a, 0.06], fadeOut: 1.8,
      }),
    );
  }

  return shots;
}
