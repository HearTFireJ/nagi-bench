// Turns the region layout into collision boxes: rasterise walkable rectangles on a 0.5 m grid, extrude a 1 m thick wall
// shell around every walkable cell, merge cells into as few boxes as possible, then add crates and door headers.
import { makeBox } from '../collision';
import type { Box } from '../collision';
import * as L from './layout';
import type { CrateDef, DoorDef, Material, SiteDef, SpawnPoint, ZoneInfo } from './layout';

export const MATERIALS: Material[] = ['sand', 'stone', 'wood', 'metal'];

export interface ZoneLabel {
  id: string;
  name: string;
  x: number;
  z: number;
}

export interface ResolvedCrate {
  def: CrateDef;
  box: Box;
}

export interface MapData {
  cell: number;
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** Floor height per cell, NaN = solid / outside. */
  floor: Float32Array;
  /** Ceiling underside per cell, NaN = open sky. */
  roof: Float32Array;
  zone: Uint8Array;
  mat: Uint8Array;
  boxes: Box[];
  crates: ResolvedCrate[];
  doors: DoorDef[];
  sites: SiteDef[];
  zones: ZoneInfo[];
  zoneLabels: ZoneLabel[];
  spawns: { T: SpawnPoint[]; CT: SpawnPoint[] };
  anchors: Record<string, { x: number; z: number }>;
}

interface Rect {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
  key: number;
}

/** Greedy rectangle merge of equal-key cells (key < 0 = empty). */
const mergeCells = (keys: Int32Array, cols: number, rows: number): Rect[] => {
  const rects: Rect[] = [];
  let open = new Map<string, Rect>();
  for (let r = 0; r < rows; r++) {
    const next = new Map<string, Rect>();
    let c = 0;
    while (c < cols) {
      const key = keys[r * cols + c];
      if (key < 0) {
        c++;
        continue;
      }
      let e = c + 1;
      while (e < cols && keys[r * cols + e] === key) e++;
      const sig = c + ',' + e + ',' + key;
      const prev = open.get(sig);
      if (prev) {
        prev.r1 = r;
        next.set(sig, prev);
      } else {
        const rect: Rect = { c0: c, c1: e - 1, r0: r, r1: r, key };
        rects.push(rect);
        next.set(sig, rect);
      }
      c = e;
    }
    open = next;
  }
  return rects;
};

