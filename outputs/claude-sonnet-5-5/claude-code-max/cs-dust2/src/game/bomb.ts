// C4 lifecycle: carried -> (dropped) -> planted -> defused | exploded, plus the plant / defuse interaction.
import { clamp, dist2D, vec3 } from '../core/math';
import type { Vec3 } from '../core/math';
import { cancelUse, killActor, eyePosition } from './combat';
import { ROUND } from './config';
import type { SiteDef } from './map/layout';
import type { World } from './world';
import type { Actor, SiteId } from './types';

export type BombStatus = 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded';

export interface BombState {
  status: BombStatus;
  carrierId: number;
  pos: Vec3;
  site: SiteId | null;
  plantedAt: number;
  explodeAt: number;
  planterId: number;
  defuserId: number;
  defuseProgress: number;
  lastBeepAt: number;
}

export const createBomb = (): BombState => ({
  status: 'carried',
  carrierId: -1,
  pos: vec3(),
  site: null,
  plantedAt: 0,
  explodeAt: 0,
  planterId: -1,
  defuserId: -1,
  defuseProgress: 0,
  lastBeepAt: 0,
});

/** Which bombsite (if any) contains this position. */
export const siteAt = (w: World, x: number, z: number): SiteDef | null => {
  for (const s of w.level.map.sites) {
    if (dist2D(x, z, s.x, s.z) <= s.radius) return s;
  }
  return null;
};

export const remainingBombTime = (w: World): number => Math.max(0, w.bomb.explodeAt - w.time);

/** Called from combat when the carrier dies. */
export const dropBomb = (w: World, carrier: Actor): void => {
  const b = w.bomb;
  if (b.status !== 'carried') return;
  b.status = 'dropped';
  b.carrierId = -1;
  b.pos.x = carrier.pos.x;
  b.pos.y = carrier.pos.y;
  b.pos.z = carrier.pos.z;
  carrier.hasBomb = false;
  if (carrier.activeSlot === 'bomb') carrier.activeSlot = carrier.weapons.primary ? 'primary' : carrier.weapons.secondary ? 'secondary' : 'melee';
  w.emit({ type: 'bombDrop', pos: { x: b.pos.x, y: b.pos.y, z: b.pos.z } });
};

/** Plant / defuse interaction for one actor (called every tick). */
export const updateBombUse = (w: World, a: Actor, dt: number): void => {
  const wantsUse = a.alive && (a.input.use || (a.activeSlot === 'bomb' && a.input.fire));
  if (!wantsUse) {
    if (a.useKind) cancelUse(w, a);
    return;
  }
  const b = w.bomb;
  const live = w.round.phase === 'live' || w.round.phase === 'planted';
  const still = Math.hypot(a.vel.x, a.vel.z) < 1.2;

  let kind: 'plant' | 'defuse' | null = null;
  let site: SiteDef | null = null;
  if (live && a.team === 'T' && a.hasBomb && b.status === 'carried' && b.carrierId === a.id && a.onGround) {
    site = siteAt(w, a.pos.x, a.pos.z);
    if (site) kind = 'plant';
  } else if (live && a.team === 'CT' && b.status === 'planted' && a.onGround) {
    const near = dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z) <= ROUND.defuseRange && Math.abs(a.pos.y - b.pos.y) < 1.5;
    const other = b.defuserId >= 0 && b.defuserId !== a.id ? w.actors[b.defuserId] : null;
    const otherBusy = !!other && other.alive && other.useKind === 'defuse';
    if (near && !otherBusy) kind = 'defuse';
  }

  if (!kind || !still) {
    if (a.useKind) cancelUse(w, a);
    return;
  }

  if (a.useKind !== kind) {
    if (a.useKind) cancelUse(w, a);
    a.useKind = kind;
    a.useProgress = 0;
    if (kind === 'plant' && site) w.emit({ type: 'plantStart', actorId: a.id, site: site.id, pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z } });
    else w.emit({ type: 'defuseStart', actorId: a.id, pos: { x: b.pos.x, y: b.pos.y, z: b.pos.z } });
  }
  a.useProgress += dt;

  if (kind === 'plant' && site) {
    if (a.useProgress >= ROUND.plantTime) completePlant(w, a, site);
  } else if (kind === 'defuse') {
    b.defuserId = a.id;
    b.defuseProgress = a.useProgress;
    if (a.useProgress >= ROUND.defuseTime) completeDefuse(w, a);
  }
};

