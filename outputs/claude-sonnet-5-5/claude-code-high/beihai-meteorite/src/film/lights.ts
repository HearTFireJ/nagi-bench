import * as THREE from "three";
import { seg, smooth, mix, type V3 } from "../blocks";
import { bulbPos } from "../sets/basement";
import { tubeLevel } from "../sets/shop";
import { sunState } from "../sets/space";
import { CABIN } from "../sets/cabin";
import { T } from "../timing";
import type { Ctx } from "./core";
import { inFlashback, SHOTS, K, type SpaceRuntime } from "./act3";
import { shotKick } from "./act2";
import type { Loc } from "../world";

const sm = (t: number, a: number, b: number) => smooth(seg(t, a, b));

export function applyLights(ctx: Ctx, loc: Loc, t: number, rt: SpaceRuntime): void {
  const rig = ctx.rig;
  switch (loc) {
    case "alley": {
      const fl = 1 + Math.sin(t * 3.7) * 0.06;
      rig.configure({
        bg: 0x352c48,
        fog: [0x352c48, 16, 72],
        hemi: [0x98a0c0, 0x3a3230, 1.5],
        key: { pos: [-11, 7, 9], target: [0, 0, -6], color: 0xffe0c8, i: 1.2, size: 16, far: 60 },
        points: [
          { pos: [-2.6, 2.4, -10.1], color: 0xff5a30, i: 15 * fl, distance: 9 },
          { pos: [-2.6, 2.4, -6.3], color: 0xff5a30, i: 15 * fl, distance: 9 },
          { pos: [-2.0, 1.4, -8.2], color: 0xff9a60, i: 3, distance: 6 },
        ],
        exposure: 1.0,
      });
      break;
    }
    case "house": {
      const door = sm(t, T.doorOpen0, T.doorOpen1);
      rig.configure({
        bg: 0x0a0908,
        hemi: [0x9a8a78, 0x2c2218, 0.85],
        spot: { pos: [-1.66, 1.26, -0.6], target: [-1.5, 0.9, -0.45], color: 0xffe0a8, i: 1.4, angle: 1.0, penumbra: 0.7, distance: 7 },
        points: [
          { pos: [-0.5, 2.7, -3.3], color: 0xdcecff, i: 22, distance: 9 },
          { pos: [-3.7, 2.7, -0.8], color: 0xdcecff, i: 18, distance: 9 },
          { pos: [0.0, 2.3, 1.4], color: 0xffe0b8, i: 10, distance: 9 },
          { pos: [0.2, 1.7, 6.4], color: 0xffc890, i: 9 + 8 * door, distance: 14 },
        ],
      });
      break;
    }
    case "shop": {
      const v = tubeLevel(t);
      const dark = 1 - v;
      rig.configure({
        bg: 0x080a10,
        hemi: [0x7a8cb8, 0x2a2c34, 0.6 + 0.3 * v],
        points: [
          { pos: [0, 4.4, -3.4], color: 0xdfeaff, i: 90 * v, distance: 16 },
          { pos: [0, 4.4, 0.4], color: 0xdfeaff, i: 90 * v, distance: 16 },
          { pos: [0, 4.4, 3.6], color: 0xdfeaff, i: 70 * v, distance: 16 },
          { pos: [1.2, 1.8, 0.0], color: 0x59e0a0, i: 1.4 * (0.4 + 0.6 * dark), distance: 4 },
        ],
      });
      break;
    }
    case "basement": {
      const bp = bulbPos(t);
      const kick = shotKick(t, T.bShots, 0.05);
      const open = sm(t, T.bDoor - 0.2, T.bDoor + 0.8) * (1 - sm(t, T.bExit0 + 0.6, T.bExit1));
      const flick = 1 + Math.sin(t * 23) * 0.03 + Math.sin(t * 7.1) * 0.03;
      const mz = ctx.basement.muzzle;
      rig.configure({
        bg: 0x040404,
        hemi: [0x7a7a88, 0x2a2a32, 0.5],
        points: [
          { pos: bp, color: 0xffe2a8, i: 11 * flick, distance: 10 },
          { pos: [mz[0], mz[1], mz[2]], color: 0xffd9a0, i: 110 * Math.min(1, kick), distance: 9 },
          { pos: [1.9, 1.7, 3.1], color: 0xf3ecd0, i: 18 * open, distance: 8 },
          { pos: [-1.6, 1.2, -1.4], color: 0xffb070, i: 16 * Math.min(1, kick), distance: 5 },
        ],
      });
      break;
    }
    case "cabin": {
      const fb = inFlashback(t);
      const day = t >= 216 && t < 229.5 && !fb;
      const blink = 0.5 + 0.5 * Math.max(0, Math.sin(t * 5));
      if (day) {
        rig.configure({
          bg: 0x000000,
          hemi: [0xdde6ee, 0x606870, 0.5],
          points: [
            { pos: [0, 2.5, 0.2], color: 0xf4f9ff, i: 14, distance: 9 },
            { pos: [0.8, 2.4, -1.5], color: 0xf4f9ff, i: 7, distance: 8 },
            { pos: [1.4, 1.2, 0.5], color: 0x40ff80, i: 0.03 * blink, distance: 2.4 },
          ],
        });
      } else {
        rig.configure({
          bg: 0x000000,
          hemi: [fb ? 0x9fb4e8 : 0x3a4a78, fb ? 0x40303a : 0x1a1214, fb ? 1.1 : 0.16],
          points: [
            { pos: [-1.3, 2.3, 0.0], color: 0xff3a24, i: fb ? 16 : 8, distance: 8 },
            { pos: [1.4, 1.2, 0.5], color: 0x40ff80, i: fb ? 0 : 0.03 * blink, distance: 2.4 },
            { pos: [0.0, 1.4, -2.0], color: 0x4a70ff, i: fb ? 6 : 2, distance: 6 },
          ],
        });
      }
      void CABIN;
      break;
    }
    case "space": {
      const ss = sunState(t);
      const d = ss.dir;
      const muz = rt.muzzle;
      let fl = 0;
      for (const s of SHOTS) if (t >= s && t < s + 0.075) fl = 1 - (t - s) / 0.075;
      const open = sm(t, K.hatchOpen0, K.hatchOpen1) - sm(t, K.hatchClose0, K.hatchClose1);
      const green = t >= K.hatchGreen && t < K.hatchClose0;
      const D = rt.D;
      const O = rt.O;
      const pro = t < 25;
      // a soft headlight that follows the camera, scaled so a close face is not blown out and a wide shot is not black
      const zh = ctx.cast.zhangS.fig.root.position;
      const dcam = Math.hypot(ctx.camera.position.x - zh.x, ctx.camera.position.y - zh.y, ctx.camera.position.z - zh.z);
      const head = Math.min(44, 1.1 * dcam * dcam + 1.2) * (t < 25 ? 1.2 : 1);
      rig.configure({
        bg: 0x000000,
        hemi: [pro ? 0x7a98d8 : 0x86a4ea, 0x2a2018, pro ? 0.95 : t < 246 ? 1.2 : t < 300 ? mix(0.9, 0.55, Math.min(1, (t - 246) / 20)) : 0.5],
        key: { pos: [d.x * 60, d.y * 60, d.z * 60], target: [0, 0, 0], color: ss.color, i: ss.intensity, shadow: false },
        points: [
          { pos: [muz.x, muz.y, muz.z], color: 0xffe2b0, i: 90 * fl, distance: 14 },
          { pos: [D[0] + O[0] * 4, D[1] + O[1] * 4, D[2] + O[2] * 4], color: green ? 0x66ff99 : open > 0.05 ? 0xffe2b0 : 0xff3a24, i: 40, distance: 30 },
          { pos: [ctx.camera.position.x, ctx.camera.position.y + 0.4, ctx.camera.position.z], color: 0xdfe8ff, i: head, distance: 16 },
          { pos: [rt.G[0] + (0 - rt.G[0]) * 0.18, rt.G[1] + 10, rt.G[2] + (0 - rt.G[2]) * 0.18], color: 0xbcd0ff, i: t >= 246 && t < 325 ? 900 : 0, distance: 90 },
        ],
      });
      break;
    }
  }
}

export type { V3 };
