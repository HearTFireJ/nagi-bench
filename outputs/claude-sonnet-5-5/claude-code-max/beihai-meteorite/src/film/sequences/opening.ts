// 序：日落前（0–26s）。太空，章北海悬浮，等待日落。
// 叙事钩子：他在等什么？——先给一幅“渺小 + 壮阔”的画面和一句关于孤独的独白，再倒叙回到胡同。
import type { Shot } from "@agentbench/cinematic-player";
import type { FilmContext } from "../types";
import { makeShot, handheld, addV, type V3 } from "../shotkit";
import { DEG, seg, smooth, lerp } from "../../util/math";
import { DUR, openTau } from "../timing";
import type { SpaceWorld } from "../../world/space/spaceworld";
import { STATION } from "../../world/space/geometry";

const azDir = (az: number): V3 => [Math.sin(az * DEG), 0, -Math.cos(az * DEG)];
const rightDir = (az: number): V3 => [Math.cos(az * DEG), 0, Math.sin(az * DEG)];
const mul = (v: V3, k: number): V3 => [v[0] * k, v[1] * k, v[2] * k];

export function buildOpening(ctx: FilmContext, space: SpaceWorld, t0: number): Shot<FilmContext>[] {
  const S = (lt: number) => openTau(t0 + lt);
  const shots: Shot<FilmContext>[] = [];

  // O1：Rückenfigur —— 一个白色的小人悬在地球弧线与将落的太阳之前
  shots.push(
    makeShot(ctx, {
      id: "open-1-wide", start: t0, dur: 9, world: space,
      update: (t) => {
        space.setTau(openTau(t));
        space.ambient.intensity = 1.5;
        space.setScopeHidden(false);
      },
      cam: (lt, p) => {
        const az = -44;
        const dist = lerp(25, 15, smooth(p));
        const pos = addV(addV(mul(azDir(az), -dist), mul(rightDir(az), lerp(4.4, 3.2, p))), [0, lerp(1.6, 0.6, p), 0]);
        const look = addV(addV(pos, mul(azDir(az), 100)), [0, lerp(-1.0, 1.0, p), 0]);
        const hh = handheld(lt, 0.012, 0.6);
        return { pos: addV(pos, hh), look, lens: lerp(40, 46, p), near: 0.2, far: 150000 };
      },
      exposure: 1.0,
      vignette: 0.55,
    }),
  );

  // O2：面部特写 —— 太阳在他面前的方向，暖光打在面罩后的脸上
  shots.push(
    makeShot(ctx, {
      id: "open-2-face", start: t0 + 9, dur: 5.2, world: space,
      update: (t) => {
        space.setTau(openTau(t));
        space.ambient.intensity = 0.32;
        space.setScopeHidden(false);
      },
      cam: (lt, p) => {
        const az = -40;
        const c: V3 = [0, 1.66, 0];
        const dist = lerp(4.2, 3.2, smooth(p));
        const pos = addV(addV(c, mul(azDir(az), dist)), addV(mul(rightDir(az), lerp(0.55, 0.28, p)), [0, lerp(0.1, 0.0, p), 0]));
        return { pos: addV(pos, handheld(lt, 0.006, 0.7)), look: addV(c, [0, -0.02, 0]), lens: 85, near: 0.05, far: 150000 };
      },
      exposure: 0.62,
      vignette: 0.6,
    }),
  );

  // O3：瞄准镜里的黄河站 —— 一个圆形的小世界，气闸门紧闭
  shots.push(
    makeShot(ctx, {
      id: "open-3-scope", start: t0 + 14.2, dur: 5.8, world: space,
      update: (t) => {
        space.setTau(openTau(t));
        space.ambient.intensity = 0.55;
        space.setScopeHidden(true);
      },
      cam: (lt, p) => {
        const eye = space.eyeAt(openTau(t0 + 14.2 + lt));
        const sway = handheld(lt, 0.9, 0.5);
        const target: V3 = [STATION.x, STATION.y + 6, STATION.z];
        const look = addV(target, [sway[0] * 0.5, sway[1] * 0.5, sway[2] * 0.5]);
        return { pos: [eye.x, eye.y, eye.z], look, lens: lerp(420, 560, smooth(p)), near: 100, far: 150000 };
      },
      exposure: 1.0,
      vignette: 0.3,
      fx: (lt, p, o) => {
        o.scope = smooth(seg(lt, 0, 0.35));
        o.hud = "RNG 5012 M";
        o.reticleX = Math.sin(lt * 1.3) * 0.004;
        o.reticleY = Math.sin(lt * 1.1 + 1) * 0.004;
        o.vignette = 0.2;
      },
    }),
  );

  // O4：日落 —— 太阳的下缘触到地球的边缘，切黑
  shots.push(
    makeShot(ctx, {
      id: "open-4-touch", start: t0 + 20, dur: DUR.open - 20, world: space,
      update: (t) => {
        space.setTau(openTau(t));
        space.ambient.intensity = 1.4;
        space.setScopeHidden(false);
      },
      cam: (lt, p) => {
        const az = -44;
        const dist = lerp(20, 12, smooth(p));
        const pos = addV(addV(mul(azDir(az), -dist), mul(rightDir(az), lerp(3.6, 3.0, p))), [0, lerp(0.9, 0.7, p), 0]);
        const look = addV(addV(pos, mul(azDir(az), 100)), [0, lerp(-0.7, -0.6, p), 0]);
        return { pos: addV(pos, handheld(lt, 0.008, 0.6)), look, lens: lerp(38, 50, p), near: 0.2, far: 150000 };
      },
      exposure: 1.0,
      vignette: 0.55,
      fadeOut: 0.5,
    }),
  );
  void S;
  return shots;
}
