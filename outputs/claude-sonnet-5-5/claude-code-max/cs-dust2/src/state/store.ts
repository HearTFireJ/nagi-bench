// A tiny external store + React binding. The 3D loop and the simulation run at 60 Hz outside React; they publish immutable
// HUD snapshots here (throttled, and only when something changed), and components subscribe to just the slice they render
// through `useStore(selector)` (built on useSyncExternalStore, so there is no tearing between renders and the loop).
import { useSyncExternalStore } from 'react';

export type Listener = () => void;

export class Store<T> {
  private state: T;
  private listeners = new Set<Listener>();

  constructor(initial: T) {
    this.state = initial;
  }

  get = (): T => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Replace the snapshot. Listeners are only notified when the reference actually changed. */
  set(next: T): void {
    if (Object.is(next, this.state)) return;
    this.state = next;
    for (const l of Array.from(this.listeners)) l();
  }

  patch(partial: Partial<T>): void {
    this.set({ ...this.state, ...partial });
  }
}

/** Subscribe to a slice of the store. The selector must return a stable value (primitive or a reference kept by the snapshot). */
export const useStore = <T, S>(store: Store<T>, selector: (state: T) => S): S =>
  useSyncExternalStore(store.subscribe, () => selector(store.get()));

/** Shallow structural equality for plain objects / arrays (used when building snapshots to keep references stable). */
export const shallowEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
};
