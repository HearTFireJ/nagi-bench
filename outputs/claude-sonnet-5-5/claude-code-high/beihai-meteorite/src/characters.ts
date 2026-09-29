import * as THREE from "three";
import {
  applyPose,
  createFigure,
  createSkin,
  voxelMaterial,
  voxelModel,
  type Figure,
  type Pose,
  type SkinPainter,
} from "@agentbench/voxel-kit";

/* ------------------------------------------------------------------ faces */

export type Mood = "neutral" | "grim" | "smile" | "shock";
export interface Look {
  skin: string;
  shade: string;
  hair: string;
  eye?: string;
  lip?: string;
  glasses?: string;
  hairStyle: "crop" | "short" | "receding" | "long" | "bald";
  stubble?: boolean;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

function paintHead(p: SkinPainter, look: Look, mood: Mood, talking: boolean): void {
  const eye = look.eye ?? "#15171b";
  const lip = look.lip ?? mixHex("#8a4a3d", look.skin, 0.4);
  p.fill("head", "all", look.skin);
  // hair
  const h = look.hair;
  if (look.hairStyle !== "bald") {
    p.fill("head", "top", h);
    p.rect("head", "back", 0, 0, 8, look.hairStyle === "long" ? 8 : 5, h);
    for (const side of ["left", "right"] as const) {
      p.rect("head", side, 0, 0, 8, look.hairStyle === "long" ? 8 : 3, h);
      p.rect("head", side, 0, 3, 2, look.hairStyle === "long" ? 5 : 1, h);
    }
    p.rect("head", "front", 0, 0, 8, look.hairStyle === "receding" ? 1 : 2, h);
    if (look.hairStyle === "crop" || look.hairStyle === "long") {
      p.px("head", "front", 0, 2, h);
      p.px("head", "front", 7, 2, h);
    }
    if (look.hairStyle === "short") {
      p.px("head", "front", 0, 2, h);
      p.px("head", "front", 7, 2, h);
      p.px("head", "front", 1, 2, h);
    }
  }
  p.px("head", "front", 3, 4, look.shade);
  p.px("head", "front", 4, 4, look.shade);
  p.px("head", "front", 0, 5, look.shade);
  p.px("head", "front", 7, 5, look.shade);
  if (look.stubble) {
    for (const [x, y] of [[1, 6], [2, 7], [5, 7], [6, 6], [3, 7], [4, 7]]) p.px("head", "front", x, y, look.shade);
  }
  const brow = look.hairStyle === "receding" ? "#8d8a86" : mixHex(h, look.skin, 0.38);
  const wide = mood === "shock";
  const y = wide ? 2 : 3;
  // eyes
  if (mood === "grim") {
    p.px("head", "front", 1, 3, "#f4f4f2");
    p.px("head", "front", 2, 3, eye);
    p.px("head", "front", 5, 3, eye);
    p.px("head", "front", 6, 3, "#f4f4f2");
    p.rect("head", "front", 1, 2, 3, 1, brow);
    p.rect("head", "front", 4, 2, 3, 1, brow);
  } else if (wide) {
    p.rect("head", "front", 1, 2, 2, 2, "#f4f4f2");
    p.rect("head", "front", 5, 2, 2, 2, "#f4f4f2");
    p.px("head", "front", 2, 3, eye);
    p.px("head", "front", 5, 3, eye);
    p.rect("head", "front", 1, 1, 2, 1, brow);
    p.rect("head", "front", 5, 1, 2, 1, brow);
  } else {
    p.px("head", "front", 1, y, "#f4f4f2");
    p.px("head", "front", 2, y, eye);
    p.px("head", "front", 5, y, eye);
    p.px("head", "front", 6, y, "#f4f4f2");
    if (!look.glasses) {
      const by = mood === "smile" ? 1 : 2;
      p.rect("head", "front", 1, by, 2, 1, brow);
      p.rect("head", "front", 5, by, 2, 1, brow);
    }
  }
  if (look.glasses) {
    const g = look.glasses;
    p.rect("head", "front", 1, 2, 2, 1, g);
    p.rect("head", "front", 5, 2, 2, 1, g);
    p.px("head", "front", 0, 3, g);
    p.px("head", "front", 3, 3, g);
    p.px("head", "front", 4, 3, g);
    p.px("head", "front", 7, 3, g);
    p.px("head", "left", 0, 3, g);
    p.px("head", "right", 7, 3, g);
  }
  // mouth
  if (talking || wide) {
    p.rect("head", "front", 3, 5, 2, 2, "#4f1c1c");
    p.px("head", "front", 2, 5, lip);
    p.px("head", "front", 5, 5, lip);
  } else if (mood === "smile") {
    p.px("head", "front", 2, 5, lip);
    p.px("head", "front", 5, 5, lip);
    p.rect("head", "front", 3, 6, 2, 1, lip);
  } else if (mood === "grim") {
    p.rect("head", "front", 2, 6, 4, 1, lip);
  } else {
    p.rect("head", "front", 3, 6, 2, 1, lip);
  }
  p.grain("head", ["front", "left", "right"], 0.025, 3);
}

export interface Wardrobe {
  torso: string;
  torsoDark: string;
  arm: string;
  leg: string;
  shoe: string;
}

function paintUnder(p: SkinPainter, look: Look, under: string): void {
  p.fill("torso", "all", under);
  for (const a of ["armR", "armL"] as const) p.fill(a, "all", look.skin);
  p.fill("legR", "all", "#3a3f4a");
  p.fill("legL", "all", "#3a3f4a");
}

export interface Bodies {
  set(figure: Figure, mood: Mood, talking: boolean): void;
}

/** Eight face variants (mood × talking) built once per character. */
export function makeBodies(look: Look, under = "#cfd2d6", arm: "classic" | "slim" = "classic"): Bodies {
  const cache = new Map<string, THREE.Texture>();
  const moods: Mood[] = ["neutral", "grim", "smile", "shock"];
  for (const m of moods) {
    for (const t of [false, true]) {
      const skin = createSkin(
        (p) => {
          paintUnder(p, look, under);
          paintHead(p, look, m, t);
        },
        { arm },
      );
      cache.set(`${m}${t ? "T" : ""}`, skin.texture);
    }
  }
  const applied = new WeakMap<Figure, string>();
  return {
    set(figure, mood, talking) {
      const key = mood + (talking ? "T" : "");
      if (applied.get(figure) === key) return; // setBody flags the material for a rebuild; only do it on change
      applied.set(figure, key);
      figure.setBody(cache.get(key)!);
    },
  };
}

/* ---------------------------------------------------------------- clothing */

export function jacketSheet(w: Wardrobe, opts: { badge?: boolean; scarf?: string } = {}): THREE.Texture {
  return createSkin(
    (p) => {
      p.fill("torso", "all", w.torso);
      p.rect("torso", "front", 3, 0, 2, 2, "#e8e6e0");
      p.rect("torso", "front", 3, 2, 1, 10, w.torsoDark);
      p.rect("torso", "front", 0, 11, 8, 1, "#15171a");
      p.rect("torso", "front", 1, 4, 2, 1, w.torsoDark);
      p.rect("torso", "front", 5, 4, 2, 1, w.torsoDark);
      if (opts.badge) {
        p.rect("torso", "front", 5, 2, 2, 2, "#d8b24a");
        p.px("torso", "front", 5, 2, "#b3262b");
      }
      if (opts.scarf) p.rect("torso", "front", 2, 0, 4, 1, opts.scarf);
      p.fill("armR", "all", w.arm);
      p.fill("armL", "all", w.arm);
      for (const a of ["armR", "armL"] as const) {
        p.erase(a, "front", 0, 10, 4, 2);
        p.erase(a, "back", 0, 10, 4, 2);
        p.erase(a, "left", 0, 10, 4, 2);
        p.erase(a, "right", 0, 10, 4, 2);
        p.erase(a, "bottom", 0, 0, 4, 4);
        p.rect(a, "front", 0, 9, 4, 1, w.torsoDark);
      }
      p.fill("legR", "all", w.leg);
      p.fill("legL", "all", w.leg);
      for (const l of ["legR", "legL"] as const) {
        p.rect(l, "front", 0, 10, 4, 2, w.shoe);
        p.rect(l, "back", 0, 10, 4, 2, w.shoe);
        p.rect(l, "left", 0, 10, 4, 2, w.shoe);
        p.rect(l, "right", 0, 10, 4, 2, w.shoe);
        p.fill(l, "bottom", w.shoe);
      }
      for (const part of ["torso", "armR", "armL", "legR", "legL"] as const) p.grain(part, "all", 0.05, 11);
    },
    { transparent: true },
  ).texture;
}

export function knitSheet(): THREE.Texture {
  return createSkin(
    (p) => {
      p.fill("torso", "all", "#a89878");
      p.rect("torso", "front", 2, 0, 4, 1, "#e6e1d2");
      p.rect("torso", "front", 3, 1, 2, 1, "#e6e1d2");
      for (let y = 2; y < 12; y += 3) p.rect("torso", "front", 0, y, 8, 1, "#8f8062");
      p.rect("torso", "front", 0, 11, 8, 1, "#7d6f54");
      for (const a of ["armR", "armL"] as const) {
        p.fill(a, "all", "#8ea3b3");
        p.rect(a, "front", 0, 0, 4, 2, "#a89878");
        p.erase(a, "front", 0, 10, 4, 2);
        p.erase(a, "back", 0, 10, 4, 2);
        p.erase(a, "left", 0, 10, 4, 2);
        p.erase(a, "right", 0, 10, 4, 2);
        p.erase(a, "bottom", 0, 0, 4, 4);
      }
      p.fill("legR", "all", "#6b6654");
      p.fill("legL", "all", "#6b6654");
      for (const l of ["legR", "legL"] as const) {
        for (const f of ["front", "back", "left", "right", "bottom"] as const) p.rect(l, f, 0, 10, 4, 2, "#2c2925");
      }
      for (const part of ["torso", "armR", "armL", "legR", "legL"] as const) p.grain(part, "all", 0.07, 5);
    },
    { transparent: true },
  ).texture;
}

export type SuitTrim = "orange" | "blue" | "green" | "red" | "grey";
export type Visor = "gold" | "clear" | "cracked";

const TRIM: Record<SuitTrim, string> = {
  orange: "#e0762a",
  blue: "#2f6fb5",
  green: "#3c9a5f",
  red: "#c23a35",
  grey: "#8b929b",
};

export function suitSheet(trim: SuitTrim, visor: Visor, opts: { bareRight?: boolean } = {}): THREE.Texture {
  const c = TRIM[trim];
  return createSkin(
    (p) => {
      const white = "#dde1e6";
      const seam = "#9aa1aa";
      p.fill("head", "all", white);
      p.rect("head", "top", 3, 0, 2, 8, seam);
      p.rect("head", "back", 2, 5, 4, 1, seam);
      p.rect("head", "back", 2, 6, 4, 1, seam);
      p.rect("head", "left", 6, 3, 2, 3, seam);
      p.rect("head", "right", 0, 3, 2, 3, seam);
      if (visor === "gold") {
        p.rect("head", "front", 1, 2, 6, 5, "#c79a3c");
        p.rect("head", "front", 1, 5, 6, 2, "#8f6c26");
        p.rect("head", "front", 1, 2, 2, 1, "#f2dfa4");
        p.px("head", "front", 4, 3, "#e8c46a");
      } else if (visor === "clear") {
        p.erase("head", "front", 1, 2, 6, 5);
      } else {
        p.rect("head", "front", 1, 2, 6, 5, "#c9d3d8");
        for (const [x, y] of [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 2], [5, 3], [4, 4], [3, 5], [2, 6], [3, 3], [4, 3], [3, 2], [5, 4]]) {
          p.px("head", "front", x, y, "#5a6068");
        }
        for (const [x, y] of [[2, 4], [3, 6], [4, 5], [5, 5], [2, 5], [6, 4], [4, 6], [1, 5]]) p.px("head", "front", x, y, "#8e1b20");
      }
      // torso
      p.fill("torso", "all", white);
      p.rect("torso", "front", 2, 2, 4, 4, "#3d434b");
      p.px("torso", "front", 3, 3, "#d94040");
      p.px("torso", "front", 4, 3, "#46c46b");
      p.rect("torso", "front", 2, 5, 4, 1, "#23272c");
      p.rect("torso", "front", 0, 8, 8, 1, seam);
      p.rect("torso", "front", 0, 0, 1, 12, c);
      p.rect("torso", "front", 7, 0, 1, 12, c);
      p.rect("torso", "back", 1, 1, 6, 8, "#c4c9d0");
      p.rect("torso", "back", 0, 9, 8, 1, seam);
      for (const a of ["armR", "armL"] as const) {
        p.fill(a, "all", white);
        p.rect(a, "front", 0, 0, 4, 2, c);
        p.rect(a, "back", 0, 0, 4, 2, c);
        p.rect(a, "left", 0, 0, 4, 2, c);
        p.rect(a, "right", 0, 0, 4, 2, c);
        p.rect(a, "front", 0, 5, 4, 1, seam);
        p.rect(a, "back", 0, 5, 4, 1, seam);
        for (const f of ["front", "back", "left", "right", "bottom"] as const) p.rect(a, f, 0, 9, 4, 3, "#7c848d");
      }
      if (opts.bareRight) {
        // the right glove is off: only a thin cloth liner, already dusted with frost
        for (const f of ["front", "back", "left", "right", "bottom"] as const) p.rect("armR", f, 0, 9, 4, 3, "#b9c6d3");
        for (const [x, y] of [[0, 10], [2, 11], [3, 9], [1, 11], [2, 9]]) p.px("armR", "front", x, y, "#f4fbff");
        p.px("armR", "back", 1, 10, "#f4fbff");
      }
      for (const l of ["legR", "legL"] as const) {
        p.fill(l, "all", white);
        for (const f of ["front", "back", "left", "right"] as const) {
          p.rect(l, f, 0, 5, 4, 1, seam);
          p.rect(l, f, 0, 9, 4, 3, "#565d66");
        }
        p.fill(l, "bottom", "#3a3f46");
      }
      for (const part of ["head", "torso", "armR", "armL", "legR", "legL"] as const) p.grain(part, "all", 0.035, 9);
    },
    { transparent: true },
  ).texture;
}

