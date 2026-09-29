// Weapon handling: switching, reloading, scoping, firing (spread + view punch), hitscan against hitboxes, damage and kills.
import { DEG2RAD, TAU, clamp, dist2D, forwardFromAngles, rightFromYaw, vec3 } from '../core/math';
import type { Vec3 } from '../core/math';
import { activeWeaponId, activeWeaponState, weaponInSlot } from './actor';
import { BODY, SIM_DT } from './config';
import { computeDamage, HITBOXES } from './hitboxes';
import { makeRayHit } from './collision';
import type { World } from './world';
import type { Actor, DroppedWeapon, HitZone, WeaponId, WeaponSlot } from './types';
import { getWeapon } from './weapons';

const EYE = BODY.eyeHeight;
const rayHit = makeRayHit();

export const eyePosition = (a: Actor, out: Vec3 = vec3()): Vec3 => {
  out.x = a.pos.x;
  out.y = a.pos.y + EYE;
  out.z = a.pos.z;
  return out;
};

// ----------------------------------------------------------------------------------------------------------------------
// Inventory actions
// ----------------------------------------------------------------------------------------------------------------------

export const switchSlot = (w: World, a: Actor, slot: WeaponSlot): boolean => {
  if (slot === a.activeSlot) return false;
  if (slot === 'bomb') {
    if (!a.hasBomb) return false;
  } else if (!weaponInSlot(a, slot)) {
    return false;
  }
  a.lastSlot = a.activeSlot;
  a.activeSlot = slot;
  const def = getWeapon(activeWeaponId(a));
  a.drawEndsAt = w.time + def.drawTime;
  a.reloadEndsAt = 0;
  a.scopeLevel = 0;
  a.shotIndex = 0;
  a.triggerWasDown = true; // require a fresh click after drawing
  if (a.useKind === 'plant') cancelUse(w, a);
  w.emit({ type: 'weaponSwitch', actorId: a.id, weapon: def.id });
  return true;
};

export const startReload = (w: World, a: Actor): boolean => {
  if (a.reloadEndsAt > 0 || w.time < a.drawEndsAt) return false;
  const ws = activeWeaponState(a);
  if (!ws) return false;
  const def = getWeapon(ws.id);
  if (def.magSize <= 0 || ws.ammo >= def.magSize || ws.reserve <= 0) return false;
  a.reloadEndsAt = w.time + def.reloadTime;
  a.scopeLevel = 0;
  w.emit({ type: 'reloadStart', actorId: a.id, weapon: ws.id });
  return true;
};

export const cancelUse = (w: World, a: Actor): void => {
  if (a.useKind === 'plant') w.emit({ type: 'plantAbort', actorId: a.id });
  else if (a.useKind === 'defuse') w.emit({ type: 'defuseAbort', actorId: a.id });
  a.useKind = null;
  a.useProgress = 0;
};

export const dropWeapon = (w: World, a: Actor, slot: 'primary' | 'secondary'): DroppedWeapon | null => {
  const ws = weaponInSlot(a, slot);
  if (!ws) return null;
  a.weapons[slot] = null;
  const drop: DroppedWeapon = {
    id: w.nextDropId++,
    weapon: ws,
    pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z },
    ownerId: a.id,
    at: w.time,
  };
  w.drops.push(drop);
  w.emit({ type: 'weaponDrop', weapon: ws.id, pos: drop.pos });
  if (a.activeSlot === slot) {
    a.activeSlot = a.weapons.primary ? 'primary' : a.weapons.secondary ? 'secondary' : 'melee';
    a.drawEndsAt = w.time + getWeapon(activeWeaponId(a)).drawTime;
    a.reloadEndsAt = 0;
    a.scopeLevel = 0;
  }
  return drop;
};

/** Pick a dropped weapon up, swapping out whatever occupies the slot. */
export const pickupWeapon = (w: World, a: Actor, drop: DroppedWeapon): void => {
  const idx = w.drops.indexOf(drop);
  if (idx < 0) return;
  const slot = getWeapon(drop.weapon.id).slot;
  if (slot !== 'primary' && slot !== 'secondary') return;
  if (a.weapons[slot]) dropWeapon(w, a, slot);
  w.drops.splice(w.drops.indexOf(drop), 1);
  a.weapons[slot] = drop.weapon;
  switchSlot(w, a, slot);
  w.emit({ type: 'weaponPickup', actorId: a.id, weapon: drop.weapon.id });
};

