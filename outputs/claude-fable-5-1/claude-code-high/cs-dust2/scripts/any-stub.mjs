// A permissive "anything" object used to stub three.js in headless smoke tests.
// Property reads return memoized nested stubs, writes are stored, calls/constructs
// return fresh stubs, and numeric coercion yields 0.

export function makeAny(label = 'any') {
  const store = new Map();
  const fn = function () {};
  const p = new Proxy(fn, {
    get(_t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === Symbol.hasInstance) return () => true;
      if (k === 'then') return undefined;
      if (k === 'toString') return () => `[stub ${label}]`;
      if (k === 'length') return 0;
      if (store.has(k)) return store.get(k);
      const child = makeAny(typeof k === 'string' ? `${label}.${k}` : label);
      store.set(k, child);
      return child;
    },
    set(_t, k, v) {
      store.set(k, v);
      return true;
    },
    has() {
      return true;
    },
    apply() {
      return makeAny(label + '()');
    },
    construct() {
      return makeAny('new ' + label);
    },
  });
  return p;
}
