// 总时间轴（秒）。硬上限 360 秒，片头片尾都计算在内。
// 结构：冷开场（太空，日落前）→ 闪回：四合院 → 车间 + 地下室 → 一号基地/出发 → 太空主戏 → 片尾。

export const DUR = {
  open: 26,
  courtyard: 90,
  making: 62,
  transit: 16,
  space: 152,
  end: 6,
} as const;

export const T = {
  open: 0,
  courtyard: 26,
  making: 116,
  transit: 178,
  space: 194,
  end: 346,
} as const;

export const TOTAL = 352;

/** 冷开场的叙事时钟：t=0 → τ=-26；t=26 → τ=0（太阳恰好接触地球边缘） */
export const openTau = (t: number): number => t - DUR.open;
/** 太空主戏的叙事时钟 */
export const spaceTau = (t: number): number => t - T.space;
/** 太空主戏内的相对时刻 → 绝对时间 */
export const atSpace = (tau: number): number => T.space + tau;