// ----------------------------------------------------------------------------------------------------------------------
// Accuracy
// ----------------------------------------------------------------------------------------------------------------------

/** Current inaccuracy cone half-angle in radians. */
export const computeSpread = (a: Actor): number => {
  const def = getWeapon(activeWeaponId(a));
  const s = def.spread;
  const speed = Math.hypot(a.vel.x, a.vel.z);
  const speedRatio = clamp(speed / Math.max(def.moveSpeed, 1), 0, 1);
  const moveFactor = a.input.walk ? speedRatio * 0.25 : speedRatio;
  let deg = s.stand + s.move * moveFactor + a.shotSpread;
  if (!a.onGround) deg += s.air;
  if (def.scope && a.scopeLevel === 0) deg += def.scope.unscopedSpread;
  return deg * DEG2RAD;
};

// ----------------------------------------------------------------------------------------------------------------------
// Hit detection
// ----------------------------------------------------------------------------------------------------------------------

export interface ActorHit {
  t: number;
  zone: HitZone;
}

/** Ray vs. the actor's hitboxes (rotated by yaw). Returns the nearest zone hit within maxT. */
export const rayVsActor = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, a: Actor, out: ActorHit): boolean => {
  const cy = Math.cos(a.yaw);
  const sy = Math.sin(a.yaw);
  const rx = ox - a.pos.x;
  const ry = oy - a.pos.y;
  const rz = oz - a.pos.z;
  const lox = rx * cy - rz * sy;
  const loz = rx * sy + rz * cy;
  const ldx = dx * cy - dz * sy;
  const ldz = dx * sy + dz * cy;
  let best = maxT;
  let found = false;
  for (let i = 0; i < HITBOXES.length; i++) {
    const hb = HITBOXES[i];
    let tNear = -Infinity;
    let tFar = Infinity;
    // X slab
    if (Math.abs(ldx) < 1e-9) {
      if (lox < hb.cx - hb.hx || lox > hb.cx + hb.hx) continue;
    } else {
      let t1 = (hb.cx - hb.hx - lox) / ldx;
      let t2 = (hb.cx + hb.hx - lox) / ldx;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tNear) tNear = t1;
      if (t2 < tFar) tFar = t2;
    }
    // Y slab
    if (Math.abs(dy) < 1e-9) {
      if (ry < hb.cy - hb.hy || ry > hb.cy + hb.hy) continue;
    } else {
      let t1 = (hb.cy - hb.hy - ry) / dy;
      let t2 = (hb.cy + hb.hy - ry) / dy;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tNear) tNear = t1;
      if (t2 < tFar) tFar = t2;
    }
    // Z slab
    if (Math.abs(ldz) < 1e-9) {
      if (loz < hb.cz - hb.hz || loz > hb.cz + hb.hz) continue;
    } else {
      let t1 = (hb.cz - hb.hz - loz) / ldz;
      let t2 = (hb.cz + hb.hz - loz) / ldz;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tNear) tNear = t1;
      if (t2 < tFar) tFar = t2;
    }
    if (tNear > tFar || tFar < 0) continue;
    const t = tNear < 0 ? 0 : tNear;
    if (t < best) {
      best = t;
      out.t = t;
      out.zone = hb.zone;
      found = true;
    }
  }
  return found;
};

const actorHit: ActorHit = { t: 0, zone: 'chest' };

export interface ShotResult {
  kind: 'none' | 'world' | 'actor';
  t: number;
  victim: Actor | null;
  zone: HitZone;
  normal: Vec3 | null;
}

