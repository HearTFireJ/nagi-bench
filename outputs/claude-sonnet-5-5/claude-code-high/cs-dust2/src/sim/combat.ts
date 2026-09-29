// Weapon handling shared by the human and every bot: fire control, spread, recoil,
// hitscan with hitbox zones, armor, reload, weapon switching, melee.

import { CFG } from './config.ts';
import type { Actor } from './actor.ts';
import { HIT_MULT, rayHitbox } from './hitbox.ts';
import type { HitGroup } from './hitbox.ts';
import type { GameSim } from './game.ts';
import { DEG, TAU, clamp, dirFromAngles, lerp, rand, yawToDir } from './math.ts';
import type { WeaponId, WeaponSlot } from './weapons.ts';

const RANGE_UNIT = 12.7;

export function switchSlot(sim: GameSim, a: Actor, slot: WeaponSlot): void {
  if (!a.alive || a.slot === slot || !a.weapons[slot]) return;
  a.lastSlot = a.slot;
  a.slot = slot;
  a.reloadLeft = 0;
  a.scopeLevel = 0;
  a.plantProgress = 0;
  const def = a.weapon.def;
  a.drawLeft = def.drawTime;
  a.nextFireAt = Math.max(a.nextFireAt, sim.t + def.drawTime * 0.6);
  sim.emit({ type: 'switch', actorId: a.id, weaponId: def.id });
}

export function switchToBest(sim: GameSim, a: Actor): void {
  if (a.weapons.primary && a.weapons.primary.ammo + a.weapons.primary.reserve > 0) switchSlot(sim, a, 'primary');
  else if (a.weapons.secondary) switchSlot(sim, a, 'secondary');
  else switchSlot(sim, a, 'melee');
}

export function startReload(sim: GameSim, a: Actor): void {
  const w = a.weapon;
  if (w.def.magSize === 0 || w.ammo >= w.def.magSize || w.reserve <= 0 || a.reloadLeft > 0 || a.drawLeft > 0) return;
  a.reloadLeft = w.def.reloadTime;
  a.scopeLevel = 0;
  sim.emit({ type: 'reloadStart', actorId: a.id, weaponId: w.def.id });
}

export function setScope(sim: GameSim, a: Actor, level: number): void {
  const sc = a.weapon.def.scope;
  if (!sc || a.reloadLeft > 0 || a.drawLeft > 0) level = 0;
  if (level === a.scopeLevel) return;
  a.scopeLevel = level;
  sim.emit({ type: 'scope', actorId: a.id, level });
}

/** Current inaccuracy cone (degrees) for `a`, used both for shooting and the crosshair. */
export function currentSpread(a: Actor): number {
  const def = a.weapon.def;
  if (def.slot === 'melee') return 0;
  const s = def.spread;
  let base: number;
  if (!a.onGround) base = s.air;
  else {
    const f = clamp(a.speed / (CFG.RUN_SPEED * 0.85), 0, 1);
    base = lerp(s.stand, s.move, f);
  }
  if (def.scope) {
    if (a.scopeLevel === 0) base += def.scope.unscopedSpread;
    else if (a.speed < 1 && a.onGround) base = 0;
  }
  return base + a.spreadAccum;
}

