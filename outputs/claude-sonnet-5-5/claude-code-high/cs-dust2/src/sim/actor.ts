// A combatant: the human player or a bot. Pure data + tiny helpers; behaviour lives in
// movement.ts / combat.ts / ai.ts / game.ts.

import { CFG } from './config.ts';
import type { Vec3 } from './math.ts';
import type { Team } from './map.ts';
import { DEFAULT_SECONDARY, WEAPONS, createWeaponState } from './weapons.ts';
import type { WeaponId, WeaponSlot, WeaponState } from './weapons.ts';

export interface ActorInput {
  /** desired world-space direction, magnitude 0..1 */
  wishX: number;
  wishZ: number;
  fire: boolean;
  altFire: boolean;
  use: boolean;
  jump: boolean;
  reload: boolean;
  walk: boolean;
}

export const emptyInput = (): ActorInput => ({
  wishX: 0,
  wishZ: 0,
  fire: false,
  altFire: false,
  use: false,
  jump: false,
  reload: false,
  walk: false,
});

export class Actor {
  id: number;
  name: string;
  team: Team;
  /** controlled by a human right now */
  human = false;

  alive = true;
  hp = 100;
  armor = 0;
  helmet = false;
  kit = false;
  money = 800;
  kills = 0;
  deaths = 0;
  damageDone = 0;
  hasBomb = false;
  diedAt = -100;

  pos: Vec3 = { x: 0, y: 0, z: 0 };
  prev: Vec3 = { x: 0, y: 0, z: 0 };
  vel: Vec3 = { x: 0, y: 0, z: 0 };
  onGround = true;
  yaw = 0;
  pitch = 0;
  prevYaw = 0;
  /** view punch (deg), added to yaw/pitch when shooting and by the camera */
  punchPitch = 0;
  punchYaw = 0;
  spreadAccum = 0;
  sprayCount = 0;
  lastShotAt = -10;

  weapons: Record<WeaponSlot, WeaponState | null> = { primary: null, secondary: null, melee: null };
  slot: WeaponSlot = 'secondary';
  lastSlot: WeaponSlot = 'melee';
  scopeLevel = 0;
  nextFireAt = 0;
  /** > 0 while reloading (time left) */
  reloadLeft = 0;
  /** > 0 while drawing a weapon */
  drawLeft = 0;
  /** true when trigger was held last tick (semi-auto edge detection) */
  triggerHeld = false;
  altHeld = false;
  /** recent melee attack animation */
  meleeAnimAt = -10;
  lastHitBy = -1;

  input = emptyInput();
  speed = 0;
  stepAccum = 0;
  walkPhase = 0;
  /** last time this actor made noise (footstep/shot) */
  noiseAt = -10;

  plantProgress = 0;
  defuseProgress = 0;

  constructor(id: number, name: string, team: Team) {
    this.id = id;
    this.name = name;
    this.team = team;
  }

  get eyeY(): number {
    return this.pos.y + CFG.EYE;
  }

  get weapon(): WeaponState {
    return (this.weapons[this.slot] ?? this.weapons.melee) as WeaponState;
  }

  get viewPitch(): number {
    return this.pitch + this.punchPitch * (Math.PI / 180);
  }

  get viewYaw(): number {
    return this.yaw + this.punchYaw * (Math.PI / 180);
  }

  giveDefaultLoadout(): void {
    this.weapons.primary = null;
    this.weapons.secondary = createWeaponState(DEFAULT_SECONDARY[this.team]);
    this.weapons.melee = createWeaponState('knife');
    this.slot = 'secondary';
    this.lastSlot = 'melee';
  }

  giveWeapon(id: WeaponId): void {
    const def = WEAPONS[id];
    this.weapons[def.slot] = createWeaponState(id);
    this.slot = def.slot;
    this.reloadLeft = 0;
    this.scopeLevel = 0;
    this.drawLeft = def.drawTime;
  }

  hasWeapon(id: WeaponId): boolean {
    return this.weapons[WEAPONS[id].slot]?.def.id === id;
  }
}
