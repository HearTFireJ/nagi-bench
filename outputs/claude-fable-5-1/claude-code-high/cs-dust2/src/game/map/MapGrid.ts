import { aabb, clamp, lerp, type AABB, type Vec3 } from '../core/vec';
import { buildRawGrid, CELL, GRID_H, GRID_W, ROOF_HEIGHT, WALL_HEIGHT } from './MapData';

export type RampDir = '^' | 'v' | '<' | '>';

export interface RampInfo {
  dir: RampDir;
  axis: 'x' | 'z';
  lowEdge: number; // world coordinate along the axis where the ramp is at hLow
  highEdge: number;
  hLow: number;
  hHigh: number;
}

export interface Cell {
  x: number;
  z: number;
  ch: string;
  wall: boolean;
  /** Surface height at the cell center. */
  h: number;
  /** Base floor height (without crates) — used to place crates. */
  floorH: number;
  crateH: number; // 0 when no crate
  roof: boolean;
  door: boolean;
  zone: 'A' | 'B' | null;
  spawn: 'T' | 'CT' | null;
  ramp: RampInfo | null;
}

export interface MapRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number; // inclusive cell ranges
}

export interface RampRun extends MapRect {
  info: RampInfo;
}

export interface Collider {
  box: AABB;
  kind: 'wall' | 'crate' | 'floor' | 'ramp' | 'roof' | 'door';
}

/** Player step height: cells whose surface is at most this much higher can be walked onto. */
export const STEP_HEIGHT = 0.55;

export class MapGrid {
  readonly w = GRID_W;
  readonly h = GRID_H;
  readonly cells: Cell[] = [];
  readonly colliders: Collider[] = [];
  readonly wallRects: MapRect[] = [];
  readonly elevatedRects: MapRect[] = [];
  readonly roofRects: MapRect[] = [];
  readonly rampRuns: RampRun[] = [];
  readonly doorCells: Cell[] = [];
  readonly worldSize = GRID_W * CELL;

  constructor() {
    const raw = buildRawGrid();
    for (let z = 0; z < this.h; z++) {
      for (let x = 0; x < this.w; x++) {
        const ch = raw[z][x];
        this.cells.push(MapGrid.makeCell(x, z, ch));
      }
    }
    this.resolveRamps();
    this.buildRects();
    this.buildColliders();
  }

  private static makeCell(x: number, z: number, ch: string): Cell {
    const c: Cell = {
      x,
      z,
      ch,
      wall: ch === '#',
      h: 0,
      floorH: 0,
      crateH: 0,
      roof: ch === 'u',
      door: ch === 'D',
      zone: ch === 'A' ? 'A' : ch === 'B' ? 'B' : null,
      spawn: ch === 'T' ? 'T' : ch === 'K' ? 'CT' : null,
      ramp: null,
    };
    switch (ch) {
      case '#':
        c.h = WALL_HEIGHT;
        c.floorH = WALL_HEIGHT;
        break;
      case '-':
      case 'A':
        c.h = 2;
        c.floorH = 2;
        break;
      case 'c':
        c.crateH = 1;
        c.h = 1;
        break;
      case 'C':
        c.crateH = 2;
        c.h = 2;
        break;
      case 'o':
        c.floorH = 2;
        c.crateH = 1;
        c.h = 3;
        break;
      case 'O':
        c.floorH = 2;
        c.crateH = 2;
        c.h = 4;
        break;
      default:
        c.h = 0;
        c.floorH = 0;
    }
    return c;
  }

  cell(x: number, z: number): Cell | null {
    if (x < 0 || z < 0 || x >= this.w || z >= this.h) return null;
    return this.cells[z * this.w + x];
  }

  cellAtWorld(wx: number, wz: number): Cell | null {
    return this.cell(Math.floor(wx / CELL), Math.floor(wz / CELL));
  }

  /** Bounding cell coordinates of a world position (clamped). */
  toCell(wx: number, wz: number): { x: number; z: number } {
    return {
      x: clamp(Math.floor(wx / CELL), 0, this.w - 1),
      z: clamp(Math.floor(wz / CELL), 0, this.h - 1),
    };
  }

  cellCenter(cx: number, cz: number): Vec3 {
    const c = this.cell(cx, cz);
    return { x: cx * CELL + CELL / 2, y: c ? c.h : 0, z: cz * CELL + CELL / 2 };
  }

  private isRampChar(ch: string): ch is RampDir {
    return ch === '^' || ch === 'v' || ch === '<' || ch === '>';
  }

