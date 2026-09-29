import * as THREE from "three";
import { clamp, mix, seg, smooth, type V3 } from "../blocks";
import {
  camBetween,
  dialogueActive,
  easeOut,
  face,
  gait,
  idle,
  linear,
  lerpPose,
  nudge,
  over,
  place,
  applyPose,
  setCamera,
  speaking,
  Track,
  type Ctx,
  type E3,
  type ShotDef,
} from "./core";
import { T } from "../timing";

const PI = Math.PI;

/* ------------------------------------------------------------------ tracks */

export const alleyTrack = new Track([
  { t: 24, p: [0.3, 0, 6.0], yaw: PI },
  { t: 34, p: [0.3, 0, -6.8], yaw: PI },
  { t: 35.2, p: [-0.5, 0, -8.2], yaw: 1.35 * PI },
  { t: 36.5, p: [-2.6, 0, -8.2], yaw: 1.5 * PI },
  { t: 37, p: [-2.6, 0, -8.2], yaw: 1.5 * PI },
]);

export const zhangHouse = new Track([
  { t: 36.9, p: [0, 0, 5.3], yaw: PI },
  { t: 38.3, p: [0, 0, 5.3], yaw: PI },
  { t: 39.6, p: [0, 0, 4.5], yaw: PI },
  { t: 42.0, p: [-0.35, 0, 3.0], yaw: PI },
  { t: 44.7, p: [-1.0, 0, 1.5], yaw: PI },
  { t: 46.4, p: [-1.2, 0, 0.85], yaw: PI },
  { t: 81.8, p: [-1.2, 0, 0.85], yaw: PI },
  { t: 82.7, p: [-0.4, 0, 0.42], yaw: PI },
  { t: 86.2, p: [-0.4, 0, 0.42], yaw: PI },
  { t: 87.2, p: [-1.2, 0, 0.85], yaw: PI },
  { t: 118, p: [-1.2, 0, 0.85], yaw: PI },
]);

export const collHouse = new Track([
  { t: 37, p: [-1.2, 0, -1.25], yaw: 0 },
  { t: 73.6, p: [-1.2, 0, -1.25], yaw: 0 },
  { t: 75.0, p: [-3.2, 0, -1.25], yaw: -0.5 * PI },
  { t: 76.3, p: [-3.35, 0, 0.2], yaw: 0 },
  { t: 77.2, p: [-3.45, 0, 1.55], yaw: -0.5 * PI },
  { t: 80.3, p: [-3.45, 0, 1.55], yaw: -0.5 * PI },
  { t: 82.6, p: [-3.0, 0, -1.3], yaw: -PI },
  { t: 83.9, p: [-0.9, 0, -1.25], yaw: -1.5 * PI },
  { t: 84.5, p: [-0.9, 0, -1.25], yaw: -2 * PI },
  { t: 90.6, p: [-0.9, 0, -1.25], yaw: -2 * PI },
  { t: 92.0, p: [-1.1, 0, -3.3], yaw: -PI },
  { t: 94.6, p: [-1.1, 0, -3.3], yaw: -PI },
  { t: 95.8, p: [-0.9, 0, -1.25], yaw: 0 },
  { t: 118, p: [-0.9, 0, -1.25], yaw: 0 },
]);

/* ---------------------------------------------------------------- gestures */

function talkArms(t: number, seed: number, amt = 1): { armR: E3; armL: E3 } {
  const a = Math.sin(t * 3.1 + seed) * 0.5 + 0.5;
  const b = Math.sin(t * 2.3 + seed * 2) * 0.5 + 0.5;
  return {
    armR: [-0.55 - a * 0.5 * amt, 0.1, 0.12 - b * 0.2 * amt],
    armL: [-0.3 - b * 0.35 * amt, -0.1, -0.15 + a * 0.15 * amt],
  };
}

const sm = (t: number, a: number, b: number) => smooth(seg(t, a, b));

/* ---------------------------------------------------------------- animate */

export function animAlley(ctx: Ctx, t: number): void {
  const z = ctx.cast.zhang;
  place(z.fig, alleyTrack.pos(t), alleyTrack.yaw(t));
  let pose = gait(alleyTrack, t);
  const reach = sm(t, 36.2, 36.8);
  pose = over(pose, { armR: [mix(pose.armR?.[0] ?? 0, -1.3, reach), 0, 0.06] });
  pose = nudge(pose, { neck: [0, Math.sin(t * 0.6) * 0.08, 0] });
  applyPose(z.fig, pose);
  face(z, "grim", false);
  ctx.alley.update(t);
}

