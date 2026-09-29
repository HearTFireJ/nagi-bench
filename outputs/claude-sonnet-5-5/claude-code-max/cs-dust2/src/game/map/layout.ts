// Authoring data for the Dust2 layout. Coordinates are metres, x = east, z = south (north is the top of the radar).
//
// The map is authored as a union of walkable rectangles ("regions") with a floor height. `build.ts` rasterises them on
// a 0.5 m grid and extrudes every non-walkable cell that touches walkable space into a wall column, so the level is
// sealed by construction and connectivity is exactly what is drawn here. Crates, doors and named anchors are layered on
// top. Heights: ground 0, A site plateau +1.6 (reached by the long ramp, short stairs and CT ramp).
import type { SiteId } from '../types';

export type Material = 'sand' | 'stone' | 'wood' | 'metal';

export interface RampSpec {
  axis: 'x' | 'z';
  /** Height at the low-coordinate edge of the region. */
  from: number;
  /** Height at the high-coordinate edge. */
  to: number;
}

export interface Region {
  zone: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  h: number;
  mat: Material;
  ramp?: RampSpec;
  /** Ceiling height above the floor (tunnels). */
  roof?: number;
}

export interface ZoneInfo {
  id: string;
  /** Callout shown in the HUD (Chinese, as used in the CS community). */
  name: string;
  en: string;
}

export interface CrateDef {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  height: number;
  mat: 'wood' | 'metal' | 'stone';
  /** Extra elevation (stacked crates). */
  lift?: number;
}

export interface DoorDef {
  id: number;
  name: string;
  /** Door plane centre. Leaves slide along `axis` into the flanking walls. */
  x: number;
  z: number;
  axis: 'x' | 'z';
  width: number;
  height: number;
  thickness: number;
}

export interface SiteDef {
  id: SiteId;
  name: string;
  x: number;
  z: number;
  radius: number;
}

export interface SpawnPoint {
  x: number;
  z: number;
  yaw: number;
}

export const ZONES: ZoneInfo[] = [
  { id: 'T_SPAWN', name: 'T出生点', en: 'T Spawn' },
  { id: 'CT_SPAWN', name: 'CT出生点', en: 'CT Spawn' },
  { id: 'A_LONG', name: 'A大', en: 'Long A' },
  { id: 'A_SITE', name: 'A点', en: 'A Site' },
  { id: 'MID_DOORS', name: '中门', en: 'Mid Doors' },
  { id: 'CATWALK', name: '猫道', en: 'Catwalk' },
  { id: 'B_TUNNELS', name: 'B洞', en: 'B Tunnels' },
  { id: 'B_SITE', name: 'B点', en: 'B Site' },
  { id: 'LONG_DOORS', name: '大门', en: 'Long Doors' },
  { id: 'OUTSIDE_LONG', name: 'A大外', en: 'Outside Long' },
  { id: 'MID', name: '中路', en: 'Mid' },
  { id: 'LOWER_MID', name: '中路下', en: 'Lower Mid' },
  { id: 'TOP_MID', name: '中路上', en: 'Top Mid' },
  { id: 'T_RAMP', name: 'T坡', en: 'T Ramp' },
  { id: 'CT_MID', name: 'CT中路', en: 'CT Mid' },
  { id: 'CT_RAMP', name: 'CT坡', en: 'CT Ramp' },
  { id: 'B_DOORS', name: 'B门', en: 'B Doors' },
  { id: 'MID_TO_B', name: '中转B', en: 'Mid to B' },
  { id: 'TUNNEL_COURT', name: 'B洞外', en: 'Outside Tunnels' },
];

export const BOUNDS = { minX: 0, minZ: 0, maxX: 108, maxZ: 104 };
export const CELL = 0.5;
export const WALL_SHELL_CELLS = 2;
export const DEFAULT_WALL_HEIGHT = 6.5;
export const PLATEAU = 1.6;
export const STAIR_RISE = 0.2;

const r = (zone: string, x0: number, z0: number, x1: number, z1: number, extra: Partial<Region> = {}): Region => ({
  zone,
  x0,
  z0,
  x1,
  z1,
  h: 0,
  mat: 'sand',
  ...extra,
});