  private resolveRamps() {
    const visited = new Set<number>();
    for (const c of this.cells) {
      if (!this.isRampChar(c.ch) || visited.has(c.z * this.w + c.x)) continue;
      const dir = c.ch;
      const axis: 'x' | 'z' = dir === '^' || dir === 'v' ? 'z' : 'x';
      // Expand the run along its axis.
      let a0 = axis === 'z' ? c.z : c.x;
      let a1 = a0;
      const other = axis === 'z' ? c.x : c.z;
      const at = (a: number) => (axis === 'z' ? this.cell(other, a) : this.cell(a, other));
      while (at(a0 - 1) && at(a0 - 1)!.ch === dir) a0--;
      while (at(a1 + 1) && at(a1 + 1)!.ch === dir) a1++;
      // Rising toward '^' (north = -z), 'v' (south = +z), '<' (-x), '>' (+x)
      const risingPositive = dir === 'v' || dir === '>';
      const lowIdx = risingPositive ? a0 - 1 : a1 + 1;
      const highIdx = risingPositive ? a1 + 1 : a0 - 1;
      const lowCell = at(lowIdx);
      const highCell = at(highIdx);
      const hLow = lowCell && !lowCell.wall ? lowCell.floorH : 0;
      const hHigh = highCell && !highCell.wall ? highCell.floorH : 2;
      const info: RampInfo = {
        dir,
        axis,
        lowEdge: risingPositive ? a0 * CELL : (a1 + 1) * CELL,
        highEdge: risingPositive ? (a1 + 1) * CELL : a0 * CELL,
        hLow,
        hHigh,
      };
      for (let a = a0; a <= a1; a++) {
        const rc = at(a)!;
        rc.ramp = info;
        visited.add(rc.z * this.w + rc.x);
        const center = a * CELL + CELL / 2;
        rc.h = this.rampHeight(info, center);
        rc.floorH = rc.h;
      }
    }
    // Group ramp cells into rectangular runs (for rendering)
    const done = new Set<number>();
    const same = (a: RampInfo | null | undefined, b: RampInfo) =>
      !!a && a.dir === b.dir && a.lowEdge === b.lowEdge && a.highEdge === b.highEdge && a.hLow === b.hLow && a.hHigh === b.hHigh;
    for (const c of this.cells) {
      if (!c.ramp || done.has(c.z * this.w + c.x)) continue;
      const info = c.ramp;
      let x1 = c.x;
      let z1 = c.z;
      while (same(this.cell(x1 + 1, c.z)?.ramp, info) && !done.has(c.z * this.w + x1 + 1)) x1++;
      outer: while (z1 + 1 < this.h) {
        for (let x = c.x; x <= x1; x++) {
          if (!same(this.cell(x, z1 + 1)?.ramp, info) || done.has((z1 + 1) * this.w + x)) break outer;
        }
        z1++;
      }
      for (let z = c.z; z <= z1; z++) for (let x = c.x; x <= x1; x++) done.add(z * this.w + x);
      this.rampRuns.push({ x0: c.x, z0: c.z, x1, z1, info });
    }
  }

  rampHeight(info: RampInfo, coord: number): number {
    const t = clamp((coord - info.lowEdge) / (info.highEdge - info.lowEdge), 0, 1);
    return lerp(info.hLow, info.hHigh, t);
  }

  /** Continuous ground surface height at a world position. */
  groundHeight(wx: number, wz: number): number {
    const c = this.cellAtWorld(wx, wz);
    if (!c) return WALL_HEIGHT;
    if (c.ramp) return this.rampHeight(c.ramp, c.ramp.axis === 'z' ? wz : wx);
    return c.h;
  }

  /** Does the cell block a character whose feet are at feetY? */
  isBlocking(c: Cell | null, feetY: number): boolean {
    if (!c) return true;
    if (c.wall) return true;
    if (c.ramp) return false;
    return c.h > feetY + STEP_HEIGHT;
  }

  /** Whether a bot can walk between two adjacent cells. */
  canStep(a: Cell, b: Cell): boolean {
    if (a.wall || b.wall) return false;
    if (a.crateH > 0 || b.crateH > 0) {
      // crates are only reachable by jumping — bots don't jump
      return false;
    }
    if (a.ramp || b.ramp) return Math.abs(a.h - b.h) <= 1.2;
    return Math.abs(a.h - b.h) <= STEP_HEIGHT;
  }

  /** Cells a bot may stand on. */
  isNavWalkable(c: Cell | null): boolean {
    return !!c && !c.wall && c.crateH === 0;
  }

  private buildRects() {
    const mergeRects = (pred: (c: Cell) => boolean): MapRect[] => {
      const used = new Set<number>();
      const rects: MapRect[] = [];
      for (let z = 0; z < this.h; z++) {
        for (let x = 0; x < this.w; x++) {
          const c = this.cell(x, z)!;
          if (!pred(c) || used.has(z * this.w + x)) continue;
          // extend along x
          let x1 = x;
          while (x1 + 1 < this.w && pred(this.cell(x1 + 1, z)!) && !used.has(z * this.w + x1 + 1)) x1++;
          // extend along z while the full row span is available
          let z1 = z;
          outer: while (z1 + 1 < this.h) {
            for (let xx = x; xx <= x1; xx++) {
              const cc = this.cell(xx, z1 + 1)!;
              if (!pred(cc) || used.has((z1 + 1) * this.w + xx)) break outer;
            }
            z1++;
          }
          for (let zz = z; zz <= z1; zz++) for (let xx = x; xx <= x1; xx++) used.add(zz * this.w + xx);
          rects.push({ x0: x, z0: z, x1, z1 });
        }
      }
      return rects;
    };
    this.wallRects.push(...mergeRects((c) => c.wall));
    this.elevatedRects.push(...mergeRects((c) => !c.wall && !c.ramp && c.floorH === 2));
    this.roofRects.push(...mergeRects((c) => c.roof));
    for (const c of this.cells) if (c.door) this.doorCells.push(c);
  }