export function animHouse(ctx: Ctx, t: number): void {
  const { zhang, collector } = ctx.cast;
  const P = ctx.cast.props;
  ctx.house.update(t);

  // ---- Zhang
  place(zhang.fig, zhangHouse.pos(t), zhangHouse.yaw(t));
  let zp = gait(zhangHouse, t);
  if (t > 39.5 && t < 46.4) zp = nudge(zp, { neck: [0.03, Math.sin((t - 39.5) * 0.9) * 0.45, 0] }); // taking in the room
  // hands: cup between 47.6 and 72
  const hasCup = t >= 47.6 && t < 72.4;
  const cupUp = sm(t, 63.9, 65.2) - sm(t, 67.6, 68.8);
  if (hasCup) zp = over(zp, { armR: [-0.7 - cupUp * 0.85, 0, 0.1 - cupUp * 0.05] });
  P.cup.visible = hasCup;
  // microscope
  const lean = sm(t, 82.9, 83.6) - sm(t, 85.6, 86.4);
  zp = nudge(zp, { hips: [lean * 0.42, 0, 0], neck: [lean * 0.4, 0, 0] });
  // phone
  const phone = t >= 104.4 && t < 108.2;
  P.phone.visible = phone;
  if (phone) zp = over(zp, { armR: [-1.05, 0, 0.15], armL: [-0.7, 0, -0.1] });
  // leaning in to listen / firm stance during the last line
  if (t > 111.8) zp = nudge(zp, { neck: [-0.04, 0, 0] });
  applyPose(zhang.fig, zp);
  const smile = (t > 65.6 && t < 68.0) || (t > 70.2 && t < 71.6);
  face(zhang, smile ? "smile" : "grim", false);
  void speaking;

  // ---- Collector
  place(collector.fig, collHouse.pos(t), collHouse.yaw(t));
  let cp = gait(collHouse, t);
  const loupeOn = t < 39.0;
  P.loupe.visible = loupeOn;
  P.rockL.visible = t < 39.0;
  if (loupeOn) {
    const bend = 1 - sm(t, 38.2, 38.9);
    cp = over(cp, {
      hips: [0.34 * bend, 0, 0],
      neck: [0.5 * bend - 0.05, 0, 0],
      armR: [-1.6 + 0.3 * (1 - bend), 0, -0.1],
      armL: [-0.9, 0, 0.25],
    });
  }
  const speakingC = dialogueActive("收藏者", t);
  if (t >= 38.9 && t < 41.7) {
    // the wave of welcome
    cp = over(cp, { armR: [-2.55 + Math.sin(t * 7) * 0.25, 0, -0.25], armL: [-0.25, 0, -0.15] });
  } else if (speakingC && collHouse.speed(t) < 0.2) {
    const g = talkArms(t, 1.3, 0.9);
    cp = over(cp, { armR: g.armR, armL: g.armL });
  }
  // teacup handed over
  const cupB = t >= 45.6 && t < 47.7;
  P.cupB.visible = cupB;
  if (cupB) cp = over(cp, { armR: [-1.15 - sm(t, 46.0, 46.9) * 0.15, 0, 0.05] });
  // hands with the Mars case while walking back
  const marsHeld = t >= 80.3 && t < 83.4;
  const mars = ctx.house.marsCase;
  if (t < 80.3) {
    mars.position.set(-4.53, 1.04, 1.7);
    mars.visible = true;
  } else if (marsHeld) {
    collector.fig.anchors.handL.getWorldPosition(mars.position);
    mars.visible = true;
  } else if (t < 86.2) {
    mars.position.set(-0.33, 1.06, 0.12);
    mars.visible = true;
  } else {
    mars.visible = false;
  }
  if (marsHeld) cp = over(cp, { armL: [-1.0, 0, -0.1] });
  // walking to the safe: reach for the dial
  if (t >= 77.6 && t < 80.3) {
    const dial = sm(t, 77.6, 78.0);
    cp = over(cp, { armR: [-1.4 * dial, 0, 0.1], armL: [-0.1, 0, -0.05] });
    if (t > 78.9) cp = over(cp, { armR: [-1.1, 0, 0.1], armL: [-0.1 - 0.95 * sm(t, 79.4, 80.0), 0, -0.1] });
  }
  // cabinet: opens glass, takes a stone
  if (t >= 92.2 && t < 94.6) {
    const open = sm(t, 92.4, 93.0);
    const take = sm(t, 93.4, 93.9);
    cp = over(cp, { armR: [-1.2 * open + 0.3 * take, 0, 0.3], armL: [-1.05 * take, 0, -0.1] });
  }
  const lumpHeld = t >= 93.8 && t < 96.4;
  const lumps = ctx.extra.lumps as THREE.Object3D[];
  lumps[0]!.visible = lumpHeld;
  if (lumpHeld) collector.fig.anchors.handL.getWorldPosition(lumps[0]!.position);
  // the three lumps on the felt, later wrapped away
  const trioVisible = t >= 98.2 && t < 117.0;
  (ctx.extra.slab as THREE.Object3D).visible = t >= 98.7 && t < 105;
  for (let i = 1; i <= 3; i++) {
    lumps[i]!.visible = trioVisible;
    lumps[i]!.position.set(-1.62 + i * 0.33 - 0.33, 0.965, -0.28 + (i === 2 ? 0.1 : 0));
  }
  if (t >= 99.0 && t < 104.6) {
    // presenting the price: one hand out over the lumps
    cp = over(cp, { armR: [-1.05 + Math.sin(t * 2) * 0.1, 0.1, 0.12], armL: [-0.5, 0, -0.1] });
  }
  if (t >= 108.6 && t < 111.6) {
    // scratches his head, embarrassed
    cp = over(cp, { armR: [-2.4 + Math.sin(t * 6) * 0.12, 0.3, -0.4], armL: [-0.3, 0, -0.1] });
  }
  applyPose(collector.fig, cp);
  const embarrassed = t >= 108.4 && t < 112.6;
  face(collector, embarrassed ? "neutral" : "smile", speakingC && speaking("收藏者", t));
}