export const REGIONS: Region[] = [
  // ------------------------------------------------------------------ T side
  r('T_SPAWN', 42, 84, 68, 98),
  r('T_SPAWN', 68, 88, 72, 94), // east exit toward Outside Long
  r('T_SPAWN', 40, 88, 42, 94), // west exit toward the tunnel courtyard
  r('OUTSIDE_LONG', 72, 82, 100, 98),
  r('TUNNEL_COURT', 24, 80, 40, 98),
  r('T_RAMP', 49, 76, 60, 84),

  // ------------------------------------------------------------------ Mid
  r('LOWER_MID', 44, 62, 62, 76),
  r('MID', 47, 46, 58, 62),
  r('TOP_MID', 44, 36, 60, 46),
  r('MID_DOORS', 50, 30, 55, 36, { mat: 'stone' }),
  r('CT_MID', 44, 22, 62, 30),

  // ------------------------------------------------------------------ CT
  r('CT_SPAWN', 42, 6, 70, 22),

  // ------------------------------------------------------------------ A side (plateau +1.6)
  r('CT_RAMP', 68, 12, 74, 20, { ramp: { axis: 'x', from: 0, to: PLATEAU } }),
  r('A_SITE', 74, 6, 100, 32, { h: PLATEAU, mat: 'stone' }),
  r('CATWALK', 60, 42, 74, 48),
  r('CATWALK', 74, 42, 82, 48),
  r('CATWALK', 74, 32, 82, 42, { ramp: { axis: 'z', from: PLATEAU, to: 0 } }), // short stairs up to A
  r('A_LONG', 88, 32, 100, 44, { ramp: { axis: 'z', from: PLATEAU, to: 0 } }), // long ramp up to A
  r('A_LONG', 88, 44, 100, 74),
  r('LONG_DOORS', 90, 74, 98, 82, { mat: 'stone' }),

  // ------------------------------------------------------------------ B side
  r('B_SITE', 6, 6, 34, 32, { mat: 'stone' }),
  r('B_DOORS', 34, 12, 42, 20, { mat: 'stone' }),
  r('MID_TO_B', 34, 38, 44, 46),
  r('MID_TO_B', 28, 32, 36, 46),
  r('B_TUNNELS', 12, 32, 18, 52, { roof: 4.6, mat: 'stone' }),
  // The upper tunnel is offset 10 m east of the exit so the two legs never line up into one long sight line.
  r('B_TUNNELS', 12, 50, 28, 58, { roof: 4.6, mat: 'stone' }),
  r('B_TUNNELS', 22, 56, 28, 84, { roof: 4.6, mat: 'stone' }),
];

export const DOORS: DoorDef[] = [
  // The Mid Doors: a pair of sliding leaves that open when anybody approaches.
  { id: 0, name: 'MID_DOORS', x: 52.5, z: 33, axis: 'x', width: 5, height: 3.4, thickness: 0.4 },
];

/** Non-sliding door frames (a header over the doorway so they read as doors). */
export const DOOR_HEADERS: { x0: number; z0: number; x1: number; z1: number; y: number }[] = [
  { x0: 90, z0: 77.6, x1: 98, z1: 78.4, y: 3.8 }, // Long Doors
  { x0: 34, z0: 15.6, x1: 42, z1: 16.4, y: 3.6 }, // B Doors
];

export const CRATES: CrateDef[] = [
  // A site
  { x0: 88, z0: 15, x1: 91, z1: 18, height: 1.4, mat: 'wood' },
  { x0: 88.4, z0: 15.4, x1: 90.6, z1: 17.6, height: 1.2, mat: 'wood', lift: 1.4 },
  { x0: 96, z0: 6, x1: 100, z1: 10, height: 1.8, mat: 'wood' },
  { x0: 75, z0: 26, x1: 78, z1: 30, height: 1.4, mat: 'wood' },
  { x0: 82, z0: 8, x1: 85, z1: 12, height: 1.2, mat: 'metal' },
  { x0: 92, z0: 24, x1: 96, z1: 27, height: 1.5, mat: 'metal' },
  // Long A: two staggered containers form a chicane, so nobody can see from the doors all the way up to A site.
  { x0: 90, z0: 54, x1: 93, z1: 58, height: 1.5, mat: 'metal' },
  { x0: 88, z0: 50, x1: 95, z1: 53, height: 3, mat: 'metal' },
  { x0: 93, z0: 59, x1: 100, z1: 62, height: 3, mat: 'metal' },
  { x0: 88, z0: 46, x1: 90, z1: 49, height: 1.4, mat: 'wood' },
  // Outside long
  { x0: 80, z0: 90, x1: 83, z1: 93, height: 1.4, mat: 'wood' },
  { x0: 90, z0: 85, x1: 92, z1: 87, height: 1.2, mat: 'wood' },
  // Mid
  { x0: 50, z0: 52, x1: 52.5, z1: 54.5, height: 1.4, mat: 'metal' },
  { x0: 47, z0: 66, x1: 49, z1: 69, height: 1.4, mat: 'wood' },
  { x0: 57, z0: 70, x1: 59, z1: 72, height: 1.2, mat: 'wood' },
  { x0: 51, z0: 39, x1: 53, z1: 41, height: 6, mat: 'stone' },
  // Screens in the spawns: without them B doors -> CT spawn -> CT ramp (and the T spawn exits) form 90 m sight lines.
  { x0: 53, z0: 11, x1: 56, z1: 21, height: 5, mat: 'stone' },
  { x0: 55, z0: 87, x1: 58, z1: 95, height: 4, mat: 'stone' },
  // T spawn / CT spawn edges
  { x0: 44, z0: 94, x1: 46, z1: 97, height: 1.4, mat: 'wood' },
  { x0: 65, z0: 94, x1: 67, z1: 97, height: 1.4, mat: 'wood' },
  { x0: 64, z0: 7, x1: 67, z1: 10, height: 1.4, mat: 'wood' },
  { x0: 44, z0: 7, x1: 46, z1: 10, height: 1.4, mat: 'wood' },
  // B site
  { x0: 17, z0: 15, x1: 21, z1: 19, height: 1.8, mat: 'wood' },
  { x0: 21, z0: 15, x1: 23.5, z1: 17.5, height: 1.2, mat: 'wood' },
  { x0: 6, z0: 6, x1: 13, z1: 11, height: 1.6, mat: 'wood' },
  { x0: 28, z0: 8, x1: 31, z1: 12, height: 1.4, mat: 'wood' },
  { x0: 6, z0: 24, x1: 9, z1: 30, height: 2.4, mat: 'metal' },
  { x0: 14, z0: 26, x1: 17, z1: 29, height: 1.4, mat: 'wood' },
  // Tunnels / courtyard / mid-to-B
  { x0: 22, z0: 66, x1: 24, z1: 69, height: 1.2, mat: 'wood' },
  { x0: 30, z0: 90, x1: 33, z1: 93, height: 1.4, mat: 'wood' },
  { x0: 38, z0: 40, x1: 40, z1: 42, height: 1.2, mat: 'wood' },
];

