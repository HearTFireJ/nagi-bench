import type { Vec3 } from '../math.ts';
import { approach, lerp } from '../math.ts';
import { PLAYER } from '../config.ts';
import type { World } from './world.ts';

/** Physical state of anything that walks. */
export interface Body {
  pos: Vec3; // feet position
  vel: Vec3;
  onGround: boolean;
  /** 0 = standing, 1 = fully crouched */
  crouch: number;
}

export interface MoveInput {
  /** desired horizontal direction in world space (unit length or zero) */
  wishX: number;
  wishZ: number;
  /** desired speed in m/s */
  wishSpeed: number;
  jump: boolean;
  crouch: boolean;
}

export interface MoveResult {
  jumped: boolean;
  landed: boolean;
  /** downward speed at impact (for landing sfx) */
  impact: number;
}

const AIR_STEP = 0.12;
const SNAP_DOWN = 0.32;

export function bodyHeight(b: Body): number {
  return lerp(PLAYER.height, PLAYER.crouchHeight, b.crouch);
}

export function eyeHeight(b: Body): number {
  return lerp(PLAYER.eyeHeight, PLAYER.crouchEyeHeight, b.crouch);
}

const result: MoveResult = { jumped: false, landed: false, impact: 0 };

/**
 * One fixed step of Quake/CS style movement: friction + acceleration on the ground,
 * limited air control, gravity, auto step-up (<= stepHeight), ramp following,
 * circle-vs-box wall sliding. The returned object is reused between calls.
 */
export function stepBody(world: World, b: Body, inp: MoveInput, dt: number): MoveResult {
  result.jumped = false;
  result.landed = false;
  result.impact = 0;

  b.crouch = approach(b.crouch, inp.crouch ? 1 : 0, dt * 7);
  const height = bodyHeight(b);

  // ---- horizontal velocity
  if (b.onGround) {
    const speed = Math.hypot(b.vel.x, b.vel.z);
    if (speed > 0.001) {
      const control = Math.max(speed, PLAYER.stopSpeed);
      const drop = control * PLAYER.friction * dt;
      const ns = Math.max(0, speed - drop);
      const k = ns / speed;
      b.vel.x *= k;
      b.vel.z *= k;
    }
    if (inp.wishSpeed > 0.001) {
      const cur = b.vel.x * inp.wishX + b.vel.z * inp.wishZ;
      const add = inp.wishSpeed - cur;
      if (add > 0) {
        const acc = Math.min(add, PLAYER.accel * dt * inp.wishSpeed);
        b.vel.x += acc * inp.wishX;
        b.vel.z += acc * inp.wishZ;
      }
    }
  } else if (inp.wishSpeed > 0.001) {
    const capped = Math.min(inp.wishSpeed, PLAYER.airWishCap);
    const cur = b.vel.x * inp.wishX + b.vel.z * inp.wishZ;
    const add = capped - cur;
    if (add > 0) {
      const acc = Math.min(add, PLAYER.airAccel * dt * inp.wishSpeed);
      b.vel.x += acc * inp.wishX;
      b.vel.z += acc * inp.wishZ;
    }
  }

  // ---- horizontal move with wall sliding
  const ox = b.pos.x;
  const oz = b.pos.z;
  b.pos.x += b.vel.x * dt;
  b.pos.z += b.vel.z * dt;
  const step = b.onGround ? PLAYER.stepHeight : AIR_STEP;
  if (world.resolveCircle(b.pos, PLAYER.radius, b.pos.y, height, step)) {
    // keep only the velocity that actually happened (slide along walls)
    b.vel.x = (b.pos.x - ox) / dt;
    b.vel.z = (b.pos.z - oz) / dt;
  }

  // ---- vertical
  const px = b.pos.x;
  const pz = b.pos.z;
  if (b.onGround) {
    const g = world.groundAt(px, pz, PLAYER.groundProbeRadius, b.pos.y + PLAYER.stepHeight + 0.001);
    if (g > -Infinity && b.pos.y - g <= SNAP_DOWN) {
      b.pos.y = g;
      b.vel.y = 0;
    } else {
      b.onGround = false;
    }
  }
  if (inp.jump && b.onGround) {
    b.vel.y = PLAYER.jumpSpeed;
    b.onGround = false;
    result.jumped = true;
  }
  if (!b.onGround) {
    const oldY = b.pos.y;
    b.vel.y -= PLAYER.gravity * dt;
    let newY = oldY + b.vel.y * dt;
    if (b.vel.y > 0) {
      const ceil = world.ceilingAt(px, pz, PLAYER.radius * 0.8, oldY + height);
      if (newY + height > ceil) {
        newY = ceil - height;
        b.vel.y = 0;
      }
    } else {
      const g = world.groundAt(px, pz, PLAYER.groundProbeRadius, oldY + AIR_STEP);
      if (g > -Infinity && newY <= g) {
        result.landed = true;
        result.impact = -b.vel.y;
        newY = g;
        b.vel.y = 0;
        b.onGround = true;
      }
    }
    b.pos.y = newY;
  }

  // safety net: never leave the map or fall forever
  if (b.pos.y < -5) {
    b.pos.y = 0;
    b.vel.y = 0;
  }
  return result;
}
