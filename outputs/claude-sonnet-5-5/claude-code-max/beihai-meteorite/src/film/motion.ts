// 人物走位：路点插值 → 位置、朝向、是否在行走。全部是时间的纯函数。
import { clamp, smooth, lerp } from "../util/math";

export interface WP {
  t: number;
  x: number;
  z: number;
  /** 停留时的朝向（弧度，0 = 面向 +Z）；行走时自动取运动方向 */
  h?: number;
  y?: number;
}

export interface PathState {
  x: number;
  y: number;
  z: number;
  h: number;
  /** 米/秒 */
  speed: number;
}

export const angleLerp = (a: number, b: number, t: number): number => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export function pathAt(wps: WP[], t: number): PathState {
  if (t <= wps[0].t) {
    return { x: wps[0].x, y: wps[0].y ?? 0, z: wps[0].z, h: wps[0].h ?? 0, speed: 0 };
  }
  const last = wps[wps.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y ?? 0, z: last.z, h: last.h ?? 0, speed: 0 };
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i], b = wps[i + 1];
    if (t < a.t || t > b.t) continue;
    const dt = b.t - a.t;
    const u = clamp((t - a.t) / dt);
    const dx = b.x - a.x, dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const speed = dist / dt;
    const e = u; // 匀速；起止的加减速由姿态的“moving”混合处理
    const x = lerp(a.x, b.x, e);
    const z = lerp(a.z, b.z, e);
    const y = lerp(a.y ?? 0, b.y ?? 0, e);
    const ha = a.h ?? Math.atan2(dx, dz);
    const hb = b.h ?? Math.atan2(dx, dz);
    let h: number;
    if (speed > 0.15) {
      const travel = Math.atan2(dx, dz);
      // 起步时从停留朝向转向行进方向，到达前再转向下一个停留朝向
      const head = angleLerp(ha, travel, smooth(u * 6));
      h = angleLerp(head, hb, smooth((u - 0.82) * 5.5));
      if (a.h === undefined) h = angleLerp(travel, hb, smooth((u - 0.82) * 5.5));
    } else {
      h = angleLerp(ha, hb, smooth(u));
    }
    return { x, y, z, h, speed };
  }
  return { x: last.x, y: last.y ?? 0, z: last.z, h: last.h ?? 0, speed: 0 };
}

/** 行走强度 0..1：由速度、并在起步/收步时平滑 */
export function walkAmount(state: PathState, wps: WP[], t: number): number {
  if (state.speed < 0.15) return 0;
  // 找到所在段的进度，起止各 0.25 秒缓入缓出
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i], b = wps[i + 1];
    if (t >= a.t && t <= b.t) {
      const inn = smooth((t - a.t) / 0.25);
      const out = smooth((b.t - t) / 0.3);
      return Math.min(inn, out);
    }
  }
  return 0;
}
