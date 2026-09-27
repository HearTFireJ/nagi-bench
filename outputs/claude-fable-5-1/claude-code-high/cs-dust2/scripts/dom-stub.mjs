// Minimal browser globals for headless engine smoke tests (no rendering).
import { makeAny } from './any-stub.mjs';

const listeners = new Map(); // target -> type -> Set<fn>
function makeTarget(extra = {}) {
  const t = {
    addEventListener(type, fn) {
      if (!listeners.has(t)) listeners.set(t, new Map());
      const m = listeners.get(t);
      if (!m.has(type)) m.set(type, new Set());
      m.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(t)?.get(type)?.delete(fn);
    },
    dispatch(type, ev) {
      const fns = listeners.get(t)?.get(type);
      if (!fns) return;
      for (const fn of [...fns]) fn({ type, preventDefault() {}, ...ev });
    },
    ...extra,
  };
  return t;
}

const canvasElement = makeTarget({
  style: {},
  clientWidth: 1280,
  clientHeight: 720,
  parentElement: null,
  requestPointerLock() {
    documentStub.pointerLockElement = canvasElement;
    documentStub.dispatch('pointerlockchange');
    return undefined;
  },
  getContext() {
    return makeAny('ctx2d');
  },
  width: 0,
  height: 0,
});

const documentStub = makeTarget({
  pointerLockElement: null,
  createElement(tag) {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => makeAny('ctx2d'),
      };
    }
    return makeAny('el:' + tag);
  },
  exitPointerLock() {
    documentStub.pointerLockElement = null;
    documentStub.dispatch('pointerlockchange');
  },
});

let now = 0;
const rafQueue = [];
const windowStub = makeTarget({
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  AudioContext: undefined, // no audio in Node: AudioEngine.resume() becomes a no-op
});

globalThis.window = windowStub;
globalThis.document = documentStub;
// The three.js stub's WebGLRenderer hands out this element as its domElement.
globalThis.__canvasElement = canvasElement;
globalThis.performance = { now: () => now };
globalThis.requestAnimationFrame = (fn) => {
  rafQueue.push(fn);
  return rafQueue.length;
};
globalThis.cancelAnimationFrame = () => {};

export const dom = {
  canvasElement,
  documentStub,
  windowStub,
  /** Advance time and run queued animation frames. */
  tick(ms) {
    now += ms;
    const q = rafQueue.splice(0);
    for (const fn of q) fn(now);
  },
  container: {
    clientWidth: 1280,
    clientHeight: 720,
    appendChild(el) {
      el.parentElement = this;
    },
    removeChild() {},
  },
  key(code, down = true) {
    windowStub.dispatch(down ? 'keydown' : 'keyup', { code, repeat: false });
  },
  /** A tap: keydown followed by keyup. */
  press(code) {
    windowStub.dispatch('keydown', { code, repeat: false });
    windowStub.dispatch('keyup', { code, repeat: false });
  },
  mouse(button, down = true) {
    if (down) canvasElement.dispatch('mousedown', { button });
    else windowStub.dispatch('mouseup', { button });
  },
  move(dx, dy) {
    windowStub.dispatch('mousemove', { movementX: dx, movementY: dy });
  },
};
