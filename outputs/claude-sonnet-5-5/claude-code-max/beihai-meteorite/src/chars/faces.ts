// 脸与身体贴图：五官/表情/发型/眼镜/胡须全部画在 64×64 贴图的像素上（Voxel Kit 规定：不得用凸出几何拼贴）。
// 头部正面 8×8：行0-1 发际线，行2 眉，行3 眼，行4 鼻/颧，行5-6 嘴，行7 下颌。
import { createSkin, type Skin, type SkinPainter, type FaceName } from "@agentbench/voxel-kit";

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

export type HairStyle = "crop" | "short" | "bald" | "long" | "swept" | "bun" | "receding";
export type Expr =
  | "neutral" | "blink" | "talk" | "smile" | "laugh" | "shout" | "stern" | "squint" | "shock" | "grimace" | "awkward" | "look" | "serene";

export interface Look {
  skin: string;
  skinDark: string;
  hair: string;
  hairDark: string;
  hairStyle: HairStyle;
  brow: string;
  lips: string;
  /** 眼镜框颜色 */
  glasses?: string;
  beard?: string;
  mustache?: string;
  /** 年龄纹 0-2 */
  age?: 0 | 1 | 2;
  /** 身体底色（躯干/腿；手臂露出皮肤） */
  torso: string;
  legs: string;
}

const SCLERA = "#d9d3c6";
const IRIS = "#2a1a14";

/** 侧脸列换算：k = 距离正面边缘的像素数（0 = 贴着脸的一侧） */
const sideX = (face: FaceName, k: number): number => (face === "left" ? k : 7 - k);

function paintHair(p: SkinPainter, L: Look): void {
  const h = L.hair;
  const hd = L.hairDark;
  const H = (face: FaceName, x: number, y: number, w: number, hh: number, c = h) => p.rect("head", face, x, y, w, hh, c);
  // 顶面（行0=后，行7=前）
  if (L.hairStyle !== "bald") {
    p.fill("head", "top", h);
    if (L.hairStyle === "receding") {
      p.rect("head", "top", 1, 5, 6, 3, L.skin);
      p.rect("head", "top", 2, 4, 4, 1, L.skin);
    }
    p.rect("head", "top", 0, 0, 8, 1, hd);
  } else {
    p.fill("head", "top", L.skin);
    p.rect("head", "top", 0, 0, 8, 2, L.skin);
  }
  switch (L.hairStyle) {
    case "crop":
      H("front", 0, 0, 8, 1);
      H("front", 0, 1, 2, 1);
      H("front", 6, 1, 2, 1);
      H("back", 0, 0, 8, 5);
      H("back", 0, 5, 8, 1, hd);
      for (const f of ["left", "right"] as FaceName[]) {
        H(f, 0, 0, 8, 2);
        for (let k = 3; k < 8; k++) H(f, sideX(f, k), 2, 1, 1);
        for (let k = 5; k < 8; k++) H(f, sideX(f, k), 3, 1, 1, hd);
      }
      break;
    case "short":
    case "swept":
      H("front", 0, 0, 8, 2);
      if (L.hairStyle === "swept") p.rect("head", "front", 5, 1, 3, 1, hd);
      H("back", 0, 0, 8, 6);
      H("back", 0, 6, 8, 1, hd);
      for (const f of ["left", "right"] as FaceName[]) {
        H(f, 0, 0, 8, 3);
        for (let k = 4; k < 8; k++) H(f, sideX(f, k), 3, 1, 2, hd);
      }
      break;
    case "receding":
      H("front", 0, 0, 8, 1);
      H("front", 0, 1, 1, 1);
      H("front", 7, 1, 1, 1);
      H("back", 0, 0, 8, 3, h);
      H("back", 0, 3, 8, 1, hd);
      for (const f of ["left", "right"] as FaceName[]) {
        H(f, 0, 0, 8, 1);
        for (let k = 3; k < 8; k++) H(f, sideX(f, k), 1, 1, 2);
      }
      break;
    case "bald":
      for (const f of ["left", "right"] as FaceName[]) for (let k = 5; k < 8; k++) H(f, sideX(f, k), 3, 1, 2, hd);
      H("back", 1, 3, 6, 2, hd);
      break;
    case "long":
      H("front", 0, 0, 8, 2);
      H("front", 0, 2, 1, 6);
      H("front", 7, 2, 1, 6);
      H("back", 0, 0, 8, 8);
      H("back", 0, 7, 8, 1, hd);
      for (const f of ["left", "right"] as FaceName[]) {
        H(f, 0, 0, 8, 3);
        for (let k = 2; k < 8; k++) H(f, sideX(f, k), 3, 1, 5, k > 5 ? hd : h);
      }
      break;
    case "bun":
      H("front", 0, 0, 8, 1);
      H("front", 0, 1, 2, 1);
      H("front", 6, 1, 2, 1);
      H("back", 0, 0, 8, 6);
      H("back", 2, 2, 4, 3, hd);
      for (const f of ["left", "right"] as FaceName[]) {
        H(f, 0, 0, 8, 2);
        for (let k = 3; k < 8; k++) H(f, sideX(f, k), 2, 1, 2);
      }
      p.rect("head", "top", 2, 0, 4, 3, hd);
      break;
  }
}

