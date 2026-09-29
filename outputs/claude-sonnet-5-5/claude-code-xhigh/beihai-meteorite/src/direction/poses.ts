import { idle, lerpPose, type Pose } from "@agentbench/voxel-kit";
import { addPose } from "../util/kf";
import { wobble } from "../util/math";

/**
 * Authored poses. Joint rotations are radians in kit space:
 *  arm.x < 0 lifts the arm forward, arm.z pushes it sideways (right arm: negative = out),
 *  leg.x < 0 lifts the leg forward, hips rotate the whole body about the hip joint.
 */
export const P = (p: Pose): Pose => p;

export function breathe(t: number, k = 1): Pose {
  const b = Math.sin(t * 1.5);
  return { neck: [b * 0.015 * k, 0, 0], lift: b * 0.05 * k };
}

/** Weightless hover, upright: arms loose and slightly out, knees soft. */
export function zeroG(t: number, seed = 0, k = 1): Pose {
  const w = (s: number, f = 1) => wobble(t * f, seed + s) * k;
  return {
    hips: [-0.06 + w(1, 0.3) * 0.05, w(2, 0.25) * 0.08, w(3, 0.3) * 0.03],
    neck: [0.05 + w(4, 0.4) * 0.04, w(5, 0.3) * 0.06, 0],
    armR: [-0.35 + w(6, 0.5) * 0.12, 0, -0.38 + w(7, 0.4) * 0.08],
    armL: [-0.3 + w(8, 0.5) * 0.12, 0, 0.4 + w(9, 0.4) * 0.08],
    legR: [-0.18 + w(10, 0.4) * 0.08, 0, -0.08],
    legL: [-0.1 + w(11, 0.4) * 0.08, 0, 0.08],
    lift: w(12, 0.5) * 0.3,
  };
}

/** Standing, weight settled: small breathing plus a slow head turn. */
export function stand(t: number, seed = 0): Pose {
  return addPose(idle(t + seed), { neck: [0, wobble(t * 0.3, seed) * 0.1, 0] });
}

export function mix(a: Pose, b: Pose, t: number): Pose {
  return lerpPose(a, b, t);
}

/** Seated on a stool/chair, legs out in front (the kit has no knees). */
export function seated(t: number, seed = 0): Pose {
  return {
    hips: [0.02, 0, 0],
    neck: [0.08 + Math.sin(t * 1.4 + seed) * 0.01, wobble(t * 0.3, seed) * 0.08, 0],
    armR: [-0.5, 0, 0.1],
    armL: [-0.5, 0, -0.1],
    legR: [-1.25, 0, 0.05],
    legL: [-1.25, 0, -0.05],
    lift: -3.5,
  };
}
