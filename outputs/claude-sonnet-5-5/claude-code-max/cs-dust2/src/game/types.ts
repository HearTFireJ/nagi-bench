// Core simulation types. Pure data: no DOM / three.js / React in the `game/` layer so it can run headless in Node.
import type { Vec3 } from '../core/math';

export type Team = 'T' | 'CT';
export type SiteId = 'A' | 'B';
export type WeaponId = 'ak47' | 'm4a4' | 'awp' | 'glock' | 'usp' | 'deagle' | 'knife' | 'c4';
export type WeaponSlot = 'primary' | 'secondary' | 'melee' | 'bomb';
export type HitZone = 'head' | 'chest' | 'stomach' | 'arm' | 'leg';

export const otherTeam = (t: Team): Team => (t === 'T' ? 'CT' : 'T');

export interface WeaponState {
  id: WeaponId;
  ammo: number;
  reserve: number;
}

/** Per-tick control input. Human input and bot brains both write into this same structure. */
export interface ActorInput {
  /** -1..1, +1 = forward */
  forward: number;
  /** -1..1, +1 = right */
  strafe: number;
  jump: boolean;
  /** Shift-walk: slower and silent footsteps. */
  walk: boolean;
  /** Primary trigger, held. */
  fire: boolean;
  /** Use key (plant / defuse / pick up), held. */
  use: boolean;
  // ---- edge-triggered flags: set by the producer, consumed (cleared) by the simulation ----
  reload: boolean;
  scopeToggle: boolean;
  switchTo: WeaponSlot | null;
  switchLast: boolean;
  drop: boolean;
}

export const makeInput = (): ActorInput => ({
  forward: 0,
  strafe: 0,
  jump: false,
  walk: false,
  fire: false,
  use: false,
  reload: false,
  scopeToggle: false,
  switchTo: null,
  switchLast: false,
  drop: false,
});

export type UseKind = 'plant' | 'defuse' | null;

export interface Actor {
  id: number;
  name: string;
  team: Team;
  isBot: boolean;
  /** true while a human is driving this actor (player, or a bot the player took over). */
  human: boolean;

  // ---- kinematics (feet position, metres) ----
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  /** Distance walked since the last footstep event. */
  stepAccum: number;
  /** Highest downward speed since leaving ground (for land events). */
  fallSpeed: number;

  // ---- vitals ----
  hp: number;
  armor: number;
  helmet: boolean;
  alive: boolean;
  diedAt: number;

  // ---- inventory ----
  weapons: { primary: WeaponState | null; secondary: WeaponState | null; melee: WeaponState };
  hasBomb: boolean;
  activeSlot: WeaponSlot;
  lastSlot: WeaponSlot;

  // ---- weapon runtime ----
  nextFireAt: number;
  reloadEndsAt: number;
  drawEndsAt: number;
  triggerWasDown: boolean;
  shotIndex: number;
  lastShotAt: number;
  scopeLevel: 0 | 1 | 2;
  /** Current inaccuracy cone half-angle in radians (also drives the crosshair gap). */
  spread: number;
  /** Accumulated per-shot inaccuracy in degrees (decays while not firing). */
  shotSpread: number;
  /** Additive view kick, radians. Decays back to zero. */
  punchPitch: number;
  punchYaw: number;

  // ---- bomb interaction ----
  useKind: UseKind;
  useProgress: number;

  // ---- economy / stats ----
  money: number;
  kills: number;
  deaths: number;
  headshots: number;
  score: number;
  /** Last time this actor took damage and from where (for the damage indicator). */
  lastHurtAt: number;
  lastHurtFrom: number;

  input: ActorInput;
}

export interface DroppedWeapon {
  id: number;
  weapon: WeaponState;
  pos: Vec3;
  ownerId: number;
  at: number;
}