const completePlant = (w: World, a: Actor, site: SiteDef): void => {
  const b = w.bomb;
  b.status = 'planted';
  b.site = site.id;
  b.pos.x = a.pos.x;
  b.pos.y = a.pos.y;
  b.pos.z = a.pos.z;
  b.plantedAt = w.time;
  b.explodeAt = w.time + ROUND.bombTime;
  b.planterId = a.id;
  b.carrierId = -1;
  b.defuserId = -1;
  b.defuseProgress = 0;
  b.lastBeepAt = w.time;
  a.hasBomb = false;
  a.useKind = null;
  a.useProgress = 0;
  if (a.activeSlot === 'bomb') a.activeSlot = a.weapons.primary ? 'primary' : a.weapons.secondary ? 'secondary' : 'melee';
  a.money = Math.min(16000, a.money + 300);
  w.onBombPlanted(a, site.id);
  w.emit({ type: 'bombPlanted', actorId: a.id, site: site.id, pos: { x: b.pos.x, y: b.pos.y, z: b.pos.z } });
};

const completeDefuse = (w: World, a: Actor): void => {
  const b = w.bomb;
  b.status = 'defused';
  b.defuserId = -1;
  a.useKind = null;
  a.useProgress = 0;
  a.money = Math.min(16000, a.money + 300);
  w.emit({ type: 'bombDefused', actorId: a.id, pos: { x: b.pos.x, y: b.pos.y, z: b.pos.z } });
  w.endRound('CT', 'bomb_defused');
};

/** Global per-tick bomb logic: pickup, beeping and detonation. */
export const updateBomb = (w: World): void => {
  const b = w.bomb;
  if (b.status === 'dropped') {
    if (w.round.phase !== 'live') return;
    for (const a of w.actors) {
      if (!a.alive || a.team !== 'T') continue;
      if (dist2D(a.pos.x, a.pos.z, b.pos.x, b.pos.z) <= ROUND.pickupRange && Math.abs(a.pos.y - b.pos.y) < 1.5) {
        b.status = 'carried';
        b.carrierId = a.id;
        a.hasBomb = true;
        w.emit({ type: 'bombPickup', actorId: a.id });
        break;
      }
    }
    return;
  }
  if (b.status !== 'planted') return;

  // A defuser who died / walked away stops counting.
  if (b.defuserId >= 0) {
    const d = w.actors[b.defuserId];
    if (!d.alive || d.useKind !== 'defuse') {
      b.defuserId = -1;
      b.defuseProgress = 0;
    }
  }

  const remaining = b.explodeAt - w.time;
  const interval = 0.09 + 0.9 * Math.pow(clamp(remaining / ROUND.bombTime, 0, 1), 1.3);
  if (w.time - b.lastBeepAt >= interval) {
    b.lastBeepAt = w.time;
    w.emit({ type: 'bombBeep', pos: { x: b.pos.x, y: b.pos.y, z: b.pos.z }, urgency: 1 - clamp(remaining / ROUND.bombTime, 0, 1) });
  }
  if (remaining <= 0) explode(w);
};

const explode = (w: World): void => {
  const b = w.bomb;
  b.status = 'exploded';
  const center = { x: b.pos.x, y: b.pos.y + 0.3, z: b.pos.z };
  w.emit({ type: 'bombExploded', pos: { x: b.pos.x, y: b.pos.y, z: b.pos.z } });
  for (const a of w.actors) {
    if (!a.alive) continue;
    const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);
    if (d > ROUND.blastRadius) continue;
    const eye = eyePosition(a);
    const open = w.level.cw.lineClear(center, { x: eye.x, y: eye.y - 0.4, z: eye.z });
    let dmg: number;
    if (d <= ROUND.blastKillRadius) dmg = open ? 999 : 140;
    else dmg = 100 * (1 - (d - ROUND.blastKillRadius) / (ROUND.blastRadius - ROUND.blastKillRadius)) * (open ? 1 : 0.35);
    if (dmg >= a.hp + a.armor * 0.5) killActor(w, a, null, null, false);
    else {
      a.hp -= dmg;
      a.lastHurtAt = w.time;
    }
  }
  w.endRound('T', 'bomb_exploded');
};
