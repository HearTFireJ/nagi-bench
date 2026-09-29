// 声音与画面共用的时间数据：脚步落点、时钟换算。
// 脚步不是手写的——从人物路点与走路周期反推出每一次“脚落地”的时刻，这样声音与步态天然对齐。
import { pathAt, walkAmount, type WP } from "../film/motion";
import { DUR, T } from "../film/timing";

export interface Footfall {
  /** 绝对时间（秒） */
  t: number;
  /** 行走强度 0..1（起步/收步时较轻） */
  amt: number;
}

function segIndex(wps: WP[], t: number): number {
  for (let i = 0; i < wps.length - 1; i++) if (t >= wps[i].t && t < wps[i + 1].t) return i;
  return -1;
}

/**
 * 计算路点序列中每一步落脚的绝对时刻。
 * 与姿态一致：voxel-kit 的 walk(t, speed) 相位 = t·speed·2π，两腿摆幅在 |sin| = 1 时最大（此时脚落地）。
 * @param base   本段在总时间轴上的起点（秒）
 * @param speed  步频参数（与 stride(t, moving, speed) 的 speed 一致），可以是路径速度的函数
 */
export function footfalls(
  wps: WP[],
  base: number,
  speed: number | ((pathSpeed: number) => number),
  o: { minWalk?: number; from?: number; to?: number } = {},
): Footfall[] {
  const out: Footfall[] = [];
  const dt = 1 / 240;
  const t0 = Math.max(wps[0].t, o.from ?? -Infinity);
  const t1 = Math.min(wps[wps.length - 1].t, o.to ?? Infinity);
  let prevK = 0;
  let prevS = -1;
  let prevSeg = -2;
  for (let lt = t0; lt <= t1; lt += dt) {
    const st = pathAt(wps, lt);
    const walk = walkAmount(st, wps, lt);
    const s = typeof speed === "number" ? speed : speed(st.speed);
    const seg = segIndex(wps, lt);
    const k = Math.floor((lt * s * Math.PI * 2 - Math.PI / 2) / Math.PI);
    if (seg === prevSeg && Math.abs(s - prevS) < 1e-9 && k > prevK && walk > (o.minWalk ?? 0.45)) {
      out.push({ t: Math.round((base + lt) * 1000) / 1000, amt: walk });
    }
    prevK = k;
    prevS = s;
    prevSeg = seg;
  }
  return out;
}

/** 空间站戏的 τ → 绝对时间：τ<0 属于冷开场（开场时钟 τ = t − 26），τ≥0 属于主戏（τ = t − 194） */
export const absFromTau = (tau: number): number => (tau < 0 ? DUR.open + tau : T.space + tau);
