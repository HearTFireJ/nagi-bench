import * as THREE from "three";
import { lerpPose, type Pose } from "@agentbench/voxel-kit";
import { clamp, easeIn, easeInOut, easeOut, smooth, smoother } from "./math";

export type EaseName = "lin" | "smooth" | "smoother" | "inout" | "out" | "in";
export const EASE: Record<EaseName, (t: number) => number> = {
  lin: (t) => clamp(t),
  smooth,
  smoother,
  inout: easeInOut,
  out: easeOut,
  in: easeIn,
};

/** [time, value] */
export type Key1 = [number, number];
/** [time, x, y, z] */
export type Key3 = [number, number, number, number];

function locate<K extends number[]>(keys: K[], t: number): { i: number; u: number } {
  if (t <= keys[0]![0]) return { i: 0, u: 0 };
  const last = keys.length - 1;
  if (t >= keys[last]![0]) return { i: last - 1, u: 1 };
  let i = 0;
  while (i < last - 1 && t > keys[i + 1]![0]) i++;
  const a = keys[i]![0];
  const b = keys[i + 1]![0];
  return { i, u: (t - a) / (b - a) };
}

export function sample1(keys: Key1[], t: number, ease: EaseName = "smooth"): number {
  if (keys.length === 1) return keys[0]![1];
  const { i, u } = locate(keys, t);
  const k = EASE[ease](u);
  return keys[i]![1] + (keys[i + 1]![1] - keys[i]![1]) * k;
}

/**
 * Two keys: eased blend (default smooth) so a dolly starts and ends softly.
 * Three or more: uniform-time Catmull-Rom through the keys, so a path never
 * stops at an intermediate key.
 */
export function sample3(keys: Key3[], t: number, ease: EaseName = "smooth", out = new THREE.Vector3()): THREE.Vector3 {
  if (keys.length === 1) return out.set(keys[0]![1], keys[0]![2], keys[0]![3]);
  if (keys.length === 2) {
    const u = EASE[ease](locate(keys, t).u);
    const a = keys[0]!, b = keys[1]!;
    return out.set(a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u);
  }
  const { i, u } = locate(keys, t);
  const p0 = keys[Math.max(0, i - 1)]!, p1 = keys[i]!, p2 = keys[i + 1]!, p3 = keys[Math.min(keys.length - 1, i + 2)]!;
  const span = p2[0] - p1[0];
  const u2 = u * u, u3 = u2 * u;
  const comp = (c: 1 | 2 | 3): number => {
    // Tangents scaled to the segment length so unevenly spaced keys stay smooth.
    const m1 = (p2[c] - p0[c]) / Math.max(1e-6, p2[0] - p0[0]) * span;
    const m2 = (p3[c] - p1[c]) / Math.max(1e-6, p3[0] - p1[0]) * span;
    return (2 * u3 - 3 * u2 + 1) * p1[c] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[c] + (u3 - u2) * m2;
  };
  return out.set(comp(1), comp(2), comp(3));
}

export type PoseKey = [number, Pose];

export function samplePose(keys: PoseKey[], t: number, ease: EaseName = "smooth"): Pose {
  if (keys.length === 1) return keys[0]![1];
  const { i, u } = locate(keys as unknown as number[][], t);
  return lerpPose(keys[i]![1], keys[i + 1]![1], EASE[ease](u));
}

/** Sum joint rotations of two poses (b scaled by k). */
export function addPose(a: Pose, b: Pose, k = 1): Pose {
  const out: Pose = {};
  for (const j of ["hips", "neck", "armR", "armL", "legR", "legL"] as const) {
    const x = a[j] ?? [0, 0, 0];
    const y = b[j] ?? [0, 0, 0];
    out[j] = [x[0] + y[0] * k, x[1] + y[1] * k, x[2] + y[2] * k];
  }
  out.lift = (a.lift ?? 0) + (b.lift ?? 0) * k;
  return out;
}
