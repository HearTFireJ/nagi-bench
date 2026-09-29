// Actor construction and small inventory helpers.
import { makeInput } from './types';
import type { Actor, Team, WeaponId, WeaponSlot, WeaponState } from './types';
import { getWeapon } from './weapons';

export const makeWeaponState = (id: WeaponId): WeaponState => {
  const def = getWeapon(id);
  return { id, ammo: def.magSize, reserve: def.reserveMax };
};

export const createActor = (id: number, name: string, team: Team, isBot: boolean): Actor => ({
  id,
  name,
  team,
  isBot,
  human: false,
  pos: { x: 0, y: 0, z: 0 },
  prevPos: { x: 0, y: 0, z: 0 },
  vel: { x: 0, y: 0, z: 0 },
  yaw: 0,
  pitch: 0,
  onGround: false,
  stepAccum: 0,
  fallSpeed: 0,
  hp: 100,
  armor: 0,
  helmet: false,
  alive: true,
  diedAt: -1,
  weapons: { primary: null, secondary: null, melee: makeWeaponState('knife') },
  hasBomb: false,
  activeSlot: 'secondary',
  lastSlot: 'melee',
  nextFireAt: 0,
  reloadEndsAt: 0,
  drawEndsAt: 0,
  triggerWasDown: false,
  shotIndex: 0,
  lastShotAt: -10,
  scopeLevel: 0,
  spread: 0,
  shotSpread: 0,
  punchPitch: 0,
  punchYaw: 0,
  useKind: null,
  useProgress: 0,
  money: 800,
  kills: 0,
  deaths: 0,
  headshots: 0,
  score: 0,
  lastHurtAt: -10,
  lastHurtFrom: -1,
  input: makeInput(),
});

/** State of the weapon in a slot (null when empty / the bomb slot). */
export const weaponInSlot = (a: Actor, slot: WeaponSlot): WeaponState | null => {
  if (slot === 'primary') return a.weapons.primary;
  if (slot === 'secondary') return a.weapons.secondary;
  if (slot === 'melee') return a.weapons.melee;
  return null;
};

export const activeWeaponId = (a: Actor): WeaponId => {
  if (a.activeSlot === 'bomb') return 'c4';
  const ws = weaponInSlot(a, a.activeSlot);
  return ws ? ws.id : 'knife';
};

export const activeWeaponState = (a: Actor): WeaponState | null => weaponInSlot(a, a.activeSlot);

/** Best slot to hold when nothing specific is requested: primary > secondary > knife. */
export const bestSlot = (a: Actor): WeaponSlot => (a.weapons.primary ? 'primary' : a.weapons.secondary ? 'secondary' : 'melee');

export const isReloading = (a: Actor, time: number): boolean => a.reloadEndsAt > time;

export const eyeHeightOf = (): number => 1.62;
