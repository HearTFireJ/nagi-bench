// A permissive stand-in for `three`: every export is a constructor / function whose results are
// again permissive proxies. It cannot validate three's real API, but it lets our own render code
// run end-to-end in Node so plain JS mistakes (undefined fields, bad arguments) surface.

function make() {
  const fn = function () {};
  const store = new Map();
  const proxy = new Proxy(fn, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === 'then') return undefined;
      if (prop === 'length') return 0;
      if (typeof prop === 'symbol') return undefined;
      if (!store.has(prop)) store.set(prop, make());
      return store.get(prop);
    },
    set(_t, prop, value) {
      store.set(prop, value);
      return true;
    },
    apply() {
      return make();
    },
    construct() {
      return make();
    },
    has() {
      return true;
    },
  });
  return proxy;
}

const handler = {
  get(_t, prop) {
    if (prop === 'MathUtils') {
      return { clamp: (v, a, b) => Math.min(b, Math.max(a, v)), lerp: (a, b, t) => a + (b - a) * t };
    }
    return make();
  },
};

const mod = new Proxy({}, handler);
export const MathUtils = mod.MathUtils;
export const Scene = make();
export const PerspectiveCamera = make();
export const WebGLRenderer = make();
export const Group = make();
export const Mesh = make();
export const Object3D = make();
export const BoxGeometry = make();
export const PlaneGeometry = make();
export const SphereGeometry = make();
export const CylinderGeometry = make();
export const BufferGeometry = make();
export const Float32BufferAttribute = make();
export const MeshLambertMaterial = make();
export const MeshBasicMaterial = make();
export const Material = make();
export const Color = make();
export const Vector3 = make();
export const Quaternion = make();
export const Fog = make();
export const HemisphereLight = make();
export const DirectionalLight = make();
export const AmbientLight = make();
export const CanvasTexture = make();
export const RepeatWrapping = 1000;
export const SRGBColorSpace = 'srgb';