/* ------------------------------------------------------------------- shots */

const ZP: V3 = [-1.2, 0, 0.85];
const CP: V3 = [-1.2, 0, -1.25];
const zHead = (y = 1.62): V3 => [-1.2, y, 0.85];
const cHead = (y = 1.55): V3 => [-1.2, y, -1.25];
const zHeadAt = (t: number): V3 => {
  const p = zhangHouse.pos(t);
  return [p[0], 1.62 - (t > 82.6 && t < 86.2 ? 0.22 : 0), p[2] - (t > 82.6 && t < 86.2 ? 0.25 : 0)];
};
const cHeadAt = (t: number): V3 => {
  const p = collHouse.pos(t);
  return [p[0], 1.55, p[2]];
};

export function act1Shots(): ShotDef[] {
  const S: ShotDef[] = [];
  const mk = (id: string, start: number, end: number, loc: ShotDef["loc"], run: ShotDef["run"], extra: Partial<ShotDef> = {}) => S.push({ id, start, end, loc, run, ...extra });

  // ---- alley
  mk("alley-crane", 25.0, 30.0, "alley", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [5.5, 6.5, 9.5], l: [-0.2, 1.2, -5], fov: 42 }, { p: [2.7, 3.4, 7.2], l: [-0.4, 1.3, -6.5], fov: 36 }, p, t, linear, 0.006);
  });
  mk("alley-dolly", 30.0, 34.0, "alley", (ctx, t, lt, p) => {
    const zp = alleyTrack.pos(t);
    setCamera(ctx, [zp[0] + 0.45, 1.05, zp[2] - 3.3], [zp[0] - 0.05, 1.5, zp[2]], 32, 0, 0.008, t);
  });
  mk("alley-gate", 34.0, 37.0, "alley", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [2.4, 1.25, -5.4], l: [-1.8, 1.5, -8.2], fov: 40 }, { p: [1.4, 1.35, -6.4], l: [-2.6, 1.55, -8.2], fov: 34 }, p, t, linear, 0.005);
  });

  // ---- entrance
  mk("house-door", 37.0, 42.2, "house", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.5, 1.45, 8.2], l: [-0.4, 1.4, -1.5], fov: 34 }, { p: [0.05, 1.55, 6.2], l: [-0.6, 1.4, -1.2], fov: 34 }, p, t, linear, 0.004);
  });
  mk("house-cabinets", 42.2, 44.8, "house", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [3.4, 1.25, -2.4], l: [-1.0, 1.4, -4.2], fov: 42 }, { p: [1.6, 1.3, -2.7], l: [-2.4, 1.4, -4.2], fov: 40 }, p, t, linear, 0.003);
  });
  mk("house-arrive", 44.8, 47.0, "house", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [2.6, 1.5, 2.6], l: [-1.2, 1.3, -0.3], fov: 40 }, { p: [2.2, 1.5, 2.3], l: [-1.2, 1.35, -0.3], fov: 34 }, p, t, linear, 0.003);
  });

  // ---- the conversation (shot / reverse shot, with inserts)
  const OTS_Z = { p: [-0.2, 1.68, 2.4] as V3, l: [-1.5, 1.45, -1.25] as V3, fov: 28 };
  const OTS_C = { p: [-1.95, 1.6, -2.5] as V3, l: [-1.0, 1.6, 0.85] as V3, fov: 28 };
  const CU_Z = { p: [-0.95, 1.6, -0.75] as V3, l: [-1.2, 1.6, 0.85] as V3, fov: 24 };
  const CU_C = { p: [-1.4, 1.55, 0.85] as V3, l: [-1.2, 1.56, -1.25] as V3, fov: 22 };
  const PROFILE = { p: [3.4, 1.45, -0.2] as V3, l: [-1.2, 1.3, -0.2] as V3, fov: 34 };
  const push = (a: typeof CU_Z, amt = 0.16): typeof CU_Z => ({ p: [a.p[0] + (a.l[0] - a.p[0]) * amt, a.p[1], a.p[2] + (a.l[2] - a.p[2]) * amt], l: a.l, fov: a.fov - 1 });

  mk("talk-1", 47.0, 51.4, "house", (ctx, t, lt, p) => camBetween(ctx, OTS_Z, { ...OTS_Z, p: [-0.35, 1.68, 2.1] }, p, t, linear, 0.003));
  mk("talk-2", 51.4, 54.2, "house", (ctx, t, lt, p) => camBetween(ctx, CU_Z, push(CU_Z, 0.08), p, t, linear, 0.002));
  mk("talk-3", 54.2, 56.6, "house", (ctx, t, lt, p) => camBetween(ctx, OTS_C, { ...OTS_C, p: [-1.85, 1.6, -2.25] }, p, t, linear, 0.003));
  mk("talk-4", 56.6, 60.4, "house", (ctx, t, lt, p) => camBetween(ctx, PROFILE, { ...PROFILE, p: [3.0, 1.42, -0.1], fov: 32 }, p, t, linear, 0.003));
  mk("talk-5", 60.4, 63.5, "house", (ctx, t, lt, p) => camBetween(ctx, CU_C, push(CU_C, 0.12), p, t, linear, 0.002));
  mk("talk-6", 63.5, 66.8, "house", (ctx, t, lt, p) => camBetween(ctx, OTS_C, { ...OTS_C, p: [-1.8, 1.6, -2.1] }, p, t, linear, 0.003));
  mk("talk-cup", 66.8, 69.5, "house", (ctx, t, lt, p) => {
    const c = new THREE.Vector3();
    ctx.cast.props.cup.getWorldPosition(c);
    camBetween(ctx, { p: [c.x + 0.42, c.y + 0.14, c.z - 0.85], l: [c.x, c.y + 0.05, c.z], fov: 28 }, { p: [c.x + 0.34, c.y + 0.1, c.z - 0.68], l: [c.x, c.y + 0.05, c.z], fov: 22 }, p, t, linear, 0.002);
  });
  mk("talk-7", 69.5, 72.9, "house", (ctx, t, lt, p) => camBetween(ctx, CU_C, push(CU_C, 0.1), p, t, linear, 0.003));
  mk("safe-track", 72.9, 77.4, "house", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [1.9, 1.5, 3.2], l: (tt) => [collHouse.pos(tt)[0], 1.3, collHouse.pos(tt)[2]], fov: 44 }, { p: [-0.6, 1.5, 3.8], l: (tt) => [collHouse.pos(tt)[0], 1.3, collHouse.pos(tt)[2]], fov: 40 }, p, t, linear, 0.005);
  });
  mk("safe-open", 77.4, 79.4, "house", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [-2.15, 1.35, 2.9], l: [-4.35, 1.0, 1.7], fov: 38 }, { p: [-2.4, 1.3, 2.55], l: [-4.4, 0.95, 1.7], fov: 30 }, p, t, linear, 0.003);
  });
  mk("mars-insert", 79.4, 81.0, "house", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [-3.4, 1.22, 2.0], l: [-4.5, 1.02, 1.7], fov: 28 }, { p: [-3.65, 1.18, 1.95], l: [-4.5, 1.02, 1.7], fov: 20 }, p, t, linear, 0.002);
  });
  mk("mars-carry", 81.0, 83.4, "house", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [-1.5, 1.5, 2.6], l: (tt) => [collHouse.pos(tt)[0], 1.3, collHouse.pos(tt)[2]], fov: 42 }, { p: [-1.0, 1.5, 1.6], l: (tt) => [collHouse.pos(tt)[0], 1.3, collHouse.pos(tt)[2]], fov: 38 }, p, t, linear, 0.004);
  });
  mk("microscope", 83.4, 84.6, "house", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [1.45, 1.6, 0.4], l: [-0.4, 1.35, 0.15], fov: 32 }, { p: [1.2, 1.55, 0.3], l: [-0.4, 1.35, 0.15], fov: 26 }, p, t, linear, 0.002);
  });
  mk("microscope-lens", 84.6, 86.2, "house", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [1.45, 1.6, 0.4], l: [-0.4, 1.35, 0.15], fov: 32 }, { p: [1.2, 1.55, 0.3], l: [-0.4, 1.35, 0.15], fov: 26 }, p, t, linear, 0.002);
  }, { lens: true });
  mk("talk-8", 86.2, 88.9, "house", (ctx, t, lt, p) => camBetween(ctx, CU_Z, push(CU_Z, 0.1), p, t, linear, 0.002));
  mk("talk-9", 88.9, 90.9, "house", (ctx, t, lt, p) => camBetween(ctx, OTS_Z, { ...OTS_Z, p: [-0.45, 1.68, 2.1] }, p, t, linear, 0.003));
  mk("cabinet-trip", 90.9, 93.6, "house", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.9, 1.5, -0.6], l: [-1.1, 1.35, -3.6], fov: 40 }, { p: [0.2, 1.5, -1.3], l: [-1.1, 1.4, -3.7], fov: 34 }, p, t, linear, 0.004);
  });
  mk("stone-insert", 93.6, 96.0, "house", (ctx, t, lt, p) => {
    // over his shoulder at the open cabinet: the stone comes off the shelf, he turns back with it
    const c = collHouse.pos(t);
    camBetween(ctx, { p: [c[0] + 0.75, 1.62, c[2] + 1.2], l: [c[0] - 0.1, 1.35, c[2] - 1.0], fov: 32 }, { p: [c[0] + 0.9, 1.6, c[2] + 1.3], l: [c[0] - 0.1, 1.3, c[2] - 0.6], fov: 34 }, p, t, linear, 0.003);
  });
  mk("talk-10", 96.0, 98.7, "house", (ctx, t, lt, p) => camBetween(ctx, CU_Z, push(CU_Z, 0.06), p, t, linear, 0.002));
  mk("lumps-insert", 98.7, 102.0, "house", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [-1.3, 1.3, 0.5], l: [-1.35, 0.97, -0.2], fov: 32 }, { p: [-1.3, 1.2, 0.3], l: [-1.35, 0.97, -0.2], fov: 26 }, p, t, linear, 0.0015);
  });
  mk("talk-11", 102.0, 104.8, "house", (ctx, t, lt, p) => camBetween(ctx, CU_C, push(CU_C, 0.08), p, t, linear, 0.002));
  mk("phone", 104.8, 108.0, "house", (ctx, t, lt, p) => {
    const ph = new THREE.Vector3();
    ctx.cast.props.phone.getWorldPosition(ph);
    camBetween(ctx, { p: [ph.x + 0.28, ph.y + 0.08, ph.z - 0.55], l: [ph.x, ph.y, ph.z], fov: 24 }, { p: [ph.x + 0.2, ph.y + 0.05, ph.z - 0.4], l: [ph.x, ph.y, ph.z], fov: 18 }, p, t, linear, 0.002);
  });
  mk("talk-12", 108.0, 111.6, "house", (ctx, t, lt, p) => camBetween(ctx, CU_C, push(CU_C, 0.06), p, t, linear, 0.003));
  mk("talk-13", 111.6, 118.0, "house", (ctx, t, lt, p) => camBetween(ctx, { ...CU_Z, p: [-0.95, 1.62, -0.9], fov: 26 }, { p: [-1.1, 1.63, -0.25], l: [-1.2, 1.62, 0.85], fov: 22 }, p, t, easeOut, 0.0015));
  return S;
}

export { zHead, cHead, zHeadAt, cHeadAt, ZP, CP, clamp, idle, lerpPose };
