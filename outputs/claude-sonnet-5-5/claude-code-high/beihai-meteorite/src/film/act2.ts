import * as THREE from "three";
import { seg, smooth, mix, type V3 } from "../blocks";
import { BASE } from "../sets/basement";
import { SHOP } from "../sets/shop";
import {
  applyPose,
  camBetween,
  face,
  gait,
  idle,
  linear,
  nudge,
  over,
  place,
  setCamera,
  Track,
  easeOut,
  type Ctx,
  type E3,
  type ShotDef,
} from "./core";
import { aim } from "@agentbench/voxel-kit";
import { T } from "../timing";

const PI = Math.PI;
const sm = (t: number, a: number, b: number) => smooth(seg(t, a, b));

/* ------------------------------------------------------------------ shop */

export const zhangShop = new Track([
  { t: 118.0, p: [-7.6, 0, 2.2], yaw: 0.5 * PI },
  { t: 119.3, p: [-6.6, 0, 2.2], yaw: 0.5 * PI },
  { t: 120.0, p: [-6.5, 0, 1.4], yaw: PI },
  { t: 120.6, p: [-6.5, 0, 1.4], yaw: 1.5 * PI },
  { t: 121.5, p: [-6.5, 0, 1.4], yaw: 1.5 * PI },
  { t: 121.9, p: [-6.5, 0, 1.4], yaw: 2.5 * PI },
  { t: 125.0, p: [-0.1, 0, 0.42], yaw: 2.5 * PI },
  { t: 125.4, p: [-0.1, 0, 0.42], yaw: 3 * PI },
  { t: 128.6, p: [-0.1, 0, 0.42], yaw: 3 * PI },
  { t: 129.4, p: [0.85, 0, 0.42], yaw: 3 * PI },
  { t: 134.4, p: [0.85, 0, 0.42], yaw: 3 * PI },
  { t: 135.4, p: [1.35, 0, 1.75], yaw: 3 * PI },
  { t: 139.3, p: [1.35, 0, 1.75], yaw: 3 * PI },
  { t: 141.2, p: [-0.1, 0, 0.42], yaw: 3 * PI },
  { t: 145.35, p: [-0.1, 0, 0.42], yaw: 3 * PI },
  { t: 145.4, p: [-5.6, 0, 1.55], yaw: 3.5 * PI },
  { t: 146.0, p: [-6.5, 0, 1.4], yaw: 3.5 * PI },
  { t: 146.5, p: [-6.5, 0, 1.4], yaw: 3.5 * PI },
  { t: 148.0, p: [-7.7, 0, 2.2], yaw: 2.5 * PI },
]);

