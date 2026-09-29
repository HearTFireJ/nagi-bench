import type { Team } from '../map/types.ts';
import type { Hitbox } from '../weapons/damage.ts';

export type EndReason = 'elimination' | 'bomb_exploded' | 'bomb_defused' | 'time';
export type SiteId = 'A' | 'B';

/**
 * Everything that happens in the simulation is published as an event. The renderer
 * (tracers, blood, decals), the audio engine and the HUD (killfeed, banners) are pure
 * consumers of this stream, which keeps the sim free of any presentation code.
 */
export type GameEvent =
  | { type: 'shot'; shooter: number; weapon: string; ox: number; oy: number; oz: number; ex: number; ey: number; ez: number; hit: 'none' | 'world' | 'char'; nx: number; ny: number; nz: number; silenced: boolean }
  | { type: 'dryfire'; id: number; weapon: string }
  | { type: 'hit'; attacker: number; victim: number; damage: number; armorLoss: number; hitbox: Hitbox; headshot: boolean; killed: boolean; weapon: string; x: number; y: number; z: number }
  | { type: 'kill'; killer: number; victim: number; weapon: string; headshot: boolean; killerTeam: Team; victimTeam: Team; killerName: string; victimName: string }
  | { type: 'reload'; id: number; weapon: string; duration: number }
  | { type: 'reloadDone'; id: number; weapon: string }
  | { type: 'switch'; id: number; weapon: string }
  | { type: 'scope'; id: number; level: number }
  | { type: 'melee'; id: number; kind: 'slash' | 'stab'; hit: boolean; x: number; y: number; z: number }
  | { type: 'footstep'; id: number; x: number; y: number; z: number }
  | { type: 'land'; id: number; impact: number; x: number; y: number; z: number }
  | { type: 'jump'; id: number; x: number; y: number; z: number }
  | { type: 'bombPickup'; id: number }
  | { type: 'bombDrop'; id: number; x: number; y: number; z: number }
  | { type: 'plantStart'; id: number; x: number; y: number; z: number }
  | { type: 'plantAbort'; id: number }
  | { type: 'planted'; id: number; site: SiteId; x: number; y: number; z: number }
  | { type: 'defuseStart'; id: number; x: number; y: number; z: number }
  | { type: 'defuseAbort'; id: number }
  | { type: 'defused'; id: number }
  | { type: 'bombBeep'; x: number; y: number; z: number; urgency: number }
  | { type: 'exploded'; x: number; y: number; z: number }
  | { type: 'doorMove'; id: string; opening: boolean; x: number; z: number }
  | { type: 'roundStart'; round: number }
  | { type: 'freezeEnd' }
  | { type: 'roundEnd'; winner: Team; reason: EndReason }
  | { type: 'matchEnd'; winner: Team }
  | { type: 'takeover'; from: number; to: number }
  | { type: 'buy'; id: number; item: string };

/** Something audible that bots can react to. */
export interface Noise {
  x: number;
  y: number;
  z: number;
  radius: number;
  team: Team;
  time: number;
  kind: 'shot' | 'step' | 'bomb' | 'defuse' | 'reload';
  source: number;
}

export interface KillEntry {
  id: number;
  time: number;
  killer: string;
  killerTeam: Team;
  victim: string;
  victimTeam: Team;
  weapon: string;
  headshot: boolean;
  /** involves the human player */
  involvesPlayer: boolean;
}
