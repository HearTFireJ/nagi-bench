// Assembles the static level: collision world, sliding doors and the navigation grid.
import { CollisionWorld, makeBox } from './collision';
import type { Box } from './collision';
import { NavGrid } from './nav';
import { buildMap, floorAt } from './map/build';
import type { MapData } from './map/build';
import type { DoorDef } from './map/layout';
import type { Actor } from './types';

export interface Door {
  def: DoorDef;
  /** 0 = closed, 1 = fully open. */
  open: number;
  /** Seconds since anybody was near. */
  idle: number;
  wantOpen: boolean;
  floorY: number;
  leafA: Box;
  leafB: Box;
}

export interface Level {
  map: MapData;
  cw: CollisionWorld;
  nav: NavGrid;
  doors: Door[];
}

const DOOR_TRIGGER_RADIUS = 5;
const DOOR_SPEED = 2.2; // openness per second
const DOOR_CLOSE_DELAY = 1.2;

export const createLevel = (): Level => {
  const map = buildMap();
  const cw = new CollisionWorld(map.minX, map.minZ, map.maxX, map.maxZ, 4);
  for (const b of map.boxes) cw.addStatic(b);

  const doors: Door[] = map.doors.map((def) => {
    const floorY = floorAt(map, def.x, def.z);
    const y0 = Number.isNaN(floorY) ? 0 : floorY;
    const leafA = makeBox(0, y0, 0, 1, y0 + def.height, 1, 'door');
    const leafB = makeBox(0, y0, 0, 1, y0 + def.height, 1, 'door');
    cw.addDynamic(leafA);
    cw.addDynamic(leafB);
    const door: Door = { def, open: 0, idle: 99, wantOpen: false, floorY: y0, leafA, leafB };
    placeDoorLeaves(door);
    return door;
  });

  // Doors are ignored while building the nav grid (they open for whoever walks up), so the grid treats them as passable.
  const nav = new NavGrid(cw, map);
  return { map, cw, nav, doors };
};

/** Position the two leaves for the current openness (they slide sideways into the flanking walls). */
export const placeDoorLeaves = (door: Door): void => {
  const { def, open } = door;
  const half = def.width / 2;
  const slide = open * (half + 0.15);
  const ht = def.thickness / 2;
  const a = door.leafA;
  const b = door.leafB;
  if (def.axis === 'x') {
    a.minX = def.x - half - slide;
    a.maxX = def.x - slide;
    b.minX = def.x + slide;
    b.maxX = def.x + half + slide;
    a.minZ = b.minZ = def.z - ht;
    a.maxZ = b.maxZ = def.z + ht;
  } else {
    a.minZ = def.z - half - slide;
    a.maxZ = def.z - slide;
    b.minZ = def.z + slide;
    b.maxZ = def.z + half + slide;
    a.minX = b.minX = def.x - ht;
    a.maxX = b.maxX = def.x + ht;
  }
  // A fully open door is inside the walls: take it out of the collision world entirely.
  const collidable = open < 0.995;
  a.enabled = collidable;
  b.enabled = collidable;
};

/** Doors open when any living actor is nearby and close shortly after everybody left. Returns doors whose state flipped. */
export const updateDoors = (level: Level, actors: readonly Actor[], dt: number, onMove: (door: Door, opening: boolean) => void): void => {
  for (const door of level.doors) {
    let near = false;
    for (const a of actors) {
      if (!a.alive) continue;
      if (Math.abs(a.pos.y - door.floorY) > 3) continue;
      if (Math.hypot(a.pos.x - door.def.x, a.pos.z - door.def.z) < DOOR_TRIGGER_RADIUS) {
        near = true;
        break;
      }
    }
    if (near) door.idle = 0;
    else door.idle += dt;
    const want = near || door.idle < DOOR_CLOSE_DELAY;
    if (want !== door.wantOpen) {
      door.wantOpen = want;
      onMove(door, want);
    }
    const target = want ? 1 : 0;
    if (door.open !== target) {
      const step = DOOR_SPEED * dt;
      door.open = door.open < target ? Math.min(target, door.open + step) : Math.max(target, door.open - step);
      placeDoorLeaves(door);
    }
  }
};

export const resetDoors = (level: Level): void => {
  for (const door of level.doors) {
    door.open = 0;
    door.idle = 99;
    door.wantOpen = false;
    placeDoorLeaves(door);
  }
};