/** Per-tick weapon logic: timers, recoil recovery, trigger handling. */
export function updateWeapon(sim: GameSim, a: Actor, dt: number, canAct: boolean): void {
  const w = a.weapon;
  const def = w.def;

  // recoil / spread recovery
  if (a.punchPitch > 0 || a.punchYaw !== 0) {
    const r = def.recoil;
    a.punchPitch = Math.max(0, a.punchPitch - (r.recover + a.punchPitch * r.recoverExp) * dt);
    const sgn = Math.sign(a.punchYaw);
    const mag = Math.max(0, Math.abs(a.punchYaw) - (r.recover * 0.6 + Math.abs(a.punchYaw) * r.recoverExp) * dt);
    a.punchYaw = sgn * mag;
  }
  if (a.spreadAccum > 0) a.spreadAccum = Math.max(0, a.spreadAccum - def.spread.recover * dt);
  if (sim.t - a.lastShotAt > 0.4) a.sprayCount = 0;

  if (a.drawLeft > 0) a.drawLeft = Math.max(0, a.drawLeft - dt);
  if (a.reloadLeft > 0) {
    a.reloadLeft -= dt;
    if (a.reloadLeft <= 0) {
      a.reloadLeft = 0;
      const need = def.magSize - w.ammo;
      const take = Math.min(need, w.reserve);
      w.ammo += take;
      w.reserve -= take;
      sim.emit({ type: 'reloadEnd', actorId: a.id, weaponId: def.id });
    }
  }

  const inp = a.input;
  if (!canAct) {
    a.triggerHeld = inp.fire;
    a.altHeld = inp.altFire;
    return;
  }

  if (inp.reload) startReload(sim, a);

  // secondary button: scope toggle (AWP) or heavy stab (knife)
  const altEdge = inp.altFire && !a.altHeld;
  if (altEdge) {
    if (def.scope) setScope(sim, a, (a.scopeLevel + 1) % 3);
    else if (def.melee && sim.t >= a.nextFireAt && a.drawLeft <= 0) meleeAttack(sim, a, true);
  }

  if (inp.fire && a.reloadLeft <= 0 && a.drawLeft <= 0 && sim.t >= a.nextFireAt) {
    if (def.slot === 'melee') {
      meleeAttack(sim, a, false);
    } else if (!def.auto && a.triggerHeld) {
      // semi-auto needs a fresh click
    } else if (w.ammo <= 0) {
      a.nextFireAt = sim.t + 0.25;
      if (!a.triggerHeld) sim.emit({ type: 'empty', actorId: a.id });
      if (w.reserve > 0) startReload(sim, a);
    } else {
      fireGun(sim, a);
    }
  }
  if (w.ammo <= 0 && w.reserve > 0 && a.reloadLeft <= 0 && def.magSize > 0) startReload(sim, a);

  a.triggerHeld = inp.fire;
  a.altHeld = inp.altFire;
}

function fireGun(sim: GameSim, a: Actor): void {
  const w = a.weapon;
  const def = w.def;
  w.ammo--;
  a.nextFireAt = sim.t + def.fireInterval;
  if (sim.t - a.lastShotAt > 0.4) a.sprayCount = 0;

  const spread = currentSpread(a) * DEG;
  const r = spread * Math.sqrt(rand());
  const ang = rand() * TAU;
  const yaw = a.yaw + a.punchYaw * DEG + r * Math.cos(ang);
  const pitch = a.pitch + a.punchPitch * DEG + r * Math.sin(ang);
  const dir = dirFromAngles(yaw, pitch);
  const origin = { x: a.pos.x, y: a.eyeY, z: a.pos.z };
  traceBullet(sim, a, origin, dir);

  a.lastShotAt = sim.t;
  a.noiseAt = sim.t;
  a.spreadAccum = Math.min(def.spread.max, a.spreadAccum + def.spread.perShot);
  const rc = def.recoil;
  a.punchPitch = Math.min(rc.max, a.punchPitch + rc.pitch * (a.sprayCount === 0 ? 0.8 : 1));
  const drift = Math.sin(a.sprayCount * 0.85) * 0.6 + (rand() - 0.5) * 0.9;
  a.punchYaw = clamp(a.punchYaw + rc.yaw * drift, -rc.max * 0.5, rc.max * 0.5);
  a.sprayCount++;

  if (def.scope && a.scopeLevel > 0) setScope(sim, a, 0);
  sim.makeNoise(a, def.id === 'awp' ? 70 : def.id === 'usp' ? 22 : 48);
}

function traceBullet(sim: GameSim, shooter: Actor, o: { x: number; y: number; z: number }, d: { x: number; y: number; z: number }): void {
  const MAX = 220;
  const wh = sim.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, MAX);
  let bestT = wh ? wh.t : MAX;
  let bestActor: Actor | null = null;
  let bestGroup: HitGroup = 'chest';
  for (const v of sim.actors) {
    if (!v.alive || v.team === shooter.team) continue;
    const vx = v.pos.x - o.x;
    const vy = v.pos.y + 0.9 - o.y;
    const vz = v.pos.z - o.z;
    const proj = vx * d.x + vy * d.y + vz * d.z;
    if (proj < 0 || proj > bestT + 1.5) continue;
    const perp2 = vx * vx + vy * vy + vz * vz - proj * proj;
    if (perp2 > 1.3 * 1.3) continue;
    const h = rayHitbox(o.x, o.y, o.z, d.x, d.y, d.z, bestT, v.pos.x, v.pos.y, v.pos.z, v.yaw);
    if (h && h.t < bestT) {
      bestT = h.t;
      bestActor = v;
      bestGroup = h.group;
    }
  }
  const end = { x: o.x + d.x * bestT, y: o.y + d.y * bestT, z: o.z + d.z * bestT };
  const def = shooter.weapon.def;
  if (bestActor) {
    sim.emit({ type: 'shot', actorId: shooter.id, weaponId: def.id, origin: o, end, hit: 'actor', group: bestGroup });
    const falloff = Math.pow(def.rangeMod, bestT / RANGE_UNIT);
    const dmg = def.damage * HIT_MULT[bestGroup] * falloff;
    applyDamage(sim, shooter, bestActor, dmg, bestGroup, def.armorPen, def.id, end);
  } else if (wh) {
    sim.emit({
      type: 'shot',
      actorId: shooter.id,
      weaponId: def.id,
      origin: o,
      end,
      hit: 'world',
      normal: { x: wh.nx, y: wh.ny, z: wh.nz },
    });
  } else {
    sim.emit({ type: 'shot', actorId: shooter.id, weaponId: def.id, origin: o, end, hit: 'none' });
  }
}