/* ------------------------------------------------------------------- props */

const STEEL = 0x3b4048;
const DARK = 0x23272d;
const GRIP = 0x5b4633;

export function pistolGeometry(): THREE.BufferGeometry {
  const side = [
    "..############..",
    "..############..",
    "..bbbbbbbbbbbb..",
    "...bb..bbbbb....",
    "...bg..bb.......",
    "...gg...........",
    "...gg...........",
    "...gg...........",
  ].map((r) => r.padEnd(16, ".").slice(0, 16));
  const mid = side.map((r) => r);
  return voxelModel({
    palette: { "#": STEEL, b: DARK, g: GRIP },
    layers: [side, mid, mid],
    axis: "x",
    voxel: 0.42,
  });
}

export function scopeGeometry(): THREE.BufferGeometry {
  const tube = [
    ".oooooooooooo.",
    "ooLooooooooooB",
    ".oooooooooooo.",
  ];
  const cap = [
    "..............",
    ".oooooooooooo.",
    "..............",
  ];
  return voxelModel({
    palette: { o: DARK, L: 0x7fd0ff, B: 0x9ec7de },
    layers: [cap, tube, tube, tube, cap],
    axis: "x",
    voxel: 0.42,
  });
}

export function cameraGeometry(): THREE.BufferGeometry {
  const body = [
    "..####..",
    "########",
    "#gggg###",
    "#gLLg###",
    "#gLLg###",
    "#gggg###",
    "########",
  ];
  return voxelModel({
    palette: { "#": 0x33373d, g: 0x1c1e22, L: 0x8fd2ff },
    layers: [body, body, body, body, body],
    axis: "x",
    voxel: 0.55,
  });
}

