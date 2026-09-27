import { clamp, randGauss } from '../core/vec';
import type { WeaponDef } from './WeaponDefs';

export interface ShotParams {
  /** Total cone half-angle (degrees) for this shot. */
  spreadDeg: number;
  kickPitch: number;
  kickYaw: number;
}

/** Runtime state of one weapon carried by a character. */
export class WeaponInstance {
  ammo: number;
  reserve: number;
  nextFire = 0;
  reloadEnd = -1;
  /** Accumulated inaccuracy from recent shots (degrees). */
  spread = 0;
  /** Accumulated view punch that recovers over time (degrees). */
  punchPitch = 0;
  punchYaw = 0;
  lastFireTime = -100;
  shotsInBurst = 0;

  constructor(public readonly def: WeaponDef) {
    this.ammo = def.magSize;
    this.reserve = def.reserveAmmo;
  }

  get isMelee() {
    return this.def.slot === 'melee';
  }

  isReloading(now: number) {
    return this.reloadEnd > now;
  }

  update(dt: number, now: number) {
    // spread recovers, faster once the burst ended
    const idle = now - this.lastFireTime > 0.25;
    const rec = this.def.spreadRecovery * (idle ? 1.6 : 1);
    this.spread = Math.max(0, this.spread - rec * dt);
    if (idle) this.shotsInBurst = 0;
    // view punch recovers toward zero
    const k = this.def.kickRecovery * dt;
    this.punchPitch = this.punchPitch > 0 ? Math.max(0, this.punchPitch - k) : Math.min(0, this.punchPitch + k);
    this.punchYaw = this.punchYaw > 0 ? Math.max(0, this.punchYaw - k) : Math.min(0, this.punchYaw + k);
    this.finishReloadIfDue(now);
  }

  finishReloadIfDue(now: number) {
    if (this.reloadEnd >= 0 && now >= this.reloadEnd) {
      const need = this.def.magSize - this.ammo;
      const take = Math.min(need, this.reserve);
      this.ammo += take;
      this.reserve -= take;
      this.reloadEnd = -1;
    }
  }

  canFire(now: number): boolean {
    if (this.isReloading(now)) return false;
    if (now < this.nextFire) return false;
    return this.isMelee || this.ammo > 0;
  }

  needsReload(): boolean {
    return !this.isMelee && this.ammo === 0 && this.reserve > 0;
  }

  canReload(now: number): boolean {
    return !this.isMelee && !this.isReloading(now) && this.ammo < this.def.magSize && this.reserve > 0;
  }

  startReload(now: number): boolean {
    if (!this.canReload(now)) return false;
    this.reloadEnd = now + this.def.reloadTime;
    return true;
  }

  cancelReload() {
    this.reloadEnd = -1;
  }

  /** Current cone half-angle in degrees given movement fraction [0,1] and scoped state. */
  currentSpread(moving01: number, scoped: boolean, airborne: boolean): number {
    const base = scoped && this.def.scope ? this.def.scope.spread : this.def.spreadBase;
    const move = (scoped ? 0.3 : 1) * this.def.spreadMove * clamp(moving01, 0, 1);
    const air = airborne ? this.def.spreadMove * 1.5 : 0;
    return base + move + air + this.spread;
  }

  /** Consume a round and produce the shot parameters. Caller must check canFire(). */
  fire(now: number, moving01: number, scoped: boolean, airborne: boolean): ShotParams {
    const spreadDeg = this.currentSpread(moving01, scoped, airborne);
    if (!this.isMelee) this.ammo--;
    this.nextFire = now + 60 / this.def.rpm;
    this.lastFireTime = now;
    this.shotsInBurst++;
    this.spread = Math.min(this.def.spreadMax, this.spread + this.def.spreadPerShot);
    // Recoil pattern: first shots climb, later shots drift sideways more.
    const climb = this.shotsInBurst <= 6 ? 1 : 0.55;
    const drift = this.shotsInBurst > 3 ? 1.6 : 0.6;
    const kickPitch = this.def.kickPitch * climb * (0.85 + Math.random() * 0.3);
    const kickYaw = this.def.kickYaw * drift * randGauss() + (this.shotsInBurst > 8 ? this.def.kickYaw * 0.6 * Math.sin(this.shotsInBurst) : 0);
    this.punchPitch += kickPitch;
    this.punchYaw += kickYaw;
    return { spreadDeg, kickPitch, kickYaw };
  }

  refill() {
    this.ammo = this.def.magSize;
    this.reserve = this.def.reserveAmmo;
    this.reloadEnd = -1;
    this.spread = 0;
    this.punchPitch = 0;
    this.punchYaw = 0;
  }
}
