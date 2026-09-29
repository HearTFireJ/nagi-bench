// 太空段“叙事时钟 τ”上的关键事件表：开枪时刻、命中计划。
// τ = 0 是太阳恰好接触地球边缘的时刻；音效、粒子、人物反应都从这里取时间，保证画面与声音精确同步。

/** 首发子弹出膛时刻 */
export const FIRE0 = 98.0;
/** 子弹飞行时间：5000 米 ÷ 500 米/秒 = 10 秒 */
export const FLIGHT = 10.0;
/** 射击节奏：每个弹夹 10 发 */
export const SHOT_INTERVAL = 0.22;
export const MAG_GAP = 0.55;

export interface Shot {
  /** 0..29 */
  n: number;
  /** 出膛时刻 τ */
  t: number;
  /** 瞄准的目标：0 老院士 1 女总工 2 总设计师 */
  target: 0 | 1 | 2;
  /** 弹夹序号 */
  mag: 0 | 1 | 2;
}

export function buildShots(): Shot[] {
  const out: Shot[] = [];
  let t = FIRE0;
  for (let mag = 0; mag < 3; mag++) {
    for (let k = 0; k < 10; k++) {
      out.push({ n: mag * 10 + k, t, target: mag as 0 | 1 | 2, mag: mag as 0 | 1 | 2 });
      t += SHOT_INTERVAL;
    }
    t += MAG_GAP;
  }
  return out;
}
export const SHOTS = buildShots();
export const LAST_SHOT_T = SHOTS[SHOTS.length - 1].t;
/** 换弹夹的时段（τ） */
export const MAG_CHANGES: Array<[number, number]> = [
  [SHOTS[9].t + 0.1, SHOTS[10].t - 0.05],
  [SHOTS[19].t + 0.1, SHOTS[20].t - 0.05],
];

export type HitSpot = "chest" | "shoulder" | "pack" | "visor" | "arm" | "belly";
export interface HitPlan {
  /** 哪一发 */
  bullet: number;
  /** 命中谁：'gen' 'eng' 'des' 或者 'byA' / 'byB' (误伤的两位队员) */
  who: "gen" | "eng" | "des" | "byA" | "byB";
  spot: HitSpot;
}

/** 命中计划：三位目标各 ≥5 发，外加两位误伤，其余脱靶 */
export const HIT_PLAN: HitPlan[] = [
  { bullet: 0, who: "byA", spot: "shoulder" },
  { bullet: 1, who: "gen", spot: "chest" },
  { bullet: 2, who: "gen", spot: "pack" },
  { bullet: 4, who: "gen", spot: "chest" },
  { bullet: 5, who: "gen", spot: "visor" },
  { bullet: 6, who: "gen", spot: "belly" },
  { bullet: 8, who: "gen", spot: "chest" },
  { bullet: 9, who: "gen", spot: "arm" },
  { bullet: 10, who: "eng", spot: "chest" },
  { bullet: 12, who: "eng", spot: "shoulder" },
  { bullet: 13, who: "eng", spot: "visor" },
  { bullet: 15, who: "eng", spot: "pack" },
  { bullet: 17, who: "eng", spot: "chest" },
  { bullet: 18, who: "eng", spot: "belly" },
  { bullet: 20, who: "byB", spot: "arm" },
  { bullet: 21, who: "des", spot: "chest" },
  { bullet: 22, who: "des", spot: "visor" },
  { bullet: 24, who: "des", spot: "pack" },
  { bullet: 25, who: "des", spot: "chest" },
  { bullet: 27, who: "des", spot: "belly" },
  { bullet: 29, who: "des", spot: "shoulder" },
];

export const hitTime = (h: HitPlan): number => SHOTS[h.bullet].t + FLIGHT;
/** 首个命中时刻 = 摄影师按下快门的时刻 */
export const SHUTTER_T = SHOTS[0].t + FLIGHT;
