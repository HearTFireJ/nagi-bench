import { useCallback, useState } from 'react';
import type { GameConfig } from './core/game/game.ts';
import { GameView } from './ui/GameView.tsx';
import { Menu } from './ui/Menu.tsx';

/** Menu <-> game switch. Restarting simply hands GameView a fresh config object (new session). */
export function App(): JSX.Element {
  const [config, setConfig] = useState<Partial<GameConfig> | null>(null);

  const start = useCallback((cfg: Partial<GameConfig>) => setConfig({ ...cfg }), []);
  const exit = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    setConfig(null);
  }, []);
  const restart = useCallback(() => setConfig((c) => (c ? { ...c, seed: Math.floor(Math.random() * 1e9) } : c)), []);

  return config ? <GameView config={config} onExit={exit} onRestart={restart} /> : <Menu onStart={start} />;
}
