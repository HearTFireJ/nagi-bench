import { useHud } from './GameContext';

export function SpectatorBar() {
  const hud = useHud();
  if (!hud.spectating) return null;
  return (
    <div className="spectator">
      <div className="title">Spectating</div>
      <div className="name">{hud.spectateName}</div>
      <div className="hint">
        {hud.canTakeover && (
          <>
            <b>[F]</b> take control of this bot ·{' '}
          </>
        )}
        <b>[← →]</b> / click to switch teammate
      </div>
    </div>
  );
}
