import * as THREE from "three";
import { applyPose, type Pose } from "@agentbench/voxel-kit";
import {
  actor, type Actor, zhangBody, zhangCoat, collectorBody, collectorCardigan, spacesuit, attendeeBody, P, blend,
} from "./characters";
import { pistol, scope, magazine, phone, stillCamera, meteorite } from "./props";
import { MuzzleFlash, ParticleField } from "./fx";
import { buildStudy, type StudySet } from "./sets/study";
import { buildWorkshop, type WorkshopSet } from "./sets/workshop";
import { buildBasement, type BasementSet } from "./sets/basement";
import { buildCabin, type CabinSet } from "./sets/cabin";
import { buildSpace, type SpaceSet, GROUP_CENTER, HATCH, BASE_ONE } from "./sets/space";
import type { Overlay } from "./overlay";
import type { Grade } from "./post";
import { rng, smooth, easeIn, seg, lerp, clamp01, V } from "./util";
import { SPACE_SHOTS } from "./sound";

export type SetName = "study" | "workshop" | "basement" | "cabin" | "space" | "none";

export interface Film {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sets: { study: StudySet; workshop: WorkshopSet; basement: BasementSet; cabin: CabinSet; space: SpaceSet };
  cast: {
    zhang: Actor;          // hutong coat, used in study / workshop / basement
    collector: Actor;
    zhangSpace: Actor;
    attendees: Actor[];
    photographer: Actor;
  };
  suits: {
    zhangGloved: THREE.Texture;
    zhangBare: THREE.Texture;
    gold: THREE.Texture;
    clear: THREE.Texture;
    goldStripe: THREE.Texture;
    clearStripe: THREE.Texture;
    cracked: THREE.Texture;
  };
  props: {
    pistolGround: THREE.Group;   // in Zhang's right hand in the basement
    pistolSpace: THREE.Group;    // in the suit's right hand
    scopeAttached: THREE.Mesh;
    scopeFloating: THREE.Mesh;
    magsSpace: THREE.Mesh[];
    glove: THREE.Mesh;           // the removed glove drifting away
    phone: THREE.Group;
    flashGround: MuzzleFlash;
    flashSpace: MuzzleFlash;
    farFlash: THREE.Mesh;        // what the muzzle flash looks like from 4.6 km
    codaStone: THREE.Mesh;
  };
  overlay: Overlay;
  grade: Grade;
  particles: ParticleField[];
  show(set: SetName): void;
  currentSet: SetName;
}