export function animShop(ctx: Ctx, t: number): void {
  const z = ctx.cast.zhang;
  const P = ctx.cast.props;
  ctx.shop.update(t);
  place(z.fig, zhangShop.pos(t), zhangShop.yaw(t));
  let pose = gait(zhangShop, t);
  const still = zhangShop.speed(t) < 0.2;

  const carry = t >= 119.3 && t < 126.7;
  P.rock.visible = carry;
  if (carry) pose = over(pose, { armL: [-0.95, 0, 0.15] });
  // light switches
  const sw1 = sm(t, 120.6, 120.95) - sm(t, 121.25, 121.6);
  const sw2 = sm(t, 145.9, 146.15) - sm(t, 146.35, 146.6);
  if (sw1 > 0 || sw2 > 0) pose = over(pose, { armR: [-1.65 * Math.max(sw1, sw2), 0, -0.1], neck: [0, 0, 0] });
  // loading the vise
  const load = sm(t, 125.6, 126.3) - sm(t, 127.0, 127.6);
  if (load > 0) pose = over(pose, { armL: [-1.4 * load - 0.95 * (1 - load), 0, 0.05], hips: [0.12 * load, 0, 0], armR: [-0.3 * load, 0, -0.1] });
  // slide the glass door shut
  const shut = sm(t, 128.1, 128.6) - sm(t, 128.9, 129.3);
  if (shut > 0) pose = over(pose, { armR: [-1.25 * shut, 0, -0.2 * shut] });
  // press the start button
  const press = sm(t, 129.5, 129.8) - sm(t, 130.1, 130.4);
  if (press > 0) pose = over(pose, { armR: [-1.45 * press, 0, -0.3 * press], neck: [0, -0.35 * press, 0] });
  // watching the cut
  if (t >= 130.4 && t < 134.4 && still) pose = nudge(pose, { neck: [0.12, -0.25, 0], hips: [0.05, 0, 0] });
  // tray vigil
  if (t >= 135.4 && t < 139.3) pose = over(pose, { armR: [0.15, 0, -0.1], armL: [0.15, 0, 0.1], neck: [0.32, 0, 0], hips: [0.05, 0, 0] });
  // sweeping the chips
  const sweep = t >= 141.6 && t < 143.6;
  P.brush.visible = sweep;
  if (sweep) {
    const s = Math.sin((t - 141.6) * 9);
    pose = over(pose, { armR: [-1.3 + s * 0.12, 0, -0.15 + s * 0.22], armL: [-0.6, 0, 0.1], hips: [0.16, 0, 0], neck: [0.3, 0, 0] });
  }
  // removing the drill bit
  const bitIn = t >= T.toolOut && t < 145.3;
  P.bit.visible = bitIn;
  if (t >= 143.5 && t < 145.4) {
    const up = sm(t, 143.5, 143.9);
    const away = sm(t, 144.3, 144.8);
    pose = over(pose, { armR: [-2.6 * up + 1.7 * away, 0, -0.1], armL: [-0.3, 0, 0.1] });
  }
  P.gravel.visible = false;
  applyPose(z.fig, pose);
  face(z, "grim", false);

  // tin of shavings travels with his other hand
  const tin = ctx.shop.tin as THREE.Object3D;
  const tinHeld = t >= 143.7 && t < 145.4;
  if (t < 143.7) tin.position.set(-1.25, 1.1, -0.6);
  if (tinHeld) {
    z.fig.anchors.handL.getWorldPosition(tin.position);
    pose = over(pose, { armL: [-1.0, 0, 0.1] });
    applyPose(z.fig, pose);
  }
  tin.visible = t < 145.4;
}

/* -------------------------------------------------------------- basement */

const bagDx = BASE.bag[0] - 1.4;
const bagDz = BASE.bag[2] - 1.2;
export const aimYaw = Math.atan2(bagDx, bagDz) + 2 * PI;

export const zhangBase = new Track([
  { t: 148.0, p: [1.9, 0.6, 3.3], yaw: PI },
  { t: 150.1, p: [1.9, 0.6, 3.3], yaw: PI },
  { t: 150.9, p: [1.9, 0.6, 2.45], yaw: PI },
  { t: 151.5, p: [1.9, 0.4, 2.05], yaw: PI },
  { t: 152.0, p: [1.9, 0.2, 1.7], yaw: PI },
  { t: 152.5, p: [1.7, 0, 1.3], yaw: PI },
  { t: 154.5, p: [0.35, 0, 0.42], yaw: PI },
  { t: 172.4, p: [0.35, 0, 0.42], yaw: PI },
  { t: 174.6, p: [0.35, 0, 0.42], yaw: PI },
  { t: 176.4, p: [1.4, 0, 1.2], yaw: aimYaw },
  { t: 182.0, p: [1.4, 0, 1.2], yaw: aimYaw },
  { t: 182.05, p: [0.35, 0, 0.42], yaw: PI },
  { t: 196.4, p: [0.35, 0, 0.42], yaw: PI },
  { t: 196.45, p: [1.9, 0, 1.35], yaw: PI },
  { t: 197.0, p: [1.9, 0.2, 1.75], yaw: PI },
  { t: 197.4, p: [1.9, 0.6, 2.4], yaw: PI },
  { t: 198.0, p: [1.9, 0.6, 3.2], yaw: PI },
]);

export function shotKick(t: number, times: readonly number[], decay = 0.09): number {
  let k = 0;
  for (const s of times) if (t >= s) k += Math.exp(-(t - s) / decay) * (t - s < 0.5 ? 1 : 0);
  return Math.min(1.4, k);
}

