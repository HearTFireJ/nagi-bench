import * as THREE from "three";
import {
  createFigure,
  createSkin,
  applyPose,
  lerpPose,
  type Figure,
  type Pose,
  type SkinPainter,
  type PartName,
} from "@agentbench/voxel-kit";
import { rng } from "./util";

/*
 * Every face, brow, mouth, seam and insignia below is a texel on the 64x64 sheet.
 * Nothing is added as geometry. Body and clothing are separate sheets so the same
 * man can stand in a hutong coat in one act and a pressure suit in the next.
 */

const ALL: PartName[] = ["head", "torso", "armR", "armL", "legR", "legL"];

interface FaceSpec {
  skin: string;
  hair: string;
  hairline: number;          // rows of hair on the front face (0..3)
  browY: number;
  brow: string;
  eye: string;
  pupil: string;
  mouth: string;
  mouthShape: "firm" | "smile" | "open" | "line";
  glasses?: string;
  beard?: string;
  age?: number;              // 0..1 adds wrinkles / grey
}

function paintHead(p: SkinPainter, f: FaceSpec): void {
  p.fill("head", "all", f.skin);
  // Hair: top, back, and the upper rows of the sides / front.
  p.fill("head", "top", f.hair);
  p.rect("head", "back", 0, 0, 8, 5, f.hair);
  p.rect("head", "left", 0, 0, 8, 3, f.hair);
  p.rect("head", "right", 0, 0, 8, 3, f.hair);
  if (f.hairline > 0) p.rect("head", "front", 0, 0, 8, f.hairline, f.hair);
  // Ears are shading only.
  p.rect("head", "left", 3, 3, 2, 2, shade(f.skin, 0.9));
  p.rect("head", "right", 3, 3, 2, 2, shade(f.skin, 0.9));
  // Brows.
  p.rect("head", "front", 1, f.browY, 2, 1, f.brow);
  p.rect("head", "front", 5, f.browY, 2, 1, f.brow);
  // Eyes: whites and pupils, one row below the brows.
  const ey = f.browY + 1;
  p.px("head", "front", 1, ey, f.eye);
  p.px("head", "front", 2, ey, f.pupil);
  p.px("head", "front", 5, ey, f.pupil);
  p.px("head", "front", 6, ey, f.eye);
  // Nose shadow.
  p.rect("head", "front", 3, ey + 1, 2, 1, shade(f.skin, 0.86));
  // Mouth.
  const my = ey + 2;
  if (f.mouthShape === "firm") {
    p.rect("head", "front", 2, my, 4, 1, f.mouth);
  } else if (f.mouthShape === "smile") {
    p.rect("head", "front", 3, my, 2, 1, f.mouth);
    p.px("head", "front", 2, my - 1, f.mouth);
    p.px("head", "front", 5, my - 1, f.mouth);
  } else if (f.mouthShape === "open") {
    p.rect("head", "front", 3, my - 1, 2, 2, "#3a1a1a");
  } else {
    p.rect("head", "front", 3, my, 2, 1, f.mouth);
  }
  if (f.glasses) {
    p.px("head", "front", 0, ey, f.glasses);
    p.px("head", "front", 3, ey, f.glasses);
    p.px("head", "front", 4, ey, f.glasses);
    p.px("head", "front", 7, ey, f.glasses);
    p.px("head", "front", 1, ey + 1, f.glasses);
    p.px("head", "front", 2, ey + 1, f.glasses);
    p.px("head", "front", 5, ey + 1, f.glasses);
    p.px("head", "front", 6, ey + 1, f.glasses);
  }
  if (f.beard) {
    p.rect("head", "front", 1, my, 6, 8 - my, f.beard);
    p.rect("head", "front", 3, my, 2, 1, f.mouth);
  }
  if (f.age && f.age > 0.4) {
    // Crow's feet and a tired line under the eyes.
    p.px("head", "front", 0, ey + 1, shade(f.skin, 0.88));
    p.px("head", "front", 7, ey + 1, shade(f.skin, 0.88));
    p.px("head", "front", 1, ey + 2, shade(f.skin, 0.9));
    p.px("head", "front", 6, ey + 2, shade(f.skin, 0.9));
  }
  p.grain("head", "all", 0.04, 7);
}

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

