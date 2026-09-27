import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import { BuyMenu } from './ui/BuyMenu';
import { Crosshair } from './ui/Crosshair';
import { GameContext, useGame, useHud } from './ui/GameContext';
import { HUD } from './ui/HUD';
import { Killfeed } from './ui/Killfeed';
import { Minimap } from './ui/Minimap';
import { Scoreboard } from './ui/Scoreboard';
import { ScopeOverlay } from './ui/ScopeOverlay';
import { SpectatorBar } from './ui/SpectatorBar';
import { StartMenu } from './ui/StartMenu';

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const g = new Game(hostRef.current);
    setGame(g);
    return () => {
      g.dispose();
      setGame(null);
    };
  }, []);

  return (
    <div className="app">
      <div ref={hostRef} className="canvas-host" />
      {game && (
        <GameContext.Provider value={game}>
          <Overlay />
        </GameContext.Provider>
      )}
    </div>
  );
}

function Overlay() {
  const hud = useHud();
  const inMenu = hud.phase === 'menu' || hud.phase === 'matchover';
  const paused = !inMenu && !hud.pointerLocked;
  return (
    <div className="overlay">
      {!inMenu && (
        <>
          <ScopeOverlay />
          <Crosshair />
          <DamageFlash />
          <HUD />
          <Minimap />
          <Killfeed />
          <SpectatorBar />
          {hud.buyMenuOpen && <BuyMenu />}
          {hud.scoreboardOpen && <Scoreboard />}
        </>
      )}
      {inMenu && <StartMenu />}
      {paused && <PauseOverlay />}
    </div>
  );
}

function DamageFlash() {
  const hud = useHud();
  const age = hud.time - hud.damageFlashTime;
  if (age < 0 || age > 0.5) return null;
  return <div className="damage-flash" style={{ opacity: 0.55 * (1 - age / 0.5) }} />;
}

function PauseOverlay() {
  const hud = useHud();
  const game = useGame();
  return (
    <div className="pause-overlay" onClick={() => game.resumePointer()}>
      <div className="pause-card">
        <h2>Paused</h2>
        <p>Click to resume (pointer lock)</p>
        <p className="muted">
          Round {hud.roundNumber} · CT {hud.scoreCT} : {hud.scoreT} T
        </p>
      </div>
    </div>
  );
}
