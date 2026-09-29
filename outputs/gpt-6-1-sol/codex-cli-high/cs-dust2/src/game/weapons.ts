import type { HitZone, WeaponId } from "./types";
export interface WeaponDef {
  name: string;
  short: string;
  slot: number;
  damage: number;
  magazine: number;
  reserve: number;
  interval: number;
  reload: number;
  spread: number;
  recoil: number;
  auto: boolean;
  range: number;
  color: number;
}
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  ak: {
    name: "AK-47",
    short: "AK",
    slot: 0,
    damage: 42,
    magazine: 30,
    reserve: 90,
    interval: 0.105,
    reload: 2.4,
    spread: 0.007,
    recoil: 0.024,
    auto: true,
    range: 110,
    color: 0x95613b,
  },
  m4: {
    name: "M4A4",
    short: "M4",
    slot: 0,
    damage: 34,
    magazine: 30,
    reserve: 90,
    interval: 0.085,
    reload: 2.2,
    spread: 0.004,
    recoil: 0.012,
    auto: true,
    range: 110,
    color: 0x343d3d,
  },
  awp: {
    name: "AWP",
    short: "AWP",
    slot: 0,
    damage: 150,
    magazine: 5,
    reserve: 25,
    interval: 1.5,
    reload: 3.2,
    spread: 0.028,
    recoil: 0.042,
    auto: false,
    range: 160,
    color: 0x596442,
  },
  glock: {
    name: "Glock-18",
    short: "G18",
    slot: 1,
    damage: 24,
    magazine: 20,
    reserve: 100,
    interval: 0.18,
    reload: 1.9,
    spread: 0.009,
    recoil: 0.012,
    auto: false,
    range: 65,
    color: 0x30383a,
  },
  usp: {
    name: "USP-S",
    short: "USP",
    slot: 1,
    damage: 27,
    magazine: 12,
    reserve: 72,
    interval: 0.2,
    reload: 2,
    spread: 0.006,
    recoil: 0.011,
    auto: false,
    range: 75,
    color: 0x30383a,
  },
  deagle: {
    name: "Desert Eagle",
    short: "DEAGLE",
    slot: 1,
    damage: 31,
    magazine: 7,
    reserve: 35,
    interval: 0.32,
    reload: 2.2,
    spread: 0.008,
    recoil: 0.032,
    auto: false,
    range: 85,
    color: 0xa2a6a0,
  },
  knife: {
    name: "战术匕首",
    short: "KNIFE",
    slot: 2,
    damage: 55,
    magazine: 0,
    reserve: 0,
    interval: 0.55,
    reload: 0,
    spread: 0,
    recoil: 0.008,
    auto: false,
    range: 2.6,
    color: 0xb7c3bd,
  },
};
export const ZONE_MULTIPLIER: Record<HitZone, number> = {
  head: 2,
  chest: 1,
  abdomen: 1.1,
  arm: 0.7,
  leg: 0.6,
};
export function calculateDamage(
  id: WeaponId,
  zone: HitZone,
  armor: number,
): { health: number; armor: number } {
  const raw = WEAPONS[id].damage * ZONE_MULTIPLIER[zone];
  const absorbed =
    id === "knife" || zone === "leg" ? 0 : Math.min(armor, raw * 0.3);
  return { health: Math.round(raw - absorbed), armor: Math.ceil(absorbed) };
}