function paintBareBody(p: SkinPainter, skin: string, handTone = skin): void {
  for (const part of ["torso", "armR", "armL", "legR", "legL"] as PartName[]) p.fill(part, "all", skin);
  // Thin under-gloves (used by the spacesuit body) or bare hands.
  p.rect("armR", "front", 0, 10, 4, 2, handTone);
  p.rect("armR", "back", 0, 10, 4, 2, handTone);
  p.rect("armR", "left", 0, 10, 4, 2, handTone);
  p.rect("armR", "right", 0, 10, 4, 2, handTone);
  p.fill("armR", "bottom", handTone);
  p.rect("armL", "front", 0, 10, 4, 2, handTone);
  p.rect("armL", "back", 0, 10, 4, 2, handTone);
  p.rect("armL", "left", 0, 10, 4, 2, handTone);
  p.rect("armL", "right", 0, 10, 4, 2, handTone);
  p.fill("armL", "bottom", handTone);
}

/* ---------------------------------------------------------------- bodies */

export const ZHANG_FACE: FaceSpec = {
  skin: "#c99a76",
  hair: "#15161a",
  hairline: 2,
  browY: 3,
  brow: "#15161a",
  eye: "#efe9df",
  pupil: "#1a1a1e",
  mouth: "#7f4f42",
  mouthShape: "firm",
};

export function zhangBody(glovedHands = false) {
  return createSkin((p) => {
    paintHead(p, ZHANG_FACE);
    paintBareBody(p, ZHANG_FACE.skin, glovedHands ? "#3b4048" : ZHANG_FACE.skin);
    // A plain undershirt so the body reads even where a coat is erased.
    p.fill("torso", "all", "#d8d2c6");
  });
}

export const COLLECTOR_FACE: FaceSpec = {
  skin: "#d7a887",
  hair: "#a9a9a6",
  hairline: 1,
  browY: 3,
  brow: "#77736d",
  eye: "#f0ebe2",
  pupil: "#2b2420",
  mouth: "#9a5a4c",
  mouthShape: "smile",
  glasses: "#3a3733",
  age: 0.7,
};

export function collectorBody() {
  return createSkin((p) => {
    paintHead(p, COLLECTOR_FACE);
    // Receding hairline: the front row of hair is only at the temples.
    p.rect("head", "front", 2, 0, 4, 1, COLLECTOR_FACE.skin);
    paintBareBody(p, COLLECTOR_FACE.skin);
    p.fill("torso", "all", "#e6e0d2");
  });
}

/** A random attendee face for the photo crowd. Seeded so seeks are stable. */
export function attendeeBody(seed: number, senior = false) {
  const r = rng(seed * 7919 + 17);
  const skins = ["#d9ae8c", "#c98f6c", "#e2bd9c", "#b9805f", "#cfa27d"];
  const hairs = senior ? ["#9d9c99", "#6c6864", "#bcbab5"] : ["#1b1b1f", "#2d2320", "#3c2a20", "#151518"];
  const face: FaceSpec = {
    skin: skins[Math.floor(r() * skins.length)]!,
    hair: hairs[Math.floor(r() * hairs.length)]!,
    hairline: senior ? 1 : 1 + Math.floor(r() * 2),
    browY: 3,
    brow: senior ? "#6a655f" : "#1b1b1f",
    eye: "#f0ebe2",
    pupil: "#1e1a18",
    mouth: "#8a5548",
    mouthShape: r() < 0.5 ? "line" : "smile",
    glasses: r() < (senior ? 0.7 : 0.25) ? "#2b2a28" : undefined,
    age: senior ? 0.8 : r() * 0.3,
  };
  return createSkin((p) => {
    paintHead(p, face);
    paintBareBody(p, face.skin, "#3b4048");
    p.fill("torso", "all", "#cfd3d8");
  });
}

/* --------------------------------------------------------------- clothes */

