// 主要角色的“造型设定”：脸部特征、发型、肤色。服装在 outfits.ts。
import type { Look } from "./faces";
import type { SuitVariant } from "./outfits";

/** 章北海：冷静、克制的军人，寸头，眉骨压得很低 */
export const ZHANG_LOOK: Look = {
  skin: "#d5a377",
  skinDark: "#a97a54",
  hair: "#15110f",
  hairDark: "#0a0908",
  hairStyle: "crop",
  brow: "#4a3a30",
  lips: "#7a4a3c",
  age: 0,
  torso: "#dfe0da",
  legs: "#23272e",
};

/** 陨石收藏者：五十开外、面色红润，稀疏灰发，圆框眼镜，笑纹 */
export const COLLECTOR_LOOK: Look = {
  skin: "#dba985",
  skinDark: "#b48059",
  hair: "#c2c0ba",
  hairDark: "#93918b",
  hairStyle: "receding",
  brow: "#9b968d",
  lips: "#b0645a",
  glasses: "#8f7440",
  age: 1,
  torso: "#d2d3cb",
  legs: "#3b3d40",
};

export const ZHANG_SUIT: SuitVariant = { trim: "#1f4e9c", patch: "#c0392b", lamp: "#e8e8e0", led: "#3ab26e" };
