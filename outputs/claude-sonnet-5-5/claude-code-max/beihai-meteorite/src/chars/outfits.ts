// 服装层：独立于身体的衣物贴图（64×64，透明底）。空白像素露出身体（例如面罩透明处露出脸）。
import { createSkin, type Skin, type SkinPainter, type FaceName } from "@agentbench/voxel-kit";

const sideX = (face: FaceName, k: number): number => (face === "left" ? k : 7 - k);

// ---------------------------------------------------------------------------
// 日常服装
// ---------------------------------------------------------------------------

export function jacketOutfit(opts: {
  jacket: string; jacketDark: string; trousers: string; shoes: string; seam: string; shirt: string;
  rolledSleeves?: boolean; cuffs?: string; grain?: number;
}): (p: SkinPainter) => void {
  return (p) => {
    // 躯干
    p.fill("torso", "all", opts.jacket);
    p.rect("torso", "front", 3, 0, 2, 2, opts.shirt); // 领口露出的衬衫
    p.rect("torso", "front", 2, 0, 1, 1, opts.jacketDark);
    p.rect("torso", "front", 5, 0, 1, 1, opts.jacketDark);
    p.rect("torso", "front", 3, 2, 1, 10, opts.seam); // 拉链/门襟
    p.rect("torso", "front", 4, 2, 1, 10, opts.jacketDark);
    p.rect("torso", "front", 1, 7, 2, 1, opts.jacketDark); // 口袋盖
    p.rect("torso", "front", 5, 7, 2, 1, opts.jacketDark);
    p.rect("torso", "front", 0, 11, 8, 1, opts.jacketDark); // 下摆
    p.rect("torso", "back", 3, 0, 2, 12, opts.jacketDark);
    p.rect("torso", "back", 0, 11, 8, 1, opts.jacketDark);
    p.rect("torso", "top", 0, 0, 8, 4, opts.jacketDark);
    p.rect("torso", "left", 0, 11, 4, 1, opts.jacketDark);
    p.rect("torso", "right", 0, 11, 4, 1, opts.jacketDark);
    // 袖子
    for (const arm of ["armR", "armL"] as const) {
      p.fill(arm, "all", opts.jacket);
      p.rect(arm, "front", 0, 0, 4, 1, opts.jacketDark);
      if (opts.rolledSleeves) {
        // 卷到肘部以上：肘下露出前臂
        p.erase(arm, "front", 0, 6, 4, 6);
        p.erase(arm, "back", 0, 6, 4, 6);
        p.erase(arm, "left", 0, 6, 4, 6);
        p.erase(arm, "right", 0, 6, 4, 6);
        p.erase(arm, "bottom", 0, 0, 4, 4);
        p.rect(arm, "front", 0, 5, 4, 1, opts.jacketDark);
        p.rect(arm, "back", 0, 5, 4, 1, opts.jacketDark);
        p.rect(arm, "left", 0, 5, 4, 1, opts.jacketDark);
        p.rect(arm, "right", 0, 5, 4, 1, opts.jacketDark);
      } else {
        // 袖口下方 2 像素露出手
        p.erase(arm, "front", 0, 10, 4, 2);
        p.erase(arm, "back", 0, 10, 4, 2);
        p.erase(arm, "left", 0, 10, 4, 2);
        p.erase(arm, "right", 0, 10, 4, 2);
        p.erase(arm, "bottom", 0, 0, 4, 4);
        p.rect(arm, "front", 0, 9, 4, 1, opts.cuffs ?? opts.jacketDark);
        p.rect(arm, "back", 0, 9, 4, 1, opts.cuffs ?? opts.jacketDark);
        p.rect(arm, "left", 0, 9, 4, 1, opts.cuffs ?? opts.jacketDark);
        p.rect(arm, "right", 0, 9, 4, 1, opts.cuffs ?? opts.jacketDark);
      }
    }
    // 裤子与鞋
    for (const leg of ["legR", "legL"] as const) {
      p.fill(leg, "all", opts.trousers);
      p.rect(leg, "front", 0, 10, 4, 2, opts.shoes);
      p.rect(leg, "back", 0, 10, 4, 2, opts.shoes);
      p.rect(leg, "left", 0, 10, 4, 2, opts.shoes);
      p.rect(leg, "right", 0, 10, 4, 2, opts.shoes);
      p.rect(leg, "bottom", 0, 0, 4, 4, "#0c0c0e");
      p.rect(leg, "front", 1, 0, 2, 1, opts.seam);
    }
    p.grain("torso", "all", opts.grain ?? 0.06, 11);
    p.grain("armR", "all", opts.grain ?? 0.06, 12);
    p.grain("armL", "all", opts.grain ?? 0.06, 13);
    p.grain("legR", "all", 0.05, 14);
    p.grain("legL", "all", 0.05, 15);
  };
}