export function buildFilm(scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay: Overlay, grade: Grade): Film {
  const sets = {
    study: buildStudy(),
    workshop: buildWorkshop(),
    basement: buildBasement(),
    cabin: buildCabin(),
    space: buildSpace(),
  };
  for (const s of Object.values(sets)) { s.group.visible = false; scene.add(s.group); }

  // ------------------------------------------------------------------- cast
  const zhangBodyTex = zhangBody(false).texture;
  const zhangSpaceBodyTex = zhangBody(true).texture;
  const coat = zhangCoat().texture;
  const zhang = actor(zhangBodyTex, coat, 1.86);
  const collector = actor(collectorBody().texture, collectorCardigan().texture, 1.72);

  const suits = {
    zhangGloved: spacesuit({ visor: "gold", patch: "#8e2c2c" }).texture,
    zhangBare: spacesuit({ visor: "gold", patch: "#8e2c2c", bareRightHand: true }).texture,
    gold: spacesuit({ visor: "gold" }).texture,
    clear: spacesuit({ visor: "clear" }).texture,
    goldStripe: spacesuit({ visor: "gold", stripe: true, patch: "#c9a227" }).texture,
    clearStripe: spacesuit({ visor: "clear", stripe: true, patch: "#c9a227" }).texture,
    cracked: spacesuit({ visor: "cracked" }).texture,
  };
  const zhangSpace = actor(zhangSpaceBodyTex, suits.zhangGloved, 1.86);

  const attendees: Actor[] = [];
  for (let i = 0; i < 30; i++) {
    const senior = TARGETS.includes(i) || i === 2 || i === 7;
    const a = actor(attendeeBody(i + 1, senior).texture, TARGETS.includes(i) ? suits.goldStripe : suits.gold, 1.68 + (rng(i + 5)() * 0.16));
    attendees.push(a);
  }
  const photographer = actor(attendeeBody(99).texture, suits.gold, 1.76);

  // ------------------------------------------------------------------ props
  const pistolGround = pistol();
  zhang.figure.anchors.handR.add(pistolGround);
  pistolGround.visible = false;
  const flashGround = new MuzzleFlash(2.6, 0xffc46b, 7);
  flashGround.group.position.set(0.2, 1.4, 4.6);
  pistolGround.add(flashGround.group);

  const pistolSpace = pistol();
  zhangSpace.figure.anchors.handR.add(pistolSpace);
  pistolSpace.visible = false;
  const scopeAttached = scope();
  scopeAttached.visible = false;
  pistolSpace.add(scopeAttached);
  const flashSpace = new MuzzleFlash(2.2, 0xffd08a, 5);
  flashSpace.group.position.set(0.2, 1.4, 4.6);
  pistolSpace.add(flashSpace.group);
  const scopeFloating = scope();
  scopeFloating.scale.setScalar(1.86 / 32);      // world metres: 1 px of the 1.86 m figure
  scopeFloating.visible = false;
  const magsSpace = [magazine(), magazine()];
  magsSpace.forEach((m, i) => { m.position.set(i * 1.6 - 0.8, -2, 1.2); m.rotation.x = 0.3; m.visible = false; zhangSpace.figure.anchors.hipL.add(m); });
  const glove = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.13), new THREE.MeshStandardMaterial({ color: 0xd4d8de, roughness: 0.9 }));
  glove.visible = false;
  const phoneProp = phone();
  phoneProp.visible = false;
  zhang.figure.anchors.handR.add(phoneProp);
  const farFlash = new THREE.Mesh(new THREE.BoxGeometry(14, 14, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  farFlash.visible = false;
  const codaStone = meteorite(51, 2, 0.02);
  codaStone.visible = false;

  const cameraProp = stillCamera();
  cameraProp.position.set(0, 1.5, 2.5);
  photographer.figure.anchors.handR.add(cameraProp);

  // Parent the cast to their sets so visibility follows the set.
  sets.study.group.add(zhang.root, collector.root, codaStone);
  sets.space.group.add(zhangSpace.root, scopeFloating, glove, farFlash);
  for (const a of attendees) sets.space.group.add(a.root);
  sets.space.group.add(photographer.root);

  const film: Film = {
    scene, camera, sets,
    cast: { zhang, collector, zhangSpace, attendees, photographer },
    suits,
    props: { pistolGround, pistolSpace, scopeAttached, scopeFloating, magsSpace, glove, phone: phoneProp, flashGround, flashSpace, farFlash, codaStone },
    overlay, grade,
    particles: [sets.workshop.sparks, sets.basement.smoke, sets.space.puffs, sets.space.blood],
    currentSet: "none",
    show(set) {
      if (film.currentSet === set) return;
      film.currentSet = set;
      for (const [name, s] of Object.entries(sets)) s.group.visible = name === set;
      // Move the shared coat-wearing Zhang to whichever interior is live.
      if (set === "workshop") sets.workshop.group.add(zhang.root);
      else if (set === "basement") sets.basement.group.add(zhang.root);
      else if (set === "study") sets.study.group.add(zhang.root);
      if (set === "cabin") sets.cabin.group.add(zhangSpace.root);
      else if (set === "space") sets.space.group.add(zhangSpace.root);
      scene.fog = set === "workshop" ? new THREE.FogExp2(0x070a10, 0.045) : set === "basement" ? new THREE.FogExp2(0x0a0908, 0.09) : null;
    },
  };
  seedSpaceParticles(film);
  return film;
}

/* --------------------------------------------------------- the photo group */

export const TARGETS = [3, 4, 5];
export const VICTIMS: Record<number, number> = { 3: 270.5, 4: 270.9, 5: 271.3, 6: 271.6, 13: 272.1 };
export const RESCUER: Record<number, number> = { 3: 2, 4: 14, 5: 15, 6: 7, 13: 23 };
export const EXIT0 = 209.8;
export const RETREAT0 = 274.6;
export const VISOR_CLEAR0 = 221.0;

const hatchOut = HATCH.clone().add(V(0, 0, 4));

export function slotOf(i: number): THREE.Vector3 {
  const row = Math.floor(i / 10), col = i % 10;
  return V(
    GROUP_CENTER.x + (col - 4.5) * 1.75 + (row % 2) * 0.5,
    GROUP_CENTER.y + row * 1.7 - 1.2,
    GROUP_CENTER.z - row * 2.6,
  );
}

export interface AttendeeState {
  pos: THREE.Vector3;
  yaw: number;
  tilt: THREE.Euler;
  pose: Pose;
  visor: "gold" | "clear" | "cracked";
  visible: boolean;
}

const exitTime = (i: number) => EXIT0 + i * 0.36;
const FLIGHT = 9;

/** Pure function of time: where attendee `i` is and what they are doing. */
export function attendeeState(i: number, t: number): AttendeeState {
  const r = rng(i * 31 + 7);
  const j1 = r() * 6.28, j2 = r() * 6.28, j3 = r();
  const slot = slotOf(i);
  const drift = V(Math.sin(t * 0.21 + j1) * 0.12, Math.sin(t * 0.17 + j2) * 0.1, Math.sin(t * 0.13 + j1) * 0.08);
  const out: AttendeeState = { pos: slot.clone().add(drift), yaw: 0, tilt: new THREE.Euler(), pose: P.formal(t, j1), visor: "gold", visible: true };
  const te = exitTime(i);

  // Not out yet.
  if (t < te) { out.visible = false; return out; }

  // Flying out to the slot.
  if (t < te + FLIGHT) {
    const k = smooth((t - te) / FLIGHT);
    const arc = Math.sin(k * Math.PI) * 6;
    out.pos.lerpVectors(hatchOut, slot, k).add(V(0, arc, 0));
    out.pose = blend(P.fly(t), P.formal(t, j1), smooth((k - 0.6) / 0.4));
    out.yaw = 0;
    out.tilt.set(-(1 - k) * 0.4, 0, 0);
    return out;
  }

  // In formation. Visors turn clear in the fading light, front row first.
  const clearAt = VISOR_CLEAR0 + i * 0.15 + j3 * 0.6;
  if (t >= clearAt) out.visor = "clear";

  const hitAt = VICTIMS[i];
  const rescuerOf = RESCUER[i];
  const rescuing = Object.entries(RESCUER).find(([, resc]) => resc === i);
  const retreatAt = RETREAT0 + (rescuing ? 0.2 : 0.8 + (i % 7) * 0.22);

  if (hitAt !== undefined && t >= hitAt) {
    // Struck: thrown back, tumbling slowly, then towed by the rescuer.
    const k = clamp01((t - hitAt) / 0.5);
    out.pose = blend(P.formal(t, j1), P.struck(t), k);
    out.tilt.set(-(t - hitAt) * 0.12, (t - hitAt) * 0.05, 0.2 * k);
    out.visor = i === 6 ? (t >= hitAt ? "cracked" : "clear") : "clear";
    const towStart = RETREAT0 + 0.2 + 2.2;    // rescuer reaches the victim
    if (t < towStart) {
      out.pos.addScaledVector(V(0, 0.15, -0.5), (t - hitAt));
      return out;
    }
    const resc = attendeeState(rescuerOf!, t);
    out.pos.copy(resc.pos).add(V(1.3, -0.3, 0.3));
    out.tilt.set(-1.2, 0.3, 0.4);
    out.visible = resc.visible;
    return out;
  }

  if (t < retreatAt) return out;

  // Retreat: rescuers detour to their victim, everyone else goes straight home.
  if (rescuing) {
    const victim = Number(rescuing[0]);
    const vpos = slotOf(victim).add(V(0, 0.15, -0.5).multiplyScalar(RETREAT0 + 2.4 - VICTIMS[victim]!));
    const k1 = clamp01((t - retreatAt) / 2.2);
    if (k1 < 1) {
      out.pos.lerpVectors(slot.clone().add(drift), vpos.clone().add(V(-1.3, 0.3, -0.3)), smooth(k1));
      out.pose = blend(P.formal(t, j1), P.fly(t), k1);
      out.yaw = Math.PI;
      out.tilt.set(0.3 * k1, 0, 0);
      return out;
    }
    const k2 = easeIn((t - retreatAt - 2.2) / 7.2);
    out.pos.lerpVectors(vpos.clone().add(V(-1.3, 0.3, -0.3)), hatchOut, k2);
    out.pose = P.fly(t);
    out.yaw = Math.PI;
    out.tilt.set(0.4, 0, 0);
    out.visible = k2 < 0.995;
    return out;
  }
  const k = easeIn((t - retreatAt) / 6.5);
  out.pos.lerpVectors(slot.clone().add(drift), hatchOut, k);
  out.pose = blend(P.formal(t, j1), P.fly(t), clamp01(k * 4));
  out.yaw = Math.PI;
  out.tilt.set(0.4 * clamp01(k * 4), 0, 0);
  out.visible = k < 0.995;
  return out;
}

export function photographerState(t: number): { pos: THREE.Vector3; visible: boolean; pose: Pose; yaw: number } {
  const home = GROUP_CENTER.clone().add(V(0.5, 0.4, 12));
  const te = EXIT0 - 1.5;                  // the photographer goes out first
  if (t < te) return { pos: home, visible: false, pose: P.fly(t), yaw: 0 };
  if (t < te + FLIGHT) {
    const k = smooth((t - te) / FLIGHT);
    return { pos: hatchOut.clone().lerp(home, k).add(V(0, Math.sin(k * Math.PI) * 8, 0)), visible: true, pose: P.fly(t), yaw: 0 };
  }
  if (t < RETREAT0 + 1.0) {
    // Directing with the free arm, then holding the camera up.
    const wave = seg(t, 213, 219) * (1 - seg(t, 219, 221));
    const pose: Pose = {
      hips: [-0.05, 0, 0], neck: [0.1, 0, 0],
      armR: [-1.65, 0, 0.15],
      armL: [lerp(-0.3, -2.2 + Math.sin(t * 3) * 0.3, wave), 0, -0.3],
      legR: [-0.15, 0, 0.05], legL: [-0.1, 0, -0.05],
    };
    return { pos: home.clone().add(V(Math.sin(t * 0.2) * 0.1, Math.sin(t * 0.15) * 0.1, 0)), visible: true, pose, yaw: Math.PI };
  }
  const k = easeIn((t - RETREAT0 - 1.0) / 7.0);
  return { pos: home.clone().lerp(hatchOut, k), visible: k < 0.995, pose: P.fly(t), yaw: Math.PI };
}

/** Apply the whole group for a frame. */
export function poseGroup(film: Film, t: number): void {
  film.cast.attendees.forEach((a, i) => {
    const s = attendeeState(i, t);
    a.root.visible = s.visible;
    if (!s.visible) return;
    a.root.position.copy(s.pos);
    a.root.rotation.set(s.tilt.x, s.yaw + s.tilt.y, s.tilt.z);
    applyPoseTo(a, s.pose);
    const stripe = TARGETS.includes(i);
    const tex = s.visor === "cracked" ? film.suits.cracked : s.visor === "clear" ? (stripe ? film.suits.clearStripe : film.suits.clear) : (stripe ? film.suits.goldStripe : film.suits.gold);
    const mat = a.figure.clothing.head.material as THREE.MeshStandardMaterial;
    if (mat.map !== tex) a.setClothes(tex);
  });
  const p = photographerState(t);
  film.cast.photographer.root.visible = p.visible;
  film.cast.photographer.root.position.copy(p.pos);
  film.cast.photographer.root.rotation.set(0, p.yaw, 0);
  applyPoseTo(film.cast.photographer, p.pose);
}

export function applyPoseTo(a: Actor, p: Pose): void { applyPose(a.figure, p); }

/* ------------------------------------------------- Zhang's flights in orbit */

const baseDir = BASE_ONE.clone().normalize();

/** Arrival from Base One: decelerating along the line, stopping at the origin at 182.5. */
export function zhangArrival(t: number): THREE.Vector3 {
  const k = clamp01((t - 172) / 10.5);
  const d = 650 * Math.pow(1 - k, 3);
  return baseDir.clone().multiplyScalar(d);
}

/** Departure toward Base One from 290.4: accelerating, becoming a point. */
export function zhangDeparture(t: number): THREE.Vector3 {
  const dt = Math.max(0, t - 290.6);
  return baseDir.clone().multiplyScalar(0.5 * 1.35 * dt * dt);
}

/* ----------------------------------------------- pre-authored particle cues */

function seedSpaceParticles(film: Film): void {
  const puffs = film.sets.space.puffs;
  const blood = film.sets.space.blood;
  const white = new THREE.Color(0xdfe8ff);
  const whiteEnd = new THREE.Color(0x2a3350);

  // Zhang braking on arrival: jets fire forward along the travel direction.
  for (let k = 0; k < 34; k++) {
    const at = 172.2 + k * 0.3;
    const pos = zhangArrival(at);
    puffs.add({ at, origin: pos.clone().addScaledVector(baseDir, -1.2), dir: baseDir.clone().negate(), speed: [6, 14], spread: 0.35, life: 2.4, count: 14, size: 0.5, color: white, colorEnd: whiteEnd, seed: 100 + k });
  }
  // Zhang leaving: exhaust trails behind him.
  for (let k = 0; k < 40; k++) {
    const at = 290.6 + k * 0.12;
    if (at > 292.9 && at < 294.0) continue;
    if (at > 296.2) break;
    const pos = zhangDeparture(at);
    puffs.add({ at, origin: pos.clone().addScaledVector(baseDir, -0.7), dir: baseDir.clone().negate(), speed: [5, 12], spread: 0.3, life: 3.5, count: 12, size: 0.5, color: white, colorEnd: whiteEnd, seed: 200 + k });
  }
  // The photo group: small thruster puffs while flying out and while fleeing.
  for (let i = -1; i < 30; i++) {
    const te = i < 0 ? EXIT0 - 1.5 : exitTime(i);
    for (let k = 0; k < 10; k++) {
      const at = te + 0.5 + k * 0.8;
      const s = i < 0 ? photographerState(at) : attendeeState(i, at);
      puffs.add({ at, origin: s.pos.clone().add(V(0, -0.4, -0.6)), dir: V(0, -0.2, -1), speed: [2, 5], spread: 0.5, life: 2.2, count: 6, size: 0.35, color: white, colorEnd: whiteEnd, seed: 300 + i * 10 + k });
    }
  }
  for (let i = -1; i < 30; i++) {
    if (i >= 0 && VICTIMS[i] !== undefined) continue;
    for (let k = 0; k < 24; k++) {
      const at = RETREAT0 + 0.3 + k * 0.3;
      const s = i < 0 ? photographerState(at) : attendeeState(i, at);
      if (!s.visible) break;
      puffs.add({ at, origin: s.pos.clone().add(V(0, -0.2, 0.8)), dir: V(0, 0.1, 1), speed: [4, 9], spread: 0.4, life: 3.2, count: 9, size: 0.45, color: white, colorEnd: whiteEnd, seed: 700 + i * 30 + k });
    }
  }
  // Impacts: suit gas venting, one ruptured thruster pack, one visor.
  const vent = new THREE.Color(0xf4f7ff);
  for (const [idx, at] of Object.entries(VICTIMS)) {
    const i = Number(idx);
    const s = attendeeState(i, at);
    const chest = s.pos.clone().add(V(0, 1.2, 0));
    puffs.add({ at, origin: chest, dir: V(0.2, 0.3, -1), speed: [2.5, 6], spread: 0.9, life: 3.2, count: 110, size: 0.4, color: vent, colorEnd: whiteEnd, window: 1.6, seed: 900 + i });
    puffs.add({ at: at + 0.05, origin: chest.clone().add(V(0, 0, 0.2)), dir: V(-0.1, 0.2, 1), speed: [1.5, 4], spread: 1.0, life: 2.6, count: 50, size: 0.35, color: vent, colorEnd: whiteEnd, window: 1.2, seed: 950 + i });
    if (i === 5) {
      // Round passes through and bursts the pack behind the second row.
      puffs.add({ at: at + 0.02, origin: s.pos.clone().add(V(0.4, 1.1, -1.4)), dir: V(0, 0.4, -1), speed: [6, 14], spread: 1.3, life: 4.5, count: 320, size: 0.7, color: vent, colorEnd: whiteEnd, window: 0.5, seed: 990 });
    }
    if (i === 6) {
      blood.add({ at: at + 0.1, origin: s.pos.clone().add(V(0, 1.55, 0.25)), dir: V(0, 0.1, 1), speed: [0.4, 1.6], spread: 1.2, life: 5, count: 90, size: 0.12, color: new THREE.Color(0x9b1a1a), colorEnd: new THREE.Color(0xf0c8c8), window: 1.4, seed: 1001 });
    }
  }
}

/** Sparks and smoke for the interiors are authored here too. */
export function seedInteriorParticles(film: Film): void {
  const sparks = film.sets.workshop.sparks;
  const orange = new THREE.Color(0xffb347), red = new THREE.Color(0x8a2a10);
  for (let k = 0; k < 110; k++) {
    const at = 102.4 + k * 0.083;
    sparks.add({ at, origin: film.sets.workshop.cutPoint, dir: V(0.2, 0.7, 0.75), speed: [1.2, 3.4], spread: 0.55, life: 0.55, count: 8, size: 0.03, color: orange, colorEnd: red, accel: V(0, -9.8, 0), seed: 40 + k });
  }
  // Gun smoke in the basement, from the muzzle toward the corner.
  const smoke = film.sets.basement.smoke;
  const grey = new THREE.Color(0x8b8a86), greyEnd = new THREE.Color(0x3a3a38);
  for (const t of BASEMENT_SHOTS_LOCAL) {
    smoke.add({ at: t, origin: V(-0.62, 1.45, 0.78), dir: V(0.68, 0.15, -0.72), speed: [1.5, 4], spread: 0.35, life: 2.8, count: 60, size: 0.12, color: grey, colorEnd: greyEnd, window: 0.1, seed: 60 + Math.floor(t) });
    smoke.add({ at: t + 0.1, origin: V(-0.55, 1.5, 0.7), dir: V(0, 1, 0), speed: [0.2, 0.7], spread: 1.2, life: 5.5, count: 60, size: 0.2, color: grey, colorEnd: greyEnd, window: 1.5, seed: 80 + Math.floor(t) });
  }
}
const BASEMENT_SHOTS_LOCAL = [133.2, 134.4, 135.3, 136.5];
export { SPACE_SHOTS };