/** Trace a hitscan bullet from `origin` along the (normalised) direction. Teammates are ignored (no friendly fire). */
export const traceShot = (w: World, shooter: Actor, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number): ShotResult => {
  const cw = w.level.cw;
  let tWall = range;
  let normal: Vec3 | null = null;
  let kind: ShotResult['kind'] = 'none';
  if (cw.raycast(ox, oy, oz, dx, dy, dz, range, rayHit)) {
    tWall = rayHit.t;
    normal = { x: rayHit.nx, y: rayHit.ny, z: rayHit.nz };
    kind = 'world';
  }
  let victim: Actor | null = null;
  let zone: HitZone = 'chest';
  let bestT = tWall;
  for (const other of w.actors) {
    if (!other.alive || other.team === shooter.team) continue;
    // Cheap reject: closest approach of the ray to the actor's centre column.
    const cx = other.pos.x - ox;
    const cz = other.pos.z - oz;
    const along = cx * dx + cz * dz;
    if (along < -1 || along > bestT + 1) continue;
    if (rayVsActor(ox, oy, oz, dx, dy, dz, bestT, other, actorHit)) {
      bestT = actorHit.t;
      victim = other;
      zone = actorHit.zone;
    }
  }
  if (victim) return { kind: 'actor', t: bestT, victim, zone, normal: null };
  return { kind, t: tWall, victim: null, zone, normal };
};

// ----------------------------------------------------------------------------------------------------------------------
// Damage & death
// ----------------------------------------------------------------------------------------------------------------------

export const applyDamage = (w: World, attacker: Actor, victim: Actor, weapon: WeaponId, zone: HitZone, distance: number, baseOverride?: number): void => {
  if (!victim.alive) return;
  const dmg = computeDamage(weapon, zone, distance, victim.armor, victim.helmet, baseOverride);
  victim.armor = Math.max(0, victim.armor - dmg.armor);
  victim.hp -= dmg.health;
  victim.lastHurtAt = w.time;
  victim.lastHurtFrom = attacker.id;
  const killed = victim.hp <= 0;
  const p = { x: victim.pos.x, y: victim.pos.y + (zone === 'head' ? 1.64 : zone === 'leg' ? 0.5 : 1.2), z: victim.pos.z };
  w.emit({ type: 'hit', attackerId: attacker.id, victimId: victim.id, zone, damage: Math.round(dmg.health), weapon, point: p, killed });
  if (killed) killActor(w, victim, attacker, weapon, zone === 'head');
};

export const killActor = (w: World, victim: Actor, killer: Actor | null, weapon: WeaponId | null, headshot: boolean): void => {
  if (!victim.alive) return;
  victim.alive = false;
  victim.hp = 0;
  victim.diedAt = w.time;
  victim.deaths++;
  victim.vel.x = victim.vel.z = 0;
  victim.scopeLevel = 0;
  victim.reloadEndsAt = 0;
  if (victim.useKind) cancelUse(w, victim);
  victim.input.fire = false;
  if (victim.hasBomb) w.bombDropped(victim);
  // Drop the primary weapon where the actor fell.
  if (victim.weapons.primary) dropWeapon(w, victim, 'primary');

  if (killer && killer !== victim && weapon) {
    killer.kills++;
    killer.score += 2;
    if (headshot) killer.headshots++;
    killer.money = Math.min(16000, killer.money + getWeapon(weapon).killReward);
  }
  if (killer && weapon) {
    w.emit({
      type: 'kill',
      killerId: killer.id,
      victimId: victim.id,
      weapon,
      headshot,
      killerName: killer.name,
      victimName: victim.name,
      killerTeam: killer.team,
      victimTeam: victim.team,
    });
  }
  if (victim.human) w.emit({ type: 'playerDied', actorId: victim.id, killerId: killer ? killer.id : -1 });
};

// ----------------------------------------------------------------------------------------------------------------------
// Firing
// ----------------------------------------------------------------------------------------------------------------------

const scratchFwd = vec3();
const scratchRight = vec3();

