import type { Vec2 } from '../math.ts';

export type Team = 'CT' | 'T';

export type BoxKind = 'floor' | 'wall' | 'roof' | 'lintel' | 'crate' | 'door';

/** Static solid axis-aligned box. */
export interface BoxDef {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  kind: BoxKind;
  /** Palette index for floor/wall/roof, material name for crates. */
  style: number;
  mat?: CrateMat;
}

export type CrateMat = 'wood' | 'containerBlue' | 'containerGreen' | 'metal' | 'car' | 'doorWood';

/** Axis-aligned ramp: surface height interpolates along `axis` from hFrom (min side) to hTo (max side). */
export interface RampDef {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  axis: 'x' | 'z';
  hFrom: number;
  hTo: number;
  style: number;
}

/** Sliding double door. The gap rectangle is walkable floor; leaves slide sideways into the wall. */
export interface DoorDef {
  id: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Axis along which the leaves slide (= long side of the gap). */
  slide: 'x' | 'z';
  floorY: number;
  height: number;
  triggerRadius: number;
}

export interface ZoneDef {
  id: string;
  /** Chinese callout name shown in the HUD. */
  name: string;
  /** Short label for the minimap. */
  label: string;
  rects: [number, number, number, number][];
}

export interface SpawnPoint {
  x: number;
  z: number;
  yaw: number;
}

export interface SiteDef {
  id: 'A' | 'B';
  name: string;
  /** Rectangle inside which C4 may be planted. */
  plantRect: [number, number, number, number];
  /** Preferred plant spots for bots. */
  plantSpots: Vec2[];
  /** Positions T bots hold after planting. */
  guardSpots: Vec2[];
  /** Positions CT bots hold while defending the site. */
  defendSpots: Vec2[];
  center: Vec2;
}

export interface MapData {
  name: string;
  width: number;
  depth: number;
  cols: number;
  rows: number;
  /** Floor height per 1m cell; NaN = solid. */
  terrain: Float32Array;
  styleGrid: Uint8Array;
  boxes: BoxDef[];
  ramps: RampDef[];
  doors: DoorDef[];
  zones: ZoneDef[];
  anchors: Record<string, Vec2>;
  spawns: Record<Team, SpawnPoint[]>;
  sites: Record<'A' | 'B', SiteDef>;
  /** Routes are ordered anchor names. */
  routes: Record<string, string[]>;
}
