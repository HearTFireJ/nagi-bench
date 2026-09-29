import * as THREE from "three";
import { createSkin, type Skin, type SkinPainter, type PartName } from "@agentbench/voxel-kit";
import { css, shade, mix } from "../util/math";

/**
 * Identity is painted, never sculpted: every eye, brow, mouth, pair of glasses,
 * seam and insignia below is a texel on the 64x64 sheets of @agentbench/voxel-kit.
 * The body sheet holds the bare figure (skin, hair, face); clothing lives on its
 * own transparent sheet so a body can be redressed without repainting it.
 */

export type HairStyle = "crop" | "thin" | "receding" | "bald";
export type Eyes = "calm" | "narrow" | "wide" | "shut" | "happy" | "down";
export type Mouth = "flat" | "smile" | "talk" | "laugh" | "scream" | "frown" | "grit";

export interface Look {
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  brow: number;
  iris: number;
  glasses?: number;
  stubble?: boolean;
  wrinkles?: boolean;
  /** Colour of the bare-figure torso/legs under the clothing. */
  base?: number;
}

const ALL_PARTS: PartName[] = ["head", "torso", "armR", "armL", "legR", "legL"];
const RIGHT_ARM_FACES = ["front", "back", "left", "right", "top", "bottom"] as const;

function paintHead(p: SkinPainter, look: Look, eyes: Eyes, mouth: Mouth): void {
  const skin = css(look.skin);
  const sh = css(shade(look.skin, 0.82));
  const sh2 = css(shade(look.skin, 0.66));
  const hair = css(look.hair);
  const hairLo = css(shade(look.hair, 0.78));
  const brow = css(mix(look.brow, look.skin, 0.32));
  const iris = css(look.iris);
  const lip = css(mix(look.skin, 0x8a2f2f, 0.55));
  const dark = "#2a1214";

  p.fill("head", "all", skin);

  // ---- hair -----------------------------------------------------------------
  const style = look.hairStyle;
  if (style !== "bald") {
    p.fill("head", "top", style === "receding" ? skin : hair);
    if (style === "receding") {
      p.rect("head", "top", 0, 3, 8, 5, hair);
      p.rect("head", "top", 0, 0, 1, 3, hair);
      p.rect("head", "top", 7, 0, 1, 3, hair);
    }
    p.rect("head", "back", 0, 0, 8, style === "thin" || style === "receding" ? 5 : 6, hair);
    p.rect("head", "back", 0, 5, 8, 1, hairLo);
    // sides: hair over the crown and behind the ear
    for (const [face, backX] of [["right", 0], ["left", 5]] as const) {
      p.rect("head", face, 0, 0, 8, 2, hair);
      p.rect("head", face, backX, 2, 3, 3, hair);
      p.rect("head", face, backX === 0 ? 3 : 5, 2, 0, 0, hair);
    }
    // front hairline
    if (style === "crop") {
      p.rect("head", "front", 0, 0, 8, 2, hair);
      p.px("head", "front", 0, 2, hair);
      p.px("head", "front", 7, 2, hair);
      p.px("head", "front", 2, 1, hairLo);
      p.px("head", "front", 5, 1, hairLo);
    } else if (style === "thin") {
      p.rect("head", "front", 0, 0, 8, 1, hair);
      p.rect("head", "front", 0, 1, 2, 1, hair);
      p.rect("head", "front", 6, 1, 2, 1, hair);
      p.px("head", "front", 0, 2, hair);
      p.px("head", "front", 7, 2, hair);
    } else {
      p.rect("head", "front", 0, 0, 8, 1, hair);
      p.px("head", "front", 0, 1, hair);
      p.px("head", "front", 7, 1, hair);
      p.px("head", "front", 0, 2, hair);
      p.px("head", "front", 7, 2, hair);
    }
  }

  // ---- ears, nose, wrinkles --------------------------------------------------
  p.rect("head", "right", 3, 4, 2, 2, sh);
  p.rect("head", "left", 3, 4, 2, 2, sh);
  p.rect("head", "front", 3, 5, 2, 1, css(shade(look.skin, 0.9)));
  if (look.wrinkles) {
    p.rect("head", "front", 1, 2, 6, 1, sh);
    p.px("head", "front", 1, 5, sh);
    p.px("head", "front", 6, 5, sh);
    p.px("head", "front", 2, 6, sh);
  }

  // ---- brows -----------------------------------------------------------------
  const browY = eyes === "wide" ? 2 : 3;
  p.rect("head", "front", 1, browY, 2, 1, brow);
  p.rect("head", "front", 5, browY, 2, 1, brow);
  if (eyes === "narrow") {
    p.px("head", "front", 3, 3, sh2);
    p.px("head", "front", 4, 3, sh2);
  }

  // ---- eyes ------------------------------------------------------------------
  const white = "#f4f4f2";
  switch (eyes) {
    case "calm":
      p.px("head", "front", 1, 4, white); p.px("head", "front", 2, 4, iris);
      p.px("head", "front", 5, 4, iris); p.px("head", "front", 6, 4, white);
      break;
    case "narrow":
      p.px("head", "front", 1, 4, sh2); p.px("head", "front", 2, 4, iris);
      p.px("head", "front", 5, 4, iris); p.px("head", "front", 6, 4, sh2);
      break;
    case "wide":
      p.rect("head", "front", 1, 3, 2, 2, white); p.px("head", "front", 2, 4, iris); p.px("head", "front", 2, 3, iris);
      p.rect("head", "front", 5, 3, 2, 2, white); p.px("head", "front", 5, 4, iris); p.px("head", "front", 5, 3, iris);
      break;
    case "shut":
    case "down":
      p.rect("head", "front", 1, 4, 2, 1, brow);
      p.rect("head", "front", 5, 4, 2, 1, brow);
      break;
    case "happy":
      p.rect("head", "front", 1, 4, 2, 1, brow);
      p.rect("head", "front", 5, 4, 2, 1, brow);
      p.px("head", "front", 1, 5, css(mix(look.skin, 0xd05a5a, 0.35)));
      p.px("head", "front", 6, 5, css(mix(look.skin, 0xd05a5a, 0.35)));
      break;
  }

  // ---- glasses ---------------------------------------------------------------
  if (look.glasses !== undefined) {
    const g = css(look.glasses);
    p.px("head", "front", 0, 4, g); p.px("head", "front", 3, 4, g);
    p.px("head", "front", 4, 4, g); p.px("head", "front", 7, 4, g);
    p.px("head", "front", 3, 3, g); p.px("head", "front", 4, 3, g);
    p.rect("head", "front", 0, 5, 4, 1, g);
    p.rect("head", "front", 4, 5, 4, 1, g);
    p.px("head", "front", 1, 5, css(shade(look.glasses, 1.4))); p.px("head", "front", 6, 5, css(shade(look.glasses, 1.4)));
    p.px("head", "right", 7, 4, g); p.px("head", "right", 6, 4, g); p.px("head", "right", 5, 4, g);
    p.px("head", "left", 0, 4, g); p.px("head", "left", 1, 4, g); p.px("head", "left", 2, 4, g);
  }

  // ---- mouth -----------------------------------------------------------------
  switch (mouth) {
    case "flat":
      p.rect("head", "front", 2, 6, 4, 1, css(mix(shade(look.skin, 0.66), 0x6a3a30, 0.35)));
      break;
    case "grit":
      p.rect("head", "front", 2, 6, 4, 1, dark);
      p.rect("head", "front", 3, 6, 2, 1, white);
      break;
    case "smile":
      p.px("head", "front", 2, 6, lip); p.px("head", "front", 5, 6, lip);
      p.rect("head", "front", 3, 7, 2, 1, lip);
      break;
    case "frown":
      p.rect("head", "front", 3, 6, 2, 1, lip);
      p.px("head", "front", 2, 7, lip); p.px("head", "front", 5, 7, lip);
      break;
    case "talk":
      p.rect("head", "front", 3, 6, 2, 2, dark);
      p.px("head", "front", 2, 6, lip); p.px("head", "front", 5, 6, lip);
      break;
    case "laugh":
      p.rect("head", "front", 2, 6, 4, 1, white);
      p.rect("head", "front", 3, 7, 2, 1, dark);
      p.px("head", "front", 2, 7, lip); p.px("head", "front", 5, 7, lip);
      break;
    case "scream":
      p.rect("head", "front", 2, 6, 4, 1, white);
      p.rect("head", "front", 2, 7, 4, 1, dark);
      p.rect("head", "front", 3, 5, 2, 1, sh2);
      break;
  }
  if (look.stubble) {
    for (let x = 1; x < 7; x++) {
      if ((x + 1) % 2 === 0) p.px("head", "front", x, 7, sh);
    }
    p.px("head", "front", 1, 6, sh); p.px("head", "front", 6, 6, sh);
  }
}

