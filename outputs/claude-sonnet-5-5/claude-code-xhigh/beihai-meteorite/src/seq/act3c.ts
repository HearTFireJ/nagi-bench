import * as THREE from "three";
import type { Shot } from "@agentbench/cinematic-player";
import { defineShot, hold, type CamSpec, type Ctx } from "../direction/ctx";
import type { LightPreset } from "../direction/rig";
import { spaceLight } from "../direction/lighting";
import { zeroG } from "../direction/poses";
import { addPose } from "../util/kf";
import { lerp, seg, smooth, wobble, type V3 } from "../util/math";
import { EV, T } from "../timeline";
import { GROUP_POS } from "../world/space";
import type { Orbitals } from "./orbitals";
import type { Person } from "./crowd";

/** Direction Zhang eventually drifts: toward Base One, away from the wheel. */
export const AWAY = new THREE.Vector3(-0.41, 0.04, 0.91).normalize();
/** Distance travelled along AWAY: a gentle burn, then coasting. */
export function awayDistance(t: number): number {
  if (t < 302.4) return 0;
  const x = seg(t, 302.4, 306.4);
  const T1 = 4.0, V = 4.6;
  if (x < 1) return V * T1 * (x * x * x - 0.5 * x * x * x * x);
  return V * T1 * 0.5 + V * (t - 306.4);
}

