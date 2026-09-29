// Minimal stand-in for the subset of three.js that src/render uses. It exists ONLY so the render / engine code can be
// executed headlessly in Node for smoke testing (no GPU, no npm registry). It implements real vector / quaternion /
// matrix math where the code depends on it and validates that every transform and geometry stays finite.
// This is NOT the library the game ships with: `npm install` provides the real three.

export const RepeatWrapping = 1000;
export const SRGBColorSpace = 'srgb';
export const AdditiveBlending = 2;
export const NormalBlending = 1;
export const BackSide = 1;

const notFinite = (v: number): boolean => !Number.isFinite(v);

export class Vector3 {
  constructor(public x = 0, public y = 0, public z = 0) {}
  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  setScalar(s: number): this {
    return this.set(s, s, s);
  }
  copy(v: { x: number; y: number; z: number }): this {
    return this.set(v.x, v.y, v.z);
  }
  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }
  add(v: Vector3): this {
    return this.set(this.x + v.x, this.y + v.y, this.z + v.z);
  }
  sub(v: Vector3): this {
    return this.set(this.x - v.x, this.y - v.y, this.z - v.z);
  }
  addScaledVector(v: Vector3, s: number): this {
    return this.set(this.x + v.x * s, this.y + v.y * s, this.z + v.z * s);
  }
  multiplyScalar(s: number): this {
    return this.set(this.x * s, this.y * s, this.z * s);
  }
  dot(v: Vector3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }
  lengthSq(): number {
    return this.dot(this);
  }
  length(): number {
    return Math.sqrt(this.lengthSq());
  }
  normalize(): this {
    const l = this.length() || 1;
    return this.multiplyScalar(1 / l);
  }
  applyMatrix4(m: Matrix4): this {
    const e = m.elements;
    const { x, y, z } = this;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    return this.set((e[0] * x + e[4] * y + e[8] * z + e[12]) * w, (e[1] * x + e[5] * y + e[9] * z + e[13]) * w, (e[2] * x + e[6] * y + e[10] * z + e[14]) * w);
  }
}

export class Euler {
  private _x: number;
  private _y: number;
  private _z: number;
  order: string;
  onChange: () => void = () => {};
  constructor(x = 0, y = 0, z = 0, order = 'XYZ') {
    this._x = x;
    this._y = y;
    this._z = z;
    this.order = order;
  }
  get x(): number {
    return this._x;
  }
  set x(v: number) {
    this._x = v;
    this.onChange();
  }
  get y(): number {
    return this._y;
  }
  set y(v: number) {
    this._y = v;
    this.onChange();
  }
  get z(): number {
    return this._z;
  }
  set z(v: number) {
    this._z = v;
    this.onChange();
  }
  set(x: number, y: number, z: number, order?: string): this {
    this._x = x;
    this._y = y;
    this._z = z;
    if (order) this.order = order;
    this.onChange();
    return this;
  }
}

