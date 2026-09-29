import { useEffect, useRef } from 'react';
import { runtime } from './runtime/runtime.ts';
import { hudStore, useStore } from './runtime/store.ts';
import { Hud } from './ui/Hud.tsx';
import { Menu } from './ui/Menu.tsx';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hud = useStore(hudStore);

  useEffect(() => {
    if (canvasRef.current) runtime.init(canvasRef.current);
  }, []);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="game-canvas" />
      {hud.screen === 'menu' ? <Menu /> : <Hud />}
    </div>
  );
}
