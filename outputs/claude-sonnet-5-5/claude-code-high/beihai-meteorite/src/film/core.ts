import * as THREE from "three";
import type { Figure, Pose } from "@agentbench/voxel-kit";
import { applyPose, idle, lerpPose, walk } from "@agentbench/voxel-kit";
import type { Shot } from "@agentbench/cinematic-player";
import { clamp, mix, smooth, type V3 } from "../blocks";
import type { Actor, Loc, Rig } from "../world";
import type { Cast } from "../cast";
import type { HouseSet } from "../sets/house";
import type { AlleySet } from "../sets/alley";
import type { ShopSet } from "../sets/shop";
import type { BasementSet } from "../sets/basement";
import type { CabinSet } from "../sets/cabin";
import type { SpaceSet } from "../sets/space";
import { voiceCues } from "../voice";
import type { Mood } from "../characters";

export interface Overlay {
  scope(alpha: number, zoom: number): void;
  lens(alpha: number, kind: "micro" | "none"): void;
  title(kind: "none" | "title" | "end" | "place", text: string, sub: string, alpha: number): void;
  fade(alpha: number): void;
  flash(alpha: number, tint?: string): void;
}

export interface Ctx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rig: Rig;
  cast: Cast;
  house: HouseSet;
  alley: AlleySet;
  shop: ShopSet;
  basement: BasementSet;
  cabin: CabinSet;
  space: SpaceSet;
  groups: Record<Loc, THREE.Object3D>;
  overlay: Overlay;
  loc: Loc;
  extra: Record<string, any>;
}

export type E3 = [number, number, number];

/* ------------------------------------------------------------------- camera */

export type Vec = V3 | ((t: number) => V3);
const val = (v: Vec, t: number): V3 => (typeof v === "function" ? v(t) : v);

export interface CamSpec {
  p: Vec;
  l: Vec;
  fov: number;
  roll?: number;
}

const tmpV = new THREE.Vector3();

export function setCamera(ctx: Ctx, p: V3, l: V3, fov: number, roll = 0, shake = 0, t = 0): void {
  const c = ctx.camera;
  let [px, py, pz] = p;
  let [lx, ly, lz] = l;
  if (shake > 0) {
    const s = shake;
    px += (Math.sin(t * 6.3) * 0.6 + Math.sin(t * 11.7 + 1) * 0.4) * s;
    py += (Math.sin(t * 5.1 + 2) * 0.6 + Math.sin(t * 13.1) * 0.4) * s;
    pz += Math.sin(t * 7.3 + 4) * s * 0.5;
    lx += Math.sin(t * 4.1 + 3) * s * 0.7;
    ly += Math.sin(t * 5.7 + 5) * s * 0.7;
  }
  c.position.set(px, py, pz);
  c.up.set(0, 1, 0);
  c.lookAt(lx, ly, lz);
  if (roll) c.rotateZ(roll);
  if (c.fov !== fov) {
    c.fov = fov;
    c.updateProjectionMatrix();
  }
}

/** Interpolate between two camera specs over a shot. `ease` maps 0..1 progress. */
export function camBetween(ctx: Ctx, a: CamSpec, b: CamSpec, progress: number, t: number, ease: (x: number) => number = smooth, shake = 0.004): void {
  const k = ease(clamp(progress));
  const pa = val(a.p, t);
  const pb = val(b.p, t);
  const la = val(a.l, t);
  const lb = val(b.l, t);
  setCamera(
    ctx,
    [mix(pa[0], pb[0], k), mix(pa[1], pb[1], k), mix(pa[2], pb[2], k)],
    [mix(la[0], lb[0], k), mix(la[1], lb[1], k), mix(la[2], lb[2], k)],
    mix(a.fov, b.fov, k),
    mix(a.roll ?? 0, b.roll ?? 0, k),
    shake,
    t,
  );
}

export const linear = (x: number) => x;
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 2.4);
export const easeIn = (x: number) => Math.pow(x, 2);

/* -------------------------------------------------------------------- tracks */

export interface Key {
  t: number;
  p: V3;
  yaw?: number;
}