export class Quaternion {
  private _x = 0;
  private _y = 0;
  private _z = 0;
  private _w = 1;
  onChange: () => void = () => {};
  get x(): number {
    return this._x;
  }
  get y(): number {
    return this._y;
  }
  get z(): number {
    return this._z;
  }
  get w(): number {
    return this._w;
  }
  set(x: number, y: number, z: number, w: number): this {
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
    this.onChange();
    return this;
  }
  copy(q: Quaternion): this {
    return this.set(q.x, q.y, q.z, q.w);
  }
  clone(): Quaternion {
    return new Quaternion().copy(this);
  }
  invert(): this {
    return this.set(-this._x, -this._y, -this._z, this._w);
  }
  multiplyQuaternions(a: Quaternion, b: Quaternion): this {
    const qax = a.x, qay = a.y, qaz = a.z, qaw = a.w;
    const qbx = b.x, qby = b.y, qbz = b.z, qbw = b.w;
    return this.set(
      qax * qbw + qaw * qbx + qay * qbz - qaz * qby,
      qay * qbw + qaw * qby + qaz * qbx - qax * qbz,
      qaz * qbw + qaw * qbz + qax * qby - qay * qbx,
      qaw * qbw - qax * qbx - qay * qby - qaz * qbz,
    );
  }
  multiply(q: Quaternion): this {
    return this.multiplyQuaternions(this, q);
  }
  premultiply(q: Quaternion): this {
    return this.multiplyQuaternions(q, this);
  }
  setFromEuler(e: Euler, update = true): this {
    const c1 = Math.cos(e.x / 2), c2 = Math.cos(e.y / 2), c3 = Math.cos(e.z / 2);
    const s1 = Math.sin(e.x / 2), s2 = Math.sin(e.y / 2), s3 = Math.sin(e.z / 2);
    let x: number, y: number, z: number, w: number;
    if (e.order === 'YXZ') {
      x = s1 * c2 * c3 + c1 * s2 * s3;
      y = c1 * s2 * c3 - s1 * c2 * s3;
      z = c1 * c2 * s3 - s1 * s2 * c3;
      w = c1 * c2 * c3 + s1 * s2 * s3;
    } else {
      x = s1 * c2 * c3 + c1 * s2 * s3;
      y = c1 * s2 * c3 - s1 * c2 * s3;
      z = c1 * c2 * s3 + s1 * s2 * c3;
      w = c1 * c2 * c3 - s1 * s2 * s3;
    }
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
    if (update) this.onChange();
    return this;
  }
  setFromUnitVectors(from: Vector3, to: Vector3): this {
    let r = from.dot(to) + 1;
    let x: number, y: number, z: number;
    if (r < 1e-6) {
      r = 0;
      if (Math.abs(from.x) > Math.abs(from.z)) {
        x = -from.y;
        y = from.x;
        z = 0;
      } else {
        x = 0;
        y = -from.z;
        z = from.y;
      }
    } else {
      x = from.y * to.z - from.z * to.y;
      y = from.z * to.x - from.x * to.z;
      z = from.x * to.y - from.y * to.x;
    }
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = r;
    const l = Math.sqrt(x * x + y * y + z * z + r * r) || 1;
    this._x /= l;
    this._y /= l;
    this._z /= l;
    this._w /= l;
    this.onChange();
    return this;
  }
}

export class Matrix4 {
  elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  compose(p: Vector3, q: Quaternion, s: Vector3): this {
    const { x, y, z, w } = q;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const e = this.elements;
    e[0] = (1 - (yy + zz)) * s.x;
    e[1] = (xy + wz) * s.x;
    e[2] = (xz - wy) * s.x;
    e[3] = 0;
    e[4] = (xy - wz) * s.y;
    e[5] = (1 - (xx + zz)) * s.y;
    e[6] = (yz + wx) * s.y;
    e[7] = 0;
    e[8] = (xz + wy) * s.z;
    e[9] = (yz - wx) * s.z;
    e[10] = (1 - (xx + yy)) * s.z;
    e[11] = 0;
    e[12] = p.x;
    e[13] = p.y;
    e[14] = p.z;
    e[15] = 1;
    return this;
  }
  multiplyMatrices(a: Matrix4, b: Matrix4): this {
    const ae = a.elements, be = b.elements;
    const out = this.elements;
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += ae[k * 4 + r] * be[c * 4 + k];
        out[c * 4 + r] = sum;
      }
    }
    return this;
  }
  copy(m: Matrix4): this {
    for (let i = 0; i < 16; i++) this.elements[i] = m.elements[i];
    return this;
  }
}

export class Color {
  r = 1;
  g = 1;
  b = 1;
  constructor(hex: number | string = 0xffffff) {
    if (typeof hex === 'number') {
      this.r = ((hex >> 16) & 255) / 255;
      this.g = ((hex >> 8) & 255) / 255;
      this.b = (hex & 255) / 255;
    }
  }
}

export class Fog {
  constructor(public color: number, public near: number, public far: number) {}
}

