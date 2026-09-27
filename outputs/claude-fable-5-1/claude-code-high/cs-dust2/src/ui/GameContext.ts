import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Game } from '../game/Game';
import type { HudState } from '../game/state/GameStore';

export const GameContext = createContext<Game | null>(null);

export function useGame(): Game {
  const g = useContext(GameContext);
  if (!g) throw new Error('GameContext missing');
  return g;
}

/** Subscribe to the engine's HUD snapshot (published at ~10-20Hz or on events). */
export function useHud(): HudState {
  const game = useGame();
  return useSyncExternalStore(game.store.subscribe, game.store.getSnapshot, game.store.getSnapshot);
}
