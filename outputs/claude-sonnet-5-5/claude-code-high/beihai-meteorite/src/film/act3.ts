import * as THREE from "three";
import { aim, float as floatPose, type Figure } from "@agentbench/voxel-kit";
import { clamp, glowSprite, mix, rng, seg, smooth, type V3 } from "../blocks";
import { EARTH_C, sunState } from "../sets/space";
import { CABIN } from "../sets/cabin";
import { T } from "../timing";
import {
  applyPose,
  camBetween,
  easeIn,
  easeOut,
  face,
  idle,
  lerpPose,
  linear,
  nudge,
  over,
  place,
  setCamera,
  Track,
  type Ctx,
  type E3,
  type ShotDef,
} from "./core";
import { ParticlePool, trail, type Emission } from "./fx";

const PI = Math.PI;

/** Swap a clothing sheet only when it actually changes (setClothes flags the material for a rebuild). */
function dress(fig: Figure, tex: THREE.Texture): void {
  if ((fig.clothing.head.material as THREE.MeshStandardMaterial).map !== tex) fig.setClothes(tex);
}
const sm = (t: number, a: number, b: number) => smooth(seg(t, a, b));
const V = (a: V3) => new THREE.Vector3(...a);
const arr = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];

/* ------------------------------------------------------------- key times */

export const K = {
  hatchGreen: 251.0,
  hatchOpen0: 251.8,
  hatchOpen1: 253.4,
  emerge0: 253.8,
  visor0: 263.5,
  gloveOff: 275.6,
  scopeFloat0: 274.0,
  draw: 277.4,
  scopeGrab: 285.4,
  scopeMount: 286.2,
  magIn: 287.6,
  aimUp: 288.4,
  fire: [297.4, 299.9, 302.4] as const,
  fireStep: 0.16,
  hatchClose0: 322.8,
  hatchClose1: 323.8,
  bulletFlight: 10.0,
};

const shotTimes: number[] = [];
for (const f of K.fire) for (let i = 0; i < 10; i++) shotTimes.push(f + i * K.fireStep);
export const SHOTS = shotTimes;

const VICTIMS = [
  { i: 1, t: 307.4, head: true, helper: 11 },
  { i: 8, t: 308.5, head: false, helper: 7, pack: true },
  { i: 2, t: 309.9, head: true, helper: 13 },
  { i: 4, t: 310.7, head: false, helper: 9 },
  { i: 3, t: 312.3, head: true, helper: 15 },
];
const isVictim = (i: number) => VICTIMS.find((v) => v.i === i);
const helperOf = (i: number) => VICTIMS.find((v) => v.helper === i);

/* -------------------------------------------------------- shared helpers */

class Path {
  constructor(public segs: Array<{ t0: number; t1: number; f: (t: number) => V3 }>) {}
  pos(t: number): V3 {
    const s = this.segs;
    if (t <= s[0]!.t0) return s[0]!.f(s[0]!.t0);
    for (const g of s) if (t < g.t1) return g.f(Math.max(t, g.t0));
    const l = s[s.length - 1]!;
    return l.f(l.t1);
  }
  start(): number {
    return this.segs[0]!.t0;
  }
  end(): number {
    return this.segs[this.segs.length - 1]!.t1;
  }
  segAt(t: number): number {
    for (let i = 0; i < this.segs.length; i++) if (t < this.segs[i]!.t1) return i;
    return this.segs.length;
  }
}

const bez = (a: V3, c: V3, b: V3, u: number): V3 => {
  const k = 1 - u;
  return [k * k * a[0] + 2 * k * u * c[0] + u * u * b[0], k * k * a[1] + 2 * k * u * c[1] + u * u * b[1], k * k * a[2] + 2 * k * u * c[2] + u * u * b[2]];
};
const lerp3 = (a: V3, b: V3, u: number): V3 => [mix(a[0], b[0], u), mix(a[1], b[1], u), mix(a[2], b[2], u)];
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Orient a figure head-first along `dir`, face toward the planet, like a swimmer. */
const bx = new THREE.Vector3();
const by = new THREE.Vector3();
const bz = new THREE.Vector3();
const bm = new THREE.Matrix4();
function flightOrient(obj: THREE.Object3D, dir: THREE.Vector3): void {
  by.copy(dir).normalize();
  bz.set(0, -1, 0).addScaledVector(by, -by.y);
  if (bz.lengthSq() < 1e-4) bz.set(0, 0, 1);
  bz.normalize();
  bx.crossVectors(by, bz).normalize();
  bz.crossVectors(bx, by).normalize();
  bm.makeBasis(bx, by, bz);
  obj.quaternion.setFromRotationMatrix(bm);
}
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

/* ------------------------------------------------------- runtime (init) */

export interface SpaceRuntime {
  G: V3;
  D: V3;
  O: V3;
  gyaw: number;
  X: V3;
  Zd: V3;
  slots: V3[];
  phoSlot: V3;
  crowdPath: Path[];
  phoPath: Path;
  order: number[];
  puffs: ParticlePool;
  gas: ParticlePool;
  blood: ParticlePool;
  bullets: THREE.InstancedMesh;
  zGlow: THREE.Sprite;
  flash: THREE.Sprite;
  floatScope: THREE.Mesh;
  glove: THREE.Mesh;
  ZW: V3;
  zhangYaw: number;
  muzzle: THREE.Vector3;
  targetPos: V3[];
  lastMuzzleT: number;
  zFlight: Path;
  zBack: Path;
  dirB: THREE.Vector3;
}

const ZW: V3 = [0, 0, 0];

