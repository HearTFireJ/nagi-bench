import type { LightPreset } from "../direction/rig";
import type { Ctx } from "../direction/ctx";
import type { V3 } from "../util/math";

/** Shared blocking marks in the collector's house. */
export const TEA = { A: [0.85, 0, -0.5] as V3, B: [2.55, 0, -0.5] as V3, table: [1.7, 0.54, -0.5] as V3 };

export function hutongLight(_t?: number, _lt?: number, c?: Ctx): LightPreset {
  const lantern = c ? c.w.hutong.lanternPos : { x: 2.55, y: 2.45, z: 16.9 };
  return {
    bg: 0x2a2f5a,
    exposure: 1.0,
    fog: { color: 0x4a4468, density: 0.011 },
    hemi: [0x8592c8, 0x3c3230, 1.35],
    sun: { color: 0xff9a5a, intensity: 1.9, from: [-30, 10, 8], to: [0, 0, 12], box: 22 },
    points: [
      { color: 0xff6a2a, intensity: 14, pos: [lantern.x, lantern.y, lantern.z], distance: 14 },
      { color: 0xffd08a, intensity: 7, pos: [-2.55, 2.3, 8.5], distance: 10 },
    ],
  };
}

export interface RoomLightOpts {
  lamp?: number;
  warm?: number;
  cab?: V3;
  cabI?: number;
  win?: V3;
  winI?: number;
  fill?: number;
  exposure?: number;
  warmPos?: V3;
}

export function roomLight(c: Ctx, o: RoomLightOpts = {}): LightPreset {
  const r = c.w.room;
  return {
    bg: 0x0b0906,
    exposure: o.exposure ?? 1.05,
    fog: { color: 0x1a120c, density: 0.01 },
    hemi: [0xb59f80, 0x3a2a1c, 0.7 * (o.fill ?? 1)],
    spot: {
      color: 0xffc27a, intensity: 55 * (o.lamp ?? 1),
      pos: [r.lampPos.x, r.lampPos.y, r.lampPos.z], target: [r.felt.x, r.benchTop, r.felt.z],
      angle: 0.95, penumbra: 0.7, distance: 9,
    },
    points: [
      { color: 0xbfd8ff, intensity: 5.5 * (o.cabI ?? 1), pos: o.cab ?? [-0.5, 1.7, -2.5], distance: 7 },
      { color: 0x86a0ff, intensity: 5 * (o.winI ?? 1), pos: o.win ?? [3.5, 1.8, -0.6], distance: 6 },
      { color: 0xffd6a8, intensity: 5.5 * (o.warm ?? 1), pos: o.warmPos ?? [0.2, 2.9, 0.4], distance: 9 },
    ],
  };
}