  private buildColliders() {
    for (const r of this.wallRects) {
      this.colliders.push({
        kind: 'wall',
        box: aabb(r.x0 * CELL, -0.5, r.z0 * CELL, (r.x1 + 1) * CELL, WALL_HEIGHT, (r.z1 + 1) * CELL),
      });
    }
    for (const r of this.elevatedRects) {
      this.colliders.push({
        kind: 'floor',
        box: aabb(r.x0 * CELL, -0.5, r.z0 * CELL, (r.x1 + 1) * CELL, 2, (r.z1 + 1) * CELL),
      });
    }
    for (const r of this.roofRects) {
      this.colliders.push({
        kind: 'roof',
        box: aabb(r.x0 * CELL, ROOF_HEIGHT, r.z0 * CELL, (r.x1 + 1) * CELL, ROOF_HEIGHT + 0.3, (r.z1 + 1) * CELL),
      });
    }
    for (const c of this.cells) {
      if (c.crateH > 0) {
        const m = 0.05;
        this.colliders.push({
          kind: 'crate',
          box: aabb(c.x * CELL + m, c.floorH, c.z * CELL + m, (c.x + 1) * CELL - m, c.h, (c.z + 1) * CELL - m),
        });
      }
      if (c.ramp) {
        // Two stepped boxes approximating the slope, for line-of-sight only.
        const info = c.ramp;
        const axisLow = info.axis === 'z' ? c.z * CELL : c.x * CELL;
        const hA = this.rampHeight(info, axisLow);
        const hB = this.rampHeight(info, axisLow + CELL);
        const hMin = Math.min(hA, hB);
        const hMax = Math.max(hA, hB);
        this.colliders.push({
          kind: 'ramp',
          box: aabb(c.x * CELL, -0.5, c.z * CELL, (c.x + 1) * CELL, hMin + (hMax - hMin) * 0.5, (c.z + 1) * CELL),
        });
      }
      if (c.door) {
        this.colliders.push(...this.doorColliders(c));
      }
    }
  }

  /** Axis along which the corridor through a door cell runs. */
  doorAxis(c: Cell): 'x' | 'z' {
    const l = this.cell(c.x - 1, c.z);
    const r = this.cell(c.x + 1, c.z);
    return l?.wall || r?.wall ? 'z' : 'x';
  }

  /**
   * Geometry description of a door cell: frame across the corridor with one panel
   * hinged at the wall side, swung open along the corridor (passable in the middle).
   */
  doorGeometry(c: Cell): { axis: 'x' | 'z'; hingeAtMin: boolean; panel: AABB; header: AABB; post: AABB } {
    const axis = this.doorAxis(c);
    const x0 = c.x * CELL;
    const z0 = c.z * CELL;
    if (axis === 'z') {
      const zc = z0 + CELL / 2;
      const hingeAtMin = !!this.cell(c.x - 1, c.z)?.wall;
      const px = hingeAtMin ? x0 + 0.08 : x0 + CELL - 0.24;
      return {
        axis,
        hingeAtMin,
        panel: aabb(px, 0, zc - 0.05, px + 0.16, 2.4, zc + 1.3),
        header: aabb(x0, 2.6, zc - 0.15, x0 + CELL, 3.0, zc + 0.15),
        post: aabb(hingeAtMin ? x0 : x0 + CELL - 0.2, 0, zc - 0.15, hingeAtMin ? x0 + 0.2 : x0 + CELL, 3.0, zc + 0.15),
      };
    }
    const xc = x0 + CELL / 2;
    const hingeAtMin = !!this.cell(c.x, c.z - 1)?.wall;
    const pz = hingeAtMin ? z0 + 0.08 : z0 + CELL - 0.24;
    return {
      axis,
      hingeAtMin,
      panel: aabb(xc - 0.05, 0, pz, xc + 1.3, 2.4, pz + 0.16),
      header: aabb(xc - 0.15, 2.6, z0, xc + 0.15, 3.0, z0 + CELL),
      post: aabb(xc - 0.15, 0, hingeAtMin ? z0 : z0 + CELL - 0.2, xc + 0.15, 3.0, hingeAtMin ? z0 + 0.2 : z0 + CELL),
    };
  }

  doorColliders(c: Cell): Collider[] {
    const g = this.doorGeometry(c);
    return [
      { kind: 'door', box: g.panel },
      { kind: 'door', box: g.header },
      { kind: 'door', box: g.post },
    ];
  }

  isInPlantZone(wx: number, wz: number): 'A' | 'B' | null {
    const c = this.cellAtWorld(wx, wz);
    return c ? c.zone : null;
  }
}

let shared: MapGrid | null = null;
export function getMapGrid(): MapGrid {
  if (!shared) shared = new MapGrid();
  return shared;
}
