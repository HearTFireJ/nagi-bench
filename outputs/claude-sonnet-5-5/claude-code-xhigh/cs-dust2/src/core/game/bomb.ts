import type { Game } from './game.ts';
import type { Character } from '../entities/character.ts';
import type { Vec3 } from '../math.ts';
import { clamp } from '../math.ts';
import { ECONOMY, ROUND } from '../config.ts';
import type { SiteId } from './events.ts';

export interface BombState {
  state: 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded';
  carrier: number;
  pos: Vec3;
  site: SiteId | null;
  /** seconds until detonation (planted only) */
  timeLeft: number;
  planter: number;
  defuser: number;
  beepTimer: number;
}

export function makeBomb(): BombState {
  return { state: 'carried', carrier: -1, pos: { x: 0, y: 0, z: 0 }, site: null, timeLeft: 0, planter: -1, defuser: -1, beepTimer: 0 };
}

/** Which bombsite (if any) contains this position. */
export function siteAt(game: Game, x: number, z: number): SiteId | null {
  for (const id of ['A', 'B'] as const) {
    const r = game.map.sites[id].plantRect;
    if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return id;
  }
  return null;
}

export function defuseDuration(ch: Character): number {
  return ch.defuseKit ? ROUND.defuseTimeKit : ROUND.defuseTime;
}

/** Hand the C4 to a random living T at round start. */
export function assignBomb(game: Game): void {
  const b = game.bomb;
  const ts = game.chars.filter((c) => c.alive && c.team === 'T');
  b.state = 'carried';
  b.site = null;
  b.planter = -1;
  b.defuser = -1;
  b.timeLeft = 0;
  for (const c of game.chars) {
    c.hasBomb = false;
    c.plantProgress = 0;
    c.defuseProgress = 0;
  }
  if (ts.length === 0) {
    b.carrier = -1;
    return;
  }
  const c = game.rng.pick(ts);
  c.hasBomb = true;
  b.carrier = c.id;
  b.pos.x = c.pos.x;
  b.pos.y = c.pos.y;
  b.pos.z = c.pos.z;
}

/** The carrier died (or dropped it): the C4 falls to the floor where they stood. */
export function dropBomb(game: Game, ch: Character): void {
  const b = game.bomb;
  if (b.state !== 'carried' || b.carrier !== ch.id) return;
  ch.hasBomb = false;
  ch.plantProgress = 0;
  b.state = 'dropped';
  b.carrier = -1;
  b.pos.x = ch.pos.x;
  b.pos.y = ch.pos.y;
  b.pos.z = ch.pos.z;
  game.emit({ type: 'bombDrop', id: ch.id, x: b.pos.x, y: b.pos.y, z: b.pos.z });
}

function plant(game: Game, ch: Character, site: SiteId): void {
  const b = game.bomb;
  ch.hasBomb = false;
  ch.plantProgress = 0;
  b.state = 'planted';
  b.site = site;
  b.planter = ch.id;
  b.carrier = -1;
  b.pos.x = ch.pos.x;
  b.pos.y = ch.pos.y;
  b.pos.z = ch.pos.z;
  b.timeLeft = ROUND.bombTime;
  b.beepTimer = 0.3;
  b.defuser = -1;
  game.phase = 'planted';
  game.phaseTime = 0;
  ch.money = Math.min(ROUND.maxMoney, ch.money + ECONOMY.plantBonus);
  ch.score += 3;
  game.emit({ type: 'planted', id: ch.id, site, x: b.pos.x, y: b.pos.y, z: b.pos.z });
  game.emitNoise(ch, 45, 'bomb');
  game.onBombPlanted();
}

function explode(game: Game): void {
  const b = game.bomb;
  b.state = 'exploded';
  game.emit({ type: 'exploded', x: b.pos.x, y: b.pos.y, z: b.pos.z });
  for (const c of game.chars) {
    if (!c.alive) continue;
    const d = Math.hypot(c.pos.x - b.pos.x, c.pos.y - b.pos.y, c.pos.z - b.pos.z);
    // gaussian falloff: lethal within ~16 m, harmless beyond ~35 m
    let dmg = 500 * Math.exp(-(d * d) / (2 * 11 * 11));
    if (!game.world.lineClear(b.pos.x, b.pos.y + 0.5, b.pos.z, c.pos.x, c.pos.y + 1, c.pos.z)) dmg *= 0.4;
    if (dmg > 0) game.applyEnvironmentDamage(c, dmg);
  }
  game.endRound('T', 'bomb_exploded');
}

