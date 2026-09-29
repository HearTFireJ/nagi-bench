import { createContext, useContext } from 'react';
import type { GameEngine } from '../engine/GameEngine';
import type { HudState } from '../engine/hudState';
import { useStore } from '../state/store';

export const EngineContext = createContext<GameEngine | null>(null);

export const useEngine = (): GameEngine => {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error('useEngine must be used inside <EngineContext.Provider>');
  return engine;
};

/**
 * Subscribe to a slice of the HUD snapshot. The component re-renders only when the selected value changes
 * (selectors must return primitives or objects that keep their identity between unchanged snapshots).
 */
export const useHud = <S,>(selector: (state: HudState) => S): S => {
  const engine = useEngine();
  return useStore(engine.hud, selector);
};