export function act3c(c: Ctx, orb: Orbitals): Shot<Ctx>[] {
  const { zhang } = c.cast;
  const pistol = c.props.pistol;
  const crowd = orb.crowd;
  const A = crowd.leader(0), B = crowd.leader(1);
  const shots: Shot<Ctx>[] = [];

  const faceLight = (t: number, p: Person, base: LightPreset, k = 1): LightPreset => {
    const h = crowd.head(p, t);
    base.points = [{ color: 0xffb98a, intensity: 16 * k, pos: [h.x + 1.2, h.y + 0.5, h.z - 2.6], distance: 8 }, null, null];
    return base;
  };
  const scopeCam = (look: (lt: number) => V3, fov: number | Array<[number, number]>): CamSpec => ({
    pos: [[0, 0.02, 0.92, 0.5]],
    look,
    fov, ease: "smooth", shake: 0.0006, shakeRate: 1.4,
  });
  const holdSteady = (t: number): void => {
    orb.zhangFloat(t, {
      face: "narrow", outfit: "suitFrost",
      pose: addPose(zeroG(t, 3, 0.15), { armR: [-1.35, 0, 0.2], armL: [-1.3, 0, -0.3], neck: [0.3, 0, 0] }),
      euler: [0.02, 0, 0],
    });
    hold(pistol.root, zhang, "handR", [0, 0, 0], [0, 0, 0], 1);
    pistol.scope.visible = true;
    pistol.mag.visible = true;
    pistol.flash.visible = false;
  };

  // ── d13a: through the scope the first thread of white gas leaves a black suit ──────
  shots.push(defineShot({
    id: "d13a-first-hit", start: T.d13a[0], end: T.d13a[1], sets: ["space"], optic: "rifle",
    light: (t) => faceLight(t, A, spaceLight(t, { target: [-9, 0, 56], box: 14, fill: 1.25 }), 0.8),
    run: (t) => {
      orb.update(t);
      holdSteady(t);
      if (t < A.hits[0]!) A.actor.face("happy", "smile");
    },
    cam: scopeCam((lt) => { const g = crowd.chest(A, T.d13a[0] + lt); return [g.x, g.y + 0.32, g.z]; }, [[0, 2.0], [3.2, 1.7]]),
  }));

  // ── d13b: the visor of the second man goes white with cracks, then red from within ──
  shots.push(defineShot({
    id: "d13b-visor", start: T.d13b[0], end: T.d13b[1], sets: ["space"], optic: "rifle",
    light: (t) => faceLight(t, B, spaceLight(t, { target: [-9, 0, 56], box: 14, fill: 1.25 }), 0.8),
    run: (t) => {
      orb.update(t);
      holdSteady(t);
    },
    cam: scopeCam((lt) => { const h = crowd.head(B, T.d13b[0] + lt); return [h.x, h.y - 0.1, h.z]; }, [[0, 2.6], [1.8, 2.1]]),
  }));

  // ── d13c: one face, mouth wide — the word Zhang was waiting for, read from lips ────
  const shouter = crowd.people[0]!;
  shots.push(defineShot({
    id: "d13c-cry", start: T.d13c[0], end: T.d13c[1], sets: ["space"], optic: "rifle",
    light: (t) => faceLight(t, shouter, spaceLight(t, { target: [-9, 0, 56], box: 14, fill: 1.3 }), 0.9),
    run: (t) => {
      orb.update(t);
      holdSteady(t);
      shouter.actor.dress("clear").face("wide", "scream");
    },
    cam: scopeCam((lt) => { const h = crowd.head(shouter, T.d13c[0] + lt); return [h.x, h.y - 0.02, h.z]; }, [[0, 1.9], [2.8, 1.5]]),
  }));

  // ── d13d: everyone running for the wheel, white plumes across the last light ───────
  shots.push(defineShot({
    id: "d13d-flight", start: T.d13d[0], end: T.d13d[1], sets: ["space"],
    light: (t) => spaceLight(t, { target: [-10, 0, 150], box: 36, fill: 1.3, exposure: 1.15 }),
    run: (t) => {
      orb.update(t);
      holdSteady(t);
    },
    cam: {
      pos: [[0, 2.5, 0.9, -3.0], [3.2, 2.2, 0.7, -2.6]],
      look: [[0, -12, 3, 115], [3.2, -14, 3, 120]],
      fov: [[0, 34], [3.2, 30]], ease: "smooth", shake: 0.003,
    },
  }));

  // ── d13e: behind the glass, a man who has done what he came for ───────────────────
  shots.push(defineShot({
    id: "d13e-calm", start: T.d13e[0], end: T.d13e[1], sets: ["space"],
    light: (t) => {
      const l = spaceLight(t, { box: 6, fill: 1.7, exposure: 1.25 });
      l.points = [{ color: 0xbcd0ff, intensity: 9, pos: [1.3, 1.0, 2.3], distance: 7 }, null, null];
      return l;
    },
    run: (t, lt) => {
      orb.update(t);
      const lower = smooth(seg(lt, 0.2, 1.4));
      const blink = lt > 1.4 && lt < 1.6;
      orb.zhangFloat(t, {
        face: blink ? "shut" : "calm", outfit: "suitFrost",
        pose: addPose(zeroG(t, 3, 0.2), { armR: [-1.3 + lower * 0.9, 0, 0.2], armL: [-1.25 + lower * 0.9, 0, -0.3], neck: [0.3 * (1 - lower), 0, 0] }),
        euler: [0.02, 0.0, 0],
      });
      hold(pistol.root, zhang, "handR", [0, 0, 0], [0, 0, 0], 1);
      pistol.scope.visible = true;
      pistol.flash.visible = false;
    },
    cam: {
      pos: [[0, 0.6, 1.02, 2.5], [2.6, 0.4, 1.0, 2.15]],
      look: [[0, 0, 0.96, 0], [2.6, 0, 0.96, 0]],
      fov: [[0, 22], [2.6, 19]], ease: "smooth", shake: 0.0012,
    },
  }));

  // ── d14: he leaves the way he came: no sound, no wake but a white breath ────────────
  const away = (t: number): THREE.Vector3 => AWAY.clone().multiplyScalar(awayDistance(t));
  const yaw = Math.atan2(AWAY.x, AWAY.z);
  c.fx.space.add({
    t0: 302.5, t1: 306.3, rate: 30, life: 2.2,
    origin: (b) => { const p = away(b); return [p.x - AWAY.x * 0.55, p.y - AWAY.y * 0.55 + 0.05, p.z - AWAY.z * 0.55]; },
    dir: [-AWAY.x, -AWAY.y, -AWAY.z], speed: [2.5, 6.5], spread: 0.16, size: [0.14, 0.55],
    colors: [0xffffff, 0xd8e8ff, 0xb8d0ff], seed: 777, drag: 0.5, fade: 0.5,
  });
  const leaving = (t: number): void => {
    orb.update(t);
    const p = away(t);
    const burn = smooth(seg(t, 302.4, 303.6)) * (1 - smooth(seg(t, 305.6, 307.2)));
    orb.zhangFloat(t, {
      face: "calm", outfit: "suitFrost",
      pose: addPose(zeroG(t, 3, 0.15), { hips: [0.35 * burn, 0, 0], armR: [0.5 * burn, 0, -0.1], armL: [0.5 * burn, 0, 0.1], legR: [0.05, 0, 0], legL: [0.05, 0, 0], neck: [-0.3 * burn, 0, 0] }),
      centre: [p.x, p.y, p.z], euler: [0, yaw * smooth(seg(t, 302, 303.4)), 0],
    });
    hold(pistol.root, zhang, "hipR", [0, 0.5, 0.4], [0, 0, 0], 0.8);
    pistol.scope.visible = false;
    pistol.flash.visible = false;
  };
  const nightLight = (t: number, blue = 1): LightPreset => {
    const l = spaceLight(t, { box: 8, fill: 2.2, exposure: 1.35 * blue });
    const p = away(t);
    l.points = [{ color: 0xc4d6ff, intensity: 12, pos: [p.x + 1.9, p.y + 0.9, p.z + 2.2], distance: 8 }, null, null];
    return l;
  };
  shots.push(defineShot({
    id: "d14a-away", start: T.d14a[0], end: T.d14a[1], sets: ["space"],
    light: (t) => nightLight(t),
    run: (t) => leaving(t),
    cam: (lt, t) => {
      const p = away(t);
      const q = away(t + 0.0);
      return {
        pos: [[0, q.x + 1.7, q.y + 0.4, q.z + 2.0]],
        look: [[0, p.x, p.y + 0.85, p.z + 0.15]],
        fov: [[0, 24], [6.8, 28]], ease: "smooth", shake: 0.003,
      } as CamSpec;
    },
  }));
  shots.push(defineShot({
    id: "d14b-dot", start: T.d14b[0], end: T.d14b[1], sets: ["space"],
    light: (t) => spaceLight(t, { box: 8, fill: 1.5, exposure: 1.25 }),
    run: (t) => leaving(t),
    cam: {
      pos: [[0, 9, 4, -16], [5.8, 8, 4.5, -12]],
      look: [[0, -12, 8, 60], [5.8, -16, 6, 70]],
      fov: [[0, 40], [5.8, 34]], ease: "smooth", shake: 0.003,
    },
  }));
  shots.push(defineShot({
    id: "d14c-stars", start: T.d14c[0], end: T.d14c[1], sets: ["space"],
    light: (t) => spaceLight(t, { box: 8, fill: 1.4, exposure: 1.3 }),
    run: (t) => leaving(t),
    cam: {
      pos: [[0, 8, 4.5, -12], [3.4, 7, 5.5, -10]],
      look: [[0, -18, 5, 75], [3.4, -30, 2, 90]],
      fov: 32, ease: "smooth", shake: 0.002,
    },
  }));

  void lerp; void wobble; void GROUP_POS; void EV;
  return shots;
}
