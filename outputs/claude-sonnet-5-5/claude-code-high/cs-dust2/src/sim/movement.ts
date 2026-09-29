// Kinematic character movement: accelerate toward the wish direction, circle-vs-box push-out,
// gravity, jump, stepping onto / standing on crates, footstep bookkeeping.

import { CFG } from './config.ts';
import type { Actor } from './actor.ts';
import type { SimEvent } from './types.ts';
import type { World } from './world.ts';

export function maxSpeedFor(a: Actor): number {
  const def = a.weapon.def;
  let sp = CFG.RUN_SPEED * def.moveSpeed;
  if (a.scopeLevel > 0 && def.scope) sp = CFG.RUN_SPEED * def.scope.scopedMove;
  if (a.input.walk) sp *= CFG.WALK_MULT;
  return sp;
}

export function stepMovement(
  a: Actor,
  dt: number,
  world: World,
  emit: (e: SimEvent) => void,
  frozen: boolean,
): void {
  a.prev.x = a.pos.x;
  a.prev.y = a.pos.y;
  a.prev.z = a.pos.z;
  a.prevYaw = a.yaw;

  const inp = a.input;
  let wx = frozen ? 0 : inp.wishX;
  let wz = frozen ? 0 : inp.wishZ;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) {
    wx /= wl;
    wz /= wl;
  }
  const maxSp = maxSpeedFor(a);
  const accel = a.onGround ? CFG.GROUND_ACCEL : CFG.AIR_ACCEL;
  let dvx = wx * maxSp - a.vel.x;
  let dvz = wz * maxSp - a.vel.z;
  const dl = Math.hypot(dvx, dvz);
  const maxDv = accel * dt;
  if (dl > maxDv) {
    dvx *= maxDv / dl;
    dvz *= maxDv / dl;
  }
  a.vel.x += dvx;
  a.vel.z += dvz;

  if (inp.jump && a.onGround && !frozen) {
    a.vel.y = CFG.JUMP_V;
    a.onGround = false;
    emit({ type: 'jump', actorId: a.id, pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z } });
  }

  // horizontal
  const p = { x: a.pos.x + a.vel.x * dt, z: a.pos.z + a.vel.z * dt };
  const d = world.resolveCircle(p, CFG.RADIUS, a.pos.y, CFG.HEIGHT, CFG.STEP_H);
  const dlen = Math.hypot(d.dx, d.dz);
  if (dlen > 1e-6) {
    const nx = d.dx / dlen;
    const nz = d.dz / dlen;
    const vn = a.vel.x * nx + a.vel.z * nz;
    if (vn < 0) {
      a.vel.x -= vn * nx;
      a.vel.z -= vn * nz;
    }
  }
  a.pos.x = p.x;
  a.pos.z = p.z;

  // vertical
  if (!a.onGround) a.vel.y -= CFG.GRAVITY * dt;
  a.pos.y += a.vel.y * dt;
  const g = world.groundHeight(a.pos.x, a.pos.z, CFG.RADIUS, a.pos.y, CFG.STEP_H);
  if (a.vel.y <= 0 && a.pos.y <= g + 1e-4) {
    a.pos.y = g;
    a.vel.y = 0;
    a.onGround = true;
  } else if (a.onGround) {
    if (a.pos.y - g > 0.06) a.onGround = false;
    else a.pos.y = g;
  }

  a.speed = Math.hypot(a.vel.x, a.vel.z);

  // footsteps
  if (a.onGround && a.speed > 1.5) {
    a.walkPhase += a.speed * dt * 1.7;
    a.stepAccum += a.speed * dt;
    if (a.stepAccum >= CFG.STEP_DIST) {
      a.stepAccum = 0;
      if (!inp.walk) emit({ type: 'step', actorId: a.id, pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z } });
    }
  } else if (a.speed < 0.3) {
    a.stepAccum = CFG.STEP_DIST * 0.7;
  }
}
