import type { Vec3 } from '../math.ts';
import type { Team } from '../map/types.ts';
import type { WeaponSlot } from '../weapons/defs.ts';
import type { WeaponInstance } from '../weapons/weaponState.ts';
import { eyeHeight } from '../physics/movement.ts';
import type { BotBrain } from '../ai/brain.ts';

/** One frame of controller intent. The human and the AI both produce these. */
export interface UserCmd {
  /** -1..1, +1 = forward */
  forward: number;
  /** -1..1, +1 = right */
  strafe: number;
  jump: boolean;
  crouch: boolean;
  /** shift-walk (silent, slower) */
  walk: boolean;
  fire: boolean;
  fire2: boolean;
  reload: boolean;
  use: boolean;
  /** one-shot weapon switch request */
  slot: WeaponSlot | 'last' | null;
}

export function makeCmd(): UserCmd {
  return { forward: 0, strafe: 0, jump: false, crouch: false, walk: false, fire: false, fire2: false, reload: false, use: false, slot: null };
}

export function clearCmd(c: UserCmd): void {
  c.forward = 0;
  c.strafe = 0;
  c.jump = false;
  c.crouch = false;
  c.walk = false;
  c.fire = false;
  c.fire2 = false;
  c.reload = false;
  c.use = false;
  c.slot = null;
}

export class Character {
  readonly id: number;
  name: string;
  team: Team;
  /** true while a human drives this body */
  isHuman = false;
  alive = true;
  health = 100;
  armor = 0;
  helmet = false;
  defuseKit = false;
  money = 0;
  kills = 0;
  deaths = 0;
  score = 0;

  pos: Vec3 = { x: 0, y: 0, z: 0 };
  prevPos: Vec3 = { x: 0, y: 0, z: 0 };
  vel: Vec3 = { x: 0, y: 0, z: 0 };
  onGround = true;
  crouch = 0;
  /** view angles, radians */
  yaw = 0;
  pitch = 0;
  /** view punch from recoil, degrees */
  punchPitch = 0;
  punchYaw = 0;

  primary: WeaponInstance | null = null;
  secondary: WeaponInstance;
  melee: WeaponInstance;
  activeSlot: WeaponSlot = 'secondary';
  lastSlot: WeaponSlot = 'melee';
  /** 0 = not scoped, n = zoom level n */
  scope = 0;
  reloadEnd = -1;
  hasBomb = false;

  cmd: UserCmd = makeCmd();
  prevFire = false;
  prevFire2 = false;
  prevReload = false;

  stepAccum = 0;
  speed2D = 0;
  walking = false;
  lastHurtTime = -99;
  /** world-space yaw pointing from the victim towards the last attacker */
  lastHurtDir = 0;
  lastShotTime = -99;
  deathTime = -1;
  plantProgress = 0;
  defuseProgress = 0;
  brain: BotBrain | null = null;

  constructor(id: number, name: string, team: Team, secondary: WeaponInstance, melee: WeaponInstance) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.secondary = secondary;
    this.melee = melee;
  }

  get weapon(): WeaponInstance {
    if (this.activeSlot === 'primary' && this.primary) return this.primary;
    if (this.activeSlot === 'melee') return this.melee;
    return this.secondary;
  }

  slotWeapon(slot: WeaponSlot): WeaponInstance | null {
    return slot === 'primary' ? this.primary : slot === 'secondary' ? this.secondary : this.melee;
  }

  get eyeY(): number {
    return this.pos.y + eyeHeight(this);
  }

  get reloading(): boolean {
    return this.reloadEnd >= 0;
  }
}