export const buildMap = (): MapData => {
  const cell = L.CELL;
  const minX = L.BOUNDS.minX;
  const minZ = L.BOUNDS.minZ;
  const cols = Math.round((L.BOUNDS.maxX - minX) / cell);
  const rows = Math.round((L.BOUNDS.maxZ - minZ) / cell);
  const n = cols * rows;
  const floor = new Float32Array(n).fill(NaN);
  const roof = new Float32Array(n).fill(NaN);
  const wallRef = new Float32Array(n).fill(NaN);
  const wallCap = new Float32Array(n).fill(NaN);
  const zone = new Uint8Array(n).fill(255);
  const mat = new Uint8Array(n);

  const zoneIndex = new Map<string, number>();
  L.ZONES.forEach((z, i) => zoneIndex.set(z.id, i));

  // ---- rasterise regions (later regions override earlier ones) ----
  for (const reg of L.REGIONS) {
    const zi = zoneIndex.get(reg.zone);
    if (zi === undefined) throw new Error('Unknown zone ' + reg.zone);
    const c0 = Math.round((reg.x0 - minX) / cell);
    const c1 = Math.round((reg.x1 - minX) / cell);
    const r0 = Math.round((reg.z0 - minZ) / cell);
    const r1 = Math.round((reg.z1 - minZ) / cell);
    const matId = MATERIALS.indexOf(reg.mat);
    const ramp = reg.ramp;
    const steps = ramp ? Math.max(1, Math.round(Math.abs(ramp.to - ramp.from) / L.STAIR_RISE) - 1) : 0;
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        const i = r * cols + c;
        let h = reg.h;
        let ref = reg.h;
        if (ramp) {
          const t = ramp.axis === 'x' ? (c - c0 + 0.5) / (c1 - c0) : (r - r0 + 0.5) / (r1 - r0);
          const s = Math.min(steps - 1, Math.floor(t * steps));
          h = ramp.from + ((ramp.to - ramp.from) * (s + 1)) / (steps + 1);
          ref = Math.max(ramp.from, ramp.to);
        }
        floor[i] = h;
        wallRef[i] = ref;
        wallCap[i] = reg.roof !== undefined ? ref + reg.roof + 0.6 : ref + L.DEFAULT_WALL_HEIGHT;
        roof[i] = reg.roof !== undefined ? h + reg.roof : NaN;
        zone[i] = zi;
        mat[i] = matId;
      }
    }
  }

  // ---- wall shell: solid cells within WALL_SHELL_CELLS of any walkable cell ----
  const wallTop = new Float32Array(n).fill(NaN);
  const S = L.WALL_SHELL_CELLS;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (Number.isNaN(floor[i])) continue;
      for (let dr = -S; dr <= S; dr++) {
        for (let dc = -S; dc <= S; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
          const j = rr * cols + cc;
          if (!Number.isNaN(floor[j])) continue;
          const top = wallCap[i];
          if (Number.isNaN(wallTop[j]) || top > wallTop[j]) wallTop[j] = top;
        }
      }
    }
  }

  const boxes: Box[] = [];
  const toBox = (rect: Rect, y0: number, y1: number, tag: string): void => {
    boxes.push(makeBox(minX + rect.c0 * cell, y0, minZ + rect.r0 * cell, minX + (rect.c1 + 1) * cell, y1, minZ + (rect.r1 + 1) * cell, tag));
  };

  // Floors (key = height * 20 * 8 + material).
  {
    const keys = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) if (!Number.isNaN(floor[i])) keys[i] = Math.round((floor[i] + 10) * 20) * 8 + mat[i];
    for (const rect of mergeCells(keys, cols, rows)) {
      const h = (Math.floor(rect.key / 8) / 20) - 10;
      toBox(rect, -3, h, 'floor:' + MATERIALS[rect.key % 8]);
    }
  }
  // Walls.
  {
    const keys = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) if (!Number.isNaN(wallTop[i])) keys[i] = Math.round(wallTop[i] * 10);
    for (const rect of mergeCells(keys, cols, rows)) toBox(rect, -3, rect.key / 10, 'wall');
  }
  // Roofs (tunnels).
  {
    const keys = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) if (!Number.isNaN(roof[i])) keys[i] = Math.round(roof[i] * 10);
    for (const rect of mergeCells(keys, cols, rows)) toBox(rect, rect.key / 10, rect.key / 10 + 0.6, 'roof');
  }

  const cellIndexAt = (x: number, z: number): number => {
    const c = Math.floor((x - minX) / cell);
    const r = Math.floor((z - minZ) / cell);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
    return r * cols + c;
  };

  // ---- crates: sit on the highest floor under their footprint ----
  const crates: ResolvedCrate[] = [];
  for (const def of L.CRATES) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let z = def.z0 + cell / 2; z < def.z1; z += cell) {
      for (let x = def.x0 + cell / 2; x < def.x1; x += cell) {
        const i = cellIndexAt(x, z);
        if (i < 0 || Number.isNaN(floor[i])) continue;
        lo = Math.min(lo, floor[i]);
        hi = Math.max(hi, floor[i]);
      }
    }
    if (lo === Infinity) throw new Error('Crate outside walkable area: ' + JSON.stringify(def));
    const lift = def.lift ?? 0;
    const bottom = lift > 0 ? hi + lift : lo - 0.05;
    const top = bottom + def.height + (lift > 0 ? 0 : hi - lo + 0.05);
    const box = makeBox(def.x0, bottom, def.z0, def.x1, top, def.z1, 'crate:' + def.mat);
    boxes.push(box);
    crates.push({ def, box });
  }

  // ---- door headers: fill the slot above doors so they cannot be seen or shot over ----
  for (const d of L.DOORS) {
    const hw = d.axis === 'x' ? d.width / 2 : d.thickness / 2;
    const hd = d.axis === 'x' ? d.thickness / 2 : d.width / 2;
    boxes.push(makeBox(d.x - hw, d.height, d.z - hd, d.x + hw, L.DEFAULT_WALL_HEIGHT, d.z + hd, 'wall'));
  }
  for (const h of L.DOOR_HEADERS) boxes.push(makeBox(h.x0, h.y, h.z0, h.x1, L.DEFAULT_WALL_HEIGHT, h.z1, 'wall'));

  // ---- zone label anchors: centre of the largest region of each zone ----
  const zoneLabels: ZoneLabel[] = [];
  for (const info of L.ZONES) {
    let best: L.Region | null = null;
    let bestArea = -1;
    for (const reg of L.REGIONS) {
      if (reg.zone !== info.id) continue;
      const area = (reg.x1 - reg.x0) * (reg.z1 - reg.z0);
      if (area > bestArea) {
        bestArea = area;
        best = reg;
      }
    }
    if (best) zoneLabels.push({ id: info.id, name: info.name, x: (best.x0 + best.x1) / 2, z: (best.z0 + best.z1) / 2 });
  }

  return {
    cell,
    cols,
    rows,
    minX,
    minZ,
    maxX: L.BOUNDS.maxX,
    maxZ: L.BOUNDS.maxZ,
    floor,
    roof,
    zone,
    mat,
    boxes,
    crates,
    doors: L.DOORS,
    sites: L.SITES,
    zones: L.ZONES,
    zoneLabels,
    spawns: { T: L.T_SPAWNS, CT: L.CT_SPAWNS },
    anchors: L.ANCHORS,
  };
};

/** Zone info for a world position (or null outside the level). */
export const zoneAt = (map: MapData, x: number, z: number): ZoneInfo | null => {
  const c = Math.floor((x - map.minX) / map.cell);
  const r = Math.floor((z - map.minZ) / map.cell);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return null;
  const zi = map.zone[r * map.cols + c];
  return zi === 255 ? null : map.zones[zi];
};

/** Floor height at a world position (NaN outside the walkable area). */
export const floorAt = (map: MapData, x: number, z: number): number => {
  const c = Math.floor((x - map.minX) / map.cell);
  const r = Math.floor((z - map.minZ) / map.cell);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return NaN;
  return map.floor[r * map.cols + c];
};

/** Surface material name for footstep sounds. */
export const materialAt = (map: MapData, x: number, z: number): Material => {
  const c = Math.floor((x - map.minX) / map.cell);
  const r = Math.floor((z - map.minZ) / map.cell);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return 'sand';
  return MATERIALS[map.mat[r * map.cols + c]] ?? 'sand';
};
