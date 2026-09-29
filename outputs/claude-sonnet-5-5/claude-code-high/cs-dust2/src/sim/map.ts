// Dust2 layout data. Everything is authored as axis-aligned rectangles on a 1 m grid
// (x -> east, z -> south, so "north" / CT side is small z). The wall geometry, the
// navigation grid, the minimap and the renderer are all derived from this one file.
//
//                       B site            CT spawn           A site
//                    ┌─────────┐   ┌───────────────┐   ┌────────────┐
//        B tunnels ──┤  B点    ├───┤   CT出生点    ├───┤    A点     ├── A大坑
//                    └────┬────┘   └───────┬───────┘   └──┬──────┬──┘
//                         │  B门     ┌─────┴─────┐  猫道   │      │
//                         │          │ CT中路    │────────┘      │ A大
//                         │          └───┬───┬───┘               │
//                         │            中门  │                    │
//       下隧道 ────────────┼───────────中路──┘                    │
//                         │            │                         │
//        上隧道 ── T出生点 ──┴────────────┴──── 外大 ── 大门 ───────┘

import type { Vec3 } from './math.ts';

export const GRID_W = 112;
export const GRID_H = 112;
export const WALL_H = 6;

export type Team = 'CT' | 'T';

export interface AreaDef {
  id: string;
  name: string;
  /** half-open [x0,x1) x [z0,z1) in meters */
  rect: [number, number, number, number];
  /** base floor tint for the renderer */
  tint: number;
}

export interface CrateDef {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  kind: 'crate' | 'container' | 'car' | 'platform';
}

export interface DoorLeafDef {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** direction the leaf slides when opening (into the wall) */
  slide: { x: number; z: number };
}

export interface DoorDef {
  id: string;
  name: string;
  cx: number;
  cz: number;
  /** open when any living actor is within this many meters of (cx,cz) */
  trigger: number;
  leaves: DoorLeafDef[];
}

export interface SiteDef {
  id: 'A' | 'B';
  name: string;
  /** plantable region, half-open */
  rect: [number, number, number, number];
  center: { x: number; z: number };
  plantSpots: { x: number; z: number }[];
  /** where T bots stand guard after planting */
  guardSpots: { x: number; z: number }[];
  /** directions CTs come from (for guard look-at) */
  entrances: { x: number; z: number }[];
}

export interface RouteDef {
  id: string;
  name: string;
  site: 'A' | 'B';
  points: { x: number; z: number }[];
}

export interface HoldPost {
  id: string;
  name: string;
  x: number;
  z: number;
  looks: { x: number; z: number }[];
  site: 'A' | 'B' | 'MID';
}

const A = (id: string, name: string, x0: number, z0: number, x1: number, z1: number, tint: number): AreaDef => ({
  id,
  name,
  rect: [x0, z0, x1, z1],
  tint,
});

// Order matters for zone lookup: first match wins (small/specific areas first).
export const AREAS: AreaDef[] = [
  A('LONG_DOORS', '大门', 84, 87, 90, 88, 0x7f8c96),
  A('MID_DOORS', '中门', 44, 40, 52, 41, 0x7f8c96),
  A('B_DOORS', 'B门', 34, 26, 40, 32, 0xb8a06e),
  A('A_CROSS', 'A点入口', 68, 10, 72, 20, 0xd9c08a),
  A('CT_BACK', 'CT后路', 34, 12, 46, 18, 0xcbb27a),
  A('CAT_N', '猫道', 70, 34, 76, 44, 0xc9ae78),
  A('CAT', '猫道', 64, 44, 76, 50, 0xc9ae78),
  A('A_SITE', 'A点', 72, 8, 100, 34, 0xe0c890),
  A('PIT', 'A大坑', 98, 40, 106, 58, 0xb59a68),
  A('LONG', 'A大', 84, 34, 98, 87, 0xd8bd85),
  A('OUTSIDE_LONG', '外大', 66, 88, 90, 106, 0xcdb27a),
  A('T_EXIT', 'T出口', 62, 96, 66, 102, 0xc4aa74),
  A('T_SPAWN', 'T出生点', 38, 90, 62, 106, 0xb99f6c),
  A('MID_TOP', '中路上', 44, 41, 64, 52, 0xd0b57e),
  A('MID', '中路', 47, 52, 56, 90, 0xcfb47c),
  A('CT_MID', 'CT中路', 40, 24, 58, 40, 0xd8be88),
  A('CT_SPAWN', 'CT出生点', 46, 6, 68, 24, 0xd2c090),
  A('B_SITE', 'B点', 8, 8, 34, 38, 0xdfc48c),
  A('B_EXIT', 'B洞出口', 18, 38, 30, 48, 0xb5a070),
  A('B_TUNNELS', 'B洞', 20, 48, 28, 102, 0xa8946a),
  A('UPPER_TUNNELS', '上隧道', 24, 96, 38, 102, 0xa8946a),
  A('LOWER_TUNNELS', '下隧道', 28, 66, 47, 72, 0xa8946a),
];

