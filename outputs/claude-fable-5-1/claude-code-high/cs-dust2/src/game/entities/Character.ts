import type { Vec3 } from '../core/vec';
import type { BodyState, HitTarget } from '../physics/World';
import { Humanoid } from '../render/Humanoid';
import { WEAPONS, type Team, type WeaponSlot } from '../weapons/WeaponDefs';
import { WeaponInstance } from '../weapons/WeaponInstance';

export type Controller = 'player' | 'bot';

/** Per-tick command produced by the player input layer or by a bot brain. */
export interface Intent {
  dirX: number; // world-space desired move direction (length <= 1)
  dirZ: number;
  jump: boolean;
  walk: boolean;
  fire: boolean; // trigger held
  altFire: boolean; // scope toggle pressed this tick
  reload: boolean;
  interact: boolean; // plant / defuse / pickup (held)
  switchSlot: WeaponSlot | null;
}

export const EYE_HEIGHT = 1.6;

export class Character implements HitTarget, BodyState {
  pos: Vec3 = { x: 0, y: 0, z: 0 };
  vel: Vec3 = { x: 0, y: 0, z: 0 };
  radius = 0.35;
  grounded = true;
  yaw = 0;
  pitch = 0;

  health = 100;
  armor = 0;
  helmet = false;
  money = 800;
  alive = true;
  deathTime = -1;
  kills = 0;
  deaths = 0;

  weapons = new Map<WeaponSlot, WeaponInstance>();
  activeSlot: WeaponSlot = 'secondary';
  switchTime = -10;
  hasC4 = false;
  scoped = false;
  prevFire = false;
  meleeSwingStart = -10;
  lastDamageFrom = -1;
  lastDamageTime = -10;
  footstepDist = 0;
  wasGrounded = true;

  intent: Intent = {
    dirX: 0,
    dirZ: 0,
    jump: false,
    walk: false,
    fire: false,
    altFire: false,
    reload: false,
    interact: false,
    switchSlot: null,
  };

  readonly model: Humanoid;

  constructor(
    public readonly id: number,
    public name: string,
    public readonly team: Team,
    public controller: Controller,
  ) {
    this.model = new Humanoid(team, name);
    this.weapons.set('melee', new WeaponInstance(WEAPONS.knife));
  }

  get eye(): Vec3 {
    return { x: this.pos.x, y: this.pos.y + EYE_HEIGHT, z: this.pos.z };
  }

  get activeWeapon(): WeaponInstance {
    return this.weapons.get(this.activeSlot) ?? this.weapons.get('melee')!;
  }

  get isPlayer() {
    return this.controller === 'player';
  }

  hasWeapon(id: string): boolean {
    for (const w of this.weapons.values()) if (w.def.id === id) return true;
    return false;
  }

  /** Give a weapon (replacing the one in the same slot). */
  giveWeapon(id: string, now: number, autoSwitch = true) {
    const def = WEAPONS[id];
    if (!def) return;
    const inst = new WeaponInstance(def);
    this.weapons.set(def.slot, inst);
    if (autoSwitch && def.slot !== 'melee') this.switchTo(def.slot, now);
  }

  removeWeapon(slot: WeaponSlot) {
    if (slot === 'melee') return;
    this.weapons.delete(slot);
    if (this.activeSlot === slot) this.activeSlot = this.bestSlot();
  }

  bestSlot(): WeaponSlot {
    const p = this.weapons.get('primary');
    if (p && (p.ammo > 0 || p.reserve > 0)) return 'primary';
    const s = this.weapons.get('secondary');
    if (s && (s.ammo > 0 || s.reserve > 0)) return 'secondary';
    return 'melee';
  }

  switchTo(slot: WeaponSlot, now: number): boolean {
    if (!this.weapons.has(slot) || slot === this.activeSlot) return false;
    this.activeWeapon.cancelReload();
    this.activeSlot = slot;
    this.switchTime = now;
    this.scoped = false;
    this.model.setWeapon(this.activeWeapon.def.model);
    return true;
  }

  /** 0..1 progress of the weapon raise animation. */
  switchProgress(now: number): number {
    return Math.min(1, (now - this.switchTime) / 0.35);
  }

  isSwitching(now: number): boolean {
    return now - this.switchTime < 0.3;
  }

  maxSpeed(): number {
    const base = this.activeWeapon.def.moveSpeed;
    let s = base;
    if (this.intent.walk) s *= 0.52;
    if (this.scoped) s *= 0.5;
    return s;
  }

  horizontalSpeed(): number {
    return Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
  }

  /** Reset for a new round (or takeover) at a spawn point. */
  respawn(pos: Vec3, yaw: number, now: number) {
    this.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = yaw;
    this.pitch = 0;
    this.health = 100;
    this.alive = true;
    this.deathTime = -1;
    this.grounded = true;
    this.hasC4 = false;
    this.scoped = false;
    this.prevFire = false;
    this.lastDamageFrom = -1;
    for (const w of this.weapons.values()) w.refill();
    this.activeSlot = this.bestSlot();
    this.switchTime = now - 1;
    this.model.revive();
    this.model.setWeapon(this.activeWeapon.def.model);
    this.clearIntent();
  }

  clearIntent() {
    this.intent.dirX = 0;
    this.intent.dirZ = 0;
    this.intent.jump = false;
    this.intent.fire = false;
    this.intent.altFire = false;
    this.intent.reload = false;
    this.intent.interact = false;
    this.intent.switchSlot = null;
    this.intent.walk = false;
  }

  die(now: number) {
    this.alive = false;
    this.deathTime = now;
    this.deaths++;
    this.health = 0;
    this.scoped = false;
    this.vel = { x: 0, y: 0, z: 0 };
    this.model.die(now);
    this.clearIntent();
  }

  updateModel(dt: number, now: number) {
    this.model.update(dt, now, this.pos.x, this.pos.y, this.pos.z, this.yaw, this.pitch, this.alive ? this.horizontalSpeed() : 0);
  }
}