export function makeBody(look: Look, eyes: Eyes, mouth: Mouth): Skin {
  const base = css(look.base ?? 0x4b4f57);
  const skin = css(look.skin);
  return createSkin((p) => {
    for (const part of ALL_PARTS) p.fill(part, "all", base);
    for (const face of RIGHT_ARM_FACES) {
      p.fill("armR", face, skin);
      p.fill("armL", face, skin);
    }
    paintHead(p, look, eyes, mouth);
  });
}

// ---------------------------------------------------------------------------
// Clothing sheets (transparent; unpainted texels reveal the body)
// ---------------------------------------------------------------------------

function clothes(draw: (p: SkinPainter) => void): Skin {
  return createSkin(draw, { transparent: true });
}

export interface SuitOptions {
  accent: number;
  /** "clear" = face visible through the visor; "gold" = mirrored; "cracked" = hit. */
  visor: "clear" | "gold" | "cracked";
  /** Right glove removed (thin liner glove only). */
  bareRight?: boolean;
  /** Frost on the exposed liner glove, 0..1. */
  frost?: number;
  /** Tone of the suit (0xRRGGBB). */
  cloth?: number;
  badge?: number;
  stripes?: number;
}

/** White pressure suit: reads as a layer over the body, helmet visor is a window. */
export function makeSuit(o: SuitOptions): Skin {
  const white = o.cloth ?? 0xe8ecf0;
  const W = css(white);
  const W2 = css(shade(white, 0.86));
  const G = css(0x8d97a3);
  const GD = css(0x4b525c);
  const A = css(o.accent);
  return clothes((p) => {
    for (const part of ALL_PARTS) p.fill(part, "all", W);
    for (const part of ALL_PARTS) p.grain(part, "all", 0.035, 7);

    // helmet
    p.fill("head", ["top", "back", "left", "right"], W);
    p.rect("head", "top", 3, 0, 2, 8, W2);
    p.rect("head", "back", 2, 5, 4, 2, G);
    p.rect("head", "left", 0, 6, 8, 2, W2);
    p.rect("head", "right", 0, 6, 8, 2, W2);
    p.rect("head", "left", 2, 3, 4, 1, A);
    p.rect("head", "right", 2, 3, 4, 1, A);
    p.rect("head", "front", 0, 0, 8, 8, W);
    p.rect("head", "front", 0, 1, 8, 1, G);
    p.rect("head", "front", 0, 7, 8, 1, G);
    p.rect("head", "front", 0, 2, 1, 5, G);
    p.rect("head", "front", 7, 2, 1, 5, G);
    p.rect("head", "front", 3, 0, 2, 1, A);
    if (o.visor === "clear") {
      p.erase("head", "front", 1, 2, 6, 5);
    } else if (o.visor === "gold") {
      p.rect("head", "front", 1, 2, 6, 5, "#c9962f");
      p.rect("head", "front", 1, 2, 6, 2, "#e6c163");
      p.rect("head", "front", 1, 4, 6, 1, "#7d9fc9");
      p.rect("head", "front", 1, 5, 6, 2, "#a3742a");
      p.px("head", "front", 5, 2, "#fff6d8"); p.px("head", "front", 6, 2, "#fff6d8");
    } else {
      p.rect("head", "front", 1, 2, 6, 5, "#aeb8c4");
      p.rect("head", "front", 1, 2, 6, 1, "#c7d0da");
      // cracks
      for (const [x, y] of [[3, 2], [3, 3], [4, 4], [4, 5], [5, 6], [2, 4], [1, 5], [5, 3], [6, 2]] as const) {
        p.px("head", "front", x, y, "#4d5560");
      }
      // blood from inside
      for (const [x, y] of [[2, 3], [3, 4], [4, 3], [3, 5], [2, 5], [4, 6], [5, 5], [3, 6]] as const) {
        p.px("head", "front", x, y, "#a3141b");
      }
      p.px("head", "front", 4, 4, "#d92a2f"); p.px("head", "front", 3, 3, "#d92a2f");
    }

    // torso
    p.rect("torso", "front", 1, 2, 6, 5, "#9db0c4");
    p.rect("torso", "front", 1, 2, 6, 1, G);
    p.rect("torso", "front", 1, 6, 6, 1, G);
    p.px("torso", "front", 2, 4, "#d94a3d"); p.px("torso", "front", 3, 4, "#e6c13a");
    p.px("torso", "front", 4, 4, "#4fcf7a"); p.px("torso", "front", 5, 4, "#5aa7ff");
    p.rect("torso", "front", 2, 5, 4, 1, GD);
    p.rect("torso", "front", 0, 9, 8, 1, G);
    p.rect("torso", "front", 0, 10, 8, 2, W2);
    p.rect("torso", "front", 0, 0, 8, 1, G);
    p.rect("torso", "front", 0, 1, 2, 3, A);
    if (o.badge !== undefined) p.rect("torso", "front", 6, 1, 2, 2, css(o.badge));
    p.rect("torso", "back", 0, 9, 8, 1, G);
    p.rect("torso", "back", 2, 2, 4, 6, W2);
    p.rect("torso", "left", 0, 9, 4, 1, G);
    p.rect("torso", "right", 0, 9, 4, 1, G);

    // arms: shoulder seam, accent band, wrist ring, gloves
    for (const arm of ["armR", "armL"] as const) {
      for (const face of ["front", "back", "left", "right"] as const) {
        p.rect(arm, face, 0, 2, 4, 1, G);
        p.rect(arm, face, 0, 4, 4, 1, A);
        p.rect(arm, face, 0, 8, 4, 1, G);
        p.rect(arm, face, 0, 9, 4, 3, GD);
      }
      p.fill(arm, "bottom", GD);
    }
    if (o.bareRight) {
      const liner = css(mix(0xd8c7a6, 0xcfe4ff, o.frost ?? 0));
      const linerShade = css(shade(mix(0xd8c7a6, 0xcfe4ff, o.frost ?? 0), 0.85));
      for (const face of ["front", "back", "left", "right"] as const) {
        p.rect("armR", face, 0, 9, 4, 3, liner);
        p.rect("armR", face, 0, 10, 4, 1, linerShade);
      }
      p.fill("armR", "bottom", liner);
      if ((o.frost ?? 0) > 0.05) {
        for (const face of ["front", "back", "left", "right"] as const) {
          for (let i = 0; i < 4 + Math.floor((o.frost ?? 0) * 8); i++) {
            p.px("armR", face, (i * 3) % 4, 9 + ((i * 5) % 3), "#f3fbff");
          }
        }
      }
    }

    // legs: knee ring, boots
    for (const leg of ["legR", "legL"] as const) {
      for (const face of ["front", "back", "left", "right"] as const) {
        p.rect(leg, face, 0, 5, 4, 1, G);
        p.rect(leg, face, 0, 6, 4, 1, W2);
        p.rect(leg, face, 0, 9, 4, 3, GD);
        p.rect(leg, face, 0, 9, 4, 1, G);
      }
      p.fill(leg, "bottom", GD);
    }
  });
}