const fireBullet = (w: World, a: Actor): void => {
  const ws = activeWeaponState(a);
  if (!ws) return;
  const def = getWeapon(ws.id);
  const rng = w.rng;

  ws.ammo--;
  // Keep the fire schedule instead of restarting it at "now": otherwise a 0.085 s interval would be rounded up to whole
  // 1/60 s ticks (0.1 s) and the M4 would shoot exactly as slowly as the AK.
  const lag = w.time - a.nextFireAt;
  a.nextFireAt = (lag >= 0 && lag < SIM_DT * 1.01 ? a.nextFireAt : w.time) + def.fireInterval;
  a.lastShotAt = w.time;
  a.shotIndex++;

  // Direction = view direction (including punch) + random point inside the inaccuracy cone.
  const yaw = a.yaw + a.punchYaw;
  const pitch = a.pitch + a.punchPitch;
  const fwd = forwardFromAngles(yaw, pitch, scratchFwd);
  const right = rightFromYaw(yaw, scratchRight);
  // up = right x forward
  const upx = Math.sin(yaw) * fwd.y;
  const upy = -Math.sin(yaw) * fwd.x - Math.cos(yaw) * fwd.z;
  const upz = Math.cos(yaw) * fwd.y;
  const spread = computeSpread(a);
  const rad = Math.tan(spread) * Math.sqrt(rng.next());
  const ang = rng.next() * TAU;
  const sx = Math.cos(ang) * rad;
  const sy = Math.sin(ang) * rad;
  let dx = fwd.x + right.x * sx + upx * sy;
  let dy = fwd.y + right.y * sx + upy * sy;
  let dz = fwd.z + right.z * sx + upz * sy;
  const dl = Math.hypot(dx, dy, dz);
  dx /= dl;
  dy /= dl;
  dz /= dl;

  const ox = a.pos.x;
  const oy = a.pos.y + EYE;
  const oz = a.pos.z;
  const res = traceShot(w, a, ox, oy, oz, dx, dy, dz, def.range);
  const end = { x: ox + dx * res.t, y: oy + dy * res.t, z: oz + dz * res.t };
  const muzzle = { x: ox + fwd.x * 0.6 + right.x * 0.16, y: oy - 0.14 + fwd.y * 0.6, z: oz + fwd.z * 0.6 + right.z * 0.16 };
  w.emit({ type: 'shot', actorId: a.id, weapon: def.id, muzzle, end, hit: res.kind, normal: res.normal });
  if (res.kind === 'actor' && res.victim) applyDamage(w, a, res.victim, def.id, res.zone, res.t);

  // View kick and accumulated inaccuracy.
  const rec = def.recoil;
  const scopedDamp = a.scopeLevel > 0 ? 0.6 : 1;
  a.punchPitch = Math.min(rec.max * DEG2RAD, a.punchPitch + rec.pitch * DEG2RAD * scopedDamp);
  a.punchYaw = clamp(a.punchYaw + (rng.next() - 0.5) * 2 * rec.yaw * DEG2RAD, -rec.max * 0.5 * DEG2RAD, rec.max * 0.5 * DEG2RAD);
  a.shotSpread = Math.min(def.spread.maxShot, a.shotSpread + def.spread.perShot);
};

const meleeAttack = (w: World, a: Actor, stab: boolean): void => {
  const def = getWeapon('knife');
  const damage = stab && def.stab ? def.stab.damage : def.damage;
  a.nextFireAt = w.time + (stab && def.stab ? def.stab.interval : def.fireInterval);
  a.lastShotAt = w.time;
  const fx = -Math.sin(a.yaw);
  const fz = -Math.cos(a.yaw);
  const eye = eyePosition(a);
  let target: Actor | null = null;
  let bestD = def.range + 0.4;
  for (const other of w.actors) {
    if (!other.alive || other.team === a.team) continue;
    const d = dist2D(a.pos.x, a.pos.z, other.pos.x, other.pos.z);
    if (d > bestD || Math.abs(other.pos.y - a.pos.y) > 1.6) continue;
    const dot = ((other.pos.x - a.pos.x) * fx + (other.pos.z - a.pos.z) * fz) / Math.max(d, 1e-6);
    if (dot < 0.4) continue;
    const chest = { x: other.pos.x, y: other.pos.y + 1.2, z: other.pos.z };
    if (!w.level.cw.lineClear(eye, chest)) continue;
    bestD = d;
    target = other;
  }
  const end = { x: eye.x + fx * 1.4, y: eye.y - 0.3, z: eye.z + fz * 1.4 };
  w.emit({ type: 'shot', actorId: a.id, weapon: 'knife', muzzle: eyePosition(a), end, hit: target ? 'actor' : 'none', normal: null });
  if (target) applyDamage(w, a, target, 'knife', 'chest', 0, damage);
};

