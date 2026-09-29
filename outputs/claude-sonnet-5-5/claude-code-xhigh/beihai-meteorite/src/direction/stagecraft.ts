import type { Actor } from "../art/cast";
import type { Eyes, Mouth } from "../art/skins";
import { isSpeaking } from "../voiceCues";
import type { Pose } from "@agentbench/voxel-kit";
import { addPose } from "../util/kf";
import { wobble } from "../util/math";

/** Face state with mouth movement while this actor has a live *dialogue* cue. */
export function speak(a: Actor, t: number, eyes: Eyes = "calm", mouth: Mouth = "flat"): void {
  if (isSpeaking(t, a.name)) {
    const beat = Math.sin(t * 12.6 + a.name.length * 1.7) > -0.15 && Math.sin(t * 4.7 + 1.3) > -0.7;
    a.face(eyes, beat ? "talk" : mouth);
  } else a.face(eyes, mouth);
}

/** Small conversational movement layered over a base pose while speaking. */
export function gesture(base: Pose, a: Actor, t: number, k = 1): Pose {
  if (!isSpeaking(t, a.name)) return base;
  const s = Math.sin(t * 2.6 + a.name.length);
  return addPose(base, {
    neck: [Math.sin(t * 5.1) * 0.05 * k, wobble(t * 1.2, 3) * 0.08 * k, 0],
    armR: [-0.25 * k * (0.5 + 0.5 * s), 0, -0.06 * k * s],
    armL: [-0.1 * k * (0.5 - 0.5 * s), 0, 0.04 * k],
  });
}

/** Sit on a seat whose top is `seatH` metres high. Legs go out front (the kit has no knees). */
export function seatLift(a: Actor, seatH: number): number {
  const px = a.heightM / 32;
  return seatH / px - 12;
}

/**
 * Camera position on a circle around an actor: `ang` = 0 is straight in front of
 * the face, +/-PI/2 the profile, PI directly behind. Height is absolute (metres).
 */
export function orbit(pos: [number, number, number], yaw: number, dist: number, height: number, ang: number): [number, number, number] {
  return [pos[0] + Math.sin(yaw + ang) * dist, height, pos[2] + Math.cos(yaw + ang) * dist];
}