export function zhangCivilian(): Skin {
  return createSkin(
    jacketOutfit({
      jacket: "#2c3441", jacketDark: "#222833", seam: "#3d4859", trousers: "#23272e", shoes: "#101013", shirt: "#e4e2da",
    }),
    { transparent: true },
  );
}

/** 车间：护目镜 + 蓝色手套（画在头部服装层与手臂服装层上） */
export function zhangWorkshop(): Skin {
  const base = jacketOutfit({
    jacket: "#2c3441", jacketDark: "#222833", seam: "#3d4859", trousers: "#23272e", shoes: "#101013", shirt: "#e4e2da",
  });
  return createSkin((p) => {
    base(p);
    // 护目镜：细黑框 + 镜片透明
    p.rect("head", "front", 0, 2, 8, 1, "#15181d");
    p.rect("head", "front", 0, 4, 8, 1, "#15181d");
    p.px("head", "front", 0, 3, "#15181d");
    p.px("head", "front", 7, 3, "#15181d");
    p.px("head", "front", 3, 3, "#15181d");
    p.px("head", "front", 4, 3, "#15181d");
    p.rect("head", "left", 0, 2, 5, 3, "#15181d");
    p.rect("head", "right", 3, 2, 5, 3, "#15181d");
    p.rect("head", "back", 0, 3, 8, 1, "#15181d");
    // 蓝色丁腈手套
    for (const arm of ["armR", "armL"] as const) {
      p.erase(arm, "front", 0, 10, 4, 2);
      for (const f of ["front", "back", "left", "right"] as FaceName[]) p.rect(arm, f, 0, 10, 4, 2, "#3a78c8");
      p.rect(arm, "bottom", 0, 0, 4, 4, "#3a78c8");
    }
  }, { transparent: true });
}

/** 地下室：护耳（灰色耳罩 + 头带） */
export function zhangBasement(): Skin {
  const base = jacketOutfit({
    jacket: "#2c3441", jacketDark: "#222833", seam: "#3d4859", trousers: "#23272e", shoes: "#101013", shirt: "#e4e2da",
  });
  return createSkin((p) => {
    base(p);
    for (const f of ["left", "right"] as FaceName[]) {
      p.rect("head", f, 2, 2, 4, 5, "#d9822b");
      p.rect("head", f, 3, 3, 2, 3, "#4d5158");
    }
    p.rect("head", "top", 3, 0, 2, 8, "#4d5158");
    p.rect("head", "front", 3, 0, 2, 1, "#4d5158");
    p.rect("head", "back", 3, 0, 2, 1, "#4d5158");
  }, { transparent: true });
}

/** 收藏者：对襟褂，卷袖，布鞋 */
export function collectorOutfit(): Skin {
  return createSkin((p) => {
    const main = "#5c6a63";
    const dark = "#3f4a45";
    const pipe = "#a9a58c";
    p.fill("torso", "all", main);
    p.rect("torso", "front", 0, 0, 8, 1, dark); // 立领
    p.rect("torso", "front", 3, 1, 2, 11, dark); // 门襟
    p.rect("torso", "front", 3, 1, 1, 11, pipe);
    for (const y of [2, 4, 6, 8]) {
      p.px("torso", "front", 2, y, "#2a1f18");
      p.px("torso", "front", 5, y, "#2a1f18");
    }
    p.rect("torso", "front", 0, 11, 8, 1, dark);
    p.rect("torso", "back", 0, 0, 8, 1, dark);
    p.rect("torso", "back", 3, 1, 2, 11, dark);
    p.rect("torso", "top", 0, 0, 8, 4, dark);
    for (const arm of ["armR", "armL"] as const) {
      p.fill(arm, "all", main);
      // 卷袖：肘部以下露出前臂
      for (const f of ["front", "back", "left", "right"] as FaceName[]) {
        p.erase(arm, f, 0, 6, 4, 6);
        p.rect(arm, f, 0, 5, 4, 1, pipe);
      }
      p.erase(arm, "bottom", 0, 0, 4, 4);
    }
    for (const leg of ["legR", "legL"] as const) {
      p.fill(leg, "all", "#3b3d40");
      for (const f of ["front", "back", "left", "right"] as FaceName[]) {
        p.rect(leg, f, 0, 10, 4, 2, "#171719");
        p.rect(leg, f, 0, 11, 4, 1, "#d8d4c8"); // 布鞋白边
      }
      p.rect(leg, "bottom", 0, 0, 4, 4, "#d8d4c8");
    }
    p.grain("torso", "all", 0.07, 21);
    p.grain("armR", "all", 0.07, 22);
    p.grain("armL", "all", 0.07, 23);
    p.grain("legR", "all", 0.05, 24);
    p.grain("legL", "all", 0.05, 25);
  }, { transparent: true, arm: "slim" });
}