/** Ticks pickup, planting, the fuse and defusing. */
export function updateBomb(game: Game, dt: number): void {
  const b = game.bomb;
  const live = game.phase === 'live' || game.phase === 'planted';

  if (b.state === 'dropped' && live) {
    for (const c of game.chars) {
      if (!c.alive || c.team !== 'T' || c.hasBomb) continue;
      const d = Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z);
      if (d < ROUND.bombPickupRadius && Math.abs(c.pos.y - b.pos.y) < 1.5) {
        c.hasBomb = true;
        b.state = 'carried';
        b.carrier = c.id;
        game.emit({ type: 'bombPickup', id: c.id });
        break;
      }
    }
  }

  if (b.state === 'carried') {
    const c = game.chars[b.carrier];
    if (!c || !c.alive) {
      b.state = 'dropped';
      b.carrier = -1;
    } else {
      b.pos.x = c.pos.x;
      b.pos.y = c.pos.y;
      b.pos.z = c.pos.z;
      if (game.phase === 'live') {
        const site = siteAt(game, c.pos.x, c.pos.z);
        const wants = c.cmd.use && site !== null && c.onGround && c.speed2D < 1.2;
        if (wants) {
          if (c.plantProgress === 0) game.emit({ type: 'plantStart', id: c.id, x: c.pos.x, y: c.pos.y, z: c.pos.z });
          c.plantProgress += dt;
          if (c.plantProgress >= ROUND.plantTime && site) plant(game, c, site);
        } else if (c.plantProgress > 0) {
          c.plantProgress = 0;
          game.emit({ type: 'plantAbort', id: c.id });
        }
      }
    }
  }

  if (b.state === 'planted') {
    b.timeLeft -= dt;
    b.beepTimer -= dt;
    if (b.beepTimer <= 0) {
      // beeps speed up as the fuse burns down (1 s interval -> 0.12 s)
      const frac = clamp(b.timeLeft / ROUND.bombTime, 0, 1);
      b.beepTimer = 0.12 + 0.88 * frac * frac;
      game.emit({ type: 'bombBeep', x: b.pos.x, y: b.pos.y, z: b.pos.z, urgency: 1 - frac });
    }

    // defusing
    let d = b.defuser >= 0 ? game.chars[b.defuser] : null;
    if (d) {
      const near = Math.hypot(d.pos.x - b.pos.x, d.pos.z - b.pos.z) < ROUND.bombUseRadius && Math.abs(d.pos.y - b.pos.y) < 1.6;
      if (!d.alive || !d.cmd.use || !near || !d.onGround) {
        d.defuseProgress = 0;
        game.emit({ type: 'defuseAbort', id: d.id });
        b.defuser = -1;
        d = null;
      }
    }
    if (!d) {
      for (const c of game.chars) {
        if (!c.alive || c.team !== 'CT' || !c.cmd.use || !c.onGround) continue;
        const near = Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z) < ROUND.bombUseRadius && Math.abs(c.pos.y - b.pos.y) < 1.6;
        if (near) {
          b.defuser = c.id;
          d = c;
          c.defuseProgress = 0;
          game.emit({ type: 'defuseStart', id: c.id, x: b.pos.x, y: b.pos.y, z: b.pos.z });
          game.emitNoise(c, 18, 'defuse');
          break;
        }
      }
    }
    if (d) {
      d.defuseProgress += dt;
      if (d.defuseProgress >= defuseDuration(d)) {
        b.state = 'defused';
        b.defuser = -1;
        d.defuseProgress = 0;
        d.money = Math.min(ROUND.maxMoney, d.money + ECONOMY.defuseBonus);
        d.score += 3;
        game.emit({ type: 'defused', id: d.id });
        game.endRound('CT', 'bomb_defused');
        return;
      }
    }

    if (b.timeLeft <= 0) explode(game);
  }
}