export function initSpace(ctx: Ctx, floatScope: THREE.Mesh, glove: THREE.Mesh): SpaceRuntime {
  const sp = ctx.space;
  const G = arr(sp.groupCenter);
  const D = arr(sp.door.pos);
  const O = arr(sp.door.out);
  const dx = ZW[0] - G[0];
  const dz = ZW[2] - G[2];
  const gyaw = Math.atan2(dx, dz);
  const X: V3 = [Math.cos(gyaw), 0, -Math.sin(gyaw)];
  const Zd: V3 = [Math.sin(gyaw), 0, Math.cos(gyaw)];
  const at = (lx: number, ly: number, lz: number): V3 => [G[0] + X[0] * lx + Zd[0] * lz, G[1] + ly, G[2] + X[2] * lx + Zd[2] * lz];
  const slots: V3[] = [];
  [-1.9, -0.95, 0, 0.95, 1.9].forEach((x) => slots.push(at(x, 0, 0)));
  [-2.4, -1.45, -0.5, 0.5, 1.45, 2.4].forEach((x) => slots.push(at(x, 0.62, -0.95)));
  [-2.4, -1.45, -0.5, 0.5, 1.45, 2.4].forEach((x) => slots.push(at(x, 1.24, -1.9)));
  const phoSlot = at(-3.6, 0.3, 9.5);

  // arrival order: front row last, so the rows read as they file out
  const order = [11, 5, 12, 6, 13, 7, 14, 8, 15, 9, 16, 10, 0, 1, 2, 3, 4];
  const rank = (i: number) => order.indexOf(i);

  const stand = (j: number) => (t: number): V3 => {
    const s = slots[j]!;
    return [s[0] + Math.sin(t * 0.31 + j) * 0.05, s[1] + Math.sin(t * 0.47 + j * 1.7) * 0.06, s[2] + Math.cos(t * 0.27 + j * 0.6) * 0.05];
  };
  const fly = (a: V3, ctrl: V3, b: V3, t0: number, t1: number, ease: (x: number) => number) => ({
    t0,
    t1,
    f: (t: number): V3 => bez(a, ctrl, b, ease(clamp((t - t0) / (t1 - t0)))),
  });
  const doorIn: V3 = add3(D, [O[0] * 0.5, O[1] * 0.5, O[2] * 0.5]);
  const doorCtrl = (j: number): V3 => add3(D, [O[0] * 26 + (j - 8) * 0.9, O[1] * 26 + Math.sin(j) * 2, O[2] * 26]);

  const crowdPath: Path[] = [];
  for (let j = 0; j < 17; j++) {
    const s0 = K.emerge0 + rank(j) * 0.26;
    const s1 = s0 + 3.9;
    const segs: Array<{ t0: number; t1: number; f: (t: number) => V3 }> = [fly(doorIn, doorCtrl(j), slots[j]!, s0, s1, easeOut)];
    const v = isVictim(j);
    const h = helperOf(j);
    if (v) {
      const hitT = v.t;
      const attach = hitT + 2.6;
      const arrive = attach + 6.5;
      const push = (t: number): V3 => {
        const u = t - hitT;
        const s = slots[j]!;
        return [s[0] - Zd[0] * 0.35 * u + X[0] * Math.sin(u * 2 + j) * 0.12, s[1] + 0.12 * u - 0.05 * u * u, s[2] - Zd[2] * 0.35 * u + X[2] * Math.sin(u * 2 + j) * 0.12];
      };
      segs.push({ t0: s1, t1: hitT, f: stand(j) });
      segs.push({ t0: hitT, t1: attach, f: push });
      const carryStart = push(attach);
      segs.push({
        t0: attach,
        t1: arrive,
        f: (t) => add3(bez(carryStart, doorCtrl(j), doorIn, easeIn(clamp((t - attach) / (arrive - attach)) * 0.6 + 0.4 * clamp((t - attach) / (arrive - attach)))), [X[0] * 0.55, 0, X[2] * 0.55]),
      });
    } else if (h) {
      const v2 = h;
      const start = v2.t + 0.5;
      const reach = start + 2.1;
      const arrive = v2.t + 2.6 + 6.5;
      const target = (t: number): V3 => {
        const s = slots[v2.i]!;
        const u = t - v2.t;
        return [s[0] - Zd[0] * 0.35 * u, s[1] + 0.12 * u, s[2] - Zd[2] * 0.35 * u];
      };
      segs.push({ t0: s1, t1: start, f: stand(j) });
      segs.push({ t0: start, t1: reach, f: (t) => lerp3(slots[j]!, add3(target(reach), [-X[0] * 0.5, 0, -X[2] * 0.5]), easeOut(clamp((t - start) / (reach - start)))) });
      const from = add3(target(reach), [-X[0] * 0.5, 0, -X[2] * 0.5]);
      segs.push({
        t0: reach,
        t1: arrive,
        f: (t) => bez(from, doorCtrl(j), doorIn, easeIn(clamp((t - reach) / (arrive - reach)) * 0.6 + 0.4 * clamp((t - reach) / (arrive - reach)))),
      });
    } else {
      const flee0 = 309.7 + rank(j) * 0.09;
      const arrive = flee0 + 8.2 + (j % 4) * 0.5;
      segs.push({ t0: s1, t1: flee0, f: stand(j) });
      segs.push({
        t0: flee0,
        t1: arrive,
        f: (t) => bez(slots[j]!, doorCtrl(j), doorIn, easeIn(clamp((t - flee0) / (arrive - flee0)) * 0.55 + 0.45 * clamp((t - flee0) / (arrive - flee0)))),
      });
    }
    crowdPath.push(new Path(segs));
  }
  const phoStart = K.emerge0 + 17 * 0.26 * 0.5;
  const phoPath = new Path([
    fly(doorIn, doorCtrl(3), phoSlot, phoStart, phoStart + 4.6, easeOut),
    { t0: phoStart + 4.6, t1: 309.8, f: (t) => [phoSlot[0] + Math.sin(t * 0.3) * 0.06, phoSlot[1] + Math.sin(t * 0.5) * 0.05, phoSlot[2]] },
    {
      t0: 309.8,
      t1: 318.5,
      f: (t) => bez(phoSlot, doorCtrl(5), doorIn, easeIn(clamp((t - 309.8) / 8.7) * 0.6 + 0.4 * clamp((t - 309.8) / 8.7))),
    },
  ]);

  // Zhang's flights: in from Base One (230→240) and out again (332→)
  const b1 = sp.base1;
  const dirB0 = new THREE.Vector3(b1.x, b1.y, b1.z).normalize();
  const toZ = dirB0.clone().negate();
  const R0: V3 = [b1.x + toZ.x * 12, b1.y + toZ.y * 12, b1.z + toZ.z * 12];
  const zFlight = new Path([
    // leaving Base One: a slow start that builds
    { t0: 230.4, t1: 234.6, f: (t) => { const u = t - 230.4; const d = 0.5 * 7.9 * u * u; return [R0[0] + toZ.x * d, R0[1] + toZ.y * d, R0[2] + toZ.z * d]; } },
    // (the long coast is cut) arriving: hard braking onto the chosen spot
    { t0: 234.6, t1: 240.4, f: (t) => { const w = (t - 234.6) / 5.8; const d = 90 * (1 - w) * (1 - w); return [ZW[0] - toZ.x * d, ZW[1] - toZ.y * d, ZW[2] - toZ.z * d]; } },
  ]);
  const dirB = new THREE.Vector3(b1.x, b1.y, b1.z).normalize();
  const zBack = new Path([{ t0: 331.8, t1: 350, f: (t) => { const u = t - 331.8; const d = 0.5 * 1.9 * u * u; return [dirB.x * d, dirB.y * d, dirB.z * d]; } }]);

  // ---- FX
  const puffs = new ParticlePool(700, 0.75);
  const gas = new ParticlePool(420, 0.9);
  const blood = new ParticlePool(120, 1);
  const puffE: Emission[] = [];
  crowdPath.forEach((p, j) => {
    const s0 = K.emerge0 + rank(j) * 0.26;
    trail(puffE, (t) => p.pos(t), s0 + 0.1, s0 + 3.2, 7, 100 + j, { size: 0.16, life: 1.6, grow: 3, back: 0.6 });
    const flee = p.segs[p.segs.length - 1]!;
    trail(puffE, (t) => p.pos(t), flee.t0 + 0.2, flee.t1 - 0.6, 8, 200 + j, { size: 0.16, life: 1.5, grow: 3, back: 0.6 });
  });
  trail(puffE, (t) => zFlight.pos(t), 230.6, 234.4, 18, 501, { size: 0.28, life: 2.2, grow: 2.4, back: 1.4, spread: 1.0 });
  trail(puffE, (t) => zFlight.pos(t), 235.0, 240.0, 22, 502, { size: 0.2, life: 1.8, grow: 2.2, back: -1.2, spread: 1.2 });
  trail(puffE, (t) => zBack.pos(t), 332.4, 346, 34, 503, { size: 0.26, life: 2.6, grow: 2.4, back: 1.2, spread: 0.8 });
  puffs.set(puffE);

  const gasE: Emission[] = [];
  const bloodE: Emission[] = [];
  const rr = rng(7);
  const stateAt = (i: number, t: number): V3 => crowdPath[i]!.pos(t);
  VICTIMS.forEach((v, vi) => {
    const n = v.pack ? 9 : 7;
    for (let k = 0; k < n; k++) {
      const te = v.t + k * (v.pack ? 0.2 : 0.16);
      const base = stateAt(v.i, te);
      const cx = base[0];
      const cy = base[1] + (v.pack ? 1.05 : 1.25);
      const cz = base[2];
      for (let q = 0; q < (v.pack ? 5 : 4); q++) {
        const a = rr() * Math.PI * 2;
        const s = (v.pack ? 2.6 : 1.5) * (0.5 + rr());
        gasE.push({
          t: te + q * 0.03,
          p: [cx + Math.cos(a) * 0.05, cy + (rr() - 0.5) * 0.3, cz + Math.sin(a) * 0.05],
          v: [Math.cos(a) * s * 0.6 + Zd[0] * s, (rr() - 0.4) * s, Math.sin(a) * s * 0.6 + Zd[2] * s],
          seed: 900 + vi * 100 + k * 7 + q,
          life: v.pack ? 3.4 : 2.6,
          size: v.pack ? 0.3 : 0.11,
          grow: v.pack ? 3.4 : 2.4,
          c0: 0xffffff,
          c1: 0xffffff,
          jitter: 0.3,
        });
      }
    }
    if (v.head) {
      const base = stateAt(v.i, v.t + 0.6);
      for (let k = 0; k < 16; k++) {
        const a = rr() * Math.PI * 2;
        const e = (rr() - 0.5) * 1.6;
        bloodE.push({
          t: v.t + 0.35 + rr() * 0.4,
          p: [base[0], base[1] + 1.65, base[2]],
          v: [Math.cos(a) * 0.9 + Zd[0] * 0.8, e, Math.sin(a) * 0.9 + Zd[2] * 0.8],
          seed: 1500 + vi * 40 + k,
          life: 3.6,
          size: 0.075,
          grow: 1,
          c0: 0xb01820,
          c1: 0xeaf6ff,
          turn: 0.45,
          jitter: 0.3,
        });
      }
    }
  });
  gas.set(gasE);
  blood.set(bloodE);

  // bullets: 30 slivers of stone crossing the void
  const bullets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.11, 0.11), new THREE.MeshBasicMaterial({ color: 0xffe9c8, fog: false }), 30);
  bullets.frustumCulled = false;
  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: null, color: 0xfff0c8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  flash.scale.set(1.6, 1.6, 1);
  flash.visible = false;

  const zGlow = glowSprite("255,226,170", 7, 0.9, 6);
  zGlow.visible = false;
  const targetPos: V3[] = [slots[1]!, slots[2]!, slots[3]!];
  return {
    G, D, O, gyaw, X, Zd, slots, phoSlot, crowdPath, phoPath, order, puffs, gas, blood, bullets, zGlow, flash, floatScope, glove,
    ZW, zhangYaw: Math.atan2(G[0] - ZW[0], G[2] - ZW[2]), muzzle: new THREE.Vector3(), targetPos, lastMuzzleT: -1, zFlight, zBack, dirB,
  };
}