function meleeAttack(sim: GameSim, a: Actor, heavy: boolean): void {
  const def = a.weapon.def;
  const m = def.melee;
  if (!m) return;
  a.nextFireAt = sim.t + (heavy ? m.altInterval : def.fireInterval);
  a.meleeAnimAt = sim.t;
  const o = { x: a.pos.x, y: a.eyeY, z: a.pos.z };
  const dir = dirFromAngles(a.yaw, a.pitch);
  let target: Actor | null = null;
  let bestScore = Infinity;
  for (const v of sim.actors) {
    if (!v.alive || v.team === a.team) continue;
    const cx = v.pos.x - o.x;
    const cy = v.pos.y + 1.2 - o.y;
    const cz = v.pos.z - o.z;
    const dist = Math.hypot(cx, cy, cz);
    if (dist > m.range + 0.35) continue;
    const cosA = (cx * dir.x + cy * dir.y + cz * dir.z) / Math.max(dist, 1e-4);
    if (cosA < 0.75 && dist > 0.8) continue;
    if (!sim.world.lineOfSight(o.x, o.y, o.z, v.pos.x, v.pos.y + 1.2, v.pos.z)) continue;
    if (dist < bestScore) {
      bestScore = dist;
      target = v;
    }
  }
  const end = { x: o.x + dir.x * m.range, y: o.y + dir.y * m.range, z: o.z + dir.z * m.range };
  sim.emit({
    type: 'shot',
    actorId: a.id,
    weaponId: def.id,
    origin: o,
    end,
    hit: target ? 'actor' : 'none',
    group: 'chest',
  });
  if (!target) return;
  const f = yawToDir(target.yaw);
  const tx = target.pos.x - a.pos.x;
  const tz = target.pos.z - a.pos.z;
  const tl = Math.hypot(tx, tz) || 1;
  const behind = (f.x * tx + f.z * tz) / tl > 0.35;
  let dmg = heavy ? m.altDamage : def.damage;
  if (behind) dmg = heavy ? 195 : 76;
  applyDamage(sim, a, target, dmg, 'chest', def.armorPen, def.id, { x: target.pos.x, y: target.pos.y + 1.2, z: target.pos.z });
}

export function applyDamage(
  sim: GameSim,
  attacker: Actor,
  victim: Actor,
  dmg: number,
  group: HitGroup,
  armorPen: number,
  weaponId: WeaponId,
  pos: { x: number; y: number; z: number },
): void {
  if (!victim.alive) return;
  // legs are never covered by kevlar; the head only with a helmet
  const protectedZone = group === 'head' ? victim.helmet : group !== 'leg';
  let hpDmg = dmg;
  if (victim.armor > 0 && protectedZone) {
    hpDmg = dmg * armorPen;
    const absorbed = dmg - hpDmg;
    let armorLoss = absorbed * CFG.ARMOR_ABSORB;
    if (armorLoss > victim.armor) {
      hpDmg += (armorLoss - victim.armor) / CFG.ARMOR_ABSORB;
      armorLoss = victim.armor;
    }
    victim.armor = Math.max(0, Math.round(victim.armor - armorLoss));
  }
  hpDmg = Math.max(1, Math.round(hpDmg));
  const dealt = Math.min(hpDmg, victim.hp);
  victim.hp -= hpDmg;
  victim.lastHitBy = attacker.id;
  attacker.damageDone += dealt;
  const killed = victim.hp <= 0;
  sim.emit({ type: 'hit', attackerId: attacker.id, victimId: victim.id, damage: hpDmg, group, killed, pos });
  sim.emit({ type: 'damage', victimId: victim.id, fromX: attacker.pos.x, fromZ: attacker.pos.z, amount: hpDmg });
  sim.onDamaged(victim, attacker);
  if (killed) sim.killActor(victim, attacker, weaponId, group === 'head');
}

