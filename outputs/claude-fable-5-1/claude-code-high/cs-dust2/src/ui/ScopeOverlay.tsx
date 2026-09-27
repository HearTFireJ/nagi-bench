import { useHud } from './GameContext';

/** 2D sniper scope mask shown while the AWP is zoomed. */
export function ScopeOverlay() {
  const hud = useHud();
  if (!hud.me.scoped || !hud.me.alive) return null;
  return (
    <div className="scope">
      <div className="hole" />
      <div className="h" />
      <div className="v" />
    </div>
  );
}
