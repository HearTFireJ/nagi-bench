// Player / bot locomotion: Quake-style ground friction + acceleration, air control, jumping and footstep events.
import type { CollisionWorld } from './collision';
import { BODY } from './config';
import { activeWeaponId } from './actor';
import { getWeapon } from './weapons';
import type { Actor } from './types';
import type { GameEvent } from './events';

const STEP_STRIDE = 2.1;

export const maxSpeedOf = (a: Actor): number => {
  const def = getWeapon(activeWeaponId(a));
  let speed = def.moveSpeed;
  if (def.scope && a.scopeLevel > 0) speed = def.scope.scopedSpeed;
  if (a.input.walk) speed *= BODY.walkFactor;
  return speed;
};

const accelerate = (a: Actor, wx: number, wz: number, wishSpeed: number, accel: number, dt: number): void => {
  const current = a.vel.x * wx + a.vel.z * wz;
  const add = wishSpeed - current;
  if (add <= 0) return;
  let gain = accel * dt * wishSpeed;
  if (gain > add) gain = add;
  a.vel.x += gain * wx;
  a.vel.z += gain * wz;
};

/**
 * Advance one actor's kinematics by dt. `frozen` (freeze time / dead) disables movement input.
 * Emits jump / land / footstep events.
 */
export const stepMovement = (cw: CollisionWorld, a: Actor, dt: number, frozen: boolean, emit: (e: GameEvent) => void): void => {
  const input = a.input;
  let fwd = frozen ? 0 : input.forward;
  let str = frozen ? 0 : input.strafe;
  // Planting / defusing roots the actor.
  const rooted = a.useKind !== null;
  if (rooted) {
    fwd = 0;
    str = 0;
  }
  const len = Math.hypot(fwd, str);
  if (len > 1) {
    fwd /= len;
    str /= len;
  }

  // Wish direction in world space (forward = -Z at yaw 0).
  const sy = Math.sin(a.yaw);
  const cy = Math.cos(a.yaw);
  let wx = -sy * fwd + cy * str;
  let wz = -cy * fwd - sy * str;
  const wl = Math.hypot(wx, wz);
  let wishSpeed = 0;
  if (wl > 1e-6) {
    wishSpeed = Math.min(1, wl) * maxSpeedOf(a);
    wx /= wl;
    wz /= wl;
  }

  const wasOnGround = a.onGround;
  if (a.onGround) {
    // Friction.
    const speed = Math.hypot(a.vel.x, a.vel.z);
    if (speed > 1e-4) {
      const drop = Math.max(speed, BODY.stopSpeed) * BODY.friction * dt;
      const scale = Math.max(0, speed - drop) / speed;
      a.vel.x *= scale;
      a.vel.z *= scale;
    }
    accelerate(a, wx, wz, wishSpeed, BODY.groundAccel, dt);
    if (!frozen && input.jump && !rooted) {
      a.vel.y = BODY.jumpSpeed;
      a.onGround = false;
      emit({ type: 'jump', actorId: a.id, pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z } });
    } else {
      a.vel.y = 0;
    }
  } else {
    accelerate(a, wx, wz, Math.min(wishSpeed, BODY.airWishCap), BODY.airAccel, dt);
    a.vel.y -= BODY.gravity * dt;
    if (a.vel.y < a.fallSpeed) a.fallSpeed = a.vel.y;
  }

  const px = a.pos.x;
  const pz = a.pos.z;
  const grounded = cw.moveBody(a.pos, a.vel, dt, wasOnGround && a.vel.y <= 0);
  a.onGround = grounded;

  if (grounded && !wasOnGround) {
    if (a.fallSpeed < -3.5) emit({ type: 'land', actorId: a.id, pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, speed: -a.fallSpeed });
    a.fallSpeed = 0;
    a.stepAccum = STEP_STRIDE * 0.5;
  } else if (grounded) {
    a.fallSpeed = 0;
  }

  // Footsteps: only when running on the ground (shift-walking is silent, like CS).
  if (grounded) {
    const moved = Math.hypot(a.pos.x - px, a.pos.z - pz);
    const speed = moved / dt;
    if (speed > 2.2 && !input.walk) {
      a.stepAccum += moved;
      if (a.stepAccum >= STEP_STRIDE) {
        a.stepAccum -= STEP_STRIDE;
        emit({ type: 'footstep', actorId: a.id, pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, walk: false });
      }
    } else if (speed < 0.5) {
      a.stepAccum = Math.min(a.stepAccum, STEP_STRIDE * 0.5);
    }
  }
};

export const horizontalSpeed = (a: Actor): number => Math.hypot(a.vel.x, a.vel.z);