export const CRATES: CrateDef[] = [
  // mid
  { x: 50, z: 70, w: 2, d: 2, h: 1.3, kind: 'crate' }, // xbox
  { x: 60, z: 45, w: 2, d: 2, h: 1.2, kind: 'crate' },
  // A long
  { x: 94, z: 60, w: 4, d: 8, h: 2.6, kind: 'container' },
  { x: 86, z: 66, w: 3, d: 5, h: 1.5, kind: 'car' },
  { x: 90, z: 48, w: 2, d: 2, h: 1.2, kind: 'crate' },
  { x: 88, z: 78, w: 2, d: 2, h: 1.0, kind: 'crate' },
  // A site
  { x: 80, z: 14, w: 3, d: 3, h: 1.6, kind: 'crate' },
  { x: 76, z: 22, w: 2, d: 2, h: 1.0, kind: 'crate' },
  { x: 92, z: 10, w: 3, d: 3, h: 2.4, kind: 'crate' },
  { x: 90, z: 22, w: 2, d: 2, h: 1.2, kind: 'crate' },
  { x: 95, z: 26, w: 2, d: 2, h: 1.0, kind: 'crate' },
  // B site
  { x: 12, z: 12, w: 4, d: 4, h: 2.4, kind: 'platform' },
  { x: 26, z: 12, w: 3, d: 3, h: 1.6, kind: 'crate' },
  { x: 14, z: 26, w: 3, d: 3, h: 1.4, kind: 'car' },
  { x: 22, z: 22, w: 2, d: 2, h: 1.0, kind: 'crate' },
  { x: 10, z: 32, w: 2, d: 2, h: 1.2, kind: 'crate' },
  // spawns & misc
  { x: 54, z: 12, w: 3, d: 3, h: 1.2, kind: 'crate' },
  { x: 50, z: 30, w: 2, d: 2, h: 1.3, kind: 'crate' },
  { x: 44, z: 96, w: 2, d: 2, h: 1.0, kind: 'crate' },
  { x: 52, z: 100, w: 3, d: 2, h: 1.2, kind: 'crate' },
  { x: 24, z: 58, w: 2, d: 2, h: 1.2, kind: 'crate' },
  { x: 22, z: 80, w: 2, d: 2, h: 1.5, kind: 'crate' },
  { x: 72, z: 92, w: 2, d: 2, h: 1.2, kind: 'crate' },
  { x: 80, z: 100, w: 3, d: 2, h: 1.0, kind: 'crate' },
];

export const DOORS: DoorDef[] = [
  {
    id: 'mid',
    name: '中门',
    cx: 48,
    cz: 40.5,
    trigger: 5.5,
    leaves: [
      { x0: 44, z0: 40, x1: 48, z1: 41, slide: { x: -1, z: 0 } },
      { x0: 48, z0: 40, x1: 52, z1: 41, slide: { x: 1, z: 0 } },
    ],
  },
  {
    id: 'long',
    name: '大门',
    cx: 87,
    cz: 87.5,
    trigger: 5.5,
    leaves: [
      { x0: 84, z0: 87, x1: 87, z1: 88, slide: { x: -1, z: 0 } },
      { x0: 87, z0: 87, x1: 90, z1: 88, slide: { x: 1, z: 0 } },
    ],
  },
  {
    id: 'b',
    name: 'B门',
    cx: 37.5,
    cz: 29,
    trigger: 5,
    leaves: [
      { x0: 37, z0: 26, x1: 38, z1: 29, slide: { x: 0, z: -1 } },
      { x0: 37, z0: 29, x1: 38, z1: 32, slide: { x: 0, z: 1 } },
    ],
  },
];

