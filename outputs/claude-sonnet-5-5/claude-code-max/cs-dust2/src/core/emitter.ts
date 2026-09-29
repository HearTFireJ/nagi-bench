// Minimal typed pub/sub used to decouple the simulation from audio, rendering and UI.

export type Listener<E> = (event: E) => void;

export class Emitter<E> {
  private listeners: Listener<E>[] = [];

  /** Subscribe; returns an unsubscribe function. */
  on(listener: Listener<E>): () => void {
    this.listeners.push(listener);
    return () => this.off(listener);
  }

  off(listener: Listener<E>): void {
    const i = this.listeners.indexOf(listener);
    if (i >= 0) this.listeners.splice(i, 1);
  }

  emit(event: E): void {
    // Copy-on-iterate is unnecessary here: listeners never unsubscribe re-entrantly in this codebase,
    // but iterating over a snapshot keeps it safe if that ever changes.
    const snapshot = this.listeners.slice();
    for (let i = 0; i < snapshot.length; i++) snapshot[i](event);
  }

  clear(): void {
    this.listeners.length = 0;
  }
}