// ---------------------------------------------------------------------------
// 航天服
// ---------------------------------------------------------------------------

export interface SuitVariant {
  /** 腰带/臂章/腿侧条纹的强调色 */
  trim: string;
  /** 肩章色 */
  patch: string;
  /** 头盔顶灯颜色 */
  lamp?: string;
  /** 右手是否摘掉手套（薄布手套，带霜） */
  gloveOffR?: boolean;
  /** 胸前小指示灯 */
  led?: string;
}

export type VisorState =
  | { kind: "gold"; level: number } // level: 1=全金 → 0=全透（抖动过渡）
  | { kind: "cracked" }
  | { kind: "bloody" };

const WHITE = "#e8ecef";
const WHITE_D = "#c9d0d6";
const GREY = "#8a929b";
const GREY_D = "#565d66";
const GLOVE = "#3b4048";

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function paintVisor(p: SkinPainter, state: VisorState): void {
  // 面罩开口：x1..6, y2..6
  if (state.kind === "gold") {
    const rows = ["#f6dc90", "#e6bd5e", "#cf9d3f", "#ad7c2b", "#7d5820"];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 6; x++) {
        const threshold = (BAYER4[(y + 2) & 3][(x + 1) & 3] + 0.5) / 16;
        if (threshold < state.level) {
          let c = rows[y];
          if (x === 1 && y === 1) c = "#fff2c2";
          if (x === 2 && y === 0) c = "#fff2c2";
          if (x === 5) c = y < 2 ? "#c99a3e" : "#7d5820";
          p.px("head", "front", 1 + x, 2 + y, c);
        }
      }
    }
    if (state.level < 0.999) {
      // 玻璃反光小亮点（始终存在）
      p.px("head", "front", 6, 2, "#dfeaf5");
    }
  } else {
    const base = "#c7d2da";
    p.rect("head", "front", 1, 2, 6, 5, base);
    // 裂纹：从撞击点 (3,3) 放射
    const crack = "#5f6b75";
    for (const [x, y] of [[3, 3], [2, 2], [4, 4], [5, 5], [1, 4], [2, 4], [4, 2], [5, 2], [6, 2], [3, 5], [3, 6], [4, 3], [6, 4]]) {
      p.px("head", "front", x, y, crack);
    }
    p.px("head", "front", 3, 2, "#e8f0f5");
    p.px("head", "front", 5, 4, "#e8f0f5");
    if (state.kind === "bloody") {
      const blood = "#8e1216";
      const blood2 = "#c0262b";
      for (const [x, y] of [[2, 3], [3, 3], [3, 4], [4, 4], [4, 5], [2, 5], [5, 3], [1, 2], [6, 6], [4, 6], [5, 6]]) {
        p.px("head", "front", x, y, blood);
      }
      for (const [x, y] of [[3, 3], [4, 4], [2, 5]]) p.px("head", "front", x, y, blood2);
      p.px("head", "front", 5, 3, "#d0dae0");
    }
  }
}