export function backpackGeometry(trim: number): THREE.BufferGeometry {
  const s = [
    ".wwwwwww.",
    "wwwwwwwww",
    "wwwtttwww",
    "wwwtttwww",
    "wwwwwwwww",
    "wwwwwwwww",
    "wwwwwwwww",
    ".wwwwwww.",
    "..n...n..",
  ];
  return voxelModel({
    palette: { w: 0xd3d8de, t: trim, n: 0x555b63 },
    layers: [s, s, s, s, s, s, s, s],
    axis: "x",
    voxel: 0.9,
  });
}

/** Small utility to mount a voxel prop on an anchor. */
export function mount(anchor: THREE.Object3D, geometry: THREE.BufferGeometry, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]): THREE.Mesh {
  const m = new THREE.Mesh(geometry, voxelMaterial({ roughness: 0.6, metalness: 0.15 }));
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true;
  anchor.add(m);
  return m;
}

/* ------------------------------------------------------------- pose helpers */

export type E3 = [number, number, number];
export const P = (o: Partial<Pose> & Record<string, unknown>): Pose => o as Pose;

export function poseApply(fig: Figure, pose: Pose): void {
  applyPose(fig, pose);
}

export function addPose(a: Pose, b: Pose): Pose {
  const out: Pose = {};
  for (const j of ["hips", "neck", "armR", "armL", "legR", "legL"] as const) {
    const x = a[j] ?? [0, 0, 0];
    const y = b[j] ?? [0, 0, 0];
    out[j] = [x[0] + y[0], x[1] + y[1], x[2] + y[2]];
  }
  out.lift = (a.lift ?? 0) + (b.lift ?? 0);
  return out;
}

export function makeFigure(
  body: THREE.Texture,
  clothes: THREE.Texture | null,
  heightM: number,
  arm: "classic" | "slim" = "classic",
): Figure {
  return createFigure({ body, clothes, heightM, arm });
}
