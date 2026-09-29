// Smoke-test stand-in: state/store.ts only needs `useSyncExternalStore` at import time.
export const useSyncExternalStore = <T>(_subscribe: (l: () => void) => () => void, getSnapshot: () => T): T => getSnapshot();
