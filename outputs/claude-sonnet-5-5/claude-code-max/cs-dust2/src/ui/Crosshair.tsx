import { useEffect, useRef } from 'react';
import { DEG2RAD } from '../core/math';
import { useEngine, useHud } from './EngineContext';

/**
 * Dynamic crosshair. The gap between the four bars follows the weapon's live inaccuracy (movement, jumping, sustained
 * fire) and is written straight to a CSS variable every frame: no React re-render happens per frame.
 */
export const Crosshair = () => {
  const engine = useEngine();
  const root = useRef<HTMLDivElement>(null);
  const scoped = useHud((h) => h.scopeLevel > 0);
  const visible = useHud((h) => h.playerAlive || h.spectating);
  const melee = useHud((h) => h.weapon.melee);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    return engine.frame$.on(() => {
      const a = engine.viewActor;
      const halfH = window.innerHeight / 2;
      const spreadPx = (Math.tan(a.spread) / Math.tan((engine.currentFov * DEG2RAD) / 2)) * halfH;
      el.style.setProperty('--gap', (3 + Math.min(spreadPx, 180)).toFixed(1) + 'px');
    });
  }, [engine, scoped, visible]);

  if (scoped || !visible) return null;
  return (
    <div ref={root} className={'crosshair' + (melee ? ' crosshair-dot' : '')}>
      <i className="ch ch-t" />
      <i className="ch ch-b" />
      <i className="ch ch-l" />
      <i className="ch ch-r" />
      <i className="ch-dot" />
    </div>
  );
};
