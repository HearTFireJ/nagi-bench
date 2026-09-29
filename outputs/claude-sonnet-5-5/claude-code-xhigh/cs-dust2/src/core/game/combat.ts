import type { Game } from './game.ts';
import type { Character } from '../entities/character.ts';
import type { WeaponSlot } from '../weapons/defs.ts';
import { DEG, TAU, clamp, forwardFromAngles, lerp } from '../math.ts';
import type { Vec3 } from '../math.ts';
import { makeRayHit } from '../physics/world.ts';
import { raycastCharacter, computeDamage } from '../weapons/damage.ts';
import type { Hitbox } from '../weapons/damage.ts';
import type { WeaponInstance } from '../weapons/weaponState.ts';

const rayHit = makeRayHit();
const fwd: Vec3 = { x: 0, y: 0, z: -1 };

/** Current bullet inaccuracy cone (degrees) of a character with its active weapon. */
export function currentSpread(ch: Character, w: WeaponInstance): number {
  const sp = w.def.spread;
  const speedFrac = clamp(ch.speed2D / Math.max(0.1, w.def.moveSpeed), 0, 1.2);
  const moveFrac = clamp((speedFrac - 0.3) / 0.7, 0, 1);
  const scope = w.def.scope;
  let s: number;
  if (scope && ch.scope === 0) {
    s = scope.unscopedSpread + moveFrac * (sp.move * 0.3);
  } else if (!ch.onGround) {
    s = sp.air;
  } else {
    s = lerp(sp.stand, sp.move, moveFrac);
  }
  if (ch.onGround) s *= lerp(1, sp.crouchMul, ch.crouch);
  return s + w.bloom;
}

export function switchTo(game: Game, ch: Character, slot: WeaponSlot | 'last'): boolean {
  const target: WeaponSlot = slot === 'last' ? ch.lastSlot : slot;
  const w = ch.slotWeapon(target);
  if (!w || target === ch.activeSlot) return false;
  ch.lastSlot = ch.activeSlot;
  ch.activeSlot = target;
  ch.reloadEnd = -1;
  ch.scope = 0;
  w.deployEnd = game.time + w.def.deployTime;
  game.emit({ type: 'switch', id: ch.id, weapon: w.def.id });
  return true;
}

/** Best available slot in priority order (used after death of primary / when bots want a gun). */
export function bestSlot(ch: Character): WeaponSlot {
  if (ch.primary) return 'primary';
  return 'secondary';
}

export function startReload(game: Game, ch: Character): void {
  const w = ch.weapon;
  const d = w.def;
  if (d.mag <= 0 || ch.reloading || w.mag >= d.mag || w.reserve <= 0) return;
  ch.reloadEnd = game.time + d.reloadTime;
  ch.scope = 0;
  game.emit({ type: 'reload', id: ch.id, weapon: d.id, duration: d.reloadTime });
  game.emitNoise(ch, 6, 'reload');
}

function finishReload(game: Game, ch: Character): void {
  const w = ch.weapon;
  const need = w.def.mag - w.mag;
  const take = Math.min(need, w.reserve);
  w.mag += take;
  w.reserve -= take;
  ch.reloadEnd = -1;
  game.emit({ type: 'reloadDone', id: ch.id, weapon: w.def.id });
}

/**
 * Per-tick weapon handling for one character: recoil recovery, switching, reload,
 * scope and firing. `canShoot` is false during freeze time / after the round ended.
 */
