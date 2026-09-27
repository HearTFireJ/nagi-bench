import { BUY_ITEMS } from '../game/weapons/WeaponDefs';
import { useGame, useHud } from './GameContext';

export function BuyMenu() {
  const game = useGame();
  const hud = useHud();
  const me = hud.me;
  const items = BUY_ITEMS.filter((i) => !i.team || i.team === me.team);
  return (
    <div className="buy-menu">
      <h3>
        <span>Buy Menu</span>
        <span className="money">${me.money}</span>
      </h3>
      {items.map((item) => {
        const owned =
          item.kind === 'weapon' ? me.weapons.some((w) => w.id === item.id) : item.id === 'kevlar' ? me.armor >= 100 : me.armor >= 100 && me.helmet;
        const affordable = me.money >= item.price;
        const disabled = owned || !affordable;
        return (
          <div
            key={item.id}
            className={'buy-item' + (disabled ? ' disabled' : '') + (owned ? ' owned' : '')}
            onClick={() => !disabled && game.buy(item.id)}
          >
            <span>
              <span className="key">{item.key}</span>
              {item.name}
            </span>
            <span className="price">{owned ? 'owned' : `$${item.price}`}</span>
          </div>
        );
      })}
      <div className="hint">Press the number key or click · [B] / [Esc] closes · buying is allowed during freeze time and the first seconds in spawn</div>
    </div>
  );
}