/** Zhang's hutong coat: dark, high collar, cut like a uniform that has stopped being one. */
export function zhangCoat() {
  return createSkin((p) => {
    const coat = "#2b313b", dark = "#1f242c", collar = "#3d4553", trouser = "#23262c";
    p.fill("torso", "all", coat);
    p.rect("torso", "front", 0, 0, 8, 1, collar);
    p.rect("torso", "back", 0, 0, 8, 1, collar);
    p.rect("torso", "front", 3, 1, 2, 11, dark);        // closure seam
    p.px("torso", "front", 4, 3, "#8a8f98");             // buttons
    p.px("torso", "front", 4, 6, "#8a8f98");
    p.px("torso", "front", 4, 9, "#8a8f98");
    p.rect("torso", "front", 1, 10, 6, 2, dark);         // hem shadow
    for (const arm of ["armR", "armL"] as PartName[]) {
      p.fill(arm, "all", coat);
      p.clear(arm, "bottom");
      for (const face of ["front", "back", "left", "right"] as const) p.erase(arm, face, 0, 10, 4, 2); // hands bare
      p.rect(arm, "front", 0, 9, 4, 1, dark);            // cuff
    }
    for (const leg of ["legR", "legL"] as PartName[]) {
      p.fill(leg, "all", trouser);
      for (const face of ["front", "back", "left", "right"] as const) p.rect(leg, face, 0, 11, 4, 1, "#0f0f11"); // shoes
      p.fill(leg, "bottom", "#0f0f11");
    }
    p.grain("torso", "all", 0.05, 3);
  }, { transparent: true });
}

/** The collector: warm cardigan over a pale shirt, corduroy trousers. */
export function collectorCardigan() {
  return createSkin((p) => {
    const knit = "#6f4f39", knitDark = "#5a3f2d", shirt = "#e2dccb", trouser = "#5a5650";
    p.fill("torso", "all", knit);
    p.rect("torso", "front", 2, 0, 4, 3, shirt);        // open V of the shirt
    p.rect("torso", "front", 3, 3, 2, 3, shirt);
    p.px("torso", "front", 3, 6, "#c9b68f");             // buttons
    p.px("torso", "front", 3, 8, "#c9b68f");
    p.px("torso", "front", 3, 10, "#c9b68f");
    p.rect("torso", "front", 0, 0, 1, 12, knitDark);     // ribbing
    p.rect("torso", "front", 7, 0, 1, 12, knitDark);
    for (const arm of ["armR", "armL"] as PartName[]) {
      p.fill(arm, "all", knit);
      p.clear(arm, "bottom");
      for (const face of ["front", "back", "left", "right"] as const) p.erase(arm, face, 0, 10, 4, 2);
      p.rect(arm, "front", 0, 9, 4, 1, knitDark);
    }
    for (const leg of ["legR", "legL"] as PartName[]) {
      p.fill(leg, "all", trouser);
      for (const face of ["front", "back", "left", "right"] as const) p.rect(leg, face, 0, 11, 4, 1, "#2c2622");
      p.fill(leg, "bottom", "#2c2622");
    }
    p.grain("torso", "all", 0.08, 11);
    p.grain("armR", "all", 0.08, 12);
    p.grain("armL", "all", 0.08, 13);
  }, { transparent: true });
}

export interface SuitOptions {
  /** Visor: "gold" mirrored, "clear" shows the face, "cracked" frosted with blood. */
  visor: "gold" | "clear" | "cracked";
  /** Chest patch colour: a unit flash. */
  patch?: string;
  /** Right glove removed, revealing the thin under-glove on the body sheet. */
  bareRightHand?: boolean;
  /** Small rank stripe on the arm for the three leaders. */
  stripe?: boolean;
}

