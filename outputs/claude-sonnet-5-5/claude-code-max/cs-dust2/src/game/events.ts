// Events emitted by the simulation. Audio, VFX and the HUD store subscribe to these; the sim never calls them directly.
import type { Vec3 } from '../core/math';
import type { HitZone, SiteId, Team, WeaponId } from './types';

export type RoundEndReason = 'elimination' | 'bomb_exploded' | 'bomb_defused' | 'time';

export type GameEvent =
  | { type: 'shot'; actorId: number; weapon: WeaponId; muzzle: Vec3; end: Vec3; hit: 'none' | 'world' | 'actor'; normal: Vec3 | null }
  | { type: 'hit'; attackerId: number; victimId: number; zone: HitZone; damage: number; weapon: WeaponId; point: Vec3; killed: boolean }
  | { type: 'kill'; killerId: number; victimId: number; weapon: WeaponId; headshot: boolean; killerName: string; victimName: string; killerTeam: Team; victimTeam: Team }
  | { type: 'reloadStart'; actorId: number; weapon: WeaponId }
  | { type: 'reloadEnd'; actorId: number; weapon: WeaponId }
  | { type: 'dryFire'; actorId: number; weapon: WeaponId }
  | { type: 'weaponSwitch'; actorId: number; weapon: WeaponId }
  | { type: 'scope'; actorId: number; level: 0 | 1 | 2 }
  | { type: 'footstep'; actorId: number; pos: Vec3; walk: boolean }
  | { type: 'jump'; actorId: number; pos: Vec3 }
  | { type: 'land'; actorId: number; pos: Vec3; speed: number }
  | { type: 'bombPickup'; actorId: number }
  | { type: 'bombDrop'; pos: Vec3 }
  | { type: 'plantStart'; actorId: number; site: SiteId; pos: Vec3 }
  | { type: 'plantAbort'; actorId: number }
  | { type: 'bombPlanted'; actorId: number; site: SiteId; pos: Vec3 }
  | { type: 'bombBeep'; pos: Vec3; urgency: number }
  | { type: 'defuseStart'; actorId: number; pos: Vec3 }
  | { type: 'defuseAbort'; actorId: number }
  | { type: 'bombDefused'; actorId: number; pos: Vec3 }
  | { type: 'bombExploded'; pos: Vec3 }
  | { type: 'weaponPickup'; actorId: number; weapon: WeaponId }
  | { type: 'weaponDrop'; weapon: WeaponId; pos: Vec3 }
  | { type: 'doorMove'; doorId: number; opening: boolean; pos: Vec3 }
  | { type: 'roundStart'; round: number }
  | { type: 'freezeEnd'; round: number }
  | { type: 'roundEnd'; winner: Team; reason: RoundEndReason }
  | { type: 'matchEnd'; winner: Team }
  | { type: 'playerDied'; actorId: number; killerId: number }
  | { type: 'buy'; actorId: number; item: string };