export function spaceSuit(variant: SuitVariant, visor: VisorState): Skin {
  return createSkin((p) => {
    // ---- 头盔（服装层的头部壳，膨胀 0.5 像素） ----
    p.fill("head", "all", WHITE);
    p.rect("head", "front", 0, 0, 8, 1, WHITE_D);
    p.rect("head", "front", 0, 7, 8, 1, GREY);
    p.rect("head", "front", 0, 2, 1, 5, WHITE_D);
    p.rect("head", "front", 7, 2, 1, 5, WHITE_D);
    p.rect("head", "front", 0, 1, 8, 1, WHITE);
    // 面罩开口（先清空，再按状态绘制）
    p.erase("head", "front", 1, 2, 6, 5);
    p.rect("head", "top", 3, 5, 2, 2, variant.lamp ?? "#f2b544");
    p.rect("head", "top", 0, 0, 8, 1, WHITE_D);
    for (const f of ["left", "right"] as FaceName[]) {
      p.rect("head", f, sideX(f, 3), 3, 3, 3, GREY);
      p.rect("head", f, sideX(f, 4), 4, 1, 1, GREY_D);
      p.rect("head", f, 0, 7, 8, 1, GREY);
    }
    p.rect("head", "back", 2, 2, 4, 3, WHITE_D);
    p.rect("head", "back", 0, 7, 8, 1, GREY);
    p.fill("head", "bottom", GREY);
    paintVisor(p, visor);

    // ---- 躯干 ----
    p.fill("torso", "all", WHITE);
    p.rect("torso", "front", 0, 0, 8, 1, GREY); // 颈环
    p.rect("torso", "front", 1, 1, 1, 8, WHITE_D);
    p.rect("torso", "front", 6, 1, 1, 8, WHITE_D);
    p.rect("torso", "front", 2, 3, 4, 3, GREY); // 胸前控制盒
    p.rect("torso", "front", 2, 3, 4, 1, GREY_D);
    p.px("torso", "front", 2, 4, "#3ab26e");
    p.px("torso", "front", 3, 4, variant.led ?? "#d84a4a");
    p.px("torso", "front", 4, 4, "#3b82f6");
    p.px("torso", "front", 5, 5, "#f2c14e");
    p.rect("torso", "front", 0, 7, 8, 1, WHITE_D);
    p.rect("torso", "front", 0, 9, 8, 1, variant.trim);
    p.rect("torso", "front", 0, 10, 8, 2, WHITE_D);
    p.rect("torso", "front", 3, 10, 2, 2, GREY);
    p.rect("torso", "back", 0, 0, 8, 1, GREY);
    p.rect("torso", "back", 1, 2, 6, 8, WHITE_D);
    p.rect("torso", "back", 0, 9, 8, 1, variant.trim);
    p.rect("torso", "top", 0, 0, 8, 4, GREY);
    p.rect("torso", "left", 0, 9, 4, 1, variant.trim);
    p.rect("torso", "right", 0, 9, 4, 1, variant.trim);

    // ---- 手臂 ----
    for (const arm of ["armR", "armL"] as const) {
      p.fill(arm, "all", WHITE);
      for (const f of ["front", "back", "left", "right"] as FaceName[]) {
        p.rect(arm, f, 0, 0, 4, 1, GREY);
        p.rect(arm, f, 0, 5, 4, 1, WHITE_D); // 肘环
        p.rect(arm, f, 0, 8, 4, 1, GREY); // 腕环
        p.rect(arm, f, 0, 9, 4, 3, GLOVE); // 手套
        p.rect(arm, f, 0, 11, 4, 1, GREY_D);
      }
      p.rect(arm, "front", 0, 7, 4, 1, variant.trim);
      p.rect(arm, "back", 0, 7, 4, 1, variant.trim);
      // 肩章
      p.rect(arm, "front", 1, 1, 2, 2, variant.patch);
      p.rect(arm, "left", 1, 1, 2, 2, variant.patch);
      p.rect(arm, "right", 1, 1, 2, 2, variant.patch);
      p.px(arm, "front", 2, 1, "#f5d24b");
      p.rect(arm, "bottom", 0, 0, 4, 4, GLOVE);
    }
    if (variant.gloveOffR) {
      // 摘掉右手手套：只剩金属护环和薄布手套，带霜
      const A = "armR" as const;
      for (const f of ["front", "back", "left", "right"] as FaceName[]) {
        p.rect(A, f, 0, 9, 4, 3, "#aab6c4");
        p.rect(A, f, 0, 8, 4, 1, GREY);
      }
      p.rect(A, "bottom", 0, 0, 4, 4, "#aab6c4");
      for (const [x, y] of [[0, 10], [2, 11], [3, 9], [1, 11], [2, 10]]) {
        p.px(A, "front", x, y, "#eaf3fb");
        p.px(A, "back", x, y, "#eaf3fb");
      }
    }

    // ---- 腿 ----
    for (const leg of ["legR", "legL"] as const) {
      p.fill(leg, "all", WHITE);
      for (const f of ["front", "back", "left", "right"] as FaceName[]) {
        p.rect(leg, f, 0, 0, 4, 1, GREY);
        p.rect(leg, f, 0, 9, 4, 3, GLOVE);
        p.rect(leg, f, 0, 11, 4, 1, GREY_D);
      }
      p.rect(leg, "front", 0, 4, 4, 2, GREY); // 护膝
      p.rect(leg, "front", 0, 6, 4, 1, WHITE_D);
      p.rect(leg, "left", 1, 1, 2, 7, variant.trim);
      p.rect(leg, "right", 1, 1, 2, 7, variant.trim);
      p.rect(leg, "bottom", 0, 0, 4, 4, GREY_D);
    }

    p.grain("torso", "all", 0.035, 31);
    p.grain("armR", "all", 0.035, 32);
    p.grain("armL", "all", 0.035, 33);
    p.grain("legR", "all", 0.035, 34);
    p.grain("legL", "all", 0.035, 35);
  }, { transparent: true });
}
