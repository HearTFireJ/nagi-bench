// 表演姿态：在 Voxel Kit 的固定骨架上，用关节欧拉角组合出“表演”。
// 约定：人物面向 +Z；armR 在 -X 侧；arm/leg 的 x 旋转为负 = 向前抬；hips.x 为正 = 躯干前倾（同时带动双腿，需反向补偿）。
import { lerpPose, idle, walk, aim, float, type Pose, type Euler3 } from "@agentbench/voxel-kit";
import { clamp, smooth } from "../util/math";

export { lerpPose, idle, walk, aim, float };
export type { Pose, Euler3 };

const Z: Euler3 = [0, 0, 0];

export function addE(a: Euler3 | undefined, b: Euler3 | undefined): Euler3 {
  const x = a ?? Z;
  const y = b ?? Z;
  return [x[0] + y[0], x[1] + y[1], x[2] + y[2]];
}
/** 逐关节相加（用于把呼吸/微动叠加在动作上） */
export function addPose(a: Pose, b: Pose): Pose {
  return {
    hips: addE(a.hips, b.hips),
    neck: addE(a.neck, b.neck),
    armR: addE(a.armR, b.armR),
    armL: addE(a.armL, b.armL),
    legR: addE(a.legR, b.legR),
    legL: addE(a.legL, b.legL),
    lift: (a.lift ?? 0) + (b.lift ?? 0),
  };
}

/** 站姿：可选前倾（腿保持竖直）、低头 */
export function stand(lean = 0, headDown = 0, turnHead = 0): Pose {
  return {
    hips: [lean, 0, 0],
    neck: [headDown - lean * 0.35, turnHead, 0],
    legR: [-lean, 0, 0],
    legL: [-lean, 0, 0],
    armR: [0, 0, 0.05],
    armL: [0, 0, -0.05],
  };
}

/** 呼吸：很小的正弦，用于任何静止姿态 */
export function breathe(t: number, amt = 1, rate = 1.5): Pose {
  const b = Math.sin(t * rate);
  return {
    neck: [b * 0.015 * amt, 0, 0],
    armR: [b * 0.02 * amt, 0, 0],
    armL: [-b * 0.02 * amt, 0, 0],
    lift: b * 0.06 * amt,
  };
}

/** 行走（较慢、有分量），moving=0 时回到站姿 */
export function stride(t: number, moving: number, speed = 1.05): Pose {
  return lerpPose(idle(t), walk(t, speed), smooth(moving));
}

/** 双手在身前捧物（低），略前倾 */
export function holdFront(lean = 0.1, height = -0.9): Pose {
  return {
    hips: [lean, 0, 0],
    neck: [0.1 - lean * 0.35, 0, 0],
    legR: [-lean, 0, 0],
    legL: [-lean, 0, 0],
    armR: [height, 0, -0.25],
    armL: [height, 0, 0.25],
  };
}

/** 伏案：身体前倾，双臂向前下方撑在台面 */
export function overBench(lean = 0.5, armPitch = -1.1): Pose {
  return {
    hips: [lean, 0, 0],
    neck: [0.25 - lean * 0.2, 0, 0],
    legR: [-lean, 0, 0],
    legL: [-lean, 0, 0],
    armR: [armPitch, 0, -0.12],
    armL: [armPitch, 0, 0.12],
  };
}

/** 单臂向前举（指点/递物/端杯） */
export function armForward(side: "R" | "L", pitch = -1.3, spread = 0.1): Partial<Pose> {
  return side === "R" ? { armR: [pitch, 0, -spread] } : { armL: [pitch, 0, spread] };
}

/** 把多个“部分姿态”合成一个完整姿态：后者覆盖前者 */
export function compose(...parts: Array<Partial<Pose>>): Pose {
  const out: Pose = {};
  for (const p of parts) Object.assign(out, p);
  return out;
}

/** 大笑：肩膀抖动、头后仰 */
export function laugh(t: number, strength = 1): Pose {
  const s = Math.sin(t * 22) * 0.04 * strength;
  return {
    hips: [-0.06 * strength, 0, 0],
    neck: [-0.25 * strength + s, 0, 0],
    armR: [-0.1 + s, 0, 0.1],
    armL: [-0.1 - s, 0, -0.1],
    legR: [0.06 * strength, 0, 0],
    legL: [0.06 * strength, 0, 0],
    lift: Math.abs(s) * 2,
  };
}

/** 失重悬浮（在 kit 的 float 上叠加朝向控制）：yawRoll 让身体前倾/侧倾 */
export function drift(t: number, seed = 0, tilt = 0): Pose {
  const f = float(t + seed * 3.7);
  return { ...f, hips: [(f.hips?.[0] ?? 0) + tilt, f.hips?.[1] ?? 0, f.hips?.[2] ?? 0] };
}

/** 失重中“站立式”漂浮（合影用）：微微前倾、手臂自然垂向身体，随时间轻摆 */
export function floatUpright(t: number, seed = 0): Pose {
  const a = t * 0.55 + seed * 2.1;
  return {
    hips: [-0.04 + Math.sin(a) * 0.03, Math.sin(a * 0.6) * 0.05, Math.sin(a * 0.8) * 0.03],
    neck: [0.02, Math.sin(a * 0.7 + 1) * 0.06, 0],
    armR: [0.1 + Math.sin(a + 1) * 0.08, 0, 0.16],
    armL: [0.1 + Math.sin(a + 2.3) * 0.08, 0, -0.16],
    legR: [-0.08 + Math.sin(a + 0.4) * 0.05, 0, 0.05],
    legL: [-0.03 + Math.sin(a + 1.7) * 0.05, 0, -0.05],
    lift: Math.sin(a * 0.9) * 0.3,
  };
}

/** 挥手 / 举手示意 */
export function wave(t: number, side: "R" | "L" = "R", speed = 6): Partial<Pose> {
  const sw = Math.sin(t * speed) * 0.3;
  return side === "R" ? { armR: [-0.3, 0, -2.5 + sw] } : { armL: [-0.3, 0, 2.5 - sw] };
}

/** 抱头/惊恐：双臂上举内收 */
export function panic(t: number, seed = 0): Pose {
  const s = Math.sin(t * 9 + seed) * 0.25;
  return {
    hips: [0.1, 0, 0],
    neck: [-0.2, 0, 0],
    armR: [-2.6 + s, 0, -0.6],
    armL: [-2.4 - s, 0, 0.6],
    legR: [-0.5 + s, 0, 0.1],
    legL: [-0.3 - s, 0, -0.1],
  };
}

/** 全速推进器返航：身体水平，双腿并拢，手臂后掠 */
export function thrust(t: number, seed = 0): Pose {
  const s = Math.sin(t * 3 + seed) * 0.05;
  return {
    hips: [1.35 + s, 0, 0],
    neck: [-0.9, 0, 0],
    armR: [0.2, 0, 0.15],
    armL: [0.2, 0, -0.15],
    legR: [-0.1, 0, 0.04],
    legL: [-0.1, 0, -0.04],
  };
}

export const ease = smooth;
export const clampPose = clamp;