/** Zhang Beihai's civilian clothes: charcoal zip jacket, dark trousers, black shoes. */
export function makeJacket(): Skin {
  const J = css(0x3d4756);
  const J2 = css(0x4c586a);
  const T = css(0x2c313b);
  return clothes((p) => {
    for (const part of ["torso", "armR", "armL"] as PartName[]) p.fill(part, "all", J);
    p.fill("legR", "all", T);
    p.fill("legL", "all", T);
    for (const part of ["torso", "armR", "armL", "legR", "legL"] as PartName[]) p.grain(part, "all", 0.05, 11);
    // stand collar and zip
    p.rect("torso", "front", 0, 0, 8, 2, J2);
    p.rect("torso", "back", 0, 0, 8, 2, J2);
    p.rect("torso", "left", 0, 0, 4, 2, J2);
    p.rect("torso", "right", 0, 0, 4, 2, J2);
    p.rect("torso", "front", 3, 2, 1, 10, "#79808b");
    p.px("torso", "front", 4, 2, "#79808b");
    p.rect("torso", "front", 1, 8, 2, 1, J2);
    p.rect("torso", "front", 5, 8, 2, 1, J2);
    p.rect("torso", "front", 0, 11, 8, 1, J2);
    p.rect("torso", "back", 0, 11, 8, 1, J2);
    for (const arm of ["armR", "armL"] as const) {
      for (const face of ["front", "back", "left", "right"] as const) p.rect(arm, face, 0, 10, 4, 2, J2);
    }
    // shoes
    for (const leg of ["legR", "legL"] as const) {
      for (const face of ["front", "back", "left", "right"] as const) p.rect(leg, face, 0, 10, 4, 2, "#0c0d10");
      p.fill(leg, "bottom", "#0c0d10");
    }
  });
}

