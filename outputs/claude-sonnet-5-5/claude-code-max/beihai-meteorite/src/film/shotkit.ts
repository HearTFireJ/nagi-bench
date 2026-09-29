import type { Shot } from "@agentbench/cinematic-player";
import { DEG, clamp, lerp, smooth, easeInOut } from "../util/math";
import { defaultOverlay, type FilmContext, type OverlayState, type World } from "./types";

export type V3 = [number, number, number];

/** 相机姿态：lens 为等效焦距（毫米，以 36mm 片门宽度计），fov 会随画幅自动换算 */
export interface CamPose {
  pos: V3;
  look: V3;
  lens: number;
  roll?: number;
  near?: number;
  far?: number;
}

export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
export const addV = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const subV = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scaleV = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const lerpV = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const lenV = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const normV = (a: V3): V3 => {
  const l = lenV(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export function applyCam(ctx: FilmContext, p: CamPose): void {
  const cam = ctx.camera;
  cam.position.set(p.pos[0], p.pos[1], p.pos[2]);
  cam.up.set(0, 1, 0);
  cam.lookAt(p.look[0], p.look[1], p.look[2]);
  if (p.roll) cam.rotateZ(p.roll * DEG);
  const hfov = 2 * Math.atan(18 / p.lens);
  const vfov = 2 * Math.atan(Math.tan(hfov / 2) / cam.aspect);
  cam.fov = vfov / DEG;
  cam.near = p.near ?? 0.05;
  cam.far = p.far ?? 800;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}

/** 两个机位之间插值（焦距做对数插值，推拉变焦更自然） */
export function camLerp(a: CamPose, b: CamPose, t: number): CamPose {
  return {
    pos: lerpV(a.pos, b.pos, t),
    look: lerpV(a.look, b.look, t),
    lens: Math.exp(lerp(Math.log(a.lens), Math.log(b.lens), t)),
    roll: lerp(a.roll ?? 0, b.roll ?? 0, t),
    near: b.near ?? a.near,
    far: b.far ?? a.far,
  };
}

/** 手持微晃：确定性的多频正弦叠加 */
export function handheld(t: number, amp = 0.01, speed = 1): V3 {
  const s = t * speed;
  return [
    (Math.sin(s * 5.13 + 1.3) * 0.55 + Math.sin(s * 9.71 + 4.1) * 0.3 + Math.sin(s * 2.03) * 0.5) * amp,
    (Math.sin(s * 4.37 + 2.2) * 0.5 + Math.sin(s * 8.11 + 0.7) * 0.3 + Math.sin(s * 1.71 + 3) * 0.5) * amp,
    (Math.sin(s * 3.91 + 0.4) * 0.4 + Math.sin(s * 7.31 + 5.1) * 0.2) * amp,
  ];
}

export function polar(center: V3, radius: number, azimuthDeg: number, height = 0): V3 {
  const a = azimuthDeg * DEG;
  return [center[0] + Math.sin(a) * radius, center[1] + height, center[2] + Math.cos(a) * radius];
}

export interface ShotSpec {
  id: string;
  /** 绝对开始时间（秒） */
  start: number;
  dur: number;
  world: World;
  cam: (lt: number, p: number) => CamPose;
  exposure?: number | ((lt: number, p: number) => number);
  vignette?: number;
  grain?: number;
  tint?: [number, number];
  fadeIn?: number;
  fadeOut?: number;
  /** 起始/结束的过渡颜色：默认黑 */
  fadeColor?: number;
  /** 场景状态更新（绝对时间 t，局部时间 lt，进度 p） */
  update?: (t: number, lt: number, p: number) => void;
  /** 对叠层的自定义修改 */
  fx?: (lt: number, p: number, o: OverlayState) => void;
  enter?: () => void;
  leave?: () => void;
}

export function makeShot(ctx: FilmContext, s: ShotSpec): Shot<FilmContext> {
  const end = s.start + s.dur;
  return {
    id: s.id,
    start: s.start,
    end,
    enter: () => {
      ctx.world = s.world;
      s.world.enter?.();
      s.enter?.();
    },
    update: ({ time, localTime, progress }) => {
      ctx.world = s.world;
      const lt = localTime;
      const p = progress;
      // 先重置叠层，再让镜头描述覆盖
      const o = Object.assign(ctx.overlay, defaultOverlay());
      o.vignette = s.vignette ?? 0.5;
      o.grain = s.grain ?? 0.5;
      if (s.tint) {
        o.tint = s.tint[0];
        o.tintOpacity = s.tint[1];
      }
      ctx.exposure = typeof s.exposure === "function" ? s.exposure(lt, p) : s.exposure ?? 1;
      s.update?.(time, lt, p);
      applyCam(ctx, s.cam(lt, p));
      // 头尾过渡（黑场/色场）
      let f = 0;
      if (s.fadeIn && lt < s.fadeIn) f = Math.max(f, 1 - smooth(lt / s.fadeIn));
      if (s.fadeOut && s.dur - lt < s.fadeOut) f = Math.max(f, 1 - smooth((s.dur - lt) / s.fadeOut));
      if (f > 0) {
        if (s.fadeColor !== undefined && s.fadeColor !== 0x000000) {
          o.flash = Math.max(o.flash, f);
          o.flashColor = s.fadeColor;
        } else {
          o.fade = Math.max(o.fade, f);
        }
      }
      s.fx?.(lt, p, o);
    },
    leave: () => {
      s.leave?.();
    },
  };
}

/** 便捷：把 [t, value] 关键帧做平滑插值 */
export function keyframes(t: number, keys: Array<[number, number]>, ease: (x: number) => number = smooth): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      return lerp(v0, v1, ease(clamp((t - t0) / (t1 - t0))));
    }
  }
  return keys[keys.length - 1][1];
}

export { easeInOut };
