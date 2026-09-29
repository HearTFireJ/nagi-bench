import type { Game } from './game.ts';
import { Character } from '../entities/character.ts';
import type { Team } from '../map/types.ts';
import { ECONOMY, ROUND, ROUND_PRESETS } from '../config.ts';
import type { RoundPreset } from '../config.ts';
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY, WEAPONS, getWeapon } from '../weapons/defs.ts';
import { WeaponInstance } from '../weapons/weaponState.ts';

export interface BuyItem {
  id: string;
  name: string;
  price: number;
  category: 'rifle' | 'sniper' | 'pistol' | 'gear';
  team?: Team;
}

export function listBuyItems(team: Team): BuyItem[] {
  const items: BuyItem[] = [];
  for (const w of Object.values(WEAPONS)) {
    if (w.price <= 0 || (w.team && w.team !== team)) continue;
    items.push({ id: w.id, name: w.name, price: w.price, category: w.cls === 'rifle' ? 'rifle' : w.cls === 'sniper' ? 'sniper' : 'pistol', team: w.team });
  }
  items.push({ id: 'kevlar', name: '防弹衣', price: ECONOMY.kevlar, category: 'gear' });
  items.push({ id: 'kevlar_helmet', name: '防弹衣 + 头盔', price: ECONOMY.kevlarHelmet, category: 'gear' });
  if (team === 'CT') items.push({ id: 'defuse_kit', name: '拆弹器', price: ECONOMY.defuseKit, category: 'gear', team: 'CT' });
  return items;
}

export function makeCharacter(id: number, name: string, team: Team): Character {
  const ch = new Character(id, name, team, new WeaponInstance(getWeapon(DEFAULT_SECONDARY[team])), new WeaponInstance(getWeapon('knife')));
  return ch;
}

/** Put a weapon into its slot (replacing what was there) and draw it. */
export function giveWeapon(ch: Character, id: string, now: number, equip = true): void {
  const def = getWeapon(id);
  const inst = new WeaponInstance(def);
  if (def.slot === 'primary') ch.primary = inst;
  else if (def.slot === 'secondary') ch.secondary = inst;
  else ch.melee = inst;
  if (equip) {
    ch.lastSlot = ch.activeSlot;
    ch.activeSlot = def.slot;
    inst.deployEnd = now + def.deployTime;
  }
  ch.reloadEnd = -1;
  ch.scope = 0;
}

/** Fresh start-of-life kit for a round preset: default pistol + knife, preset armour, optionally a rifle. */
export function resetLoadout(ch: Character, preset: RoundPreset, now: number): void {
  ch.primary = null;
  ch.secondary = new WeaponInstance(getWeapon(DEFAULT_SECONDARY[ch.team]));
  ch.melee = new WeaponInstance(getWeapon('knife'));
  ch.armor = preset.armor;
  ch.helmet = preset.helmet;
  ch.defuseKit = false;
  ch.hasBomb = false;
  ch.activeSlot = 'secondary';
  ch.lastSlot = 'melee';
  if (preset.primary) giveWeapon(ch, DEFAULT_PRIMARY[ch.team], now);
  else ch.secondary.deployEnd = now;
}

export function refillAmmo(ch: Character): void {
  for (const w of [ch.primary, ch.secondary]) {
    if (!w) continue;
    w.mag = w.def.mag;
    w.reserve = w.def.reserve;
    w.bloom = 0;
    w.sprayIndex = 0;
  }
}

export function canBuy(game: Game, ch: Character, item: string): { ok: boolean; reason: string; price: number } {
  const bad = (reason: string, price = 0) => ({ ok: false, reason, price });
  if (!ch.alive) return bad('已阵亡');
  const inBuyWindow = game.phase === 'freeze' || (game.phase === 'live' && game.phaseTime < ROUND.buyTime);
  if (!inBuyWindow) return bad('购买时间已结束');
  let price: number;
  if (item === 'kevlar') {
    price = ECONOMY.kevlar;
    if (ch.armor >= 100) return bad('已有防弹衣', price);
  } else if (item === 'kevlar_helmet') {
    price = ECONOMY.kevlarHelmet;
    if (ch.armor >= 100 && ch.helmet) return bad('已有防弹衣与头盔', price);
  } else if (item === 'defuse_kit') {
    price = ECONOMY.defuseKit;
    if (ch.team !== 'CT') return bad('仅 CT 可购买');
    if (ch.defuseKit) return bad('已有拆弹器', price);
  } else {
    const def = WEAPONS[item];
    if (!def || def.price <= 0) return bad('未知物品');
    if (def.team && def.team !== ch.team) return bad('该阵营无法购买');
    price = def.price;
    const owned = def.slot === 'primary' ? ch.primary : ch.secondary;
    if (owned && owned.def.id === def.id) return bad('已持有', price);
  }
  if (ch.money < price) return bad('资金不足', price);
  return { ok: true, reason: '', price };
}

export function buy(game: Game, ch: Character, item: string): boolean {
  const c = canBuy(game, ch, item);
  if (!c.ok) return false;
  ch.money -= c.price;
  if (item === 'kevlar') ch.armor = 100;
  else if (item === 'kevlar_helmet') {
    ch.armor = 100;
    ch.helmet = true;
  } else if (item === 'defuse_kit') ch.defuseKit = true;
  else giveWeapon(ch, item, game.time);
  game.emit({ type: 'buy', id: ch.id, item });
  return true;
}

/**
 * Buy logic for bots (and the human when auto-buy is enabled), following the usual CS economy:
 * full-buy when the money covers rifle + armour + helmet, a small "force" buy in the round after
 * the pistol round, otherwise save (eco) so the next round can be a full-buy.
 */
export function autoBuy(game: Game, ch: Character): void {
  const tryBuy = (item: string): boolean => canBuy(game, ch, item).ok && buy(game, ch, item);
  const rifle = getWeapon(DEFAULT_PRIMARY[ch.team]);
  const fullCost = rifle.price + ECONOMY.kevlarHelmet;

  if (ch.primary) {
    // survivors only top up their armour
    if (ch.armor < 100 || !ch.helmet) tryBuy('kevlar_helmet');
    if (ch.team === 'CT') tryBuy('defuse_kit');
    return;
  }

  if (ch.money >= fullCost) {
    const teamAwps = game.chars.filter((c) => c.team === ch.team && c.primary && c.primary.def.id === 'awp').length;
    if (ch.money >= 4750 + ECONOMY.kevlarHelmet && teamAwps === 0 && game.rng.chance(0.4)) tryBuy('awp');
    if (!ch.primary) tryBuy(rifle.id);
    tryBuy('kevlar_helmet');
    if (ch.team === 'CT' && game.rng.chance(0.8)) tryBuy('defuse_kit');
    return;
  }

  // force buy right after the pistol round (everyone is broke, armour + Deagle is the standard play)
  if (game.roundNumber === 2) {
    if (ch.money >= ECONOMY.kevlar + 700 && game.rng.chance(0.5)) {
      tryBuy('kevlar');
      tryBuy('deagle');
    } else if (ch.money >= ECONOMY.kevlar) tryBuy('kevlar');
    return;
  }
  // eco: save
}

export function presetFor(mode: 'pistol' | 'fullbuy'): RoundPreset {
  return ROUND_PRESETS[mode];
}
