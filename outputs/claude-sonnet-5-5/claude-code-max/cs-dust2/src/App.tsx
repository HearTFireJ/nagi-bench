import { useEffect, useRef, useState } from 'react';
import { GameEngine } from './engine/GameEngine';
import { EngineContext } from './ui/EngineContext';
import { Hud } from './ui/Hud';
import { MainMenu } from './ui/MainMenu';

/**
 * Owns the engine lifecycle. The engine (simulation + three.js + audio + input) lives outside React and is created /
 * disposed here exactly once per mount (React 18 StrictMode mounts effects twice in dev, so dispose must be complete).
 */
export const App = () => {
  const viewport = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    let created: GameEngine | null = null;
    try {
      created = new GameEngine(el);
      setEngine(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    return () => {
      created?.dispose();
      setEngine(null);
    };
  }, []);

  return (
    <div className="app">
      <div ref={viewport} className="viewport" />
      {engine ? (
        <EngineContext.Provider value={engine}>
          <Hud />
          <MainMenu />
        </EngineContext.Provider>
      ) : error ? (
        <div className="overlay">
          <div className="panel">
            <h1>无法启动渲染器</h1>
            <p>{error}</p>
            <p>请使用支持 WebGL 的现代浏览器（Chrome / Edge / Firefox）。</p>
          </div>
        </div>
      ) : (
        <div className="loading">加载中…</div>
      )}
    </div>
  );
};