/** A pressure suit. The helmet is the inflated head shell; the visor is paint. */
export function spacesuit(o: SuitOptions) {
  return createSkin((p) => {
    const white = "#e9ebee", seam = "#b9bec6", pad = "#d2d6dc", helm = "#f1f2f4";
    for (const part of ALL) p.fill(part, "all", white);
    p.fill("head", "all", helm);
    p.rect("head", "front", 0, 7, 8, 1, seam);          // neck ring
    p.rect("head", "left", 0, 7, 8, 1, seam);
    p.rect("head", "right", 0, 7, 8, 1, seam);
    p.rect("head", "back", 0, 7, 8, 1, seam);
    p.rect("head", "back", 1, 1, 6, 5, pad);             // comms pack outline
    p.rect("head", "top", 1, 1, 6, 6, pad);
    // Visor.
    if (o.visor === "gold") {
      p.rect("head", "front", 1, 1, 6, 5, "#8a5f16");
      p.rect("head", "front", 1, 1, 6, 2, "#c99a2e");     // reflected light band
      p.rect("head", "front", 2, 1, 2, 1, "#f2d38a");
      p.rect("head", "left", 6, 1, 2, 5, "#8a5f16");      // visor wraps a little to the sides
      p.rect("head", "right", 0, 1, 2, 5, "#8a5f16");
    } else if (o.visor === "clear") {
      p.erase("head", "front", 1, 1, 6, 5);
      p.px("head", "front", 1, 1, "#ffffffaa");            // a glint on the glass edge
      p.rect("head", "left", 6, 1, 2, 5, "#3a4455");
      p.rect("head", "right", 0, 1, 2, 5, "#3a4455");
    } else {
      p.rect("head", "front", 1, 1, 6, 5, "#d9d5cf");      // frosted
      p.rect("head", "front", 2, 2, 4, 3, "#8c1d1d");      // blood behind the glass
      p.px("head", "front", 3, 1, "#f6f6f6");
      p.px("head", "front", 5, 3, "#f6f6f6");
      p.px("head", "front", 2, 4, "#f6f6f6");
      p.px("head", "front", 4, 5, "#5a0f0f");
      p.rect("head", "left", 6, 1, 2, 5, "#d9d5cf");
      p.rect("head", "right", 0, 1, 2, 5, "#d9d5cf");
    }
    // Torso: chest controls and the unit patch.
    p.rect("torso", "front", 1, 2, 6, 3, pad);
    p.rect("torso", "front", 2, 3, 1, 1, "#2f8f4a");       // status lamp (green)
    p.rect("torso", "front", 4, 3, 2, 1, "#333a44");
    p.rect("torso", "front", 1, 6, 6, 1, seam);
    p.rect("torso", "front", 2, 8, 4, 3, o.patch ?? "#2c4f8e");
    p.rect("torso", "back", 1, 1, 6, 9, pad);              // life-support pack painted on
    p.rect("torso", "back", 2, 2, 4, 2, "#5b6470");
    for (const arm of ["armR", "armL"] as PartName[]) {
      p.rect(arm, "front", 0, 3, 4, 1, seam);              // joint rings
      p.rect(arm, "front", 0, 8, 4, 1, seam);
      p.rect(arm, "back", 0, 3, 4, 1, seam);
      p.rect(arm, "back", 0, 8, 4, 1, seam);
      if (o.stripe) p.rect(arm, "left", 0, 5, 4, 1, "#c0392b");
      p.rect(arm, "front", 0, 10, 4, 2, "#cfd3d9");        // gloves
      p.rect(arm, "back", 0, 10, 4, 2, "#cfd3d9");
    }
    if (o.bareRightHand) {
      for (const face of ["front", "back", "left", "right"] as const) p.erase("armR", face, 0, 10, 4, 2);
      p.clear("armR", "bottom");
      p.rect("armR", "front", 0, 9, 4, 1, "#8f969f");      // the open wrist ring
    }
    for (const leg of ["legR", "legL"] as PartName[]) {
      p.rect(leg, "front", 0, 5, 4, 1, seam);
      p.rect(leg, "back", 0, 5, 4, 1, seam);
      p.rect(leg, "front", 0, 10, 4, 2, "#c6cbd2");        // boots
      p.rect(leg, "back", 0, 10, 4, 2, "#c6cbd2");
      p.fill(leg, "bottom", "#9aa1aa");
    }
    p.grain("torso", "all", 0.03, 21);
  }, { transparent: true });
}

/* ---------------------------------------------------------------- figures */

export interface Actor {
  figure: Figure;
  root: THREE.Group;
  setClothes(tex: THREE.Texture): void;
}

export function actor(body: THREE.Texture, clothes: THREE.Texture, heightM: number): Actor {
  const figure = createFigure({ body, clothes, heightM, castShadow: true });
  return {
    figure,
    root: figure.root,
    setClothes: (tex) => figure.setClothes(tex),
  };
}

/* ------------------------------------------------------------------ poses */

