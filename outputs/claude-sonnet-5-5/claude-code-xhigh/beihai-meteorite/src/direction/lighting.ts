import type { LightPreset } from "./rig";
import { sunDirection, sunHeight } from "../world/space";
import { clamp, mix, seg, smooth, type V3 } from "../util/math";

/**
 * Orbital light: one hard sun that reddens and dies as it sinks behind the limb,
 * and a cold blue fill thrown up by the Earth below.
 */
export function sunColour(h: number): number {
  if (h > 2.4) return 0xfff3de;
  if (h > 0.6) return mix(0xffc48a, 0xfff3de, seg(h, 0.6, 2.4));
  return mix(0xff9558, 0xffc994, seg(h, -0.6, 0.6));
}

export function spaceLight(
  t: number,
  o: { target?: V3; box?: number; sun?: number; fill?: number; exposure?: number; bg?: number } = {},
): LightPreset {
  const h = sunHeight(t);
  const dir = sunDirection(t);
  const strength = smooth(clamp((h + 1.06) / 0.62)) * (o.sun ?? 1);
  const target = o.target ?? [0, 0, 0];
  const d = 220;
  return {
    bg: o.bg ?? 0x010208,
    exposure: o.exposure ?? 1,
    hemi: [0x0b1428, 0x3a72c8, (o.fill ?? 1) * (0.55 + 0.35 * (1 - strength))],
    sun: {
      color: sunColour(h),
      intensity: 5.0 * strength,
      from: [target[0] + dir.x * d, target[1] + dir.y * d, target[2] + dir.z * d],
      to: target,
      box: o.box ?? 14,
    },
  };
}
