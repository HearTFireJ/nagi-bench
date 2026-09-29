// Round loadouts, the buy menu rules and simple bot purchasing.
import { makeWeaponState } from './actor';
import { dropWeapon, switchSlot } from './combat';
import { ECONOMY, FULL_ROUND, PISTOL_ROUND } from './config';
import type { Loadout } from './config';
import type { World } from './world';
import type { Actor, WeaponId } from './types';
import { DEFAULT_PISTOL, KEVLAR_HELMET_PRICE, KEVLAR_PRICE, TEAM_RIFLE, getWeapon, weaponAllowedFor } from './weapons';

export type BuyItem = WeaponId | 'kevlar' | 'kevlar_helmet';

export const BUY_ITEMS: { id: BuyItem; label: string }[] = [
  { id: 'glock', label: 'Glock-18' },
  { id: 'usp', label: 'USP-S' },
  { id: 'deagle', label: 'Desert Eagle' },
  { id: 'ak47', label: 'AK-47' },
  { id: 'm4a4', label: 'M4A4' },
  { id: 'awp', label: 'AWP' },
  { id: 'kevlar', label: 'Kevlar' },
  { id: 'kevlar_helmet', label: 'Kevlar + Helmet' },
];

export const priceOf = (item: BuyItem, a: Actor): number => {
  if (item === 'kevlar') return a.armor >= 100 ? 0 : KEVLAR_PRICE;
  if (item === 'kevlar_helmet') return a.armor > 0 && !a.helmet ? KEVLAR_HELMET_PRICE - KEVLAR_PRICE : KEVLAR_HELMET_PRICE;
  return getWeapon(item).price;
};

/** Reset an actor's gear to the round-start default (pistol only). */
export const giveDefaultGear = (a: Actor): void => {
  a.weapons.primary = null;
  a.weapons.secondary = makeWeaponState(DEFAULT_PISTOL[a.team]);
  a.weapons.melee = makeWeaponState('knife');
  a.armor = 0;
  a.helmet = false;
  a.hasBomb = false;
  a.activeSlot = 'secondary';
  a.lastSlot = 'melee';
};

export const applyLoadout = (a: Actor, l: Loadout): void => {
  giveDefaultGear(a);
  const primary = l.primary[a.team];
  a.weapons.primary = primary ? makeWeaponState(primary) : null;
  a.weapons.secondary = makeWeaponState(l.secondary[a.team]);
  a.armor = l.armor;
  a.helmet = l.helmet;
  a.money = l.money;
  a.activeSlot = a.weapons.primary ? 'primary' : 'secondary';
};

export const presetFor = (pistolRound: boolean): Loadout => (pistolRound ? PISTOL_ROUND : FULL_ROUND);

/** Refill magazines of everything a survivor keeps into the next round. */
export const refillAmmo = (a: Actor): void => {
  for (const slot of ['primary', 'secondary'] as const) {
    const ws = a.weapons[slot];
    if (ws) {
      const def = getWeapon(ws.id);
      ws.ammo = def.magSize;
      ws.reserve = def.reserveMax;
    }
  }
};

/** Purchase validation + effect. Only allowed in freeze time. Returns true on success. */
export const buyItem = (w: World, a: Actor, item: BuyItem): boolean => {
  if (!a.alive || w.round.phase !== 'freeze') return false;
  const price = priceOf(item, a);
  if (price <= 0 && (item === 'kevlar' || item === 'kevlar_helmet')) return false;
  if (a.money < price) return false;
  if (item === 'kevlar') {
    a.armor = 100;
  } else if (item === 'kevlar_helmet') {
    a.armor = 100;
    a.helmet = true;
  } else {
    if (!weaponAllowedFor(item, a.team)) return false;
    const def = getWeapon(item);
    const slot = def.slot;
    if (slot !== 'primary' && slot !== 'secondary') return false;
    if (a.weapons[slot]?.id === item) return false;
    if (a.weapons[slot]) dropWeapon(w, a, slot);
    a.weapons[slot] = makeWeaponState(item);
    switchSlot(w, a, slot);
  }
  a.money -= price;
  w.emit({ type: 'buy', actorId: a.id, item });
  return true;
};

/** Very small "economy brain": rifle first, then armor, sometimes an AWP / Deagle. */
export const botBuy = (w: World, a: Actor): void => {
  const rng = w.rng;
  if (!a.weapons.primary) {
    const teamAwps = w.actors.filter((o) => o.team === a.team && o.weapons.primary?.id === 'awp').length;
    if (a.money >= getWeapon('awp').price + 650 && teamAwps === 0 && rng.chance(0.45)) buyItem(w, a, 'awp');
    else if (a.money >= getWeapon(TEAM_RIFLE[a.team]).price) buyItem(w, a, TEAM_RIFLE[a.team]);
    else if (a.money >= getWeapon('deagle').price + 650 && rng.chance(0.4)) buyItem(w, a, 'deagle');
  }
  if (a.armor < 50) {
    if (a.money >= KEVLAR_HELMET_PRICE) buyItem(w, a, 'kevlar_helmet');
    else if (a.money >= KEVLAR_PRICE) buyItem(w, a, 'kevlar');
  } else if (!a.helmet && a.money >= KEVLAR_HELMET_PRICE - KEVLAR_PRICE + 1500) {
    buyItem(w, a, 'kevlar_helmet');
  }
};

/** Loss bonus per consecutive loss (CS style). */
export const lossBonus = (streak: number): number =>
  Math.min(ECONOMY.lossBonusMax, ECONOMY.lossBonusBase + Math.max(0, streak - 1) * ECONOMY.lossBonusStep);