export const P = {
  rest: {} as Pose,
  /** Standing, hands loosely at the sides, chin level. */
  stand(t: number, sway = 1): Pose {
    const b = Math.sin(t * 1.4);
    return { neck: [0.02 * b, 0, 0], armR: [0.02 * b, 0, 0.06 * sway], armL: [-0.02 * b, 0, -0.06 * sway], lift: 0.05 * b };
  },
  /** Seated on a stool: thighs forward, spine upright. */
  sit(t: number): Pose {
    const b = Math.sin(t * 1.3);
    return {
      hips: [0, 0, 0],
      neck: [0.12 + 0.02 * b, 0, 0],
      armR: [-0.9, 0, 0.1],
      armL: [-0.9, 0, -0.1],
      legR: [-1.55, 0, 0.05],
      legL: [-1.55, 0, -0.05],
      lift: -5.2,
    };
  },
  /** Bent over a workbench, one hand steadying a magnifier. */
  bench(t: number): Pose {
    const b = Math.sin(t * 1.1);
    return {
      hips: [0.35, 0, 0],
      neck: [0.45 + 0.02 * b, 0, 0],
      armR: [-1.7, 0, 0.15],
      armL: [-1.35, 0.2, -0.25],
      legR: [-0.35, 0, 0],
      legL: [-0.35, 0, 0],
      lift: -1.2,
    };
  },
  /** Holding a tea cup up near the face. */
  cup(t: number, raise: number): Pose {
    const b = Math.sin(t * 1.4);
    return {
      neck: [0.05 + 0.02 * b, 0, 0],
      armR: [-0.7 - 1.4 * raise, 0.25 * raise, 0.1],
      armL: [-0.4, 0, -0.1],
      lift: 0.05 * b,
    };
  },
  /** Both arms raised, aiming along +Z. */
  aim(pitch: number, yaw: number): Pose {
    return {
      hips: [0, yaw * 0.35, 0],
      neck: [pitch * 0.6, yaw * 0.4, 0],
      armR: [-Math.PI / 2 + pitch, yaw * 0.25, 0.09],
      armL: [-Math.PI / 2 + pitch + 0.08, yaw * 0.25, -0.24],
    };
  },
  /** Weightless drift, the authored variant: knees drawn, arms open. */
  drift(t: number, amp = 1): Pose {
    const s = Math.sin(t * 0.5), c = Math.cos(t * 0.37);
    return {
      hips: [-0.15 * amp + s * 0.05, Math.sin(t * 0.31) * 0.15 * amp, c * 0.04],
      neck: [0.1 + Math.sin(t * 0.6 + 1) * 0.06, Math.sin(t * 0.4) * 0.1, 0],
      armR: [-0.8 + Math.sin(t * 0.7) * 0.15, 0, 0.35 + s * 0.08],
      armL: [-0.55 + Math.sin(t * 0.62 + 2) * 0.15, 0, -0.45 - s * 0.08],
      legR: [-0.5 + Math.sin(t * 0.55) * 0.1, 0, 0.12],
      legL: [-0.25 + Math.sin(t * 0.51 + 1.7) * 0.1, 0, -0.14],
      lift: s * 0.4,
    };
  },
  /** Formal float for the photo: arms at the sides, legs together, a little proud. */
  formal(t: number, seed: number): Pose {
    const s = Math.sin(t * 0.45 + seed);
    return {
      hips: [-0.05 + s * 0.02, Math.sin(t * 0.3 + seed) * 0.05, 0],
      neck: [0.02, Math.sin(t * 0.25 + seed * 2) * 0.06, 0],
      armR: [0.1 + s * 0.04, 0, 0.16],
      armL: [0.1 - s * 0.04, 0, -0.16],
      legR: [-0.08, 0, 0.04],
      legL: [-0.05, 0, -0.04],
      lift: s * 0.3,
    };
  },
  /** Thrusting forward through vacuum: body prone-ish, arms trailing. */
  fly(t: number): Pose {
    const s = Math.sin(t * 0.8);
    return {
      hips: [-1.15, 0, s * 0.03],
      neck: [0.9, 0, 0],
      armR: [0.9 + s * 0.05, 0, 0.45],
      armL: [0.9 - s * 0.05, 0, -0.45],
      legR: [0.25, 0, 0.08],
      legL: [0.25, 0, -0.08],
    };
  },
  /** Hit: limbs flung, head back, slowly tumbling afterwards. */
  struck(t: number): Pose {
    return {
      hips: [-0.5, 0.3 * Math.sin(t * 0.4), 0.2],
      neck: [-0.6, 0.2, 0.3],
      armR: [-2.4, 0, 0.9],
      armL: [-1.9, 0, -1.1],
      legR: [-0.9, 0, 0.35],
      legL: [0.4, 0, -0.3],
    };
  },
};

export function blend(a: Pose, b: Pose, t: number): Pose {
  return lerpPose(a, b, t);
}

export function pose(actorRef: Actor, p: Pose): void {
  applyPose(actorRef.figure, p);
}
