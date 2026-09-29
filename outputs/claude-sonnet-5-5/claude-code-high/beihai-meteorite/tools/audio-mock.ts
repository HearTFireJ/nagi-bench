// A promiscuous stand-in for Web Audio: every property is a callable, chainable node.
export const calls: string[] = [];

export function node(): any {
  const target = function () {};
  const store: Record<string | symbol, unknown> = {};
  return new Proxy(target, {
    get(_t, k) {
      if (k === "then") return undefined;
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === "length") return 0;
      if (k === "sampleRate") return 48000;
      if (k === "duration") return 1;
      if (k in store) return store[k];
      return node();
    },
    set(_t, k, v) {
      store[k] = v;
      return true;
    },
    apply() {
      return node();
    },
  });
}

export class MockContext {
  state = "running";
  sampleRate = 48000;
  currentTime = 0;
  destination = node();
  constructor() {
    return new Proxy(this, {
      get(t, k) {
        if (k === "then") return undefined;
        if (k in t) return (t as any)[k];
        if (typeof k === "string") calls.push(k);
        if (k === "decodeAudioData") return async () => ({ duration: 1, getChannelData: () => new Float32Array(10) });
        if (k === "resume") return async () => {};
        if (k === "createBuffer") return () => ({ getChannelData: () => new Float32Array(100000), duration: 2, length: 100000 });
        return () => node();
      },
    });
  }
}
