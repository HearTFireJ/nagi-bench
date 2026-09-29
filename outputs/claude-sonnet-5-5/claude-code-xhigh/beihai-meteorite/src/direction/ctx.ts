import * as THREE from "three";
import type { Shot, ShotFrame } from "@agentbench/cinematic-player";
import type { Rig, LightPreset } from "./rig";
import type { Actor, Crowd } from "../art/cast";
import type { Fx } from "../art/fx";
import type { PistolRig } from "../art/props";
import type { SpaceWorld } from "../world/space";
import type { Hutong } from "../world/hutong";
import type { RoomSet } from "../world/room";
import type { SnowSet } from "../world/snow";
import type { Shop } from "../world/shop";
import type { Basement } from "../world/basement";
import type { Cabin } from "../world/cabin";
import { EASE, sample1, sample3, type EaseName, type Key1, type Key3 } from "../util/kf";
import { wobble, type V3 } from "../util/math";
import { opticSpans, type OpticKind } from "../overlay";

export type SetName = "space" | "sky" | "hutong" | "room" | "snow" | "shop" | "basement" | "cabin";

export interface Worlds {
  space: SpaceWorld;
  hutong: Hutong;
  room: RoomSet;
  snow: SnowSet;
  shop: Shop;
  basement: Basement;
  cabin: Cabin;
}

export interface Cast {
  zhang: Actor;
  collector: Actor;
  crowd: Crowd;
  workers: Actor[];
  all: Actor[];
}

export interface Props {
  pistol: PistolRig;
  phone: { group: THREE.Group; screenMat: THREE.MeshBasicMaterial };
  /** Loose named props (hand-held items, magazines, bundles). */
  o: Record<string, THREE.Object3D>;
}

export interface Ctx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rig: Rig;
  w: Worlds;
  cast: Cast;
  props: Props;
  fx: { space: Fx; shop: Fx; basement: Fx; hutong: Fx; room: Fx };
  groups: Record<SetName, THREE.Object3D[]>;
  use(...sets: SetName[]): void;
  hideActors(): void;
}

// ---- camera --------------------------------------------------------------------
export type Path = Key3[] | ((lt: number) => V3);

export interface CamSpec {
  pos: Path;
  look: Path;
  fov?: number | Key1[];
  ease?: EaseName;
  lookEase?: EaseName;
  roll?: number | Key1[];
  /** Handheld amplitude in metres at 1 m. */
  shake?: number;
  shakeRate?: number;
  near?: number;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function samplePath(path: Path, lt: number, ease: EaseName, out: THREE.Vector3): THREE.Vector3 {
  if (typeof path === "function") {
    const v = path(lt);
    return out.set(v[0], v[1], v[2]);
  }
  return sample3(path, lt, ease, out);
}

export function applyCam(cam: THREE.PerspectiveCamera, s: CamSpec, lt: number): void {
  const pos = samplePath(s.pos, lt, s.ease ?? "smooth", tmpA);
  const look = samplePath(s.look, lt, s.lookEase ?? s.ease ?? "smooth", tmpB);
  if (s.shake) {
    const r = s.shakeRate ?? 1;
    pos.x += wobble(lt * r, 1) * s.shake;
    pos.y += wobble(lt * r, 2) * s.shake * 0.7;
    pos.z += wobble(lt * r, 3) * s.shake * 0.5;
    look.x += wobble(lt * r * 1.3, 4) * s.shake * 1.2;
    look.y += wobble(lt * r * 1.1, 5) * s.shake * 1.2;
  }
  cam.position.copy(pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(look);
  const roll = s.roll === undefined ? 0 : typeof s.roll === "number" ? s.roll : sample1(s.roll, lt, s.ease ?? "smooth");
  if (roll) cam.rotateZ(roll);
  const fov = s.fov === undefined ? 40 : typeof s.fov === "number" ? s.fov : sample1(s.fov, lt, s.ease ?? "smooth");
  const near = s.near ?? 0.05;
  if (cam.fov !== fov || cam.near !== near) {
    cam.fov = fov;
    cam.near = near;
    cam.updateProjectionMatrix();
  }
}

// ---- shots ---------------------------------------------------------------------
export interface ShotDef {
  id: string;
  start: number;
  end: number;
  sets: SetName[];
  /** Optic overlay (rifle scope / eyepiece) drawn over this shot. */
  optic?: OpticKind;
  light: LightPreset | ((t: number, lt: number, c: Ctx) => LightPreset);
  cam: CamSpec | ((lt: number, t: number, c: Ctx) => CamSpec);
  /** Actors, props and per-set animation as a pure function of time. */
  run?: (t: number, lt: number, p: number, c: Ctx) => void;
}

export function defineShot(def: ShotDef): Shot<Ctx> {
  if (def.optic) opticSpans.push([def.start, def.end, def.optic]);
  const update = ({ context: c, time, localTime, progress }: ShotFrame<Ctx>): void => {
    c.use(...def.sets);
    c.hideActors();
    const preset = typeof def.light === "function" ? def.light(time, localTime, c) : def.light;
    c.rig.apply(preset);
    def.run?.(time, localTime, progress, c);
    const spec = typeof def.cam === "function" ? def.cam(localTime, time, c) : def.cam;
    applyCam(c.camera, spec, localTime);
  };
  return { id: def.id, start: def.start, end: def.end, update };
}

// ---- small helpers ---------------------------------------------------------------
export function hold(prop: THREE.Object3D, actor: Actor, hand: "handR" | "handL" | "head" | "back" | "hipR" | "hipL", pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale = 1): void {
  const anchor = actor.fig.anchors[hand];
  if (prop.parent !== anchor) anchor.add(prop);
  prop.position.set(pos[0], pos[1], pos[2]);
  prop.rotation.set(rot[0], rot[1], rot[2]);
  prop.scale.setScalar(scale);
  prop.visible = true;
}

/** Put a prop into a group at world coordinates. */
export function drop(prop: THREE.Object3D, parent: THREE.Object3D, pos: V3, rot: V3 = [0, 0, 0], scale = 1): void {
  if (prop.parent !== parent) parent.add(prop);
  prop.position.set(pos[0], pos[1], pos[2]);
  prop.rotation.set(rot[0], rot[1], rot[2]);
  prop.scale.setScalar(scale);
  prop.visible = true;
}

export const ease = EASE;