export function animBasement(ctx: Ctx, t: number): void {
  const z = ctx.cast.zhang;
  const P = ctx.cast.props;
  ctx.basement.update(t);
  place(z.fig, zhangBase.pos(t), zhangBase.yaw(t));
  let pose = gait(zhangBase, t);
  const atTable = t >= 154.5 && t < 174.6;
  if (atTable || (t >= 182.05 && t < 196.4)) pose = over(pose, { hips: [0.24, 0, 0], neck: [0.34, 0, 0], armR: [-0.35, 0, -0.1], armL: [-0.35, 0, 0.1] });
  // pliers
  const pl = t >= T.bPliers0 - 0.6 && t < T.bPliers1 + 0.3;
  P.pliers.visible = pl;
  if (pl) {
    const o = Math.sin(t * 9.5) * 0.08;
    pose = over(pose, { hips: [0.28, 0, 0], neck: [0.42, 0, 0], armR: [-0.95 + o, 0, -0.15], armL: [-0.85, 0, 0.12 + o * 0.6] });
  }
  // glue
  const gl = t >= T.bGlue0 - 0.3 && t < T.bGlue1 + 0.3;
  P.brush.visible = gl;
  if (gl) {
    const o = Math.sin(t * 6.1) * 0.1;
    pose = over(pose, { hips: [0.28, 0, 0], neck: [0.42, 0, 0], armR: [-0.95 + o, 0, -0.12], armL: [-0.8, 0, 0.1] });
  }
  // loading the magazine
  const ld = t >= T.bLoad0 - 0.4 && t < T.bLoad1 + 0.2;
  P.magazine.visible = ld || (t >= 172.4 && t < 173.6);
  if (ld) {
    const cyc = ((t - T.bLoad0) % 1.1) / 1.1;
    const dip = Math.sin(Math.min(1, cyc * 1.4) * PI);
    pose = over(pose, { hips: [0.24, 0, 0], neck: [0.4, 0, 0], armR: [-0.85 - 0.35 * dip, 0, -0.12], armL: [-1.15, 0, 0.1] });
  }
  // pistol handling
  const pis = t >= 172.5 && t < 182.0;
  P.pistol.visible = pis;
  if (t >= 172.4 && t < 174.6) {
    const slap = sm(t, 172.9, 173.1) - sm(t, 173.2, 173.5);
    const rack = sm(t, 173.9, 174.1) - sm(t, 174.2, 174.4);
    pose = over(pose, { hips: [0.12, 0, 0], neck: [0.25, 0, 0], armR: [-1.05, 0.1, -0.1], armL: [-0.95 - slap * 0.45 - rack * 0.4, 0, 0.2] });
  }
  if (t >= 174.6 && t < 176.5) {
    const raise = sm(t, 175.6, 176.5);
    const a = aim(0.02, 0);
    pose = { ...pose, armR: [mix(-1.05, a.armR![0], raise), a.armR![1] * raise, mix(-0.1, a.armR![2], raise)], armL: [mix(-0.4, a.armL![0], raise), 0, mix(0.1, a.armL![2], raise)], hips: [0.02, 0, 0], neck: [0.02, 0, 0] };
  }
  if (t >= 176.5 && t < 180.2) {
    const a = aim(0.02, 0);
    const kick = shotKick(t, T.bShots);
    pose = { ...a, armR: [a.armR![0] + kick * 0.16, a.armR![1], a.armR![2]], armL: [a.armL![0] + kick * 0.16, a.armL![1], a.armL![2]], hips: [-kick * 0.03, 0, 0], neck: [0.02 - kick * 0.05, 0, 0] };
  }
  if (t >= 180.2 && t < 182.0) {
    const lower = sm(t, 180.2, 181.0);
    const a = aim(0.02, 0);
    pose = { ...a, armR: [mix(a.armR![0], -0.25, lower), 0, 0.09], armL: [mix(a.armL![0], -0.2, lower), 0, -0.1], neck: [0.15 * lower, 0, 0], hips: [0.04 * lower, 0, 0] };
  }
  // dissecting the bag
  const kn = t >= 185.5 && t < 188.4;
  P.knife.visible = kn;
  if (kn) {
    const cut = Math.sin((t - 185.5) * 3.2);
    pose = over(pose, { hips: [0.3, 0, 0], neck: [0.45, 0, 0], armR: [-1.0 + cut * 0.14, 0, -0.1], armL: [-0.85, 0, 0.1] });
  }
  // palm full of fragments
  const pm = t >= 188.2 && t < 193.0;
  P.gravel.visible = pm;
  if (pm) {
    const up = sm(t, 188.2, 189.0) - sm(t, 192.2, 192.9);
    pose = over(pose, { hips: [0.05, 0, 0], neck: [0.32 * up, 0, 0], armL: [-1.25 * up - 0.3 * (1 - up), 0, 0.12], armR: [-0.2, 0, -0.1] });
  }
  // pocketing the rounds
  if (t >= 193.2 && t < 196.4) {
    const dip = sm(t, 194.6, 195.3) - sm(t, 195.6, 196.2);
    pose = over(pose, { hips: [0.18, 0, 0], neck: [0.3, 0, 0], armR: [-0.6 + Math.sin(t * 3) * 0.1, 0, -0.1], armL: [-0.7 + dip * 0.6, 0, 0.1] });
    P.magazine.visible = t < 195.4;
  }
  applyPose(z.fig, pose);
  face(z, "grim", false);

  // the fabric bag on its crate, gone once taken
  ctx.basement.bagGroup.visible = t < 182.0;
  const kick = shotKick(t, T.bShots, 0.12);
  ctx.basement.bagGroup.rotation.x = -kick * 0.05;
  ctx.basement.bagGroup.position.set(BASE.bag[0], BASE.bag[1] + kick * 0.008, BASE.bag[2]);
}

