import { useGame, useHud } from './GameContext';

export function StartMenu() {
  const game = useGame();
  const hud = useHud();
  const over = hud.phase === 'matchover';
  return (
    <div className="menu">
      <div className="menu-card">
        <h1>
          DUST<span>2</span> · 5v5
        </h1>
        <div className="sub">Procedural three.js FPS prototype — no external assets. Bomb defusal, 1 player + 9 AI.</div>
        {over && hud.matchWinner && (
          <div className={'winner ' + hud.matchWinner}>
            {hud.matchWinner === 'CT' ? 'Counter-Terrorists' : 'Terrorists'} win the match — {hud.scoreCT} : {hud.scoreT}
            {hud.matchWinner === hud.me.team ? ' · VICTORY' : ' · DEFEAT'}
          </div>
        )}
        <div className="team-buttons">
          <button className="team-btn ct" onClick={() => game.start('CT')}>
            Play Counter-Terrorist
            <small>USP-S · defend A / B · defuse the C4</small>
          </button>
          <button className="team-btn t" onClick={() => game.start('T')}>
            Play Terrorist
            <small>Glock-18 · plant the C4 at A or B</small>
          </button>
        </div>
        <div className="controls">
          <div>
            <b>WASD</b> move
          </div>
          <div>
            <b>Mouse</b> look · <b>LMB</b> fire
          </div>
          <div>
            <b>Space</b> jump · <b>Shift</b> walk
          </div>
          <div>
            <b>RMB</b> AWP scope
          </div>
          <div>
            <b>1 / 2 / 3</b> primary / pistol / knife
          </div>
          <div>
            <b>R</b> reload · <b>Q</b> last weapon
          </div>
          <div>
            <b>E (hold)</b> plant / defuse / pick up C4
          </div>
          <div>
            <b>B</b> buy menu (freeze time)
          </div>
          <div>
            <b>Tab</b> scoreboard
          </div>
          <div>
            <b>F</b> take over spectated teammate
          </div>
          <div>
            <b>← →</b> switch spectator target
          </div>
          <div>
            <b>Esc</b> release mouse
          </div>
        </div>
      </div>
    </div>
  );
}
