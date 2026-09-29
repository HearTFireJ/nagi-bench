// 片尾（6s）：黑场里只剩一片缓缓漂移的星空——标题与署名由 DOM 叠层在其上淡入淡出（见 ui/titles.ts）。
// 不再回到任何一个“地方”：家已经在上一镜里关灯，剩下的是宇宙本身。
import * as THREE from "three";
import type { Shot } from "@agentbench/cinematic-player";
import type { FilmContext, World } from "../types";
import { makeShot } from "../shotkit";
import { lerp } from "../../util/math";
import { dirAzEl } from "../../world/space/geometry";
import type { SpaceWorld } from "../../world/space/spaceworld";
import { DUR } from "../timing";

export function buildEnd(ctx: FilmContext, S: SpaceWorld, t0: number): Shot<FilmContext>[] {
  // 只有天穹（星空），没有前景
  const world: World = {
    id: "end", scene: new THREE.Scene(), bg: S.bg, clearColor: 0x010207,
    beforeRender: () => S.bg.rotation.set(0, 0, 0),
  };
  return [
    makeShot(ctx, {
      id: "e1-stars", start: t0, dur: DUR.end, world,
      update: () => {
        // 天穹的时间：太阳已经沉没
        S.setTau(160);
      },
      cam: (lt, p) => {
        // 望向远离地球与太阳的一侧，极其缓慢地横移
        const d = dirAzEl(lerp(150, 156, p), lerp(28, 30, p));
        return { pos: [0, 0, 0], look: [d.x * 100, d.y * 100, d.z * 100], lens: 28, near: 0.1, far: 1000 };
      },
      exposure: 1.0, vignette: 0.55, grain: 0.6, fadeIn: 0.9, fadeOut: 1.2,
    }),
  ];
}
