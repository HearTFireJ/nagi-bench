import { buildDust2 } from './map/dust2.ts';
import type { MapData, ZoneDef } from './map/types.ts';
import { NavGrid } from './nav/navgrid.ts';
import { World } from './physics/world.ts';

export interface Level {
  map: MapData;
  nav: NavGrid;
  zoneGrid: Int16Array;
}

let cached: Level | null = null;

/** Build (once) the immutable parts of the level: map data, nav grid, zone lookup. */
export function getLevel(): Level {
  if (cached) return cached;
  const map = buildDust2();
  // nav generation treats doors as open regardless of their current state
  const nav = new NavGrid(new World(map));
  const zoneGrid = new Int16Array(map.cols * map.rows).fill(-1);
  for (let z = 0; z < map.rows; z++) {
    for (let x = 0; x < map.cols; x++) {
      const cx = x + 0.5;
      const cz = z + 0.5;
      for (let i = 0; i < map.zones.length; i++) {
        if (map.zones[i].rects.some((r) => cx >= r[0] && cx < r[2] && cz >= r[1] && cz < r[3])) {
          zoneGrid[z * map.cols + x] = i;
          break;
        }
      }
    }
  }
  cached = { map, nav, zoneGrid };
  return cached;
}

export function zoneAt(level: Level, x: number, z: number): ZoneDef | null {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  if (ix < 0 || iz < 0 || ix >= level.map.cols || iz >= level.map.rows) return null;
  const i = level.zoneGrid[iz * level.map.cols + ix];
  return i >= 0 ? level.map.zones[i] : null;
}
