import type { Shot } from "@agentbench/cinematic-player";
import { defineShot, type Ctx } from "../direction/ctx";
import { spaceLight } from "../direction/lighting";
import { zeroG } from "../direction/poses";
import { T } from "../timeline";
import { wobble } from "../util/math";

/** 序 — the void, a floating figure, a clock that is the sun. */
export function prologue(c: Ctx): Shot<Ctx>[] {
  const { zhang } = c.cast;
  const space = c.w.space;

  const floatZhang = (t: number, face: "calm" | "narrow"): void => {
    zhang.show(true).dress("suit").face(face, "flat");
    zhang.pose(zeroG(t, 3, 0.8));
    zhang.drift([0, 0, 0], [wobble(t * 0.13, 1) * 0.06, 0.05 + wobble(t * 0.11, 2) * 0.1, wobble(t * 0.09, 3) * 0.04]);
  };

  return [
    defineShot({
      id: "p1-void",
      start: T.p1[0], end: T.p1[1],
      sets: ["space"],
      light: (t) => spaceLight(t, { box: 8 }),
      run: (t) => {
        space.setSky(t);
        space.animateDebris(t);
        floatZhang(t, "calm");
      },
      cam: {
        pos: [[0, 3.4, -1.3, -14], [11, 2.5, -0.1, -6.4]],
        look: [[0, -2, 2.6, 100], [11, -3.5, 1.4, 100]],
        fov: [[0, 42], [11, 31]],
        ease: "smoother",
        shake: 0.004,
      },
    }),
    defineShot({
      id: "p2-visor",
      start: T.p2[0], end: T.p2[1],
      sets: ["space"],
      light: (t) => spaceLight(t, { box: 6 }),
      run: (t) => {
        space.setSky(t);
        space.animateDebris(t);
        floatZhang(t, t > 14.2 ? "narrow" : "calm");
      },
      cam: {
        pos: [[0, 1.05, 0.5, 3.1], [6.4, -0.35, 0.42, 2.25]],
        look: [[0, 0, 0.9, 0], [6.4, 0.05, 0.9, 0]],
        fov: [[0, 26], [6.4, 22]],
        ease: "smoother",
      },
    }),
  ];
}