export function tickWeapons(game: Game, ch: Character, dt: number, canShoot: boolean): void {
  const t = game.time;
  const cmd = ch.cmd;
  const w = ch.weapon;

  // view punch recovers exponentially; bloom recovers linearly
  const k = Math.exp(-w.def.recoil.decay * dt);
  ch.punchPitch *= k;
  ch.punchYaw *= k;
  if (Math.abs(ch.punchPitch) < 0.001) ch.punchPitch = 0;
  if (Math.abs(ch.punchYaw) < 0.001) ch.punchYaw = 0;
  for (const inst of [ch.primary, ch.secondary, ch.melee]) {
    if (inst && inst.bloom > 0 && t - inst.lastShot > 0.06) inst.bloom = Math.max(0, inst.bloom - inst.def.spread.recover * dt);
  }

  if (cmd.slot) {
    switchTo(game, ch, cmd.slot);
    cmd.slot = null;
  }

  const active = ch.weapon;
  if (ch.reloadEnd >= 0 && t >= ch.reloadEnd) finishReload(game, ch);
  if (cmd.reload && !ch.prevReload) startReload(game, ch);

  // right mouse: scope (AWP) or stab (knife)
  const press2 = cmd.fire2 && !ch.prevFire2;
  if (press2 && active.def.scope && !ch.reloading && t >= active.deployEnd) {
    ch.scope = ch.scope >= active.def.scope.fovs.length ? 0 : ch.scope + 1;
    game.emit({ type: 'scope', id: ch.id, level: ch.scope });
  }
  if (!active.def.scope && ch.scope !== 0) ch.scope = 0;

  if (canShoot) {
    if (active.def.melee) {
      if ((cmd.fire && t >= active.nextFire) || (press2 && t >= active.nextFire)) meleeAttack(game, ch, active, !cmd.fire && press2);
    } else if (cmd.fire) {
      tryFire(game, ch, active);
    }
  }

  ch.prevFire = cmd.fire;
  ch.prevFire2 = cmd.fire2;
  ch.prevReload = cmd.reload;
}

function tryFire(game: Game, ch: Character, w: WeaponInstance): void {
  const t = game.time;
  const d = w.def;
  if (ch.reloading || t < w.nextFire || t < w.deployEnd) return;
  if (!d.auto && ch.prevFire) return;
  if (w.mag <= 0) {
    if (!ch.prevFire) game.emit({ type: 'dryfire', id: ch.id, weapon: d.id });
    if (w.reserve > 0) startReload(game, ch);
    else w.nextFire = t + 0.25;
    return;
  }

  w.mag--;
  w.nextFire = t + d.fireInterval;
  if (t - w.lastShot > d.recoil.resetTime) w.sprayIndex = 0;
  const idx = w.sprayIndex++;
  w.lastShot = t;
  ch.lastShotTime = t;

  // direction = view + punch + random cone
  const spreadDeg = currentSpread(ch, w);
  const yaw = ch.yaw + ch.punchYaw * DEG;
  const pitch = ch.pitch + ch.punchPitch * DEG;
  forwardFromAngles(yaw, pitch, fwd);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const ux = Math.sin(yaw) * Math.sin(pitch);
  const uy = Math.cos(pitch);
  const uz = Math.cos(yaw) * Math.sin(pitch);
  const ang = game.rng.next() * TAU;
  const rad = Math.tan(spreadDeg * DEG) * Math.sqrt(game.rng.next());
  const ca = Math.cos(ang) * rad;
  const sa = Math.sin(ang) * rad;
  let dx = fwd.x + rx * ca + ux * sa;
  let dy = fwd.y + uy * sa;
  let dz = fwd.z + rz * ca + uz * sa;
  const l = Math.hypot(dx, dy, dz);
  dx /= l;
  dy /= l;
  dz /= l;

  const ox = ch.pos.x;
  const oy = ch.eyeY;
  const oz = ch.pos.z;
  const res = hitscan(game, ch, ox, oy, oz, dx, dy, dz, d.maxRange);

  game.emit({
    type: 'shot',
    shooter: ch.id,
    weapon: d.id,
    ox,
    oy,
    oz,
    ex: ox + dx * res.t,
    ey: oy + dy * res.t,
    ez: oz + dz * res.t,
    hit: res.victim ? 'char' : res.world ? 'world' : 'none',
    nx: res.nx,
    ny: res.ny,
    nz: res.nz,
    silenced: !!d.silenced,
  });
  game.emitNoise(ch, d.silenced ? 26 : d.cls === 'sniper' ? 95 : 70, 'shot');

  if (res.victim) {
    game.applyDamage(ch, res.victim, d.id, res.hitbox, res.t, 1, res.t * dx + ox, res.t * dy + oy, res.t * dz + oz);
  }

  // recoil: gentle first shot, full strength after a few bullets in the spray
  const rec = d.recoil;
  const factor = Math.min(1, 0.55 + 0.15 * idx);
  const crouchMul = 1 - 0.15 * ch.crouch;
  ch.punchPitch = Math.min(14, ch.punchPitch + rec.pitch * factor * crouchMul);
  ch.punchYaw = clamp(ch.punchYaw + rec.yaw * (game.rng.range(-1, 1) + Math.sin(idx * 0.75) * 0.6), -6, 6);
  w.bloom = Math.min(d.spread.max, w.bloom + d.spread.perShot);

  if (d.scope) ch.scope = 0; // bolt action pulls you out of the scope
}