export class Object3D {
  name = '';
  visible = true;
  parent: Object3D | null = null;
  children: Object3D[] = [];
  position = new Vector3();
  rotation = new Euler();
  quaternion = new Quaternion();
  scale = new Vector3(1, 1, 1);
  matrix = new Matrix4();
  matrixWorld = new Matrix4();
  matrixAutoUpdate = true;
  frustumCulled = true;
  constructor() {
    this.rotation.onChange = () => this.quaternion.setFromEuler(this.rotation, false);
  }
  add(...objects: Object3D[]): this {
    for (const o of objects) {
      if (!(o instanceof Object3D)) throw new Error('THREE.Object3D.add: object not an instance of THREE.Object3D: ' + String(o));
      if (o === this) throw new Error('THREE.Object3D.add: object can not be added as a child of itself');
      if (o.parent) o.parent.remove(o);
      o.parent = this;
      this.children.push(o);
    }
    return this;
  }
  remove(...objects: Object3D[]): this {
    for (const o of objects) {
      const i = this.children.indexOf(o);
      if (i >= 0) {
        this.children.splice(i, 1);
        o.parent = null;
      }
    }
    return this;
  }
  clear(): this {
    for (const c of this.children) c.parent = null;
    this.children.length = 0;
    return this;
  }
  updateMatrix(): void {
    this.matrix.compose(this.position, this.quaternion, this.scale);
  }
  updateMatrixWorld(): void {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.parent) this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    else this.matrixWorld.copy(this.matrix);
    for (const c of this.children) c.updateMatrixWorld();
  }
  lookAt(target: Vector3 | number, y?: number, z?: number): void {
    const t = typeof target === 'number' ? new Vector3(target, y ?? 0, z ?? 0) : target;
    const d = t.clone().sub(this.position);
    if (d.length() < 1e-9) return;
    d.normalize();
    this.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), d);
  }
  rotateZ(angle: number): this {
    const q = new Quaternion().setFromEuler(new Euler(0, 0, angle));
    this.quaternion.multiply(q);
    return this;
  }
  getWorldPosition(target: Vector3): Vector3 {
    // Refresh the matrices of this object's ancestors (like three's updateWorldMatrix(true, false)).
    const chain: Object3D[] = [];
    for (let o: Object3D | null = this; o; o = o.parent) chain.unshift(o);
    for (const o of chain) {
      if (o.matrixAutoUpdate) o.updateMatrix();
      if (o.parent) o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
      else o.matrixWorld.copy(o.matrix);
    }
    const e = this.matrixWorld.elements;
    return target.set(e[12], e[13], e[14]);
  }
  traverse(cb: (o: Object3D) => void): void {
    cb(this);
    for (const c of this.children) c.traverse(cb);
  }
}

export class Group extends Object3D {}
export class Scene extends Object3D {
  background: Color | null = null;
  fog: Fog | null = null;
}
export class Camera extends Object3D {}
export class PerspectiveCamera extends Camera {
  constructor(public fov = 50, public aspect = 1, public near = 0.1, public far = 2000) {
    super();
  }
  updateProjectionMatrix(): void {
    if (notFinite(this.fov) || notFinite(this.aspect) || this.aspect <= 0) throw new Error('bad camera projection: fov=' + this.fov + ' aspect=' + this.aspect);
  }
}
export class HemisphereLight extends Object3D {
  constructor(public skyColor = 0xffffff, public groundColor = 0xffffff, public intensity = 1) {
    super();
  }
}
export class AmbientLight extends Object3D {
  constructor(public color = 0xffffff, public intensity = 1) {
    super();
  }
}
export class DirectionalLight extends Object3D {
  constructor(public color = 0xffffff, public intensity = 1) {
    super();
  }
}