// ----------------------------------------------------------------------------------------------------------------------
// Per-tick update
// ----------------------------------------------------------------------------------------------------------------------

export const updateWeapons = (w: World, a: Actor, dt: number, frozen: boolean): void => {
  const input = a.input;
  const def = getWeapon(activeWeaponId(a));

  // Recoil & inaccuracy only recover once the trigger has been released for a moment, so sustained fire accumulates:
  // the AK climbs and blooms hard over a spray, the M4 barely does.
  const rec = def.recoil;
  const settle = clamp(def.fireInterval * 1.25, 0.09, 0.2);
  if (w.time - a.lastShotAt > settle) {
    const recover = rec.recovery * DEG2RAD * dt;
    a.punchPitch = Math.max(0, a.punchPitch - recover - a.punchPitch * 3.5 * dt);
    if (a.punchYaw > 0) a.punchYaw = Math.max(0, a.punchYaw - recover * 0.6 - a.punchYaw * 3 * dt);
    else if (a.punchYaw < 0) a.punchYaw = Math.min(0, a.punchYaw + recover * 0.6 - a.punchYaw * 3 * dt);
    a.shotSpread = Math.max(0, a.shotSpread - def.spread.recovery * dt);
  }
  if (w.time - a.lastShotAt > 0.35) a.shotIndex = 0;

  if (!a.alive) return;

  // Edge-triggered requests.
  if (input.switchTo) {
    switchSlot(w, a, input.switchTo);
    input.switchTo = null;
  }
  if (input.switchLast) {
    switchSlot(w, a, a.lastSlot);
    input.switchLast = false;
  }
  if (input.drop) {
    input.drop = false;
    if (a.activeSlot === 'primary' || a.activeSlot === 'secondary') dropWeapon(w, a, a.activeSlot);
  }
  if (input.reload) {
    input.reload = false;
    startReload(w, a);
  }
  const cur = getWeapon(activeWeaponId(a));
  if (input.scopeToggle) {
    input.scopeToggle = false;
    if (cur.scope && w.time >= a.drawEndsAt && a.reloadEndsAt === 0) {
      a.scopeLevel = ((a.scopeLevel + 1) % 3) as 0 | 1 | 2;
      w.emit({ type: 'scope', actorId: a.id, level: a.scopeLevel });
    } else if (cur.kind === 'knife' && !frozen && w.time >= a.nextFireAt && w.time >= a.drawEndsAt) {
      meleeAttack(w, a, true);
    }
  }

  // Reload completion.
  if (a.reloadEndsAt > 0 && w.time >= a.reloadEndsAt) {
    a.reloadEndsAt = 0;
    const ws = activeWeaponState(a);
    if (ws) {
      const d = getWeapon(ws.id);
      const n = Math.min(d.magSize - ws.ammo, ws.reserve);
      ws.ammo += n;
      ws.reserve -= n;
      w.emit({ type: 'reloadEnd', actorId: a.id, weapon: ws.id });
    }
  }

  // Firing.
  const canShoot = !frozen && w.time >= a.nextFireAt && w.time >= a.drawEndsAt && a.reloadEndsAt === 0 && a.useKind === null;
  const trigger = input.fire && a.activeSlot !== 'bomb';
  if (trigger && canShoot) {
    if (cur.kind === 'knife') {
      if (cur.automatic || !a.triggerWasDown) meleeAttack(w, a, false);
    } else if (cur.kind !== 'bomb') {
      const fresh = cur.automatic || !a.triggerWasDown;
      if (fresh) {
        const ws = activeWeaponState(a);
        if (ws && ws.ammo > 0) {
          fireBullet(w, a);
          if (ws.ammo === 0 && ws.reserve > 0) startReload(w, a);
        } else if (ws) {
          a.nextFireAt = w.time + 0.25;
          w.emit({ type: 'dryFire', actorId: a.id, weapon: ws.id });
          if (ws.reserve > 0) startReload(w, a);
        }
      }
    }
  }
  a.triggerWasDown = input.fire;
  a.spread = computeSpread(a);
};