export class Track {
  private table: Array<{ t: number; d: number }> = [];
  constructor(private keys: Key[]) {
    let d = 0;
    let prev = this.pos(keys[0]!.t);
    const t0 = keys[0]!.t;
    const t1 = keys[keys.length - 1]!.t;
    for (let t = t0; t <= t1 + 1e-6; t += 0.02) {
      const p = this.pos(t);
      d += Math.hypot(p[0] - prev[0], p[2] - prev[2]);
      this.table.push({ t, d });
      prev = p;
    }
  }
  private seg(t: number): [Key, Key, number] {
    const k = this.keys;
    if (t <= k[0]!.t) return [k[0]!, k[0]!, 0];
    for (let i = 0; i < k.length - 1; i++) {
      if (t < k[i + 1]!.t) return [k[i]!, k[i + 1]!, (t - k[i]!.t) / (k[i + 1]!.t - k[i]!.t)];
    }
    return [k[k.length - 1]!, k[k.length - 1]!, 1];
  }
  pos(t: number): V3 {
    const [a, b, u] = this.seg(t);
    return [mix(a.p[0], b.p[0], u), mix(a.p[1], b.p[1], u), mix(a.p[2], b.p[2], u)];
  }
  yaw(t: number): number {
    const [a, b, u] = this.seg(t);
    const ya = a.yaw ?? this.heading(t);
    const yb = b.yaw ?? this.heading(t);
    return mix(ya, yb, smooth(u));
  }
  heading(t: number): number {
    const p0 = this.pos(t - 0.15);
    const p1 = this.pos(t + 0.15);
    const dx = p1[0] - p0[0];
    const dz = p1[2] - p0[2];
    return Math.hypot(dx, dz) < 1e-4 ? 0 : Math.atan2(dx, dz);
  }
  speed(t: number): number {
    const p0 = this.pos(t - 0.1);
    const p1 = this.pos(t + 0.1);
    return Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) / 0.2;
  }
  dist(t: number): number {
    if (t <= this.table[0]!.t) return 0;
    const last = this.table[this.table.length - 1]!;
    if (t >= last.t) return last.d;
    const i = Math.floor((t - this.table[0]!.t) / 0.02);
    const a = this.table[i]!;
    const b = this.table[Math.min(i + 1, this.table.length - 1)]!;
    return mix(a.d, b.d, (t - a.t) / 0.02);
  }
}

/* --------------------------------------------------------------------- poses */

export function place(fig: Figure, p: V3, yaw: number, pitch = 0, roll = 0): void {
  fig.root.position.set(...p);
  fig.root.rotation.set(pitch, yaw, roll, "YXZ");
}

export function gait(track: Track, t: number, base?: Pose): Pose {
  const sp = track.speed(t);
  if (sp > 0.18) {
    const w = walk(track.dist(t) / 1.55, 1);
    const amt = clamp(sp / 1.1);
    return lerpPose(base ?? idle(t), w, amt);
  }
  return base ?? idle(t);
}

/** Replace individual joints of a pose. */
export function over(base: Pose, o: Partial<Record<"hips" | "neck" | "armR" | "armL" | "legR" | "legL", E3>> & { lift?: number }): Pose {
  return { ...base, ...o };
}

/** Add an offset to individual joints. */
export function nudge(base: Pose, o: Partial<Record<"hips" | "neck" | "armR" | "armL" | "legR" | "legL", E3>>): Pose {
  const out: Pose = { ...base };
  for (const key of Object.keys(o) as Array<keyof typeof o>) {
    const a = (base[key] ?? [0, 0, 0]) as E3;
    const b = o[key]!;
    out[key] = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }
  return out;
}

export { applyPose, idle, walk, lerpPose };

/* --------------------------------------------------------------------- faces */

const speakers = voiceCues.filter((c) => c.kind === "dialogue");
export function speaking(name: string, t: number): boolean {
  for (const c of speakers) if (c.speaker === name && t >= c.start && t < c.end) return Math.floor(t * 7.5) % 2 === 0 || Math.floor(t * 3.1) % 5 === 0;
  return false;
}
export function dialogueActive(name: string, t: number): boolean {
  for (const c of speakers) if (c.speaker === name && t >= c.start && t < c.end) return true;
  return false;
}

export function face(a: Actor, mood: Mood, talking: boolean): void {
  a.bodies.set(a.fig, mood, talking);
  a.mood = mood;
}

/* --------------------------------------------------------------------- shots */

export type ShotFn = (ctx: Ctx, t: number, lt: number, p: number) => void;

export interface ShotDef {
  id: string;
  start: number;
  end: number;
  loc: Loc;
  run: ShotFn;
  /** overlay furniture this shot wears: the rifle-scope reticle or the microscope eyepiece */
  scope?: boolean;
  lens?: boolean;
}

export function toPlayerShots(ctx: Ctx, defs: ShotDef[], enter: (loc: Loc, t: number) => void, after: (loc: Loc, t: number) => void): Shot<Ctx>[] {
  return defs.map((d) => ({
    id: d.id,
    start: d.start,
    end: d.end,
    update: ({ context, time, localTime, progress }) => {
      enter(d.loc, time);
      d.run(context, time, localTime, progress);
      after(d.loc, time);
    },
  }));
}

export const D2R = Math.PI / 180;
export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
export { tmpV };
