import { createContext, useContext, useSyncExternalStore } from 'react';
import type { GameSession } from '../app/session.ts';
import type { HudState } from '../app/hudStore.ts';

export const SessionContext = createContext<GameSession | null>(null);

export function useSession(): GameSession {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside of a GameSession provider');
  return s;
}

/** Subscribe to the throttled HUD snapshot. React only re-renders when its content changed. */
export function useHud(): HudState {
  const s = useSession();
  return useSyncExternalStore(s.store.subscribe, s.store.getSnapshot);
}