export const SITES: SiteDef[] = [
  {
    id: 'A',
    name: 'A点',
    rect: [74, 8, 100, 34],
    center: { x: 86.5, z: 21.5 },
    plantSpots: [
      { x: 86.5, z: 21.5 },
      { x: 78.5, z: 27.5 },
      { x: 93.5, z: 17.5 },
    ],
    guardSpots: [
      { x: 80.5, z: 26.5 },
      { x: 94.5, z: 23.5 },
      { x: 86.5, z: 13.5 },
    ],
    entrances: [
      { x: 90, z: 42 },
      { x: 74, z: 40 },
      { x: 69, z: 15 },
    ],
  },
  {
    id: 'B',
    name: 'B点',
    rect: [8, 8, 34, 38],
    center: { x: 20.5, z: 24.5 },
    plantSpots: [
      { x: 20.5, z: 24.5 },
      { x: 14.5, z: 20.5 },
      { x: 28.5, z: 30.5 },
    ],
    guardSpots: [
      { x: 16.5, z: 22.5 },
      { x: 29.5, z: 27.5 },
      { x: 22.5, z: 15.5 },
    ],
    entrances: [
      { x: 24, z: 44 },
      { x: 37, z: 29 },
      { x: 35, z: 15 },
    ],
  },
];

export const SPAWNS: Record<Team, { x: number; z: number }[]> = {
  T: [
    { x: 41.5, z: 94.5 },
    { x: 41.5, z: 102.5 },
    { x: 49.5, z: 93.5 },
    { x: 49.5, z: 104.5 },
    { x: 58.5, z: 96.5 },
  ],
  CT: [
    { x: 50.5, z: 8.5 },
    { x: 57.5, z: 8.5 },
    { x: 64.5, z: 8.5 },
    { x: 50.5, z: 19.5 },
    { x: 64.5, z: 19.5 },
  ],
};

export const T_ROUTES: RouteDef[] = [
  {
    id: 'A_LONG',
    name: 'A大',
    site: 'A',
    points: [
      { x: 64.5, z: 99.5 },
      { x: 87.5, z: 93.5 },
      { x: 92.5, z: 82.5 },
      { x: 91.5, z: 58.5 },
      { x: 90.5, z: 40.5 },
    ],
  },
  {
    id: 'A_CAT',
    name: '猫道',
    site: 'A',
    points: [
      { x: 51.5, z: 84.5 },
      { x: 51.5, z: 62.5 },
      { x: 53.5, z: 47.5 },
      { x: 68.5, z: 47.5 },
      { x: 73.5, z: 38.5 },
    ],
  },
  {
    id: 'MID_PUSH',
    name: '中路转猫道',
    site: 'A',
    points: [
      { x: 51.5, z: 84.5 },
      { x: 53.5, z: 62.5 },
      { x: 50.5, z: 47.5 },
      { x: 68.5, z: 47.5 },
      { x: 73.5, z: 38.5 },
    ],
  },
  {
    id: 'B_TUN',
    name: 'B洞',
    site: 'B',
    points: [
      { x: 40.5, z: 99.5 },
      { x: 30.5, z: 99.5 },
      { x: 24.5, z: 88.5 },
      { x: 24.5, z: 63.5 },
      { x: 24.5, z: 44.5 },
    ],
  },
  {
    id: 'B_MID',
    name: '中路下隧道',
    site: 'B',
    points: [
      { x: 51.5, z: 84.5 },
      { x: 51.5, z: 76.5 },
      { x: 44.5, z: 69.5 },
      { x: 33.5, z: 69.5 },
      { x: 24.5, z: 64.5 },
      { x: 24.5, z: 44.5 },
    ],
  },
];

