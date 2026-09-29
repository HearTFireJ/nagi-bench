import { useEffect, useRef, useState } from 'react';
import { GameSession } from '../app/session.ts';
import type { GameConfig } from '../core/game/game.ts';
import { Hud } from './Hud.tsx';

interface Props {
  config: Partial<GameConfig>;
  onExit: () => void;
  onRestart: () => void;
}

/**
 * Owns one GameSession for its lifetime: the sim, the three.js renderer, the audio engine and
 * the input handlers are created in the effect and torn down in its cleanup (StrictMode-safe).
 */
export function GameView({ config, onExit, onRestart }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let s: GameSession | null = null;
    try {
      s = new GameSession(canvas, config);
      s.start();
      setSession(s);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    }
    return () => {
      s?.dispose();
      setSession(null);
    };
  }, [config]);

  // when the match ends, give the mouse back so the buttons can be clicked
  useEffect(() => {
    if (!session) return undefined;
    return session.onFrame(() => {
      if (session.game.phase === 'matchEnd' && document.pointerLockElement) document.exitPointerLock();
    });
  }, [session]);

  return (
    <div className="game-root">
      <canvas ref={canvasRef} className="game-canvas" onClick={() => session?.resume()} />
      {session && <Hud session={session} onExit={onExit} onRestart={onRestart} />}
      {error && (
        <div className="fatal">
          <h2>无法启动游戏</h2>
          <p>{error}</p>
          <p>请确认浏览器支持 WebGL，并在 Chrome / Edge / Firefox 的最新版本中打开。</p>
          <button className="ghost" onClick={onExit}>
            返回主菜单
          </button>
        </div>
      )}
    </div>
  );
}