/* ------------------------------------------------------------- the actors */

export const zhangCabin = new Track([
  { t: 210, p: [-0.9, 0.4, -1.1], yaw: 1.0 },
  { t: 216.0, p: [-0.9, 0.4, -1.1], yaw: 1.0 },
  { t: 219.6, p: [0.9, 0.35, 0.5], yaw: 1.57 },
  { t: 221.4, p: [0.95, 0.35, 0.5], yaw: 1.57 },
  { t: 223.0, p: [0.7, 0.35, 0.55], yaw: 0.3 },
  { t: 225.0, p: [0.2, 0.35, 0.6], yaw: 0 },
  { t: 226.2, p: [0.0, 0.3, 1.3], yaw: 0 },
  { t: 228.0, p: [0.0, 0.3, 2.9], yaw: 0 },
  { t: 232, p: [0.0, 0.3, 2.9], yaw: 0 },
]);

const flashbacks = [
  { t0: 279.0, t1: 281.0, label: "第12天" },
  { t0: 281.0, t1: 283.0, label: "第47天" },
  { t0: 283.0, t1: 285.0, label: "第89天" },
];
export const inFlashback = (t: number) => flashbacks.find((f) => t >= f.t0 && t < f.t1);
export const flashbackLabels = flashbacks;

export function animCabin(ctx: Ctx, t: number): void {
  const { zhangS } = ctx.cast;
  const P = ctx.cast.props;
  const fb = inFlashback(t);
  const night = !(t >= 216 && t < 229.5) || !!fb;
  ctx.cabin.update(t, night && !fb ? 0 : sm(t, 224.8, 225.8) - sm(t, 228.2, 229.0), !fb);
  const loc = ctx.cabin.locator;
  const inHand = t >= 216 && t < 220.3;
  const zs = zhangS.fig;
  zs.root.visible = true;
  if (fb) {
    // the training loop: a cell in the dark, red lamp, the same three movements
    const u = t - fb.t0;
    place(zs, [0.1, 0.55 + Math.sin(t * 0.7) * 0.05, 0.1], 1.5 + Math.sin(t * 0.4) * 0.1, 0.1, 0.05);
    zs.clothing.head.visible = true;
    dress(zs, ctx.extra.zhangSuit.clear);
    let pose = floatPose(t * 0.8);
    P.suitPistol.visible = false;
    P.suitMag.visible = false;
    P.suitScope.visible = false;
    P.suitScopeFree.visible = false;
    if (fb.label === "第12天") {
      // draw the pistol from the thigh pocket
      const draw = sm(u, 0.2, 0.55);
      pose = over(pose, { armR: [mix(0.2, -1.55, draw), 0, -0.12], armL: [-0.5, 0, 0.2] });
      P.suitPistol.visible = draw > 0.5;
    } else if (fb.label === "第47天") {
      // mount the scope with a magnetic click
      P.suitPistol.visible = true;
      const m = sm(u, 0.5, 0.85);
      P.suitScopeFree.visible = m < 0.7;
      P.suitScope.visible = m >= 0.7;
      pose = over(pose, { armR: [-1.3, 0, -0.1], armL: [mix(-0.5, -1.55, m), 0, 0.15] });
    } else {
      // change the magazine
      P.suitPistol.visible = true;
      P.suitScope.visible = true;
      P.suitMag.visible = u < 1.3;
      const k = sm(u, 0.7, 0.95);
      pose = over(pose, { armR: [-1.4, 0, -0.1], armL: [mix(-0.7, -1.4, k), 0, 0.1] });
    }
    applyPose(zs, pose);
    face(ctx.cast.zhangS, "grim", false);
    loc.visible = false;
    return;
  }
  loc.visible = true;
  // shift whole-body props off outside their scenes
  P.suitPistol.visible = false;
  P.suitMag.visible = false;
  P.suitScope.visible = false;
  P.suitScopeFree.visible = false;

  if (t >= 216 && t < 230) {
    const p = zhangCabin.pos(t);
    const yaw = zhangCabin.yaw(t);
    place(zs, [p[0], p[1] + Math.sin(t * 0.8) * 0.03, p[2]], yaw, 0.12 * (t < 219.4 ? 1 : 0.4), 0);
    zs.clothing.head.visible = t >= 223.8;
    dress(zs, ctx.extra.zhangSuit.clear);
    let pose = floatPose(t * 0.9);
    // holding the locator, reaching to the shelf, looking at the portrait
    const reach = sm(t, 219.4, 220.0) - sm(t, 220.5, 221.0);
    const hold = t < 220.4;
    pose = over(pose, { armR: [hold ? -1.0 - reach * 0.55 : -0.3, 0, -0.1], legR: [-0.25, 0, 0.05], legL: [-0.15, 0, -0.05] });
    if (t >= 221.2 && t < 222.8) pose = nudge(pose, { neck: [0, -0.5 * sm(t, 221.2, 221.8) + 0.5 * sm(t, 222.2, 222.8), 0] });
    const helm = sm(t, 223.0, 223.8) - sm(t, 223.9, 224.2);
    if (helm > 0) pose = over(pose, { armR: [-2.5 * helm, 0, -0.4 * helm], armL: [-2.5 * helm, 0, 0.4 * helm] });
    applyPose(zs, pose);
    face(ctx.cast.zhangS, "grim", false);
    if (hold) {
      zs.anchors.handR.getWorldPosition(loc.position);
      loc.position.y -= 0.03;
    } else loc.position.set(...CABIN.shelfPos);
    zs.root.visible = t < 228.9;
  } else {
    zs.root.visible = false;
    loc.position.set(...CABIN.shelfPos);
  }
}

const sunYaw = (t: number): number => {
  const d = sunState(t).dir;
  return Math.atan2(d.x, d.z);
};