/**
 * 五官布局（正面 8×8，第 2 行起可被面罩开口看到）：
 *   行2 额头 · 行3 眉 · 行4 眼 · 行5 鼻/颧 · 行6 嘴 · 行7 下颌
 * 眉与眼之间不再紧贴，避免眼窝变成一大块黑。
 */
function paintFaceFeatures(p: SkinPainter, L: Look, expr: Expr): void {
  const F = (x: number, y: number, w: number, h: number, c: string) => p.rect("head", "front", x, y, w, h, c);
  const px = (x: number, y: number, c: string) => p.px("head", "front", x, y, c);
  const bald = L.hairStyle === "bald";
  const age = L.age ?? 0;

  // 肤色明暗：鼻影、下颌
  px(3, 5, L.skinDark);
  px(4, 5, L.skinDark);
  F(0, 7, 8, 1, mix(L.skin, L.skinDark, 0.5)); // 下颌：柔和的一行阴影，不与嘴连成一条黑带
  if (bald) F(0, 0, 8, 2, L.skin);
  // 年龄纹：法令纹、额纹
  if (age >= 1) { const soft = mix(L.skin, L.skinDark, 0.5); px(1, 5, soft); px(6, 5, soft); }
  if (age >= 2) { F(2, 2, 4, 1, L.skinDark); px(0, 6, L.skinDark); px(7, 6, L.skinDark); }

  const closed = expr === "blink" || expr === "laugh" || expr === "serene";
  const wide = expr === "shout" || expr === "shock";
  const stern = expr === "stern" || expr === "squint" || expr === "grimace";
  const scl = stern ? "#c8c2b6" : SCLERA;

  // ---- 眉（行2）----
  if (stern) {
    F(1, 2, 3, 1, L.brow); F(4, 2, 3, 1, L.brow);
    F(1, 3, 2, 1, L.skinDark); F(5, 3, 2, 1, L.skinDark); // 眉骨阴影落在眼上方
  } else if (expr === "awkward") {
    F(1, 2, 2, 1, L.brow); px(5, 2, L.brow); px(6, 3, L.brow);
  } else if (expr === "serene") {
    const soft = mix(L.skin, L.brow, 0.55);
    F(1, 2, 2, 1, soft); F(5, 2, 2, 1, soft);
  } else {
    F(1, 2, 2, 1, L.brow); F(5, 2, 2, 1, L.brow);
  }

  // ---- 眼（行4；惊恐时占行3-4）----（图像左侧 = 人物的右眼）
  if (closed) {
    // “安心”的闭眼：细而柔的一笔（用肤色的暗部，而不是眉色）
    const lid = expr === "serene" ? mix(L.skinDark, L.brow, 0.55) : L.brow;
    F(1, 4, 2, 1, lid); F(5, 4, 2, 1, lid);
  } else if (expr === "squint") {
    // 右眼（图像左）睁开对着瞄准镜，左眼闭上
    px(1, 4, scl); px(2, 4, IRIS);
    F(5, 4, 2, 1, L.brow);
  } else if (wide) {
    F(1, 3, 2, 2, SCLERA); F(5, 3, 2, 2, SCLERA);
    px(2, 3, IRIS); px(2, 4, IRIS); px(5, 3, IRIS); px(5, 4, IRIS);
  } else if (expr === "look") {
    px(1, 4, IRIS); px(2, 4, scl); px(5, 4, IRIS); px(6, 4, scl);
  } else {
    px(1, 4, scl); px(2, 4, IRIS);
    px(5, 4, IRIS); px(6, 4, scl);
  }

  // ---- 胡须 / 髭 ----
  if (L.beard) {
    F(0, 5, 1, 3, L.beard); F(7, 5, 1, 3, L.beard);
    F(1, 6, 6, 2, L.beard); F(2, 5, 4, 1, L.beard);
  }
  if (L.mustache) F(2, 5, 4, 1, L.mustache);

  // ---- 嘴（行6）----
  const lip = mix(L.skin, L.lips, 0.82); // 唇色向肤色靠一点：细、克制，不喧宾夺主
  const dark = "#3a1512";
  const mouth = L.beard ? dark : lip;
  const corner = L.skinDark; // 嘴角的笑纹用略深的肤色，不用唇色（否则像腮红）
  switch (expr) {
    case "talk":
      F(2, 6, 4, 1, mouth); F(3, 6, 2, 1, dark);
      break;
    case "smile":
      F(2, 6, 4, 1, mouth); px(1, 5, corner); px(6, 5, corner);
      break;
    case "serene":
      // 极轻的一点笑意：嘴角略高于嘴心，颜色比笑纹更淡
      F(2, 6, 4, 1, mouth); { const soft = mix(L.skin, L.skinDark, 0.55); px(1, 6, soft); px(6, 6, soft); px(1, 5, mix(L.skin, L.skinDark, 0.3)); px(6, 5, mix(L.skin, L.skinDark, 0.3)); }
      break;
    case "laugh":
      F(2, 5, 4, 1, "#f4f0e8"); F(2, 6, 4, 1, dark); px(1, 5, corner); px(6, 5, corner);
      break;
    case "shout":
      F(2, 5, 4, 1, "#f4f0e8"); F(2, 6, 4, 1, dark);
      break;
    case "shock":
      F(3, 5, 2, 2, dark);
      break;
    case "grimace":
      F(2, 5, 4, 1, "#f0ece4"); F(2, 6, 4, 1, dark); px(4, 5, dark);
      break;
    case "awkward":
      F(3, 6, 3, 1, mouth); px(2, 5, lip);
      break;
    default:
      // 抿住的嘴：细而克制的一条
      F(2, 6, 4, 1, mouth);
      break;
  }

  // ---- 眼镜：细框，镜片留空透出眼睛 ----
  if (L.glasses) {
    const g = L.glasses;
    // 半框眼镜：只有上沿与两侧，下沿留空（否则会与鼻影、嘴连成一条黑带）
    F(1, 3, 2, 1, g); F(5, 3, 2, 1, g);
    px(0, 4, g); px(3, 4, g); px(4, 4, g); px(7, 4, g);
  }
}

/** 生成某个角色在某种表情下的身体贴图 */
export function bodySkin(L: Look, expr: Expr, arm: "classic" | "slim" = "classic"): Skin {
  return createSkin((p) => {
    // 头：先铺肤色
    p.fill("head", "all", L.skin);
    p.fill("head", "bottom", L.skinDark);
    // 耳朵（侧面）
    for (const f of ["left", "right"] as FaceName[]) {
      p.rect("head", f, sideX(f, 3), 3, 2, 3, L.skinDark);
    }
    paintHair(p, L);
    paintFaceFeatures(p, L, expr);
    // 身体底色：躯干/腿为底衣，手臂为皮肤（袖子由服装层覆盖）
    p.fill("torso", "all", L.torso);
    p.fill("legR", "all", L.legs);
    p.fill("legL", "all", L.legs);
    p.fill("armR", "all", L.skin);
    p.fill("armL", "all", L.skin);
    // 领口露出的脖颈
    p.rect("torso", "front", 3, 0, 2, 1, L.skinDark);
  }, { arm });
}
