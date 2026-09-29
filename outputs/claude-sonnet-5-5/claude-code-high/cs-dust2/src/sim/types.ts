import type { Vec3 } from './math.ts';
import type { HitGroup } from './hitbox.ts';
import type { Team } from './map.ts';
import type { WeaponId } from './weapons.ts';

export type { Team };

export type RoundPhase = 'idle' | 'freeze' | 'live' | 'roundEnd' | 'matchEnd';

export type RoundEndReason =
  | 'ct_eliminated'
  | 't_eliminated'
  | 'bomb_exploded'
  | 'bomb_defused'
  | 'time';

export type SimEvent =
  | {
      type: 'shot';
      actorId: number;
      weaponId: WeaponId;
      origin: Vec3;
      end: Vec3;
      hit: 'none' | 'world' | 'actor';
      normal?: Vec3;
      group?: HitGroup;
    }
  | { type: 'hit'; attackerId: number; victimId: number; damage: number; group: HitGroup; killed: boolean; pos: Vec3 }
  | { type: 'damage'; victimId: number; fromX: number; fromZ: number; amount: number }
  | {
      type: 'kill';
      killerId: number;
      victimId: number;
      weaponId: WeaponId | 'bomb' | 'world';
      headshot: boolean;
      pos: Vec3;
    }
  | { type: 'step'; actorId: number; pos: Vec3 }
  | { type: 'jump'; actorId: number; pos: Vec3 }
  | { type: 'reloadStart'; actorId: number; weaponId: WeaponId }
  | { type: 'reloadEnd'; actorId: number; weaponId: WeaponId }
  | { type: 'scope'; actorId: number; level: number }
  | { type: 'switch'; actorId: number; weaponId: WeaponId }
  | { type: 'empty'; actorId: number }
  | { type: 'bombPickup'; actorId: number }
  | { type: 'bombDrop'; pos: Vec3 }
  | { type: 'plantStart'; actorId: number; pos: Vec3 }
  | { type: 'plantCancel'; actorId: number }
  | { type: 'bombPlanted'; actorId: number; site: 'A' | 'B'; pos: Vec3 }
  | { type: 'defuseStart'; actorId: number; pos: Vec3 }
  | { type: 'defuseCancel'; actorId: number }
  | { type: 'bombDefused'; actorId: number; pos: Vec3 }
  | { type: 'bombBeep'; pos: Vec3; urgent: boolean }
  | { type: 'bombExploded'; pos: Vec3 }
  | { type: 'freezeStart'; round: number }
  | { type: 'roundLive' }
  | { type: 'roundEnd'; winner: Team; reason: RoundEndReason }
  | { type: 'matchEnd'; winner: Team }
  | { type: 'buy'; actorId: number; item: string }
  | { type: 'door'; doorId: string; opening: boolean }
  | { type: 'spawn'; actorId: number };

export interface KillfeedEntry {
  id: number;
  time: number;
  killerId: number;
  killerName: string;
  killerTeam: Team | 'world';
  victimId: number;
  victimName: string;
  victimTeam: Team;
  weapon: string;
  weaponId: WeaponId | 'bomb' | 'world';
  headshot: boolean;
  /** true when the human is killer or victim */
  involvesHuman: boolean;
}