/** The collector: knitted brown cardigan over a checked shirt, house trousers. */
export function makeCardigan(): Skin {
  const K = css(0x84573a);
  const K2 = css(0x6e4630);
  const P = css(0x5c5b57);
  return clothes((p) => {
    for (const part of ["torso", "armR", "armL"] as PartName[]) p.fill(part, "all", K);
    p.fill("legR", "all", P);
    p.fill("legL", "all", P);
    // knit rows
    for (const part of ["torso", "armR", "armL"] as PartName[]) {
      for (const face of ["front", "back", "left", "right"] as const) {
        const h = part === "torso" ? 12 : 12;
        for (let y = 0; y < h; y += 2) {
          const w = part === "torso" ? (face === "front" || face === "back" ? 8 : 4) : 4;
          p.rect(part, face, 0, y, w, 1, K2);
        }
      }
      p.grain(part, "all", 0.07, 3);
    }
    p.grain("legR", "all", 0.04, 5);
    p.grain("legL", "all", 0.04, 5);
    // V-neck showing a checked shirt (drawn on this sheet: the layer is flattened)
    const shirtA = "#cfd6dc";
    const shirtB = "#8fa3b8";
    const checks = (x: number, y: number) => ((x + y) % 2 === 0 ? shirtA : shirtB);
    p.erase("torso", "front", 2, 0, 4, 1);
    p.erase("torso", "front", 3, 1, 2, 2);
    for (let x = 2; x < 6; x++) p.px("torso", "front", x, 0, checks(x, 0));
    for (let x = 3; x < 5; x++) for (let y = 1; y < 3; y++) p.px("torso", "front", x, y, checks(x, y));
    p.px("torso", "front", 3, 0, "#f1f3f4"); p.px("torso", "front", 4, 0, "#f1f3f4");
    // buttons
    for (const y of [4, 6, 8, 10]) p.px("torso", "front", 3, y, "#3a2416");
    p.rect("torso", "front", 0, 11, 8, 1, K2);
    for (const arm of ["armR", "armL"] as const) {
      for (const face of ["front", "back", "left", "right"] as const) p.rect(arm, face, 0, 10, 4, 2, K2);
      // frayed cuffs show a shirt cuff
      for (const face of ["front", "back", "left", "right"] as const) p.rect(arm, face, 0, 11, 4, 1, shirtA);
    }
    for (const leg of ["legR", "legL"] as const) {
      for (const face of ["front", "back", "left", "right"] as const) p.rect(leg, face, 0, 10, 4, 2, "#141414");
      p.fill(leg, "bottom", "#141414");
    }
  });
}