/** Muzzle flash sprite for the basement test. */
export function muzzleWorld(ctx: Ctx, pistol: THREE.Mesh): THREE.Vector3 {
  pistol.updateWorldMatrix(true, false);
  return pistol.localToWorld(new THREE.Vector3(0, 1.26, 3.4));
}

/* ------------------------------------------------------------------ shots */

export function act2Shots(): ShotDef[] {
  const S: ShotDef[] = [];
  const at = (o: () => THREE.Object3D, off: V3 = [0, 0, 0]) => (): V3 => {
    const v = new THREE.Vector3();
    o().getWorldPosition(v);
    return [v.x + off[0], v.y + off[1], v.z + off[2]];
  };
  const hold = (o: () => THREE.Object3D): ((t: number) => V3) => at(o);
  const mk = (id: string, start: number, end: number, loc: ShotDef["loc"], run: ShotDef["run"]) => S.push({ id, start, end, loc, run });
  const zs = (t: number): V3 => zhangShop.pos(t);
  const zb = (t: number): V3 => zhangBase.pos(t);

  // ---- workshop
  mk("shop-dark", 118.0, 121.0, "shop", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [3.8, 1.5, 4.8], l: [-6.9, 1.3, 2.2], fov: 44 }, { p: [3.0, 1.5, 4.3], l: [-6.9, 1.3, 2.2], fov: 40 }, p, t, linear, 0.004);
  });
  mk("shop-tubes", 121.0, 122.9, "shop", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [-2.5, 0.6, 2.4], l: [0, 4.6, 0.2], fov: 62 }, { p: [-2.5, 0.8, 2.4], l: [-1.0, 2.6, 0.4], fov: 50 }, p, t, linear, 0.003);
  });
  mk("shop-track", 122.9, 125.2, "shop", (ctx, t, lt, p) => {
    const z = zs(t);
    setCamera(ctx, [z[0] + 1.2, 1.35, z[2] + 3.6], [z[0] + 1.6, 1.35, z[2] - 0.2], 40, 0, 0.004, t);
  });
  mk("shop-load", 125.2, 128.6, "shop", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [1.9, 1.5, 2.3], l: [-0.3, 1.3, -0.5], fov: 36 }, { p: [1.1, 1.5, 1.6], l: [-0.35, 1.3, -0.7], fov: 30 }, p, t, linear, 0.004);
  });
  mk("shop-close", 128.6, 129.9, "shop", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [1.2, 1.55, 0.9], l: [-0.1, 1.4, -1.0], fov: 32 }, { p: [1.5, 1.55, 0.8], l: [0.7, 1.5, -0.1], fov: 26 }, p, t, linear, 0.003);
  });
  mk("shop-drill", 129.9, 132.4, "shop", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.4, 1.6, 0.5], l: [0, 1.4, -1.4], fov: 30 }, { p: [0.25, 1.6, 0.35], l: [0, 1.45, -1.4], fov: 24 }, p, t, linear, 0.006);
  });
  mk("shop-bit", 132.4, 134.8, "shop", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.55, 1.05, 0.3], l: [0, 1.55, -1.4], fov: 34 }, { p: [0.4, 1.15, 0.2], l: [0, 1.55, -1.4], fov: 26 }, p, t, linear, 0.007);
  });
  mk("shop-saw", 134.8, 137.5, "shop", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.15, 1.5, 0.45], l: [0.35, 1.2, -1.4], fov: 32 }, { p: [0.25, 1.45, 0.35], l: [0.35, 1.2, -1.4], fov: 26 }, p, t, linear, 0.006);
  });
  mk("shop-tray", 137.5, 140.6, "shop", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.55, 1.35, 1.6], l: [1.55, 0.98, 1.05], fov: 34 }, { p: [0.8, 1.4, 1.5], l: [1.55, 0.98, 1.05], fov: 24 }, p, t, linear, 0.002);
  });
  mk("shop-sweep", 140.6, 143.5, "shop", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [-1.6, 1.5, 1.4], l: [-0.3, 1.25, -0.6], fov: 36 }, { p: [-1.2, 1.5, 1.1], l: [-0.4, 1.2, -0.6], fov: 30 }, p, t, linear, 0.003);
  });
  mk("shop-bit-out", 143.5, 145.4, "shop", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.55, 1.85, 0.5], l: [-0.05, 1.85, -0.7], fov: 30 }, { p: [0.4, 1.85, 0.3], l: [-0.05, 1.85, -0.7], fov: 24 }, p, t, linear, 0.003);
  });
  mk("shop-exit", 145.4, 148.0, "shop", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [3.0, 1.5, 4.4], l: [-7.0, 1.3, 2.0], fov: 42 }, { p: [2.6, 1.5, 4.1], l: [-7.0, 1.3, 2.0], fov: 38 }, p, t, linear, 0.003);
  });

  // ---- basement
  mk("base-door", 148.0, 150.9, "basement", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [-1.4, 0.55, -0.9], l: [1.9, 1.3, 2.3], fov: 50 }, { p: [-0.9, 0.7, -0.4], l: [1.9, 1.3, 2.3], fov: 46 }, p, t, linear, 0.004);
  });
  mk("base-descend", 150.9, 154.6, "basement", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [-2.3, 1.6, -1.6], l: (tt) => { const q = zb(tt); return [q[0], q[1] + 1.2, q[2]]; }, fov: 46 }, { p: [-2.0, 1.5, -0.4], l: (tt) => { const q = zb(tt); return [q[0], q[1] + 1.2, q[2]]; }, fov: 42 }, p, t, linear, 0.004);
  });
  const propAt = (get: (ctx: Ctx) => THREE.Object3D, off: V3, off2: V3 = off) => (ctx: Ctx, t: number, p: number, fov: [number, number], look: V3 = [0, 0, 0]) => {
    const v = new THREE.Vector3();
    get(ctx).getWorldPosition(v);
    const l: V3 = [v.x + look[0], v.y + look[1], v.z + look[2]];
    const o: V3 = [mix(off[0], off2[0], p), mix(off[1], off2[1], p), mix(off[2], off2[2], p)];
    setCamera(ctx, [v.x + o[0], v.y + o[1], v.z + o[2]], l, mix(fov[0], fov[1], p), 0, 0.003, t);
  };
  mk("base-pliers", 154.6, 157.6, "basement", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.95, 1.5, -1.5], l: [0.3, 1.0, -0.05], fov: 34 }, { p: [0.8, 1.45, -1.35], l: [0.3, 1.0, -0.05], fov: 28 }, p, t, linear, 0.003);
  });
  mk("base-work", 157.6, 161.0, "basement", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [-1.6, 1.45, 0.25], l: [0.35, 1.1, 0.0], fov: 38 }, { p: [-1.3, 1.45, 0.3], l: [0.35, 1.1, 0.0], fov: 32 }, p, t, linear, 0.004);
  });
  mk("base-glue", 161.0, 164.7, "basement", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.5, 1.75, -0.2], l: [0.3, 0.93, -0.55], fov: 32 }, { p: [0.4, 1.65, -0.3], l: [0.3, 0.93, -0.55], fov: 26 }, p, t, linear, 0.002);
  });
  mk("base-rows", 164.7, 167.3, "basement", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [-1.1, 1.12, -0.55], l: [0.3, 0.98, -0.55], fov: 30 }, { p: [-0.85, 1.1, -0.55], l: [0.3, 0.98, -0.55], fov: 26 }, p, t, linear, 0.002);
  });
  mk("base-load", 167.3, 171.8, "basement", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.95, 1.4, -1.15], l: [0.3, 1.05, 0.05], fov: 32 }, { p: [0.8, 1.35, -1.0], l: [0.3, 1.05, 0.05], fov: 26 }, p, t, linear, 0.003);
  });
  mk("base-pistol", 171.8, 174.6, "basement", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [-0.75, 1.4, -1.05], l: [0.35, 1.15, 0.1], fov: 38 }, { p: [-0.5, 1.38, -0.9], l: [0.35, 1.15, 0.1], fov: 32 }, p, t, linear, 0.003);
  });
  mk("base-pov", 174.6, 177.4, "basement", (ctx, t, lt, p) => {
    // from the bag's point of view: the muzzle looks straight down the lens
    camBetween(ctx, { p: [-1.45, 1.05, -1.35], l: [0.5, 1.15, 0.4], fov: 46 }, { p: [-1.55, 1.05, -1.5], l: [1.4, 1.35, 1.2], fov: 34 }, p, t, linear, 0.004);
  });
  mk("base-fire", 177.4, 180.0, "basement", (ctx, t, lt, p) => {
    const kick = shotKick(t, T.bShots, 0.08);
    camBetween(ctx, { p: [-2.3, 1.45, 1.9], l: [-0.3, 1.1, -0.3], fov: 52 }, { p: [-2.2, 1.45, 1.8], l: [-0.3, 1.1, -0.3], fov: 50 }, p, t, linear, 0.004 + kick * 0.03);
  });
  mk("base-smoke", 180.0, 182.05, "basement", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [-0.1, 1.55, 0.4], l: [1.4, 1.5, 1.2], fov: 32 }, { p: [0.15, 1.55, 0.5], l: [1.4, 1.5, 1.2], fov: 24 }, p, t, linear, 0.004);
  });
  mk("base-unwrap", 182.05, 185.5, "basement", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.9, 1.5, -1.4], l: [0.15, 0.98, -0.3], fov: 34 }, { p: [0.75, 1.42, -1.25], l: [0.15, 0.98, -0.3], fov: 28 }, p, t, linear, 0.003);
  });
  mk("base-knife", 185.5, 188.2, "basement", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.7, 1.35, -1.1], l: [0.15, 0.98, -0.35], fov: 30 }, { p: [0.55, 1.3, -1.0], l: [0.15, 0.98, -0.35], fov: 24 }, p, t, linear, 0.002);
  });
  mk("base-palm", 188.2, 193.0, "basement", (ctx, t, lt, p) => propAt((c) => c.cast.props.gravel, [0.5, 0.12, -1.0], [0.4, 0.08, -0.85])(ctx, t, p, [28, 22]));
  mk("base-pocket", 193.0, 196.4, "basement", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.95, 1.5, -1.15], l: [0.35, 1.25, 0.35], fov: 38 }, { p: [0.8, 1.5, -1.0], l: [0.35, 1.25, 0.35], fov: 34 }, p, t, linear, 0.003);
  });
  mk("base-exit", 196.4, 198.0, "basement", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [-1.6, 0.9, 0.2], l: [1.9, 1.2, 2.0], fov: 50 }, { p: [-1.4, 0.9, 0.5], l: [1.9, 1.3, 2.3], fov: 46 }, p, t, easeOut, 0.003);
  });
  return S;
}

export { SHOP, idle };
export type { E3 };