export const SITES: SiteDef[] = [
  { id: 'A', name: 'A点', x: 87, z: 19, radius: 9 },
  { id: 'B', name: 'B点', x: 20, z: 19, radius: 9 },
];

export const T_SPAWNS: SpawnPoint[] = [
  { x: 47, z: 89, yaw: 0 },
  { x: 47.5, z: 93.5, yaw: 0 },
  { x: 51, z: 91.5, yaw: 0 },
  { x: 62, z: 89, yaw: 0 },
  { x: 63, z: 93.5, yaw: 0 },
];

export const CT_SPAWNS: SpawnPoint[] = [
  { x: 47, z: 12.5, yaw: Math.PI },
  { x: 50, z: 8, yaw: Math.PI },
  { x: 50, z: 18, yaw: Math.PI },
  { x: 60, z: 8, yaw: Math.PI },
  { x: 62, z: 17, yaw: Math.PI },
];

/** Named waypoints used by the AI planner (all are snapped to the nearest walkable nav cell at load). */
export const ANCHORS: Record<string, { x: number; z: number }> = {
  T_SPAWN: { x: 55, z: 89 },
  T_EAST_EXIT: { x: 71, z: 91 },
  OUTSIDE_LONG: { x: 86, z: 89 },
  LONG_DOORS: { x: 94, z: 78 },
  LONG_MID: { x: 94, z: 62 },
  LONG_CORNER: { x: 94, z: 47 },
  LONG_TOP: { x: 94, z: 36 },
  A_SITE: { x: 87, z: 21 },
  A_PLANT: { x: 87, z: 21 },
  A_BACK: { x: 92, z: 12 },
  A_RAMP_TOP: { x: 77, z: 16 },
  SHORT_TOP: { x: 78, z: 30 },
  SHORT_BOTTOM: { x: 78, z: 44 },
  CATWALK: { x: 66, z: 45 },
  T_RAMP: { x: 54, z: 79 },
  LOWER_MID: { x: 53, z: 69 },
  MID: { x: 52, z: 56 },
  TOP_MID: { x: 52, z: 43 },
  MID_DOORS_T: { x: 52.5, z: 37.5 },
  MID_DOORS_CT: { x: 52.5, z: 27 },
  CT_SPAWN: { x: 56, z: 14 },
  CT_RAMP: { x: 70, z: 16 },
  B_DOORS: { x: 38, z: 16 },
  B_DOORS_CT: { x: 44, z: 16 },
  MID_TO_B: { x: 40, z: 42 },
  MID_TO_B_TURN: { x: 32, z: 40 },
  B_SITE: { x: 20, z: 21 },
  B_PLANT: { x: 20, z: 21 },
  B_BACK: { x: 10, z: 16 },
  B_WINDOW: { x: 30, z: 22 },
  B_TUNNEL_EXIT: { x: 15, z: 38 },
  B_TUNNEL_LOWER: { x: 17, z: 54 },
  B_TUNNEL_UPPER: { x: 25, z: 70 },
  TUNNEL_COURT: { x: 32, z: 88 },
};