export function animSpace(ctx: Ctx, t: number, rt: SpaceRuntime): void {
  const { zhangS, crowd, photographer } = ctx.cast;
  const P = ctx.cast.props;
  const sp = ctx.space;
  sp.update(t);
  const zs = zhangS.fig;
  zs.root.visible = false;
  P.suitPistol.visible = false;
  P.suitMag.visible = false;
  P.suitScope.visible = false;
  P.suitScopeFree.visible = false;
  rt.floatScope.visible = false;
  rt.glove.visible = false;

  const fwd = new THREE.Vector3(Math.sin(rt.zhangYaw), 0, Math.cos(rt.zhangYaw));
  const pistolTime = t >= K.draw && t < 325;

  /* ---- Zhang ---- */
  if (t < 19.5) {
    zs.root.visible = true;
    zs.clothing.head.visible = true;
    dress(zs, ctx.extra.zhangSuit.clear);
    const y = sunYaw(t) + Math.sin(t * 0.07) * 0.1;
    place(zs, [0, 0.0 + Math.sin(t * 0.5) * 0.05, 0], y, 0, 0.04 * Math.sin(t * 0.21));
    applyPose(zs, floatPose(t * 0.9));
    face(zhangS, "grim", false);
  } else if (t >= 230 && t < 350) {
    zs.root.visible = true;
    zs.clothing.head.visible = true;
    const bare = t >= K.gloveOff;
    dress(zs, bare ? ctx.extra.zhangSuitBare : ctx.extra.zhangSuit.clear);
    if (t < 241) {
      // the flight in from Base One, head-first, then a flip to stand
      const p = rt.zFlight.pos(t);
      const p2 = rt.zFlight.pos(t + 0.2);
      const d = new THREE.Vector3(p2[0] - p[0], p2[1] - p[1], p2[2] - p[2]);
      zs.root.position.set(...p);
      flightOrient(zs.root, d.lengthSq() < 1e-6 ? new THREE.Vector3(-1, 0, -0.5) : d);
      const flip = sm(t, 238.6, 240.8);
      if (flip > 0) {
        qa.copy(zs.root.quaternion);
        qb.setFromEuler(new THREE.Euler(0.0, rt.zhangYaw, 0, "YXZ"));
        zs.root.quaternion.slerpQuaternions(qa, qb, flip);
      }
      const thrusting = t < 234.6 ? seg(t, 230.4, 231.6) : 0.4;
      applyPose(zs, {
        hips: [0.0, 0, 0],
        neck: [-0.15, 0, 0],
        armR: [0.12 * thrusting, 0, 0.05],
        armL: [0.12 * thrusting, 0, -0.05],
        legR: [0.05, 0, 0.03],
        legL: [0.05, 0, -0.03],
      });
      face(zhangS, "grim", false);
    } else if (t < 331.8) {
      // holding still at the chosen spot, every motion a small correction
      let yaw = rt.zhangYaw;
      const toSun = sm(t, 274.0, 276.4) - sm(t, 288.4, 290.6);
      yaw += toSun * 0.62;
      if (t >= 247.6 && t < 250.6) yaw += 0.1 * Math.sin((t - 247.6) * 1.0);
      let recoilBack = 0;
      for (const s of SHOTS) if (t >= s) recoilBack += 0.028;
      const drift = t >= 297.4 ? Math.min(1, (t - 297.4) * 0.3) : 0;
      const shiver = t >= 297.4 && t < 304 ? 0 : 0;
      place(zs, [-fwd.x * recoilBack - fwd.x * drift * 0.2, Math.sin(t * 0.4) * 0.03 + shiver, -fwd.z * recoilBack - fwd.z * drift * 0.2], yaw, 0, 0);
      let pose: any = idle(t * 0.8);
      pose = nudge(pose, { hips: [-0.08, 0, 0], neck: [0.28, 0, 0], legR: [-0.28, 0, 0.05], legL: [-0.12, 0, -0.05] });
      // scope raised like a monocular
      const raised = sm(t, 246.6, 247.6) - sm(t, 273.6, 274.4);
      if (raised > 0) {
        pose = over(pose, { armR: [-2.0 * raised, -0.25 * raised, -0.05], neck: [0.25, 0, 0] });
        P.suitScopeFree.visible = true;
      }
      // the scope floats in front of him while the other hand works
      if (t >= K.scopeFloat0 && t < K.scopeGrab) {
        rt.floatScope.visible = true;
        const u = t - K.scopeFloat0;
        rt.floatScope.position.set(fwd.x * 0.55 + Math.sin(yaw) * 0.0 + Math.sin(u * 0.9) * 0.03, 1.55 + Math.sin(u * 0.7) * 0.05 + u * 0.004, fwd.z * 0.55 + Math.cos(u * 0.8) * 0.03);
        rt.floatScope.rotation.set(0.3 + u * 0.15, yaw + 1.2 + u * 0.4, 0.2);
      }
      // left hand unscrews the ring, the glove drifts off
      if (t >= 274.4 && t < 276.4) {
        const w = sm(t, 274.4, 274.9) - sm(t, 275.7, 276.3);
        pose = over(pose, { armL: [-1.25 * w, 0, 0.3 * w], armR: [-1.15 * w, 0, -0.1], neck: [0.4, 0, 0] });
      }
      if (t >= K.gloveOff) {
        rt.glove.visible = true;
        const u = t - K.gloveOff;
        const a = new THREE.Vector3();
        zs.anchors.handR.getWorldPosition(a);
        const hold = Math.min(u, 0.2);
        rt.glove.position.set(a.x + hold * 0 + u * (Math.cos(yaw) * 0.22), a.y + u * 0.14, a.z - u * (Math.sin(yaw) * 0.22) + u * 0.06);
        rt.glove.rotation.set(u * 1.3, u * 0.7, u * 0.4);
        if (u > 6) rt.glove.visible = false;
      }
      // pistol out of the pocket, the free scope grabbed, the magazine seated
      if (t >= K.draw && t < K.aimUp) {
        const out = sm(t, K.draw, K.draw + 0.5);
        P.suitPistol.visible = true;
        pose = over(pose, { armR: [mix(-0.25, -1.05, out), 0, -0.12], neck: [0.3, 0, 0], hips: [0.04, 0, 0] });
        if (t < 279.0 || t >= 285.0) {
          P.suitMag.visible = t < 285.0 || t >= 287.4;
        }
        if (t >= K.scopeGrab) {
          const g = sm(t, K.scopeGrab - 0.5, K.scopeGrab) - sm(t, K.scopeMount, K.scopeMount + 0.3);
          pose = over(pose, { armL: [-1.1 * g - 0.3 * (1 - g), 0, 0.12], armR: [-1.15, 0, -0.1] });
          if (t < K.scopeMount) {
            P.suitScopeFree.visible = t >= K.scopeGrab;
            rt.floatScope.visible = t < K.scopeGrab;
          } else {
            P.suitScope.visible = true;
          }
        }
        if (t >= K.scopeMount + 0.4 && t < K.aimUp) {
          const mg = sm(t, K.scopeMount + 0.5, K.magIn - 0.2) - sm(t, K.magIn, K.magIn + 0.35);
          P.suitMag.visible = t < K.magIn;
          pose = over(pose, { armL: [-1.0 - 0.3 * mg, 0, 0.14], armR: [-1.15, 0, -0.1] });
        }
      }
      // aiming and firing
      if (t >= K.aimUp && t < 325) {
        P.suitPistol.visible = true;
        P.suitScope.visible = true;
        const up = sm(t, K.aimUp, K.aimUp + 1.6);
        const down = sm(t, 304.6, 306.4);
        const a = aim(0.03, 0);
        let kick = 0;
        for (const s of SHOTS) if (t >= s && t - s < 0.35) kick += Math.exp(-(t - s) / 0.05);
        const swap1 = sm(t, 298.9, 299.2) - sm(t, 299.6, 299.9);
        const swap2 = sm(t, 301.5, 301.8) - sm(t, 302.2, 302.4);
        const swap = Math.max(swap1, swap2);
        const armUp = up * (1 - down * 0.65);
        pose = {
          ...pose,
          hips: [-0.02 - kick * 0.02, 0, 0],
          neck: [0.03 + kick * 0.04, 0, 0],
          armR: [mix(pose.armR?.[0] ?? -1.15, a.armR![0] + kick * 0.09, armUp), a.armR![1] * armUp, mix(-0.1, a.armR![2], armUp)],
          armL: [mix(pose.armL?.[0] ?? -1.0, a.armL![0] + kick * 0.09 + swap * 0.9, armUp), 0, mix(0.1, a.armL![2], armUp)],
        };
        P.suitMag.visible = swap > 0.1;
      }
      if (t >= 325) {
        pose = nudge(pose, { armR: [0.1, 0, 0], armL: [0.1, 0, 0] });
      }
      // holstered again
      applyPose(zs, pose);
      face(zhangS, t >= 309 && t < 313 ? "grim" : "grim", false);
    } else {
      // the way back, head-first
      const p = rt.zBack.pos(t);
      const p2 = rt.zBack.pos(t + 0.2);
      const settle = sm(t, 331.8, 335.0);
      zs.root.position.set(...p);
      const d = new THREE.Vector3(p2[0] - p[0], p2[1] - p[1], p2[2] - p[2]);
      qa.setFromEuler(new THREE.Euler(0, rt.zhangYaw + 0.62, 0, "YXZ"));
      flightOrient(zs.root, d.lengthSq() < 1e-7 ? rt.dirB : d);
      qb.copy(zs.root.quaternion);
      zs.root.quaternion.slerpQuaternions(qa, qb, settle);
      applyPose(zs, { neck: [-0.1, 0, 0], armR: [0.14, 0, 0.05], armL: [0.14, 0, -0.05], legR: [0.05, 0, 0.02], legL: [0.05, 0, -0.02] });
    }
    // exposed aiming eye: when the sun is gone he is lit only by Earth and the station
  }
  // the scope in the raised hand, flat when not aiming
  P.suitScopeFree.position.set(0, 0.4, 1.6);

  /* ---- crowd ---- */
  const upR = new THREE.Vector3();
  crowd.forEach((a, j) => {
    const path = rt.crowdPath[j]!;
    const fig = a.fig;
    const present = t >= path.start() && t < path.end();
    fig.root.visible = present && t >= 241;
    if (!fig.root.visible) return;
    // overview commuters are handled in the overview code
    const p = path.pos(t);
    const p2 = path.pos(t + 0.12);
    const seg0 = path.segAt(t);
    const moving = new THREE.Vector3(p2[0] - p[0], p2[1] - p[1], p2[2] - p[2]);
    const speed = moving.length() / 0.12;
    fig.root.position.set(...p);
    const v = isVictim(j);
    const stillPose = lerpPose(idle(t * 0.7 + j), { armR: [0.08, 0, 0.16], armL: [0.08, 0, -0.16], legR: [-0.12, 0, 0.04], legL: [-0.06, 0, -0.04] }, 0.7);
    let pose: any = stillPose;
    const upright = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rt.gyaw, 0, "YXZ"));
    if (speed > 0.9) {
      flightOrient(fig.root, moving);
      // ease into an upright stance as they arrive
      const end = path.segs[0]!.t1;
      const settle = t < end ? sm(t, end - 1.0, end) : 0;
      if (settle > 0 && seg0 === 0) {
        qa.copy(fig.root.quaternion);
        fig.root.quaternion.slerpQuaternions(qa, upright, settle);
      }
      pose = { hips: [0, 0, 0], neck: [-0.15, 0, 0], armR: [0.14, 0, 0.05], armL: [0.14, 0, -0.05], legR: [0.05, 0, 0.03], legL: [0.05, 0, -0.03] };
    } else {
      fig.root.quaternion.copy(upright);
    }
    const hitOn = v ? t - v.t : -1;
    const alarm = t > 307.4 && !v;
    if (alarm && speed <= 0.9) {
      const w = Math.sin(t * 9 + j) * 0.3;
      pose = { hips: [0, 0, 0], neck: [0.1, 0, 0], armR: [-2.5 + w, 0, -0.5], armL: [-2.5 - w, 0, 0.5], legR: [-0.3, 0, 0.1], legL: [-0.2, 0, -0.1] };
    }
    if (v && hitOn >= 0) {
      const limp = sm(t, v.t, v.t + 0.5);
      const tumble = Math.min(1.4, hitOn * 0.45);
      pose = { hips: [-0.3 * limp, 0, 0], neck: [0.5 * limp, 0.3 * limp, 0], armR: [-0.7 * limp + 0.3, 0, -0.7 * limp], armL: [-0.9 * limp + 0.3, 0, 0.6 * limp], legR: [0.2 * limp, 0, 0.1], legL: [-0.25 * limp, 0, -0.1] };
      if (speed <= 0.9) {
        fig.root.rotateZ(Math.sin(hitOn * 1.7) * 0.4 * tumble);
        fig.root.rotateX(-0.6 * tumble);
      }
    }
    // hands holding onto the wounded
    const hv = helperOf(j);
    if (hv && t > hv.t + 2.0) {
      pose = { ...pose, armR: [-1.0, 0, -0.5], armL: [-1.0, 0, 0.5] };
    }
    applyPose(fig, pose);
    // visors: gilt in the low sun, then clear for the photograph, cracked when struck
    const suit = ctx.cast.crowdSuits[j]!;
    let tex = suit.gold;
    if (t >= K.visor0 + rt.order.indexOf(j) * 0.45) tex = suit.clear;
    if (v && v.head && t >= v.t + 0.05) tex = suit.cracked;
    if (a.fig.clothing.head.material && (a.fig.clothing.head.material as THREE.MeshStandardMaterial).map !== tex) a.fig.setClothes(tex);
    const shocked = (t > 307.4 && t < 322) || (v && t >= v.t);
    face(a, shocked ? "shock" : "neutral", false);
    void upR;
  });

  // photographer
  {
    const path = rt.phoPath;
    const fig = photographer.fig;
    const present = t >= path.start() && t < path.end() && t >= 241;
    fig.root.visible = present;
    if (present) {
      const p = path.pos(t);
      const p2 = path.pos(t + 0.12);
      const moving = new THREE.Vector3(p2[0] - p[0], p2[1] - p[1], p2[2] - p[2]);
      const speed = moving.length() / 0.12;
      fig.root.position.set(...p);
      let pose: any;
      if (speed > 0.9) {
        flightOrient(fig.root, moving);
        pose = { neck: [-0.15, 0, 0], armR: [0.14, 0, 0.05], armL: [0.14, 0, -0.05] };
        const end = path.segs[0]!.t1;
        if (t < end) {
          qa.copy(fig.root.quaternion);
          qb.setFromEuler(new THREE.Euler(0, rt.gyaw + PI, 0, "YXZ"));
          fig.root.quaternion.slerpQuaternions(qa, qb, sm(t, end - 1.0, end));
        }
      } else {
        fig.root.quaternion.setFromEuler(new THREE.Euler(0, rt.gyaw + PI, 0, "YXZ"));
        const wave = t > 259 ? Math.sin(t * 5) * 0.25 : 0;
        pose = { hips: [0, 0, 0], neck: [0, Math.sin(t * 0.8) * 0.1, 0], armR: [-1.5, 0, -0.05], armL: [-2.4 + wave, 0, 0.3], legR: [-0.1, 0, 0.03], legL: [-0.05, 0, -0.03] };
        if (t > 307.4) pose = { hips: [0.2, 0, 0], neck: [0.1, 0, 0], armR: [-2.4, 0, -0.5], armL: [-2.4, 0, 0.5], legR: [-0.2, 0, 0.1], legL: [-0.1, 0, -0.1] };
      }
      P.camera.visible = t < 307.4 && speed <= 0.9;
      applyPose(fig, pose);
      face(photographer, t > 307.4 ? "shock" : "neutral", false);
      const setTex = t >= 265.5 ? ctx.cast.suits.blue.clear : ctx.cast.suits.blue.gold;
      if ((fig.clothing.head.material as THREE.MeshStandardMaterial).map !== setTex) fig.setClothes(setTex);
    }
  }

  // hatch: lamp, leaf
  const open = sm(t, K.hatchOpen0, K.hatchOpen1) - sm(t, K.hatchClose0, K.hatchClose1);
  sp.door.leaf.position.z = open * 6.6;
  sp.door.glowInside.visible = open > 0.05;
  const green = t >= K.hatchGreen && t < K.hatchClose0;
  sp.door.lampMat.color.setHex(green ? 0x33ff66 : 0xff2a20);

  // bullets in flight
  const m = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  if (t >= K.aimUp) updateMuzzle(ctx, rt, t);
  const mp = rt.muzzle;
  SHOTS.forEach((ts, i) => {
    const age = t - ts;
    if (age < 0 || age > K.bulletFlight) {
      rt.bullets.setMatrixAt(i, zero);
      return;
    }
    const burst = Math.floor(i / 10);
    const tg = rt.targetPos[burst]!;
    const tp = new THREE.Vector3(tg[0], tg[1] + 1.3, tg[2]);
    const u = age / K.bulletFlight;
    m.makeTranslation(mp.x + (tp.x - mp.x) * u, mp.y + (tp.y - mp.y) * u, mp.z + (tp.z - mp.z) * u);
    rt.bullets.setMatrixAt(i, m);
  });
  rt.bullets.instanceMatrix.needsUpdate = true;

  // muzzle flash
  let fl = 0;
  for (const s of SHOTS) if (t >= s && t < s + 0.075) fl = 1 - (t - s) / 0.075;
  rt.flash.visible = fl > 0;
  rt.flash.position.copy(mp);
  rt.flash.scale.setScalar(0.9 + fl * 1.2);
  (rt.flash.material as THREE.SpriteMaterial).opacity = fl;

  // the thruster glow that stays visible long after the body is too small to see
  rt.zGlow.visible = t >= 331.8 && t < 350;
  if (rt.zGlow.visible) {
    const zp = rt.zBack.pos(t);
    rt.zGlow.position.set(zp[0] - rt.dirB.x * 1.2, zp[1] - rt.dirB.y * 1.2, zp[2] - rt.dirB.z * 1.2);
    const k = Math.min(1, (t - 331.8) / 3);
    (rt.zGlow.material as THREE.SpriteMaterial).opacity = 0.9 * k * (0.85 + 0.15 * Math.sin(t * 9));
  }
  rt.puffs.update(t);
  rt.gas.update(t);
  rt.blood.update(t);
}