export interface ScanResult {
  t: number;
  world: boolean;
  victim: Character | null;
  hitbox: Hitbox;
  nx: number;
  ny: number;
  nz: number;
}
const scan: ScanResult = { t: 0, world: false, victim: null, hitbox: 'chest', nx: 0, ny: 1, nz: 0 };

/** Trace a bullet: nearest of world geometry and enemy hit zones. (Teammates are ignored: no friendly fire.) */
export function hitscan(game: Game, shooter: Character, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxRange: number): ScanResult {
  let tMax = maxRange;
  scan.world = false;
  scan.victim = null;
  scan.hitbox = 'chest';
  scan.nx = 0;
  scan.ny = 1;
  scan.nz = 0;
  if (game.world.raycast(ox, oy, oz, dx, dy, dz, maxRange, rayHit)) {
    tMax = rayHit.t;
    scan.world = true;
    scan.nx = rayHit.nx;
    scan.ny = rayHit.ny;
    scan.nz = rayHit.nz;
  }
  for (const c of game.chars) {
    if (!c.alive || c === shooter || c.team === shooter.team) continue;
    const h = raycastCharacter(c.pos, c.yaw, c.crouch, ox, oy, oz, dx, dy, dz, tMax);
    if (h && h.t < tMax) {
      tMax = h.t;
      scan.victim = c;
      scan.hitbox = h.hitbox;
      scan.world = false;
    }
  }
  scan.t = tMax;
  return scan;
}

function meleeAttack(game: Game, ch: Character, w: WeaponInstance, stab: boolean): void {
  const t = game.time;
  const m = w.def.melee;
  if (!m || t < w.deployEnd) return;
  w.nextFire = t + (stab ? m.stabInterval : m.slashInterval);
  forwardFromAngles(ch.yaw, ch.pitch, fwd);
  const ex = ch.pos.x;
  const ey = ch.eyeY;
  const ez = ch.pos.z;
  let best: Character | null = null;
  let bestD = m.range;
  for (const c of game.chars) {
    if (!c.alive || c.team === ch.team) continue;
    const tx = c.pos.x - ex;
    const ty = c.pos.y + 1.1 - ey;
    const tz = c.pos.z - ez;
    const dist = Math.hypot(tx, ty, tz);
    if (dist > bestD) continue;
    const cosAng = (tx * fwd.x + ty * fwd.y + tz * fwd.z) / Math.max(dist, 1e-6);
    if (cosAng < 0.55 && dist > 0.6) continue;
    if (!game.world.lineClear(ex, ey, ez, c.pos.x, c.pos.y + 1.1, c.pos.z)) continue;
    best = c;
    bestD = dist;
  }
  game.emit({ type: 'melee', id: ch.id, kind: stab ? 'stab' : 'slash', hit: !!best, x: ex, y: ey, z: ez });
  game.emitNoise(ch, 8, 'shot');
  if (!best) return;
  // backstab: both face the same way
  const bfx = -Math.sin(best.yaw);
  const bfz = -Math.cos(best.yaw);
  const back = bfx * fwd.x + bfz * fwd.z > 0.35;
  const dmg = back ? m.backstabDamage : stab ? m.stabDamage : m.slashDamage;
  const res = computeDamage({ ...w.def, damage: dmg, rangeMod: 1 }, 'chest', 0, best.armor, best.helmet);
  game.applyDamageRaw(ch, best, w.def.id, 'chest', res.health, res.armorLoss, best.pos.x, best.pos.y + 1.1, best.pos.z);
}
