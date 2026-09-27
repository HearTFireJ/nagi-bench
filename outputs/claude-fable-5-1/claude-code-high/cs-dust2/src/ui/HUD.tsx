import { useHud } from './GameContext';

function fmtTime(t: number): string {
  const s = Math.max(0, Math.ceil(t));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

export function HUD() {
  const hud = useHud();
  const me = hud.me;
  const timerLow = hud.phase === 'live' && hud.roundTimeLeft < 20;
  return (
    <>
      <div className="hud-top">
        <span className="ct">CT {hud.scoreCT}</span>
        {hud.bomb.state === 'planted' ? (
          <span className="timer bomb">💣 {hud.bomb.timeLeft.toFixed(0)}</span>
        ) : (
          <span className={'timer' + (timerLow ? ' low' : '')}>{hud.phase === 'freeze' ? fmtTime(hud.roundTimeLeft) : fmtTime(hud.roundTimeLeft)}</span>
        )}
        <span className="t">{hud.scoreT} T</span>
        <span className="round">
          R{hud.roundNumber}
          {hud.pistolRound ? ' · PISTOL' : ''}
          {hud.phase === 'freeze' ? ' · FREEZE' : ''}
        </span>
      </div>
      <div className="fps">{hud.fps} fps</div>

      {hud.centerMessage && <div className="center-message">{hud.centerMessage}</div>}
      {hud.interactHint && !hud.plantProgress && !hud.defuseProgress && <div className="interact-hint">{hud.interactHint}</div>}
      {hud.plantProgress > 0 && (
        <>
          <div className="progress">
            <div className="bar" style={{ width: `${Math.min(100, hud.plantProgress * 100)}%` }} />
          </div>
          <div className="progress-label">Planting…</div>
        </>
      )}
      {hud.defuseProgress > 0 && (
        <>
          <div className="progress defuse">
            <div className="bar" style={{ width: `${Math.min(100, hud.defuseProgress * 100)}%` }} />
          </div>
          <div className="progress-label">Defusing…</div>
        </>
      )}

      <div className="hud-bottom-left">
        <div className={'stat health' + (me.health <= 30 ? ' low' : '')}>
          <div className="label">Health</div>
          <div className="value">+ {me.health}</div>
        </div>
        <div className="stat armor">
          <div className="label">Armor{me.helmet ? ' + Helmet' : ''}</div>
          <div className="value">◈ {me.armor}</div>
        </div>
        <div className="stat money">
          <div className="label">Money</div>
          <div className="value">${me.money}</div>
        </div>
      </div>

      <div className="hud-bottom-right">
        <div className="weapon-slots">
          {me.weapons.map((w) => (
            <div key={w.slot} className={'slot' + (w.slot === me.slot ? ' active' : '')}>
              <span className="key">{w.slot === 'primary' ? '1' : w.slot === 'secondary' ? '2' : '3'}</span>
              {w.name}
            </div>
          ))}
          {me.hasC4 && <div className="slot c4">C4</div>}
        </div>
        <div className="ammo">
          <div className="weapon-name">
            {me.weaponName}
            {me.scoped ? ' · SCOPED' : ''}
          </div>
          {me.isMelee ? (
            <div className="counts">—</div>
          ) : (
            <div className={'counts' + (me.ammo === 0 ? ' empty' : '')}>
              {me.ammo}
              <span className="reserve">/ {me.reserve}</span>
            </div>
          )}
          {me.reloading && (
            <div className="reload">
              <div className="bar" style={{ width: `${Math.min(100, me.reloadProgress * 100)}%` }} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