/** Expedition parka with a furred hood: the collector's Antarctic memory. */
export function makeParka(): Skin {
  const O = css(0xe0642a);
  const O2 = css(0xb84a1e);
  const F = css(0xd9d3c7);
  return clothes((p) => {
    for (const part of ALL_PARTS) p.fill(part, "all", O);
    for (const part of ALL_PARTS) p.grain(part, "all", 0.05, 9);
    p.fill("legR", "all", "#2d3138");
    p.fill("legL", "all", "#2d3138");
    p.fill("head", "all", O2);
    p.rect("head", "front", 0, 0, 8, 8, F);
    p.erase("head", "front", 1, 2, 6, 5);
    p.rect("head", "front", 1, 2, 6, 1, F);
    p.rect("torso", "front", 3, 0, 2, 12, O2);
    p.rect("torso", "front", 0, 6, 8, 1, O2);
    for (const arm of ["armR", "armL"] as const) {
      for (const face of ["front", "back", "left", "right"] as const) p.rect(arm, face, 0, 9, 4, 3, "#2d3138");
    }
    for (const leg of ["legR", "legL"] as const) {
      for (const face of ["front", "back", "left", "right"] as const) p.rect(leg, face, 0, 9, 4, 3, "#171a1f");
    }
  });
}

/** Keep texture objects alive and typed. */
export type TextureBox = THREE.Texture;
