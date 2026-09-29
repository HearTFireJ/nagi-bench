// Fake browser globals (window, document, canvas, Web Audio) for headless smoke tests.
// The Web Audio fake validates arguments the way a real browser does (throws on non-finite
// values, negative times, exponential ramps to <= 0, ...), so audio-synthesis bugs surface here.

const listeners = { window: new Map(), document: new Map() };
function target(name) {
  const map = listeners[name];
  return {
    addEventListener(type, fn) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      map.get(type)?.delete(fn);
    },
  };
}
export function fire(name, type, ev = {}) {
  const set = listeners[name].get(type);
  if (!set) return;
  const e = { preventDefault() {}, stopPropagation() {}, ...ev, type };
  for (const fn of [...set]) fn(e);
}
export function listenerCount() {
  let n = 0;
  for (const m of Object.values(listeners)) for (const s of m.values()) n += s.size;
  return n;
}

const ctx2d = new Proxy(
  {},
  {
    get(_t, k) {
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set() {
      return true;
    },
  },
);
export const canvasLog = { created: 0 };
function makeCanvas() {
  canvasLog.created++;
  return {
    width: 0,
    height: 0,
    clientWidth: 1280,
    clientHeight: 720,
    style: { setProperty() {} },
    getContext: () => ctx2d,
  };
}

export const doc = {
  ...target('document'),
  pointerLockElement: null,
  createElement(tag) {
    if (tag === 'canvas') return makeCanvas();
    return {};
  },
  exitPointerLock() {
    doc.pointerLockElement = null;
    fire('document', 'pointerlockchange');
  },
};

export function makeGameCanvas() {
  const c = makeCanvas();
  c.requestPointerLock = () => {
    doc.pointerLockElement = c;
    fire('document', 'pointerlockchange');
  };
  return c;
}

// ---------------------------------------------------------------- Web Audio
function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
export const audioLog = { nodes: 0, sources: 0, contexts: 0, errors: [] };

class Param {
  constructor(name, value = 0) {
    this.name = name;
    this._v = value;
  }
  get value() {
    return this._v;
  }
  set value(v) {
    if (!isNum(v)) throw new TypeError(`${this.name}.value non-finite`);
    this._v = v;
  }
  setValueAtTime(v, t) {
    if (!isNum(v) || !isNum(t) || t < 0) throw new RangeError(`${this.name}.setValueAtTime(${v}, ${t})`);
    this._v = v;
  }
  exponentialRampToValueAtTime(v, t) {
    if (!isNum(v) || v <= 0 || !isNum(t) || t < 0) throw new RangeError(`${this.name}.exponentialRampToValueAtTime(${v}, ${t})`);
  }
  setTargetAtTime(v, t, k) {
    if (!isNum(v) || !isNum(t) || !isNum(k)) throw new RangeError(`${this.name}.setTargetAtTime`);
  }
}
class Node {
  constructor() {
    audioLog.nodes++;
    this.connected = new Set();
  }
  connect(n) {
    if (!n) throw new Error('connect(undefined)');
    this.connected.add(n);
    return n;
  }
  disconnect() {
    this.connected.clear();
  }
}
class GainNode extends Node {
  constructor() {
    super();
    this.gain = new Param('gain', 1);
  }
}
class BiquadNode extends Node {
  constructor() {
    super();
    this.type = 'lowpass';
    this.frequency = new Param('frequency', 350);
    this.Q = new Param('Q', 1);
  }
}
class SourceNode extends Node {
  constructor() {
    super();
    this.started = false;
    audioLog.sources++;
  }
  start(t = 0, off = 0) {
    if (this.started) throw new Error('InvalidStateError: start called twice');
    if (!isNum(t) || t < 0 || !isNum(off) || off < 0) throw new RangeError(`start(${t}, ${off})`);
    this.started = true;
  }
  stop(t = 0) {
    if (!this.started) throw new Error('InvalidStateError: stop before start');
    if (!isNum(t) || t < 0) throw new RangeError(`stop(${t})`);
  }
}
class BufferSource extends SourceNode {
  constructor() {
    super();
    this.buffer = null;
  }
}
class Osc extends SourceNode {
  constructor() {
    super();
    this.type = 'sine';
    this.frequency = new Param('osc.frequency', 440);
  }
}
class Panner extends Node {
  constructor() {
    super();
    this.positionX = new Param('px');
    this.positionY = new Param('py');
    this.positionZ = new Param('pz');
  }
}
export class FakeAudioContext {
  constructor() {
    audioLog.contexts++;
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.state = 'running';
    this.destination = new Node();
    this.listener = {
      positionX: new Param('lx'),
      positionY: new Param('ly'),
      positionZ: new Param('lz'),
      forwardX: new Param('fx'),
      forwardY: new Param('fy'),
      forwardZ: new Param('fz'),
      upX: new Param('ux'),
      upY: new Param('uy'),
      upZ: new Param('uz'),
    };
  }
  createDynamicsCompressor() {
    const n = new Node();
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param(k);
    return n;
  }
  createGain() {
    return new GainNode();
  }
  createBiquadFilter() {
    return new BiquadNode();
  }
  createBufferSource() {
    return new BufferSource();
  }
  createOscillator() {
    return new Osc();
  }
  createPanner() {
    return new Panner();
  }
  createBuffer(ch, len) {
    if (!(len > 0)) throw new RangeError('createBuffer length');
    const data = new Float32Array(len);
    return { getChannelData: () => data, length: len };
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------- install globals
let rafCb = null;
export function installGlobals() {
  const win = {
    ...target('window'),
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    AudioContext: FakeAudioContext,
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.requestAnimationFrame = (cb) => {
    rafCb = cb;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {
    rafCb = null;
  };
}
/** Run the pending animation-frame callback (like the browser would). */
export function runFrame(now) {
  const cb = rafCb;
  rafCb = null;
  if (!cb) throw new Error('no animation frame scheduled');
  cb(now);
}
