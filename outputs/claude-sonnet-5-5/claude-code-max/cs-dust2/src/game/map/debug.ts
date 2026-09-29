// Debug helpers for inspecting the generated map in a terminal.
import type { MapData } from './build';

const LETTER: Record<string, string> = {
  T_SPAWN: 'T',
  CT_SPAWN: 'C',
  A_LONG: 'L',
  A_SITE: 'A',
  MID_DOORS: 'D',
  CATWALK: 'K',
  B_TUNNELS: 'U',
  B_SITE: 'B',
  LONG_DOORS: 'l',
  OUTSIDE_LONG: 'o',
  MID: 'M',
  LOWER_MID: 'm',
  TOP_MID: 't',
  T_RAMP: 'r',
  CT_MID: 'c',
  CT_RAMP: 'R',
  B_DOORS: 'd',
  MID_TO_B: 'b',
  TUNNEL_COURT: 'u',
};

/** One character per `step` x `step` cells: zone letter for walkable cells, '#' for crates, ' ' for solid. */
export const dumpAscii = (map: MapData, step = 2): string => {
  const lines: string[] = [];
  const crateAt = (x: number, z: number): boolean => map.crates.some((c) => x >= c.def.x0 && x < c.def.x1 && z >= c.def.z0 && z < c.def.z1);
  for (let r = 0; r < map.rows; r += step) {
    let line = '';
    for (let c = 0; c < map.cols; c += step) {
      const x = map.minX + (c + step / 2) * map.cell;
      const z = map.minZ + (r + step / 2) * map.cell;
      const i = r * map.cols + c;
      if (Number.isNaN(map.floor[i])) {
        line += ' ';
        continue;
      }
      if (crateAt(x, z)) {
        line += '#';
        continue;
      }
      const zi = map.zone[i];
      line += zi === 255 ? '?' : LETTER[map.zones[zi].id] ?? '?';
    }
    lines.push(String(Math.round(map.minZ + r * map.cell)).padStart(3, ' ') + ' ' + line);
  }
  return lines.join('\n');
};
