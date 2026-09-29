// Fake browser globals (document / window / canvas 2D / Web Audio / rAF / ResizeObserver) for headless smoke tests.
type Fn = (...args: unknown[]) => void;

/** A permissive mock: any property is another mock, any call returns a mock. Special-cased numeric fields below. */
const makeMock = (name: string, extra: Record<string, unknown> = {}): unknown => {
  const target = function () {} as unknown as Record<string, unknown>;
  const store: Record<string | symbol, unknown> = { ...extra };
  return new Proxy(target, {
    get(_t, key) {
      if (key === 'then') return undefined; // never look like a promise
      if (key === Symbol.toPrimitive) return () => 0;
      if (key in store) return store[key];
      const child = makeMock(name + '.' + String(key));
      store[key] = child;
      return child;
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
    apply() {
      return makeMock(name + '()');
    },
  });
};

// ---------------------------------------------------------------------------------------------------------------------
// Event plumbing
// ---------------------------------------------------------------------------------------------------------------------
const listeners = { window: new Map<string, Set<Fn>>(), document: new Map<string, Set<Fn>>() };
const add = (which: 'window' | 'document') => (type: string, fn: Fn) => {
  if (!listeners[which].has(type)) listeners[which].set(type, new Set());
  listeners[which].get(type)!.add(fn);
};
const remove = (which: 'window' | 'document') => (type: string, fn: Fn) => {
  listeners[which].get(type)?.delete(fn);
};
export const fire = (which: 'window' | 'document', type: string, event: Record<string, unknown> = {}): void => {
  const e = { preventDefault() {}, stopPropagation() {}, ...event, type };
  for (const fn of Array.from(listeners[which].get(type) ?? [])) fn(e);
};
export const listenerCount = (): number => [...listeners.window.values(), ...listeners.document.values()].reduce((n, s) => n + s.size, 0);

// ---------------------------------------------------------------------------------------------------------------------
// Canvas / audio mocks
// ---------------------------------------------------------------------------------------------------------------------
const makeCanvas = () => {
  const canvas: Record<string, unknown> = { width: 0, height: 0, style: {} };
  const ctx = makeMock('ctx2d');
  canvas.getContext = () => ctx;
  return canvas;
};

export const audioStats = { nodes: 0, sources: 0 };

class MockAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state = 'running';
  destination = makeMock('destination');
  resume(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
  createBuffer(channels: number, length: number, _rate: number): unknown {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (c: number) => data[c] };
  }
  createBufferSource(): unknown {
    audioStats.sources++;
    return makeMock('source');
  }
  createOscillator(): unknown {
    audioStats.sources++;
    return makeMock('osc');
  }
  createGain(): unknown {
    audioStats.nodes++;
    return makeMock('gain');
  }
  createBiquadFilter(): unknown {
    audioStats.nodes++;
    return makeMock('biquad');
  }
  createDynamicsCompressor(): unknown {
    return makeMock('comp');
  }
  createConvolver(): unknown {
    return makeMock('convolver');
  }
  createStereoPanner(): unknown {
    audioStats.nodes++;
    return makeMock('panner');
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------------------------------------------------
export const rafQueue: ((t: number) => void)[] = [];

export const doc: Record<string, unknown> = {
  addEventListener: add('document'),
  removeEventListener: remove('document'),
  pointerLockElement: null,
  exitPointerLock() {
    doc.pointerLockElement = null;
    fire('document', 'pointerlockchange');
  },
  createElement: (tag: string) => (tag === 'canvas' ? makeCanvas() : { style: {} }),
  getElementById: () => ({}),
};

export const win: Record<string, unknown> = {
  addEventListener: add('window'),
  removeEventListener: remove('window'),
  devicePixelRatio: 1,
  innerWidth: 1280,
  innerHeight: 720,
  AudioContext: MockAudioContext,
};

export class FakeContainer {
  clientWidth = 1280;
  clientHeight = 720;
  children: { parentElement?: FakeContainer | null }[] = [];
  lockRequests = 0;
  refuseLock = false;
  appendChild(el: { parentElement?: FakeContainer | null }): void {
    el.parentElement = this;
    this.children.push(el);
  }
  removeChild(el: { parentElement?: FakeContainer | null }): void {
    const i = this.children.indexOf(el);
    if (i >= 0) this.children.splice(i, 1);
    el.parentElement = null;
  }
  requestPointerLock(): Promise<void> {
    this.lockRequests++;
    if (this.refuseLock) {
      fire('document', 'pointerlockerror');
      return Promise.reject(new Error('refused'));
    }
    doc.pointerLockElement = this;
    fire('document', 'pointerlockchange');
    return Promise.resolve();
  }
}

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const g = globalThis as unknown as Record<string, unknown>;
g.window = win;
g.document = doc;
g.ResizeObserver = FakeResizeObserver;
g.requestAnimationFrame = (cb: (t: number) => void): number => {
  rafQueue.push(cb);
  return rafQueue.length;
};
g.cancelAnimationFrame = (): void => {
  rafQueue.length = 0;
};
