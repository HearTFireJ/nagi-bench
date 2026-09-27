// Procedural Dust2 layout. The map is authored as rectangle paint operations on a
// 64x64 grid of 2m cells (x = column, z = row, north = row 0).
//
// Cell characters:
//   '#'  solid wall (5m)              '.'  floor (h=0)
//   'u'  floor with a roof (tunnels)  '-'  elevated floor (h=2)
//   'T'  T spawn floor                'K'  CT spawn floor
//   'A'  A bombsite plant zone (h=2)  'B'  B bombsite plant zone (h=0)
//   'D'  double door (mid doors), passable
//   '^' 'v' '<' '>'  ramp rising toward the arrow direction
//   'c'  crate h=1     'C' stacked crates h=2 (on ground)
//   'o'  crate h=3     'O' stacked crates h=4 (on elevated floor)

export const GRID_W = 64;
export const GRID_H = 64;
export const CELL = 2; // meters per cell
export const WALL_HEIGHT = 5;
export const ROOF_HEIGHT = 3.2;

export interface PaintOp {
  ch: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const R = (ch: string, x0: number, z0: number, x1: number, z1: number): PaintOp => ({ ch, x0, z0, x1, z1 });

export const PAINT_OPS: PaintOp[] = [
  // ---- B site (north-west) ----
  R('.', 3, 4, 16, 14),
  R('B', 6, 6, 12, 11),
  // ---- B doors corridor (CT spawn -> B) ----
  R('.', 17, 4, 34, 6),
  R('#', 24, 6, 25, 6), // B doors: single row doorway with door geometry
  R('#', 24, 4, 25, 4),
  R('D', 24, 5, 25, 5),
  // ---- CT spawn (north) ----
  R('K', 35, 2, 49, 9),
  // ---- CT mid + mid-to-B passage ----
  R('.', 30, 8, 34, 12),
  R('.', 31, 7, 32, 7),
  // ---- Mid doors ----
  R('D', 31, 13, 32, 13),
  // ---- Top mid / mid ----
  R('.', 29, 14, 35, 38),
  // ---- Outside mid / T ramp ----
  R('.', 28, 38, 35, 48),
  // ---- T spawn (south) ----
  R('T', 18, 49, 34, 61),
  // ---- Outside long ----
  R('.', 35, 50, 49, 55),
  // ---- Long doors (two doorways with a pillar) ----
  R('.', 50, 50, 51, 51),
  R('.', 50, 53, 51, 54),
  // ---- Long A ----
  R('.', 52, 26, 57, 54),
  // ---- A ramp (long -> site) ----
  R('^', 52, 23, 57, 25),
  // ---- A site (east, elevated) ----
  R('-', 46, 12, 58, 22),
  R('A', 50, 15, 55, 20),
  // ---- CT ramp (CT spawn -> A) ----
  R('v', 46, 9, 49, 11),
  // ---- Catwalk (mid -> short) ----
  R('>', 36, 26, 38, 28),
  R('-', 39, 26, 44, 28),
  // ---- Short ----
  R('-', 42, 14, 44, 28),
  R('-', 45, 15, 45, 18), // opening into A site
  // ---- Upper tunnels (T -> B) ----
  R('u', 8, 15, 11, 32),
  R('u', 8, 32, 15, 35),
  R('u', 12, 35, 15, 55),
  // ---- Outside tunnels ----
  R('.', 8, 52, 17, 55),
  // ---- Lower tunnels (mid -> tunnels) ----
  R('u', 16, 36, 28, 38),

  // ---- Crates ----
  // B site
  R('C', 4, 5, 5, 6),
  R('c', 13, 10, 14, 12),
  R('c', 9, 12, 10, 12),
  // CT spawn
  R('c', 40, 3, 41, 3),
  R('c', 47, 2, 48, 2),
  // Mid (xbox) & bottom mid
  R('C', 33, 24, 34, 25),
  R('c', 29, 32, 29, 33),
  // T spawn
  R('c', 20, 58, 21, 58),
  R('C', 32, 60, 33, 61),
  // Outside long
  R('c', 44, 52, 45, 52),
  R('c', 36, 55, 37, 55),
  // Long A
  R('c', 57, 44, 57, 45),
  R('c', 52, 30, 52, 30),
  // A site (elevated)
  R('o', 56, 13, 57, 13),
  R('o', 50, 21, 51, 21),
  R('O', 57, 21, 58, 22),
  R('o', 47, 19, 48, 20),
  R('o', 53, 12, 54, 12),
  // Short
  R('o', 43, 20, 43, 20),
  // Tunnels
  R('c', 9, 25, 9, 25),
  R('c', 15, 45, 15, 45),
  R('c', 12, 53, 12, 53),
  R('c', 22, 36, 22, 36),
  // CT mid
  R('c', 30, 10, 30, 10),
];

/** Build the raw character grid from the paint ops. */
export function buildRawGrid(): string[][] {
  const g: string[][] = [];
  for (let z = 0; z < GRID_H; z++) {
    const row: string[] = [];
    for (let x = 0; x < GRID_W; x++) row.push('#');
    g.push(row);
  }
  for (const op of PAINT_OPS) {
    for (let z = op.z0; z <= op.z1; z++) {
      for (let x = op.x0; x <= op.x1; x++) {
        if (x >= 0 && x < GRID_W && z >= 0 && z < GRID_H) g[z][x] = op.ch;
      }
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Named positions for spawns, AI and minimap labels (cell coordinates).
// ---------------------------------------------------------------------------

export interface CellPos {
  x: number;
  z: number;
}

export const T_SPAWNS: CellPos[] = [
  { x: 22, z: 57 },
  { x: 25, z: 58 },
  { x: 28, z: 57 },
  { x: 24, z: 55 },
  { x: 27, z: 54 },
  { x: 30, z: 55 },
  { x: 20, z: 54 },
  { x: 31, z: 58 },
  { x: 23, z: 60 },
  { x: 29, z: 60 },
];

export const CT_SPAWNS: CellPos[] = [
  { x: 38, z: 5 },
  { x: 41, z: 6 },
  { x: 44, z: 5 },
  { x: 39, z: 8 },
  { x: 43, z: 8 },
  { x: 46, z: 6 },
  { x: 37, z: 3 },
  { x: 45, z: 3 },
  { x: 41, z: 4 },
  { x: 48, z: 8 },
];

export interface HoldSpot {
  x: number;
  z: number;
  lookX: number;
  lookZ: number;
  site: 'A' | 'B' | 'MID';
}

/** Defensive positions used by the CT side (and by T after planting). */
export const CT_HOLD_SPOTS: HoldSpot[] = [
  { x: 48, z: 14, lookX: 54, lookZ: 25, site: 'A' },
  { x: 56, z: 14, lookX: 45, lookZ: 17, site: 'A' },
  { x: 49, z: 13, lookX: 55, lookZ: 25, site: 'A' },
  { x: 5, z: 7, lookX: 10, lookZ: 15, site: 'B' },
  { x: 14, z: 7, lookX: 9, lookZ: 15, site: 'B' },
  { x: 12, z: 5, lookX: 9, lookZ: 14, site: 'B' },
  { x: 32, z: 10, lookX: 32, lookZ: 30, site: 'MID' },
  { x: 41, z: 27, lookX: 34, lookZ: 27, site: 'MID' },
];

export const T_POST_PLANT_SPOTS: HoldSpot[] = [
  { x: 57, z: 14, lookX: 52, lookZ: 24, site: 'A' },
  { x: 47, z: 13, lookX: 45, lookZ: 17, site: 'A' },
  { x: 56, z: 20, lookX: 48, lookZ: 11, site: 'A' },
  { x: 4, z: 12, lookX: 10, lookZ: 14, site: 'B' },
  { x: 15, z: 5, lookX: 17, lookZ: 5, site: 'B' },
  { x: 10, z: 13, lookX: 12, lookZ: 4, site: 'B' },
];

export const PLANT_SPOTS: Record<'A' | 'B', CellPos[]> = {
  A: [
    { x: 52, z: 17 },
    { x: 54, z: 18 },
    { x: 51, z: 19 },
  ],
  B: [
    { x: 8, z: 8 },
    { x: 10, z: 9 },
    { x: 11, z: 7 },
  ],
};

/** Intermediate waypoints so the T side spreads over different routes. */
export const T_ROUTES: Record<'A' | 'B', CellPos[][]> = {
  A: [
    [{ x: 42, z: 52 }, { x: 55, z: 46 }, { x: 55, z: 30 }], // long
    [{ x: 32, z: 30 }, { x: 41, z: 27 }, { x: 43, z: 17 }], // catwalk / short
  ],
  B: [
    [{ x: 13, z: 50 }, { x: 10, z: 30 }, { x: 10, z: 16 }], // upper tunnels
    [{ x: 32, z: 40 }, { x: 22, z: 37 }, { x: 10, z: 24 }], // mid -> lower tunnels
  ],
};

/** Free roam / hunt spots. */
export const ROAM_SPOTS: CellPos[] = [
  { x: 55, z: 40 },
  { x: 48, z: 52 },
  { x: 40, z: 27 },
  { x: 43, z: 18 },
  { x: 10, z: 20 },
  { x: 13, z: 45 },
  { x: 22, z: 37 },
  { x: 32, z: 30 },
  { x: 31, z: 44 },
  { x: 42, z: 5 },
  { x: 25, z: 5 },
  { x: 8, z: 8 },
  { x: 53, z: 17 },
  { x: 32, z: 10 },
];

export interface MapLabel {
  x: number;
  z: number;
  text: string;
}

export const MAP_LABELS: MapLabel[] = [
  { x: 9, z: 9, text: 'B' },
  { x: 52, z: 17, text: 'A' },
  { x: 42, z: 5, text: 'CT' },
  { x: 26, z: 55, text: 'T' },
  { x: 32, z: 26, text: 'MID' },
  { x: 55, z: 40, text: 'LONG' },
  { x: 41, z: 27, text: 'CAT' },
  { x: 10, z: 24, text: 'TUN' },
  { x: 32, z: 13, text: 'DOORS' },
];

export interface ZoneRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Larger site regions used for AI reasoning ("enemy seen at A"). */
export const SITE_REGIONS: Record<'A' | 'B', ZoneRect> = {
  A: { x0: 46, z0: 12, x1: 58, z1: 25 },
  B: { x0: 3, z0: 4, x1: 16, z1: 16 },
};