export const T_STRATEGIES: { id: string; routes: string[] }[] = [
  { id: 'A执行', routes: ['A_LONG', 'A_LONG', 'A_CAT', 'A_CAT', 'MID_PUSH'] },
  { id: 'A大压制', routes: ['A_LONG', 'A_LONG', 'A_LONG', 'A_CAT', 'MID_PUSH'] },
  { id: 'B洞冲', routes: ['B_TUN', 'B_TUN', 'B_TUN', 'B_MID', 'B_MID'] },
  { id: '分推', routes: ['A_LONG', 'A_CAT', 'B_TUN', 'B_TUN', 'B_MID'] },
];

export const CT_POSTS: HoldPost[] = [
  { id: 'A_LONG', name: 'A点(防A大)', x: 91.5, z: 29.5, site: 'A', looks: [{ x: 91, z: 55 }, { x: 89, z: 70 }, { x: 84, z: 40 }] },
  { id: 'A_SITE', name: 'A点', x: 84.5, z: 20.5, site: 'A', looks: [{ x: 90, z: 44 }, { x: 74, z: 40 }, { x: 70, z: 15 }] },
  { id: 'A_CAT', name: 'A点(防猫道)', x: 75.5, z: 30.5, site: 'A', looks: [{ x: 73, z: 42 }, { x: 68, z: 47 }] },
  { id: 'MID', name: 'CT中路', x: 48.5, z: 34.5, site: 'MID', looks: [{ x: 48, z: 42 }, { x: 44, z: 38 }, { x: 55, z: 38 }] },
  { id: 'B_DOORS', name: 'B门', x: 32.5, z: 29.5, site: 'B', looks: [{ x: 38, z: 29 }, { x: 44, z: 29 }] },
  { id: 'B_TUN', name: 'B点(防B洞)', x: 25.5, z: 32.5, site: 'B', looks: [{ x: 24, z: 45 }, { x: 24, z: 60 }] },
  { id: 'B_SITE', name: 'B点', x: 18.5, z: 22.5, site: 'B', looks: [{ x: 24, z: 44 }, { x: 37, z: 29 }] },
];

/** Default CT setup: index -> post id (bots pick from this list, shuffled per round). */
export const CT_SETUPS: string[][] = [
  ['A_LONG', 'A_CAT', 'MID', 'B_TUN', 'B_SITE'],
  ['A_LONG', 'A_SITE', 'MID', 'B_TUN', 'B_SITE'],
  ['A_LONG', 'A_CAT', 'MID', 'B_DOORS', 'B_SITE'],
  ['A_SITE', 'A_CAT', 'MID', 'B_TUN', 'B_DOORS'],
];

// ---- grid --------------------------------------------------------------------

export interface MapGrid {
  W: number;
  H: number;
  /** 1 = walkable floor */
  walk: Uint8Array;
  /** index into AREAS (or 255) */
  area: Uint8Array;
}

export function buildGrid(): MapGrid {
  const walk = new Uint8Array(GRID_W * GRID_H);
  const area = new Uint8Array(GRID_W * GRID_H).fill(255);
  // reverse order so earlier (more specific) areas overwrite later ones
  for (let i = AREAS.length - 1; i >= 0; i--) {
    const [x0, z0, x1, z1] = AREAS[i].rect;
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        walk[z * GRID_W + x] = 1;
        area[z * GRID_W + x] = i;
      }
    }
  }
  return { W: GRID_W, H: GRID_H, walk, area };
}

export function areaAt(x: number, z: number): AreaDef | null {
  for (const a of AREAS) {
    const [x0, z0, x1, z1] = a.rect;
    if (x >= x0 && x < x1 && z >= z0 && z < z1) return a;
  }
  return null;
}

export function zoneName(x: number, z: number): string {
  return areaAt(x, z)?.name ?? '未知区域';
}

export function siteAt(x: number, z: number): SiteDef | null {
  for (const s of SITES) {
    const [x0, z0, x1, z1] = s.rect;
    if (x >= x0 && x < x1 && z >= z0 && z < z1) return s;
  }
  return null;
}

export const routeById = (id: string): RouteDef => {
  const r = T_ROUTES.find((q) => q.id === id);
  if (!r) throw new Error('unknown route ' + id);
  return r;
};

export const siteById = (id: 'A' | 'B'): SiteDef => (id === 'A' ? SITES[0] : SITES[1]);

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}