export class BufferAttribute {
  needsUpdate = false;
  constructor(public array: Float32Array | number[], public itemSize: number) {}
}
export class Float32BufferAttribute extends BufferAttribute {
  constructor(array: number[] | Float32Array, itemSize: number) {
    super(array instanceof Float32Array ? array : new Float32Array(array), itemSize);
  }
}
export class BufferGeometry {
  attributes: Record<string, BufferAttribute> = {};
  index: number[] | null = null;
  setAttribute(name: string, attr: BufferAttribute): this {
    this.attributes[name] = attr;
    return this;
  }
  getAttribute(name: string): BufferAttribute {
    const a = this.attributes[name];
    if (!a) throw new Error('missing attribute ' + name);
    return a;
  }
  setIndex(idx: number[]): this {
    this.index = idx;
    return this;
  }
  computeBoundingSphere(): void {}
  dispose(): void {}
}
export class BoxGeometry extends BufferGeometry {
  constructor(public width = 1, public height = 1, public depth = 1) {
    super();
  }
}
export class PlaneGeometry extends BufferGeometry {
  constructor(public width = 1, public height = 1) {
    super();
  }
}
export class SphereGeometry extends BufferGeometry {
  constructor(public radius = 1, public wSeg = 8, public hSeg = 6) {
    super();
  }
}
export class CylinderGeometry extends BufferGeometry {
  constructor(public rTop = 1, public rBottom = 1, public height = 1, public radial = 8) {
    super();
  }
}

export class Texture {
  wrapS = 0;
  wrapT = 0;
  colorSpace = '';
  anisotropy = 1;
  needsUpdate = false;
  dispose(): void {}
}
export class CanvasTexture extends Texture {
  constructor(public image: unknown) {
    super();
    if (!image) throw new Error('CanvasTexture needs a canvas');
  }
}

export class Material {
  opacity = 1;
  transparent = false;
  constructor(params: Record<string, unknown> = {}) {
    Object.assign(this, params);
  }
  dispose(): void {}
}
export class MeshBasicMaterial extends Material {}
export class MeshLambertMaterial extends Material {}
export class PointsMaterial extends Material {}
export class SpriteMaterial extends Material {}

export class Mesh extends Object3D {
  constructor(public geometry: BufferGeometry, public material: Material | Material[]) {
    super();
    if (!(geometry instanceof BufferGeometry)) throw new Error('Mesh geometry invalid');
    if (!material) throw new Error('Mesh material missing');
  }
}
export class Points extends Object3D {
  constructor(public geometry: BufferGeometry, public material: Material) {
    super();
  }
}
export class Sprite extends Object3D {
  constructor(public material: SpriteMaterial) {
    super();
    if (!material) throw new Error('Sprite material missing');
  }
}

/** Fake renderer: "renders" by validating that the whole scene graph is finite. */
export class WebGLRenderer {
  autoClear = true;
  domElement: { style: Record<string, string>; parentElement: { removeChild(el: unknown): void } | null; width: number; height: number };
  drawCalls = 0;
  frames = 0;
  constructor(_opts: unknown = {}) {
    this.domElement = { style: {}, parentElement: null, width: 0, height: 0 };
  }
  setPixelRatio(_r: number): void {}
  setSize(w: number, h: number, _updateStyle?: boolean): void {
    if (!(w > 0 && h > 0)) throw new Error('bad renderer size');
    this.domElement.width = w;
    this.domElement.height = h;
  }
  clear(): void {}
  clearDepth(): void {}
  dispose(): void {}
  render(scene: Scene, camera: Camera): void {
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    this.frames++;
    const bad = (label: string, o: Object3D): never => {
      throw new Error('non-finite transform in ' + label + ' (' + (o.name || o.constructor.name) + ')');
    };
    scene.traverse((o) => {
      for (const v of [o.position.x, o.position.y, o.position.z, o.scale.x, o.scale.y, o.scale.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w]) {
        if (notFinite(v)) bad('local transform', o);
      }
      for (const v of o.matrixWorld.elements) if (notFinite(v)) bad('world matrix', o);
      if (o instanceof Mesh && o.visible) {
        this.drawCalls++;
        const pos = o.geometry.attributes.position;
        if (pos) for (let i = 0; i < pos.array.length; i++) if (notFinite(pos.array[i])) throw new Error('NaN in geometry position of ' + (o.name || 'mesh'));
      }
    });
  }
}
