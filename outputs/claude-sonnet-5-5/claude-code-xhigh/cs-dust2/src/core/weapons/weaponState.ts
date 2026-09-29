import type { WeaponDef } from './defs.ts';

/** Runtime state of one weapon in a character's inventory. */
export class WeaponInstance {
  readonly def: WeaponDef;
  mag: number;
  reserve: number;
  /** sim time when the next shot is allowed */
  nextFire = 0;
  /** sim time when the weapon is drawn and ready */
  deployEnd = 0;
  /** number of consecutive shots in the current spray (recoil index) */
  sprayIndex = 0;
  lastShot = -99;
  /** extra inaccuracy (deg) accumulated by firing */
  bloom = 0;

  constructor(def: WeaponDef) {
    this.def = def;
    this.mag = def.mag;
    this.reserve = def.reserve;
  }
}
