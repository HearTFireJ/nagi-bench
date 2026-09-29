// Minimal in-memory stand-in for the parts of three.js this project uses. It exists ONLY so the
// render / app / audio code can be executed headlessly under Node for smoke testing (typos,
// undefined references, NaN transforms, scene-graph bugs). It renders nothing and is no
// substitute for running the game in a real browser.

export const RepeatWrapping = 1000;
export const SRGBColorSpace = 'srgb';
export const AdditiveBlending = 2;
export const BackSide = 1;

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  setScalar(s) {
    return this.set(s, s, s);
  }
  copy(v) {
    return this.set(v.x, v.y, v.z);
  }
  clone() {
    return new Vector3(this.x, this.y, this.z);
  }
  add(v) {
    return this.set(this.x + v.x, this.y + v.y, this.z + v.z);
  }
  sub(v) {
    return this.set(this.x - v.x, this.y - v.y, this.z - v.z);
  }
  multiplyScalar(s) {
    return this.set(this.x * s, this.y * s, this.z * s);
  }
  length() {
    return Math.hypot(this.x, this.y, this.z);
  }
  normalize() {
    const l = this.length() || 1;
    return this.multiplyScalar(1 / l);
  }
  applyQuaternion() {
    return this;
  }
}

export class Euler {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.order = 'XYZ';
  }
  set(x, y, z, order) {
    this.x = x;
    this.y = y;
    this.z = z;
    if (order) this.order = order;
    return this;
  }
}

export class Quaternion {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.w = 1;
  }
  copy(q) {
    this.x = q.x;
    this.y = q.y;
    this.z = q.z;
    this.w = q.w;
    return this;
  }
  setFromUnitVectors() {
    return this;
  }
}

export class Color {
  constructor(c = 0xffffff) {
    this.hex = c;
  }
  setHex(h) {
    this.hex = h;
    return this;
  }
}

export class Fog {
  constructor(color, near, far) {
    this.color = color;
    this.near = near;
    this.far = far;
  }
}

export class Object3D {
  constructor() {
    this.position = new Vector3();
    this.rotation = new Euler();
    this.quaternion = new Quaternion();
    this.scale = new Vector3(1, 1, 1);
    this.children = [];
    this.parent = null;
    this.visible = true;
    this.userData = {};
    this.renderOrder = 0;
  }
  add(...objs) {
    for (const o of objs) {
      if (!o || !(o instanceof Object3D)) throw new Error('add(): not an Object3D: ' + o);
      if (o === this) throw new Error('add(): object cannot be a child of itself');
      if (o.parent) o.parent.remove(o);
      o.parent = this;
      this.children.push(o);
    }
    return this;
  }
  remove(o) {
    const i = this.children.indexOf(o);
    if (i >= 0) {
      this.children.splice(i, 1);
      o.parent = null;
    }
    return this;
  }
  removeFromParent() {
    if (this.parent) this.parent.remove(this);
    return this;
  }
  getWorldPosition(v) {
    return v.set(this.position.x, this.position.y, this.position.z);
  }
  lookAt() {}
  updateMatrixWorld() {}
}
export class Group extends Object3D {}
export class Scene extends Object3D {
  constructor() {
    super();
    this.fog = null;
    this.background = null;
  }
}
export class Mesh extends Object3D {
  constructor(geometry, material) {
    super();
    if (!geometry || !material) throw new Error('Mesh needs geometry and material');
    this.geometry = geometry;
    this.material = material;
  }
}
export class PerspectiveCamera extends Object3D {
  constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
    super();
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
  }
  updateProjectionMatrix() {}
}

class Attr {
  constructor(arr, itemSize) {
    for (const v of arr) if (!Number.isFinite(v)) throw new Error('non-finite value in buffer attribute');
    this.array = Float32Array.from(arr);
    this.itemSize = itemSize;
    this.count = arr.length / itemSize;
  }
  getX(i) {
    return this.array[i * this.itemSize];
  }
  getY(i) {
    return this.array[i * this.itemSize + 1];
  }
  getZ(i) {
    return this.array[i * this.itemSize + 2];
  }
}
export class Float32BufferAttribute extends Attr {}
export class BufferGeometry {
  constructor() {
    this.attributes = {};
    this.index = null;
  }
  setAttribute(n, a) {
    this.attributes[n] = a;
    return this;
  }
  getAttribute(n) {
    return this.attributes[n];
  }
  setIndex(i) {
    this.index = i;
    return this;
  }
  computeBoundingSphere() {}
  rotateX() {
    return this;
  }
  dispose() {}
}
class ParamGeo extends BufferGeometry {
  constructor() {
    super();
    this.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    this.setAttribute('normal', new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  }
}
export class BoxGeometry extends ParamGeo {}
export class CylinderGeometry extends ParamGeo {}
export class PlaneGeometry extends ParamGeo {}
export class SphereGeometry extends ParamGeo {}
export class CircleGeometry extends ParamGeo {}

export class MeshBasicMaterial {
  constructor(p = {}) {
    Object.assign(this, p);
    this.color = new Color(typeof p.color === 'number' ? p.color : 0xffffff);
  }
  clone() {
    return new MeshBasicMaterial({});
  }
  dispose() {}
}
export class CanvasTexture {
  constructor(image) {
    if (!image) throw new Error('CanvasTexture needs a canvas');
    this.image = image;
  }
  dispose() {}
}

function check(o, path, problems) {
  const bad = (v) => !Number.isFinite(v);
  if (bad(o.position.x) || bad(o.position.y) || bad(o.position.z)) problems.push(path + ' position NaN');
  if (bad(o.scale.x) || bad(o.scale.y) || bad(o.scale.z)) problems.push(path + ' scale NaN');
  if (bad(o.rotation.x) || bad(o.rotation.y) || bad(o.rotation.z)) problems.push(path + ' rotation NaN');
  for (let i = 0; i < o.children.length; i++) check(o.children[i], path + '/' + i, problems);
}

export class WebGLRenderer {
  constructor(p = {}) {
    if (!p.canvas) throw new Error('WebGLRenderer needs a canvas');
    this.domElement = p.canvas;
    this.autoClear = true;
    this.stats = { renders: 0, clears: 0, depthClears: 0, problems: [] };
  }
  setPixelRatio() {}
  setSize() {}
  clear() {
    this.stats.clears++;
  }
  clearDepth() {
    this.stats.depthClears++;
  }
  render(scene, camera) {
    if (!scene || !camera) throw new Error('render(scene, camera)');
    this.stats.renders++;
    if (this.stats.problems.length < 20) check(scene, 'scene', this.stats.problems);
    if (!Number.isFinite(camera.position.x + camera.position.y + camera.position.z + camera.rotation.x + camera.rotation.y + camera.fov)) {
      this.stats.problems.push('camera NaN');
    }
  }
  dispose() {}
}