export function updateMuzzle(ctx: Ctx, rt: SpaceRuntime, t: number): void {
  const zs = ctx.cast.zhangS.fig;
  const P = ctx.cast.props;
  if (!P.suitPistol.visible) {
    // fall back to a position ahead of the gun hand
    const f = new THREE.Vector3(Math.sin(rt.zhangYaw), 0, Math.cos(rt.zhangYaw));
    rt.muzzle.set(f.x * 0.9, 1.45, f.z * 0.9);
    return;
  }
  zs.root.updateMatrixWorld(true);
  P.suitPistol.updateWorldMatrix(true, false);
  rt.muzzle.copy(P.suitPistol.localToWorld(new THREE.Vector3(0, 1.26, 3.6)));
  void t;
}

/* ------------------------------------------------------------------ shots */

export function act3Shots(ctx: Ctx, rt: SpaceRuntime): ShotDef[] {
  const S: ShotDef[] = [];
  const mk = (id: string, start: number, end: number, loc: ShotDef["loc"], run: ShotDef["run"], extra: Partial<ShotDef> = {}) => S.push({ id, start, end, loc, run, ...extra });
  const sun = (t: number) => sunState(t).dir;
  const head = (): V3 => {
    const v = new THREE.Vector3();
    ctx.cast.zhangS.fig.parts.head.getWorldPosition(v);
    return arr(v);
  };
  const eye = (): V3 => {
    const h = head();
    const f = new THREE.Vector3(Math.sin(rt.zhangYaw), 0, Math.cos(rt.zhangYaw));
    return [h[0] + f.x * 0.16, h[1] - 0.02, h[2] + f.z * 0.16];
  };
  const G = rt.G;
  const gc = (dy = 1.2): V3 => [G[0], G[1] + dy, G[2]];
  const tgt = (i: number): V3 => [rt.slots[i]![0], rt.slots[i]![1] + 1.55, rt.slots[i]![2]];
  const D = rt.D;

  // ---- prologue: a single long orbit around a small figure in the void
  /** A point on a circle around Zhang, phi measured from the way he faces toward his right-hand side. */
  const orbit = (t: number, phi: number, r: number, y: number): V3 => {
    const yaw = sunYaw(t) + Math.sin(t * 0.07) * 0.1;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);
    return [fx * Math.cos(phi) * r + rx * Math.sin(phi) * r, y, fz * Math.cos(phi) * r + rz * Math.sin(phi) * r];
  };
  const dg = Math.PI / 180;
  mk("prologue-a", 0.0, 11.0, "space", (ctx, t, lt, p) => {
    const sd = sun(t);
    const k = smooth(p);
    const pos = orbit(t, mix(168, 122, k) * dg, mix(8.5, 5.6, k), mix(0.75, 0.95, k));
    const far: V3 = [sd.x * 42, sd.y * 42 + 1.0, sd.z * 42];
    const head: V3 = [0, 1.15, 0];
    const w = 0.55 * (1 - k);
    setCamera(ctx, pos, [mix(head[0], far[0], w), mix(head[1], far[1], w), mix(head[2], far[2], w)], mix(42, 34, k), 0, 0.004, t);
  });
  mk("prologue-b", 11.0, 19.0, "space", (ctx, t, lt, p) => {
    const k = smooth(p);
    const pos = orbit(t, mix(122, 32, k) * dg, mix(5.6, 2.7, k), mix(0.95, 1.5, k));
    setCamera(ctx, pos, [0, mix(1.15, 1.42, k), 0], mix(34, 24, k), 0, 0.003, t);
  });

  // ---- overview of the space works
  const S0 = arr(ctx.space.station.position);
  mk("ov-station", 198.0, 203.4, "space", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [46, 10, -34], l: [S0[0] - 4, S0[1] + 8, S0[2]], fov: 58 }, { p: [22, -6, -76], l: [S0[0] + 2, S0[1] + 2, S0[2]], fov: 46 }, p, t, linear, 0.004);
  });
  mk("ov-yard", 203.4, 207.0, "space", (ctx, t, lt, p) => {
    const y = arr(ctx.space.shipyard);
    camBetween(ctx, { p: [y[0] + 70, y[1] + 30, y[2] + 90], l: [y[0] + 25, y[1] + 8, y[2] + 5], fov: 50 }, { p: [y[0] + 20, y[1] + 12, y[2] + 60], l: [y[0] + 35, y[1] + 8, y[2] + 5], fov: 44 }, p, t, linear, 0.004);
  });
  mk("ov-base", 207.0, 211.0, "space", (ctx, t, lt, p) => {
    const b = arr(ctx.space.base1);
    // a long lens: the planet's limb below, one small wheel with a green light above it, eighty kilometres of dark between
    camBetween(ctx, { p: [0, 0, 0], l: [b[0], b[1] - 38, b[2]], fov: 13 }, { p: [0, 0, 0], l: [b[0], b[1] - 30, b[2]], fov: 9 }, p, t, linear, 0.0009);
  });
  mk("ov-hull", 211.0, 216.0, "space", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [D[0] + 24, D[1] + 14, D[2] + 26], l: [S0[0] - 10, S0[1] + 1, S0[2]], fov: 52 }, { p: [D[0] + 12, D[1] + 6, D[2] + 14], l: [D[0] - 2, D[1] + 2, D[2] - 3], fov: 44 }, p, t, linear, 0.004);
  });

  // ---- the cabin
  mk("cabin-wide", 216.0, 219.6, "cabin", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [-1.5, 1.5, 1.9], l: [0.2, 1.0, -0.6], fov: 60 }, { p: [-1.4, 1.5, 1.6], l: [0.5, 1.0, -0.3], fov: 56 }, p, t, linear, 0.004);
  });
  mk("cabin-shelf", 219.6, 222.4, "cabin", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.2, 1.4, 1.4], l: [1.55, 1.15, 0.5], fov: 34 }, { p: [0.5, 1.4, 1.1], l: [1.6, 1.3, 0.6], fov: 26 }, p, t, linear, 0.003);
  });
  mk("cabin-helmet", 222.4, 225.4, "cabin", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [-0.55, 1.15, 1.9], l: [0.7, 0.95, 0.55], fov: 40 }, { p: [-0.25, 1.15, 1.6], l: [0.5, 0.95, 0.6], fov: 34 }, p, t, linear, 0.003);
  });
  mk("cabin-hatch", 225.4, 228.4, "cabin", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.3, 1.1, -1.6], l: [0.0, 1.0, 1.6], fov: 52 }, { p: [0.15, 1.0, -1.4], l: [0.0, 0.9, 2.2], fov: 46 }, p, t, linear, 0.003);
  });
  mk("cabin-led", 228.4, 230.0, "cabin", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.6, 1.3, 0.6], l: [1.58, 1.16, 0.5], fov: 24 }, { p: [0.9, 1.25, 0.55], l: [1.58, 1.16, 0.5], fov: 16 }, p, t, linear, 0.001);
  });

  // ---- flight out, and the wait
  const b1 = arr(ctx.space.base1);
  mk("dep-exit", 230.0, 234.6, "space", (ctx, t, lt, p) => {
    const z = rt.zFlight.pos(Math.max(t, 230.4));
    const toZ = new THREE.Vector3(-b1[0], -b1[1], -b1[2]).normalize();
    const perp = new THREE.Vector3().crossVectors(toZ, new THREE.Vector3(0, 1, 0)).normalize();
    setCamera(
      ctx,
      [z[0] + perp.x * 5.5 - toZ.x * 3, z[1] + perp.y * 5.5 + 1.5 - toZ.y * 3, z[2] + perp.z * 5.5 - toZ.z * 3],
      [z[0] + toZ.x * 2, z[1] + toZ.y * 2, z[2] + toZ.z * 2],
      mix(38, 32, p),
      0,
      0.002,
      t,
    );
  });
  mk("dep-arrive", 234.6, 238.4, "space", (ctx, t, lt, p) => {
    const z = rt.zFlight.pos(t);
    setCamera(ctx, [9, 1.8, 7], [z[0], z[1], z[2]], 36, 0, 0.002, t);
  });
  mk("dep-brake", 238.4, 241.0, "space", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [7.5, 1.8, 6.5], l: [0, 1.0, 0], fov: 36 }, { p: [5.8, 1.9, 5.0], l: [0, 1.3, 0], fov: 30 }, p, t, linear, 0.003);
  });
  mk("dep-wait", 241.0, 246.0, "space", (ctx, t, lt, p) => {
    const sd = sun(t);
    camBetween(ctx, { p: [4.2, 2.6, 6.5], l: [-0.6, 0.0, -30], fov: 46 }, { p: [3.4, 2.0, 5.4], l: [-1.0, -3.0, -40], fov: 40 }, p, t, linear, 0.003);
    void sd;
  });

  // ---- sunset & the airlock
  mk("sun-profile", 246.0, 249.4, "space", (ctx, t, lt, p) => {
    const sd = sun(t);
    const c: V3 = [-sd.x * 5.0 + 0.9, 0.9, -sd.z * 5.0];
    camBetween(ctx, { p: c, l: [sd.x * 40, sd.y * 40 + 2.5, sd.z * 40], fov: 34 }, { p: [c[0] - 0.2, c[1] + 0.3, c[2]], l: [sd.x * 40, sd.y * 40 + 1.5, sd.z * 40], fov: 28 }, p, t, linear, 0.003);
  });
  mk("scope-hatch", 249.4, 253.6, "space", (ctx, t, lt, p) => {
    const e = eye();
    camBetween(ctx, { p: e, l: [D[0], D[1] + 1, D[2]], fov: 9 }, { p: e, l: [D[0], D[1] + 1, D[2]], fov: 5.5 }, p, t, linear, 0.0009);
  }, { scope: true });
  mk("emerge-wide", 253.6, 259.0, "space", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [1.6, 1.5, 1.8], l: [G[0] * 0.45 + D[0] * 0.55, G[1] * 0.5 + D[1] * 0.5, G[2] * 0.45 + D[2] * 0.55], fov: 17 }, { p: [1.2, 1.4, 1.4], l: [G[0] * 0.7 + D[0] * 0.3, G[1] * 0.7 + D[1] * 0.3 + 2, G[2] * 0.7 + D[2] * 0.3], fov: 12 }, p, t, linear, 0.003);
  });
  mk("scope-group", 259.0, 262.4, "space", (ctx, t, lt, p) => {
    const e = eye();
    camBetween(ctx, { p: e, l: gc(1.5), fov: 6.2 }, { p: e, l: gc(1.2), fov: 5.4 }, p, t, linear, 0.0008);
  }, { scope: true });
  mk("visors", 262.4, 268.2, "space", (ctx, t, lt, p) => {
    const e = eye();
    camBetween(ctx, { p: e, l: gc(1.2), fov: 9 }, { p: e, l: gc(1.3), fov: 7.2 }, p, t, linear, 0.001);
  });
  mk("scope-faces", 268.2, 271.4, "space", (ctx, t, lt, p) => {
    const e = eye();
    const a = tgt(1);
    const b = tgt(3);
    camBetween(ctx, { p: e, l: [a[0], a[1] - 0.1, a[2]], fov: 2.7 }, { p: e, l: [b[0], b[1] - 0.1, b[2]], fov: 2.2 }, p, t, linear, 0.0004);
  }, { scope: true });
  const yawAt = (t: number) => rt.zhangYaw + 0.62 * (sm(t, 274, 276.4) - sm(t, 288.4, 290.6));
  const basisAt = (t: number) => {
    const y = yawAt(t);
    return { f: new THREE.Vector3(Math.sin(y), 0, Math.cos(y)), r: new THREE.Vector3(Math.cos(y), 0, -Math.sin(y)) };
  };
  /** A point relative to Zhang's body frame: fwd is where he faces, right is *his* right (negative local x). */
  const rel = (t: number, fwd: number, right: number, up: number, from: V3 = head()): V3 => {
    const { f, r } = basisAt(t);
    return [from[0] + f.x * fwd - r.x * right, from[1] + up, from[2] + f.z * fwd - r.z * right];
  };
  const wp = (o: THREE.Object3D): V3 => {
    const v = new THREE.Vector3();
    o.getWorldPosition(v);
    return arr(v);
  };
  const zfig = ctx.cast.zhangS.fig;
  mk("zhang-eyes", 271.4, 274.0, "space", (ctx, t, lt, p) => {
    camBetween(ctx, { p: rel(t, 1.5, 0.35, 0.02), l: head(), fov: 28 }, { p: rel(t, 1.2, 0.3, 0.02), l: head(), fov: 23 }, p, t, linear, 0.002);
  });

  // ---- preparing the weapon
  mk("glove", 274.0, 276.6, "space", (ctx, t, lt, p) => {
    const hand = wp(zfig.anchors.handR);
    camBetween(ctx, { p: rel(t, 0.95, 0.6, 0.2, hand), l: hand, fov: 32 }, { p: rel(t, 0.8, 0.5, 0.15, hand), l: hand, fov: 25 }, p, t, linear, 0.002);
  });
  mk("draw", 276.6, 279.0, "space", (ctx, t, lt, p) => {
    const hand = wp(zfig.anchors.handR);
    camBetween(ctx, { p: rel(t, 1.05, 0.5, 0.25, hand), l: hand, fov: 32 }, { p: rel(t, 0.9, 0.42, 0.2, hand), l: hand, fov: 26 }, p, t, linear, 0.002);
  });
  for (let i = 0; i < 3; i++) {
    const f = flashbacks[i]!;
    mk(`drill-${i + 1}`, f.t0, f.t1, "cabin", (ctx, t, lt, p) => {
      // the same three movements, the same cell, three different days — a locked-off frame, slightly nearer each time
      camBetween(ctx, { p: [0.25, 0.95, 1.95 - i * 0.05], l: [0.1, 0.7, 0.1], fov: 46 - i * 4 }, { p: [0.2, 0.95, 1.8 - i * 0.05], l: [0.1, 0.7, 0.1], fov: 38 - i * 4 }, p, t, linear, 0.004);
    });
  }
  mk("mount", 285.0, 287.4, "space", (ctx, t, lt, p) => {
    const a = wp(zfig.anchors.handR);
    const b = wp(zfig.anchors.handL);
    const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    camBetween(ctx, { p: rel(t, 1.05, -0.3, 0.2, mid), l: mid, fov: 27 }, { p: rel(t, 0.9, -0.25, 0.15, mid), l: mid, fov: 21 }, p, t, linear, 0.003);
  });
  mk("magazine", 287.4, 288.6, "space", (ctx, t, lt, p) => {
    const hand = wp(zfig.anchors.handL);
    camBetween(ctx, { p: rel(t, 1.0, -0.4, 0.2, hand), l: hand, fov: 26 }, { p: rel(t, 0.9, -0.35, 0.15, hand), l: hand, fov: 22 }, p, t, linear, 0.003);
  });

  // ---- taking aim
  mk("aim-side", 288.6, 290.8, "space", (ctx, t, lt, p) => {
    camBetween(ctx, { p: rel(t, 1.6, 2.2, 0.05), l: rel(t, 0.6, 0, -0.12), fov: 32 }, { p: rel(t, 1.5, 1.8, 0.05), l: rel(t, 0.7, 0, -0.12), fov: 27 }, p, t, linear, 0.002);
  });
  mk("scope-aim-1", 290.8, 295.2, "space", (ctx, t, lt, p) => {
    const e = eye();
    const a = tgt(1);
    camBetween(ctx, { p: e, l: [a[0], a[1] - 0.05, a[2]], fov: 1.9 }, { p: e, l: [a[0], a[1] - 0.03, a[2]], fov: 1.5 }, p, t, linear, 0.0003);
  }, { scope: true });
  mk("aim-eye", 295.2, 297.4, "space", (ctx, t, lt, p) => {
    camBetween(ctx, { p: rel(t, 1.05, 0.6, 0.03), l: head(), fov: 24 }, { p: rel(t, 0.95, 0.5, 0.03), l: head(), fov: 18 }, p, t, linear, 0.001);
  });

  // ---- the volley, in silence
  const gunShot = (id: string, a: number, b: number, side: number, lift: number) =>
    mk(id, a, b, "space", (ctx, t, lt, p) => {
      const mz = rt.muzzle;
      const f = new THREE.Vector3(Math.sin(rt.zhangYaw), 0, Math.cos(rt.zhangYaw));
      const r = new THREE.Vector3(Math.cos(rt.zhangYaw), 0, -Math.sin(rt.zhangYaw));
      camBetween(ctx, { p: [mz.x + r.x * side - f.x * 0.9, mz.y + lift, mz.z + r.z * side - f.z * 0.9], l: [mz.x - f.x * 0.1, mz.y - 0.02, mz.z - f.z * 0.1], fov: 30 }, { p: [mz.x + r.x * side * 0.85 - f.x * 0.75, mz.y + lift, mz.z + r.z * side * 0.85 - f.z * 0.75], l: [mz.x, mz.y - 0.02, mz.z], fov: 26 }, p, t, linear, 0.004);
    });
  gunShot("fire-1", 297.4, 298.9, 0.7, 0.05);
  mk("fire-mag-1", 298.9, 299.9, "space", (ctx, t, lt, p) => {
    const h = head();
    const f = new THREE.Vector3(Math.sin(rt.zhangYaw), 0, Math.cos(rt.zhangYaw));
    const r = new THREE.Vector3(Math.cos(rt.zhangYaw), 0, -Math.sin(rt.zhangYaw));
    camBetween(ctx, { p: [h[0] + f.x * 0.8 - r.x * 0.5, h[1] - 0.35, h[2] + f.z * 0.8 - r.z * 0.5], l: [h[0] + f.x * 0.4, h[1] - 0.4, h[2] + f.z * 0.4], fov: 24 }, { p: [h[0] + f.x * 0.7 - r.x * 0.45, h[1] - 0.35, h[2] + f.z * 0.7 - r.z * 0.45], l: [h[0] + f.x * 0.4, h[1] - 0.4, h[2] + f.z * 0.4], fov: 22 }, p, t, linear, 0.004);
  });
  mk("fire-scope-2", 299.9, 301.5, "space", (ctx, t, lt, p) => {
    const e = eye();
    const a = tgt(2);
    camBetween(ctx, { p: e, l: [a[0], a[1] - 0.04, a[2]], fov: 2.5 }, { p: e, l: [a[0], a[1] - 0.04, a[2]], fov: 2.3 }, p, t, linear, 0.004);
  }, { scope: true });
  gunShot("fire-mag-2", 301.5, 302.4, -0.8, 0.12);
  mk("fire-wide-3", 302.4, 304.0, "space", (ctx, t, lt, p) => {
    const h = head();
    const f = new THREE.Vector3(Math.sin(rt.zhangYaw), 0, Math.cos(rt.zhangYaw));
    const r = new THREE.Vector3(Math.cos(rt.zhangYaw), 0, -Math.sin(rt.zhangYaw));
    camBetween(ctx, { p: [h[0] - f.x * 2.4 - r.x * 1.2, h[1] + 0.35, h[2] - f.z * 2.4 - r.z * 1.2], l: [h[0] + f.x * 1.5, h[1] - 0.3, h[2] + f.z * 1.5], fov: 34 }, { p: [h[0] - f.x * 2.1 - r.x * 1.0, h[1] + 0.3, h[2] - f.z * 2.1 - r.z * 1.0], l: [h[0] + f.x * 1.5, h[1] - 0.3, h[2] + f.z * 1.5], fov: 34 }, p, t, linear, 0.004);
  });

  // ---- ten seconds of nothing
  mk("flight-bullets", 304.0, 305.4, "space", (ctx, t, lt, p) => {
    const mz = rt.muzzle;
    const f = new THREE.Vector3(Math.sin(rt.zhangYaw), 0, Math.cos(rt.zhangYaw));
    const r = new THREE.Vector3(Math.cos(rt.zhangYaw), 0, -Math.sin(rt.zhangYaw));
    camBetween(ctx, { p: [mz.x - f.x * 1.2 + r.x * 0.55, mz.y + 0.12, mz.z - f.z * 1.2 + r.z * 0.55], l: [mz.x + f.x * 40, mz.y - 6, mz.z + f.z * 40], fov: 30 }, { p: [mz.x - f.x * 1.2 + r.x * 0.45, mz.y + 0.1, mz.z - f.z * 1.2 + r.z * 0.45], l: [mz.x + f.x * 40, mz.y - 6, mz.z + f.z * 40], fov: 24 }, p, t, linear, 0.0015);
  });
  mk("flight-led", 305.4, 306.2, "cabin", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [0.75, 1.28, 0.6], l: [1.58, 1.16, 0.5], fov: 16 }, { p: [0.95, 1.24, 0.56], l: [1.58, 1.16, 0.5], fov: 12 }, p, t, linear, 0.0005);
  });
  mk("flight-scope", 306.2, 307.4, "space", (ctx, t, lt, p) => {
    const e = eye();
    const a = tgt(2);
    camBetween(ctx, { p: e, l: [a[0], a[1] - 0.6, a[2]], fov: 4.6 }, { p: e, l: [a[0], a[1] - 0.6, a[2]], fov: 4.2 }, p, t, linear, 0.0005);
  }, { scope: true });

  // ---- the meteor rain
  mk("hit-scope", 307.4, 309.0, "space", (ctx, t, lt, p) => {
    const e = eye();
    const a = tgt(1);
    camBetween(ctx, { p: e, l: [a[0], a[1] - 0.3, a[2]], fov: 3.6 }, { p: e, l: [a[0], a[1] - 0.3, a[2]], fov: 3.4 }, p, t, linear, 0.0005);
  }, { scope: true });
  mk("hit-cloud", 311.2, 312.4, "space", (ctx, t, lt, p) => {
    const e = eye();
    camBetween(ctx, { p: [e[0] + 0.5, e[1] + 0.1, e[2] + 0.3], l: gc(0.9), fov: 12 }, { p: [e[0] + 0.5, e[1] + 0.1, e[2] + 0.3], l: gc(0.9), fov: 10 }, p, t, linear, 0.002);
  });
  mk("hit-mouth", 309.0, 311.2, "space", (ctx, t, lt, p) => {
    const e = eye();
    const a = tgt(5);
    camBetween(ctx, { p: e, l: [a[0], a[1] - 0.02, a[2]], fov: 1.9 }, { p: e, l: [a[0], a[1] - 0.02, a[2]], fov: 1.7 }, p, t, linear, 0.0004);
  }, { scope: true });
  mk("zhang-calm", 312.4, 314.0, "space", (ctx, t, lt, p) => {
    camBetween(ctx, { p: rel(t, 1.2, 0.5, 0.02), l: head(), fov: 24 }, { p: rel(t, 1.05, 0.42, 0.02), l: head(), fov: 19 }, p, t, linear, 0.0008);
  });
  mk("panic-wide", 314.0, 317.4, "space", (ctx, t, lt, p) => {
    const e = eye();
    camBetween(ctx, { p: [e[0] + 0.8, e[1] + 0.2, e[2] + 0.4], l: [(G[0] + D[0]) / 2, (G[1] + D[1]) / 2 + 2, (G[2] + D[2]) / 2], fov: 22 }, { p: [e[0] + 0.8, e[1] + 0.2, e[2] + 0.4], l: [(G[0] + D[0]) / 2, (G[1] + D[1]) / 2 + 2, (G[2] + D[2]) / 2], fov: 18 }, p, t, linear, 0.002);
  });
  mk("scope-rescue", 317.4, 320.2, "space", (ctx, t, lt, p) => {
    const e = eye();
    const c = rt.crowdPath[1]!.pos(t);
    camBetween(ctx, { p: e, l: [c[0], c[1] + 1.0, c[2]], fov: 4.2 }, { p: e, l: [c[0], c[1] + 1.0, c[2]], fov: 3.8 }, p, t, linear, 0.0005);
  }, { scope: true });
  mk("door-wide", 320.2, 323.6, "space", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [D[0] + 12, D[1] + 5, D[2] + 20], l: [D[0], D[1], D[2]], fov: 32 }, { p: [D[0] + 9, D[1] + 4, D[2] + 15], l: [D[0], D[1], D[2]], fov: 26 }, p, t, linear, 0.004);
  });

  // ---- aftermath, return, the last image
  mk("after-silence", 323.6, 326.4, "space", (ctx, t, lt, p) => {
    const h = head();
    const f = new THREE.Vector3(Math.sin(rt.zhangYaw), 0, Math.cos(rt.zhangYaw));
    const r = new THREE.Vector3(Math.cos(rt.zhangYaw), 0, -Math.sin(rt.zhangYaw));
    camBetween(ctx, { p: [h[0] + f.x * 2.6 + r.x * 1.4, h[1] + 0.1, h[2] + f.z * 2.6 + r.z * 1.4], l: [h[0], h[1] - 0.1, h[2]], fov: 30 }, { p: [h[0] + f.x * 4.2 + r.x * 2.2, h[1] + 0.3, h[2] + f.z * 4.2 + r.z * 2.2], l: [h[0] - f.x * 6, h[1] - 0.6, h[2] - f.z * 6], fov: 40 }, p, t, linear, 0.002);
  });
  mk("after-station", 326.4, 331.8, "space", (ctx, t, lt, p) => {
    camBetween(ctx, { p: [10, 3, 12], l: [S0[0], S0[1] + 4, S0[2]], fov: 50 }, { p: [12, 4, 14], l: [S0[0] + 2, S0[1] + 4, S0[2]], fov: 44 }, p, t, linear, 0.003);
  });
  mk("return-behind", 331.8, 336.4, "space", (ctx, t, lt, p) => {
    const z = rt.zBack.pos(t);
    const d = rt.dirB;
    camBetween(ctx, { p: [z[0] - d.x * 7 + 1.5, z[1] - d.y * 7 + 0.7, z[2] - d.z * 7], l: [z[0] + d.x * 2, z[1] + d.y * 2, z[2] + d.z * 2], fov: 40 }, { p: [z[0] - d.x * 9 + 2.2, z[1] - d.y * 9 + 1.6, z[2] - d.z * 9 + 1], l: [z[0] + d.x * 6, z[1] + d.y * 6, z[2] + d.z * 6], fov: 34 }, p, t, linear, 0.002);
  });
  mk("return-face", 336.4, 342.0, "space", (ctx, t, lt, p) => {
    const z = rt.zBack.pos(t);
    const d = rt.dirB;
    // he flies head-first with his face toward the planet: come round beneath him to meet it
    const down = new THREE.Vector3(0, -1, 0).addScaledVector(d, d.y).normalize();
    const side = new THREE.Vector3().crossVectors(d, down).normalize();
    const head: V3 = [z[0] + d.x * 1.55, z[1] + d.y * 1.55, z[2] + d.z * 1.55];
    const k = smooth(p);
    camBetween(
      ctx,
      { p: [head[0] + down.x * 2.1 + side.x * 0.9 - d.x * 0.6, head[1] + down.y * 2.1 + side.y * 0.9 - d.y * 0.6, head[2] + down.z * 2.1 + side.z * 0.9 - d.z * 0.6], l: head, fov: 30 },
      { p: [head[0] + down.x * 1.7 + side.x * 0.5, head[1] + down.y * 1.7 + side.y * 0.5, head[2] + down.z * 1.7 + side.z * 0.5], l: head, fov: 24 },
      k,
      t,
      linear,
      0.0015,
    );
  });
  mk("return-long", 342.0, 349.0, "space", (ctx, t, lt, p) => {
    // the last image: from behind and above, one small figure climbing toward a single green light,
    // the planet dark and lit only by its own cities
    const z = rt.zBack.pos(t);
    const bl = arr(ctx.space.base1);
    const look: V3 = [mix(z[0], bl[0], 0.35), mix(z[1], bl[1], 0.35) - 4, mix(z[2], bl[2], 0.35)];
    setCamera(ctx, [9, 8, 34], look, mix(46, 26, p), 0, 0.001, t);
  });
  return S;
}

const lerp3v = lerp3;
export { lerp3v, easeOut, easeIn, mix };
export type { E3 };
