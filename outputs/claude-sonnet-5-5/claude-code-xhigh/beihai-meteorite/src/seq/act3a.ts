import * as THREE from "three";
import type { Shot } from "@agentbench/cinematic-player";
import { walk } from "@agentbench/voxel-kit";
import { defineShot, drop, hold, type Ctx } from "../direction/ctx";
import type { LightPreset } from "../direction/rig";
import { spaceLight } from "../direction/lighting";
import { stand, zeroG } from "../direction/poses";
import { addPose } from "../util/kf";
import { clamp, easeIn, easeOut, lerp, seg, smooth, wobble, type V3 } from "../util/math";
import { EV, T } from "../timeline";
import { STATION_POS, sunDirection } from "../world/space";
import type { Orbitals } from "./orbitals";

/** Earth as seen through the cabin porthole (which looks toward -z). */
const CABIN_EARTH = new THREE.Vector3(150, -450, -1000);
const AIRLOCK_OFFSET: V3 = [0, 0, 5.2];

export function act3a(c: Ctx, orb: Orbitals): Shot<Ctx>[] {
  const { zhang } = c.cast;
  const cabin = c.w.cabin;
  const space = c.w.space;
  const o = c.props.o;
  const shots: Shot<Ctx>[] = [];

  const cabinLight = (t: number, boost = 1): LightPreset => ({
    bg: 0x030507,
    exposure: 1.1,
    fog: { color: 0x0a0e12, density: 0.012 },
    hemi: [0x9fb2c8, 0x2a3038, 0.22 * boost],
    spot: { color: 0xfff2d8, intensity: 9 * boost, pos: [0, 2.1, 0.3], target: [0, 0.5, -0.4], angle: 1.2, penumbra: 0.8, distance: 8 },
    points: [
      { color: 0x8fbaff, intensity: 4 * boost, pos: [0.45, 1.3, -1.35], distance: 5 },
      { color: 0xfff2d0, intensity: 2.5 * boost, pos: [-0.3, 1.9, 0.9], distance: 6 },
      null,
    ],
  });
  const led = (t: number): void => {
    const k = 0.75 + 0.25 * Math.sin(t * 3.2);
    cabin.locator.ledMat.color.setRGB(0.12 * k, 1.0 * k, 0.45 * k);
    cabin.locator.halo.scale.setScalar(0.9 + 0.3 * k);
  };
  const sky = (t: number): void => {
    space.setSky(t, { centre: CABIN_EARTH });
  };

  // ── d1: he holds the device that would tell them where he is ──────────────────
  shots.push(defineShot({
    id: "d1-locator", start: T.d1[0], end: T.d1[1], sets: ["cabin", "sky"],
    light: (t) => cabinLight(t),
    run: (t, lt) => {
      sky(t);
      led(t);
      zhang.show(true).dress("suit").face("calm", "flat");
      const lift = smooth(seg(lt, 0.6, 1.6));
      zhang.pose(addPose(stand(t, 3), { armR: [-1.15 * lift, 0, 0.45 * lift], armL: [-0.9 * lift, 0, -0.4 * lift], neck: [0.32 * lift, 0, 0] }));
      zhang.stand(0.1, 0, -0.15, 0.55);
      hold(cabin.locator.group, zhang, "handR", [0, 0, 0.9], [0.4, 0, 0], 18);
    },
    cam: {
      pos: [[0, 1.1, 1.45, 1.75], [3.6, 0.8, 1.4, 1.45]],
      look: [[0, 0.1, 1.15, -0.15], [3.6, 0.1, 1.1, -0.15]],
      fov: [[0, 36], [3.6, 30]], ease: "smooth", shake: 0.003,
    },
  }));

  // ── d1b: set down on the shelf, green light steady, recording nothing ────────────
  const shelfSpot: V3 = [0.95, 1.11, -1.5];
  shots.push(defineShot({
    id: "d1b-pillow", start: T.d1b[0], end: T.d1b[1], sets: ["cabin", "sky"],
    light: (t) => ({ ...cabinLight(t, 1.0), points: [{ color: 0x8fbaff, intensity: 5, pos: [0.6, 1.6, -0.6], distance: 5 }, { color: 0xfff2d0, intensity: 4, pos: [1.4, 1.5, -0.2], distance: 5 }, null] }),
    run: (t, lt) => {
      sky(t);
      led(t);
      drop(cabin.locator.group, cabin.group, shelfSpot, [0, 0.35, 0], 1);
      // a shadow of the man who left it: he crosses the far doorway at the very end
      const walkOff = smooth(seg(lt, 2.1, 3.3));
      zhang.show(walkOff > 0 && walkOff < 1).dress("suit").face("calm", "flat");
      zhang.pose(stand(t, 3));
      zhang.stand(lerp(0.2, -0.2, walkOff), 0, lerp(0.4, 1.75, walkOff), 0);
    },
    cam: {
      pos: [[0, 0.3, 1.5, 0.15], [3.4, 0.5, 1.4, -0.35]],
      look: [[0, 0.95, 1.16, -1.5], [3.4, 0.95, 1.14, -1.5]],
      fov: [[0, 28], [3.4, 22]], ease: "smooth", shake: 0.0015,
    },
  }));

  // ── d2: the airlock — pressure gone, the door opens, he lets go ─────────────────
  const zPath = (t: number): number => {
    if (t < 184.7) return lerp(0.9, 3.35, easeOut(seg(t, 183.0, 184.7)));
    if (t < 187.3) return 3.35;
    return 3.35 + 1.7 * (t - 187.3) + 0.15 * Math.pow(t - 187.3, 2);
  };
  c.fx.space.add({
    t0: 187.2, t1: 187.9, rate: 40, life: 1.2,
    origin: (b) => [0, 1.1, zPath(b) - 0.5 - AIRLOCK_OFFSET[2]], dir: [0, 0, -1], speed: [1.5, 3.2], spread: 0.25,
    size: [0.1, 0.36], colors: [0xffffff, 0xd8e8ff], seed: 901, drag: 0.8, fade: 0.5,
  });
  shots.push(defineShot({
    id: "d2-airlock", start: T.d2[0], end: T.d2[1], sets: ["cabin", "space"],
    light: (t) => {
      const l = spaceLight(t, { target: [0, 1, 8], box: 14, sun: 0.95 });
      l.spot = { color: 0xfff2d8, intensity: 26, pos: [0, 2.1, 3.4], target: [0, 0.3, 3.4], angle: 1.1, penumbra: 0.8, distance: 6 };
      const open = smooth(seg(t, EV.airlockOpen, EV.airlockOpen + 1.8));
      l.points = [
        { color: t < EV.airlockOpen ? 0xff3a2a : 0xffffff, intensity: 5, pos: [0, 2.0, 4.3], distance: 4 },
        { color: 0xa8c8ff, intensity: 8 * open, pos: [0, 1.3, 6.0], distance: 8 },
        null,
      ];
      l.hemi = [0x0b1428, 0x3a72c8, 0.6 + 0.4 * (1 - open)];
      return l;
    },
    run: (t) => {
      orb.update(t, { offset: AIRLOCK_OFFSET });
      const open = smooth(seg(t, EV.airlockOpen, EV.airlockOpen + 1.9));
      cabin.outerL.position.x = -1.05;
      cabin.outerL.scale.x = lerp(1, 0.06, open);
      cabin.outerR.scale.x = lerp(1, 0.06, open);
      cabin.outerR.position.x = lerp(0.05, 1.05 - 1.0 * 0.06, open);
      const blink = t < EV.airlockOpen && Math.sin(t * 7) > 0;
      cabin.airlockLamp.color.set(t < EV.airlockOpen ? (blink ? 0xff2a1a : 0x551008) : 0x37ff7a);
      led(t);
      const z = zPath(t);
      zhang.show(true).dress("suit").face("calm", "flat");
      const walking = t < 184.7;
      const floating = t > 187.3;
      if (floating) {
        zhang.pose(zeroG(t, 3, 0.5));
        zhang.drift([0, 0.75 + 0.35 * smooth(seg(t, 187.3, 189.5)), z], [0.05, 0, 0]);
      } else {
        zhang.pose(walking ? walk(t, 0.75) : addPose(stand(t, 3), { neck: [0, 0, 0] }));
        zhang.stand(0, -0.1, z, 0);
      }
    },
    cam: {
      pos: [[0, 0.1, 1.3, -0.2], [8, 0.05, 1.28, 0.55]],
      look: [[0, 0.0, 1.1, 5.5], [8, 0.0, 1.35, 9]],
      fov: [[0, 36], [8, 36]], ease: "smooth", shake: 0.003,
    },
  }));

  // ── d3: the prologue image again — now we know what he is waiting for ──────────
  shots.push(defineShot({
    id: "d3-echo", start: T.d3[0], end: T.d3[1], sets: ["space"],
    light: (t) => spaceLight(t, { box: 8 }),
    run: (t) => {
      orb.update(t);
      orb.zhangFloat(t, { face: t > 199 ? "narrow" : "calm" });
    },
    cam: {
      pos: [[0, 3.4, -1.3, -14], [12, 2.5, -0.1, -6.4]],
      look: [[0, -2, 2.6, 100], [12, -3.5, 1.4, 100]],
      fov: [[0, 42], [12, 31]], ease: "smoother", shake: 0.004,
    },
  }));

  // ── d4: nobody looks twice at one more figure adrift — the void is busy ──────────
  shots.push(defineShot({
    id: "d4-traffic", start: T.d4[0], end: T.d4[1], sets: ["space"],
    light: (t) => spaceLight(t, { box: 30, exposure: 1.25, fill: 2.2 }),
    run: (t) => {
      orb.update(t);
      orb.zhangFloat(t);
    },
    cam: {
      pos: [[0, 7, 2.2, -26], [7.4, 3.5, 1.5, -14]],
      look: [[0, -3, 6, 190], [7.4, -12, 5, 150]],
      fov: [[0, 48], [7.4, 42]], ease: "smooth", shake: 0.004,
    },
  }));

  // ── d4b: he turns his head toward the last of the sun ──────────────────────────
  shots.push(defineShot({
    id: "d4b-sun", start: T.d4b[0], end: T.d4b[1], sets: ["space"],
    light: (t) => {
      const l = spaceLight(t, { box: 6, fill: 1.2 });
      l.points = [{ color: 0xffa868, intensity: 6, pos: [2.2, 0.6, 2.4], distance: 6 }, null, null];
      return l;
    },
    run: (t, lt) => {
      orb.update(t);
      const turn = smooth(seg(lt, 0.3, 1.3));
      orb.zhangFloat(t, { face: "calm", pose: addPose(zeroG(t, 3, 0.5), { neck: [0, 0.75 * turn, 0] }), euler: [0.03, 0.12, 0.02] });
    },
    cam: {
      pos: [[0, 1.7, 0.6, 1.9], [3.6, 1.4, 0.65, 1.7]],
      look: [[0, -0.1, 0.95, 0.1], [3.6, -0.1, 0.95, 0.1]],
      fov: [[0, 26], [3.6, 22]], ease: "smooth", shake: 0.002,
    },
  }));

  // ── d5: the hand comes up holding a rifle scope ──────────────────────────────────
  shots.push(defineShot({
    id: "d5-raise", start: T.d5[0], end: T.d5[1], sets: ["space"],
    light: (t) => spaceLight(t, { box: 6 }),
    run: (t, lt) => {
      orb.update(t);
      const up = smooth(seg(lt, 0.4, 2.2));
      const pose = addPose(zeroG(t, 3, 0.4), { armR: [-1.6 * up, 0, 0.5 * up], neck: [0, 0.35 * up, 0] });
      orb.zhangFloat(t, { face: "narrow", pose, euler: [0.02, 0.18, 0.02] });
      hold(o.scopeHand, zhang, "handR", [0, 0, 0.8], [0, 0, 0], 1);
    },
    cam: {
      pos: [[0, -2.4, 0.5, -4.4], [3.8, -1.7, 0.45, -3.2]],
      look: [[0, 0.5, 0.95, 0], [3.8, 0.3, 1.0, 0]],
      fov: 30, ease: "smooth", shake: 0.003,
    },
  }));

  // ── d5b/d6a: through the scope, one circular door on a wheel — red, then green ─────
  const doorTarget = (): V3 => {
    const d = space.station.door.position;
    return [STATION_POS.x + d.x, STATION_POS.y + d.y, STATION_POS.z + d.z];
  };
  const scopeShot = (id: string, span: readonly [number, number]): Shot<Ctx> =>
    defineShot({
      id, start: span[0], end: span[1], sets: ["space"], optic: "rifle",
      light: (t) => spaceLight(t, { box: 14 }),
      run: (t) => {
        orb.update(t);
        orb.zhangFloat(t, { face: "narrow" });
      },
      cam: {
        pos: [[0, 0.06, 0.92, 0.45]],
        look: (lt: number): V3 => {
          const d = doorTarget();
          return [d[0] + wobble(lt * 0.4, 1) * 0.02, d[1] + wobble(lt * 0.3, 2) * 0.02 + 1.0, d[2]];
        },
        fov: [[0, 9], [5.0, 5.2]], ease: "smooth", shake: 0.0008, shakeRate: 1.4,
      },
    });
  shots.push(scopeShot("d5b-scope-door", T.d5b));
  shots.push(scopeShot("d6a-door-opens", T.d6a));

  // ── d6b: white figures pour out of the wheel and coast toward the light ───────────
  shots.push(defineShot({
    id: "d6b-emerge", start: T.d6b[0], end: T.d6b[1], sets: ["space"],
    light: (t) => spaceLight(t, { target: [-10, 0, 100], box: 44, exposure: 1.05 }),
    run: (t) => {
      orb.update(t);
      orb.zhangFloat(t);
    },
    cam: {
      pos: [[0, 2.6, 0.9, -4.6], [5.4, 1.6, 0.75, -3.4]],
      look: [[0, -12, 5.0, 110], [5.4, -10, 3.0, 90]],
      fov: [[0, 36], [5.4, 30]], ease: "smooth", shake: 0.003,
    },
  }));

  void clamp; void easeIn; void THREE;
  return shots;
}
