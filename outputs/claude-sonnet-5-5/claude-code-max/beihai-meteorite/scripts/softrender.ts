/**
 * 软件光栅化预览渲染器（仅用于开发期在没有浏览器/GPU 的环境里检查构图、色彩与曝光）。
 * 尽量模拟 three r180 的 WebGLRenderer 管线：
 *   - 物理光照单位（Lambert = albedo/π × 辐照度），PointLight/SpotLight 距离衰减与截断
 *   - 雾在“色调映射 + sRGB 编码之后”于显示空间混合（与 three 着色器顺序一致）
 *   - ACESFilmic 色调映射与 sRGB 输出
 *   - 支持 Mesh / InstancedMesh / Points / Sprite，透明与加法混合、alphaTest、顶点色、贴图（最近邻/双线性）
 * 阴影、镜面高光、后处理不在模拟范围内。
 */
import * as THREE from "three";
import zlib from "node:zlib";

const PI = Math.PI;

// ---------- sRGB LUT ----------
const LUT_N = 4096;
const SRGB_LUT = new Float32Array(LUT_N + 1);
for (let i = 0; i <= LUT_N; i++) {
  const c = i / LUT_N;
  SRGB_LUT[i] = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
function encodeSRGB(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return SRGB_LUT[(c * LUT_N) | 0];
}
function decodeSRGB(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const DECODE_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) DECODE_LUT[i] = decodeSRGB(i / 255);

// ---------- ACES（与 three.js ACESFilmicToneMapping 相同） ----------
function acesInto(out: Float32Array, r: number, g: number, b: number, exposure: number): void {
  const k = exposure / 0.6;
  r *= k; g *= k; b *= k;
  // ACESInputMat
  let R = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  let G = 0.076 * r + 0.90834 * g + 0.01566 * b;
  let B = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  // RRTAndODTFit
  const fit = (v: number) => {
    const a = v * (v + 0.0245786) - 0.000090537;
    const d = v * (0.983729 * v + 0.432951) + 0.238081;
    return a / d;
  };
  R = fit(R); G = fit(G); B = fit(B);
  // ACESOutputMat
  const oR = 1.60475 * R - 0.53108 * G - 0.07367 * B;
  const oG = -0.10208 * R + 1.10813 * G - 0.00605 * B;
  const oB = -0.00327 * R - 0.07276 * G + 1.07602 * B;
  out[0] = oR < 0 ? 0 : oR > 1 ? 1 : oR;
  out[1] = oG < 0 ? 0 : oG > 1 ? 1 : oG;
  out[2] = oB < 0 ? 0 : oB > 1 ? 1 : oB;
}

// ---------- 贴图采样 ----------
interface TexData {
  w: number;
  h: number;
  rgba: Float32Array; // 线性空间，0..1
  tex: THREE.Texture;
}
const texCache = new WeakMap<THREE.Texture, { version: number; data: TexData }>();

function getTexData(tex: THREE.Texture): TexData | null {
  const cached = texCache.get(tex);
  if (cached && cached.version === tex.version) return cached.data;
  const img = tex.image as
    | { data?: ArrayLike<number>; width: number; height: number }
    | undefined;
  if (!img) return null;
  const w = img.width;
  const h = img.height;
  const rgba = new Float32Array(w * h * 4);
  const src = img.data as ArrayLike<number> | undefined;
  if (!src) return null;
  const srgb = tex.colorSpace === THREE.SRGBColorSpace;
  const isFloat = src instanceof Float32Array;
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) {
      const v = isFloat ? (src[i * 4 + c] as number) : (src[i * 4 + c] as number) / 255;
      rgba[i * 4 + c] = srgb && !isFloat ? DECODE_LUT[(src[i * 4 + c] as number) | 0] : v;
    }
    rgba[i * 4 + 3] = isFloat ? (src[i * 4 + 3] as number) : (src[i * 4 + 3] as number) / 255;
  }
  const data = { w, h, rgba, tex };
  texCache.set(tex, { version: tex.version, data });
  return data;
}

const smp = new Float32Array(4);
function sampleTex(td: TexData, u: number, v: number, out: Float32Array): void {
  const tex = td.tex;
  // uv 变换（仅 offset / repeat）
  u = u * tex.repeat.x + tex.offset.x;
  v = v * tex.repeat.y + tex.offset.y;
  if (tex.wrapS === THREE.RepeatWrapping) u = u - Math.floor(u);
  else u = u < 0 ? 0 : u > 1 ? 1 : u;
  if (tex.wrapT === THREE.RepeatWrapping) v = v - Math.floor(v);
  else v = v < 0 ? 0 : v > 1 ? 1 : v;
  const vv = tex.flipY ? 1 - v : v;
  const fx = u * td.w;
  const fy = vv * td.h;
  if (tex.magFilter === THREE.NearestFilter) {
    let x = fx | 0;
    let y = fy | 0;
    if (x >= td.w) x = td.w - 1;
    if (y >= td.h) y = td.h - 1;
    const i = (y * td.w + x) * 4;
    out[0] = td.rgba[i]; out[1] = td.rgba[i + 1]; out[2] = td.rgba[i + 2]; out[3] = td.rgba[i + 3];
    return;
  }
  // 双线性
  const x0f = fx - 0.5;
  const y0f = fy - 0.5;
  let x0 = Math.floor(x0f);
  let y0 = Math.floor(y0f);
  const tx = x0f - x0;
  const ty = y0f - y0;
  const wrap = (a: number, n: number, rep: boolean) => (rep ? ((a % n) + n) % n : a < 0 ? 0 : a >= n ? n - 1 : a);
  const repS = tex.wrapS === THREE.RepeatWrapping;
  const repT = tex.wrapT === THREE.RepeatWrapping;
  const x1 = wrap(x0 + 1, td.w, repS);
  const y1 = wrap(y0 + 1, td.h, repT);
  x0 = wrap(x0, td.w, repS);
  y0 = wrap(y0, td.h, repT);
  const i00 = (y0 * td.w + x0) * 4;
  const i10 = (y0 * td.w + x1) * 4;
  const i01 = (y1 * td.w + x0) * 4;
  const i11 = (y1 * td.w + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const a = td.rgba[i00 + c] * (1 - tx) + td.rgba[i10 + c] * tx;
    const b = td.rgba[i01 + c] * (1 - tx) + td.rgba[i11 + c] * tx;
    out[c] = a * (1 - ty) + b * ty;
  }
}

// ---------- 光源 ----------
interface Light {
  kind: 0 | 1 | 2 | 3 | 4; // 环境, 半球, 平行, 点, 聚光
  r: number; g: number; b: number;
  gr: number; gg: number; gb: number;
  px: number; py: number; pz: number;
  dx: number; dy: number; dz: number; // 平行光: 指向光源；聚光: 光轴（光源指向目标）；半球: 天空方向
  dist: number; decay: number;
  coneCos: number; penCos: number;
}

const STRIDE = 16; // cx cy cz cw | wx wy wz | nx ny nz | r g b | u v | pad

export interface SoftRendererOptions {
  width: number;
  height: number;
  /** 点精灵大小缩放（预览分辨率相对 1920 宽度） */
  pointScale?: number;
}

export class SoftRenderer {
  readonly width: number;
  readonly height: number;
  color: Float32Array;
  depth: Float32Array;
  toneMapping: number = THREE.ACESFilmicToneMapping;
  toneMappingExposure = 1;
  autoClear = false;
  clearColor: [number, number, number] = [0, 0, 0];
  pointScale: number;
  stats = { tris: 0, drawn: 0 };

  private lights: Light[] = [];
  private fogInfo: { kind: 0 | 1 | 2; near: number; far: number; density: number; r: number; g: number; b: number } | null = null;
  private tmp = new Float32Array(4);
  private tm = new Float32Array(3);
  private texOut = new Float32Array(4);
  /** three 会对带 instanceColor 的 InstancedMesh 自动乘实例色（不需要 vertexColors） */
  private forceVC = false;

  constructor(opts: SoftRendererOptions) {
    this.width = opts.width;
    this.height = opts.height;
    this.pointScale = opts.pointScale ?? opts.width / 1920;
    this.color = new Float32Array(this.width * this.height * 3);
    this.depth = new Float32Array(this.width * this.height).fill(2);
  }

  setClearColor(color: THREE.ColorRepresentation): void {
    const c = new THREE.Color(color);
    this.clearColor = [encodeSRGB(c.r), encodeSRGB(c.g), encodeSRGB(c.b)];
  }
  setSize(): void {}
  setPixelRatio(): void {}

  clear(): void {
    for (let i = 0; i < this.width * this.height; i++) {
      this.color[i * 3] = this.clearColor[0];
      this.color[i * 3 + 1] = this.clearColor[1];
      this.color[i * 3 + 2] = this.clearColor[2];
    }
    this.depth.fill(2);
  }
  clearDepth(): void {
    this.depth.fill(2);
  }

  // =============== 主入口 ===============
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix?.();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    // 背景色（three 会在有 Color 背景时强制清屏）
    if (scene.background && (scene.background as THREE.Color).isColor) {
      const c = scene.background as THREE.Color;
      const r = encodeSRGB(c.r), g = encodeSRGB(c.g), b = encodeSRGB(c.b);
      for (let i = 0; i < this.width * this.height; i++) {
        this.color[i * 3] = r; this.color[i * 3 + 1] = g; this.color[i * 3 + 2] = b;
      }
      this.depth.fill(2);
    }

    this.collectLights(scene, camera);
    this.setupFog(scene);

    const view = camera.matrixWorldInverse;
    const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, view);

    type Item = { obj: THREE.Object3D; transparent: boolean; order: number; z: number };
    const opaque: Item[] = [];
    const transparent: Item[] = [];
    const tmpV = new THREE.Vector3();
    scene.traverseVisible((obj) => {
      const anyObj = obj as unknown as { isMesh?: boolean; isPoints?: boolean; isSprite?: boolean; material?: THREE.Material | THREE.Material[] };
      if (!anyObj.isMesh && !anyObj.isPoints && !anyObj.isSprite) return;
      const mats = Array.isArray(anyObj.material) ? anyObj.material : [anyObj.material!];
      const isT = mats.some((m) => m.transparent);
      tmpV.setFromMatrixPosition(obj.matrixWorld).applyMatrix4(view);
      const item = { obj, transparent: isT, order: obj.renderOrder, z: tmpV.z };
      (isT ? transparent : opaque).push(item);
    });
    opaque.sort((a, b) => a.order - b.order);
    transparent.sort((a, b) => a.order - b.order || a.z - b.z); // z 更负=更远，先画

    for (const it of opaque) this.drawObject(it.obj, camera, vp, view);
    for (const it of transparent) this.drawObject(it.obj, camera, vp, view);
  }

  // =============== 光源 / 雾 ===============
  private collectLights(scene: THREE.Scene, _camera: THREE.Camera): void {
    this.lights = [];
    const wp = new THREE.Vector3();
    const tp = new THREE.Vector3();
    scene.traverseVisible((obj) => {
      const l = obj as THREE.Light & {
        isAmbientLight?: boolean; isHemisphereLight?: boolean; isDirectionalLight?: boolean; isPointLight?: boolean; isSpotLight?: boolean;
        target?: THREE.Object3D; groundColor?: THREE.Color; distance?: number; decay?: number; angle?: number; penumbra?: number;
      };
      if (!l.isLight) return;
      const c = l.color;
      const I = l.intensity;
      const base: Light = {
        kind: 0, r: c.r * I, g: c.g * I, b: c.b * I, gr: 0, gg: 0, gb: 0,
        px: 0, py: 0, pz: 0, dx: 0, dy: 1, dz: 0, dist: 0, decay: 2, coneCos: 0, penCos: 0,
      };
      wp.setFromMatrixPosition(l.matrixWorld);
      if (l.isAmbientLight) {
        base.kind = 0;
      } else if (l.isHemisphereLight) {
        base.kind = 1;
        const g = l.groundColor!;
        base.gr = g.r * I; base.gg = g.g * I; base.gb = g.b * I;
        const len = wp.length() || 1;
        base.dx = wp.x / len; base.dy = wp.y / len; base.dz = wp.z / len;
      } else if (l.isDirectionalLight) {
        base.kind = 2;
        l.target!.updateMatrixWorld(true);
        tp.setFromMatrixPosition(l.target!.matrixWorld);
        const dx = wp.x - tp.x, dy = wp.y - tp.y, dz = wp.z - tp.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        base.dx = dx / len; base.dy = dy / len; base.dz = dz / len;
      } else if (l.isPointLight) {
        base.kind = 3;
        base.px = wp.x; base.py = wp.y; base.pz = wp.z;
        base.dist = l.distance ?? 0; base.decay = l.decay ?? 2;
      } else if (l.isSpotLight) {
        base.kind = 4;
        base.px = wp.x; base.py = wp.y; base.pz = wp.z;
        base.dist = l.distance ?? 0; base.decay = l.decay ?? 2;
        l.target!.updateMatrixWorld(true);
        tp.setFromMatrixPosition(l.target!.matrixWorld);
        const dx = tp.x - wp.x, dy = tp.y - wp.y, dz = tp.z - wp.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        base.dx = dx / len; base.dy = dy / len; base.dz = dz / len;
        const ang = l.angle ?? Math.PI / 3;
        const pen = l.penumbra ?? 0;
        base.coneCos = Math.cos(ang);
        base.penCos = Math.cos(ang * (1 - pen));
      } else {
        return;
      }
      this.lights.push(base);
    });
  }

  private setupFog(scene: THREE.Scene): void {
    const f = scene.fog as (THREE.Fog & THREE.FogExp2 & { isFog?: boolean; isFogExp2?: boolean }) | null;
    if (!f) { this.fogInfo = null; return; }
    const c = f.color;
    const r = encodeSRGB(c.r), g = encodeSRGB(c.g), b = encodeSRGB(c.b);
    if (f.isFog) this.fogInfo = { kind: 1, near: f.near, far: f.far, density: 0, r, g, b };
    else this.fogInfo = { kind: 2, near: 0, far: 0, density: f.density, r, g, b };
  }

  // =============== 绘制对象 ===============
  private drawObject(obj: THREE.Object3D, camera: THREE.Camera, vp: THREE.Matrix4, view: THREE.Matrix4): void {
    const o = obj as unknown as { isMesh?: boolean; isPoints?: boolean; isSprite?: boolean; isInstancedMesh?: boolean };
    if (o.isSprite) return this.drawSprite(obj as THREE.Sprite, camera, view);
    if (o.isPoints) return this.drawPoints(obj as THREE.Points, camera, vp, view);
    if (o.isMesh) return this.drawMesh(obj as THREE.Mesh, camera, vp, view);
  }

  private drawMesh(mesh: THREE.Mesh, camera: THREE.Camera, vp: THREE.Matrix4, view: THREE.Matrix4): void {
    const geo = mesh.geometry as THREE.BufferGeometry;
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    if (!posAttr) return;
    const idx = geo.index;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const inst = mesh as unknown as THREE.InstancedMesh;
    const isInst = (mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh === true;
    const count = isInst ? inst.count : 1;
    this.forceVC = isInst && !!inst.instanceColor;

    const groups = Array.isArray(mesh.material) ? geo.groups : [{ start: 0, count: idx ? idx.count : posAttr.count, materialIndex: 0 }];
    const nVerts = posAttr.count;
    const verts = new Float32Array(nVerts * STRIDE);

    const normAttr = geo.attributes.normal as THREE.BufferAttribute | undefined;
    const colAttr = geo.attributes.color as THREE.BufferAttribute | undefined;
    const uvAttr = geo.attributes.uv as THREE.BufferAttribute | undefined;

    const model = new THREE.Matrix4();
    const nmat = new THREE.Matrix3();
    const mvp = new THREE.Matrix4();
    const instM = new THREE.Matrix4();
    const iCol = new THREE.Color();

    for (let ii = 0; ii < count; ii++) {
      if (isInst) {
        inst.getMatrixAt(ii, instM);
        model.multiplyMatrices(mesh.matrixWorld, instM);
        if (inst.instanceColor) inst.getColorAt(ii, iCol);
        else iCol.setRGB(1, 1, 1);
      } else {
        model.copy(mesh.matrixWorld);
        iCol.setRGB(1, 1, 1);
      }
      nmat.getNormalMatrix(model);
      mvp.multiplyMatrices(vp, model);
      const m = model.elements;
      const n = nmat.elements;
      const q = mvp.elements;
      const pa = posAttr.array as ArrayLike<number>;
      const na = normAttr ? (normAttr.array as ArrayLike<number>) : null;
      const ca = colAttr ? (colAttr.array as ArrayLike<number>) : null;
      const cs = colAttr ? colAttr.itemSize : 3;
      const ua = uvAttr ? (uvAttr.array as ArrayLike<number>) : null;
      for (let i = 0; i < nVerts; i++) {
        const x = pa[i * 3], y = pa[i * 3 + 1], z = pa[i * 3 + 2];
        const o = i * STRIDE;
        verts[o] = q[0] * x + q[4] * y + q[8] * z + q[12];
        verts[o + 1] = q[1] * x + q[5] * y + q[9] * z + q[13];
        verts[o + 2] = q[2] * x + q[6] * y + q[10] * z + q[14];
        verts[o + 3] = q[3] * x + q[7] * y + q[11] * z + q[15];
        verts[o + 4] = m[0] * x + m[4] * y + m[8] * z + m[12];
        verts[o + 5] = m[1] * x + m[5] * y + m[9] * z + m[13];
        verts[o + 6] = m[2] * x + m[6] * y + m[10] * z + m[14];
        if (na) {
          const nx = na[i * 3], ny = na[i * 3 + 1], nz = na[i * 3 + 2];
          let wx = n[0] * nx + n[3] * ny + n[6] * nz;
          let wy = n[1] * nx + n[4] * ny + n[7] * nz;
          let wz = n[2] * nx + n[5] * ny + n[8] * nz;
          const l = Math.hypot(wx, wy, wz) || 1;
          verts[o + 7] = wx / l; verts[o + 8] = wy / l; verts[o + 9] = wz / l;
        }
        if (ca) {
          verts[o + 10] = ca[i * cs] * iCol.r; verts[o + 11] = ca[i * cs + 1] * iCol.g; verts[o + 12] = ca[i * cs + 2] * iCol.b;
        } else {
          verts[o + 10] = iCol.r; verts[o + 11] = iCol.g; verts[o + 12] = iCol.b;
        }
        if (ua) { verts[o + 13] = ua[i * 2]; verts[o + 14] = ua[i * 2 + 1]; }
      }

      for (const g of groups) {
        const mat = mats[g.materialIndex ?? 0];
        if (!mat || !mat.visible) continue;
        const start = g.start;
        const end = Math.min(g.start + g.count, idx ? idx.count : nVerts);
        const ia = idx ? (idx.array as ArrayLike<number>) : null;
        for (let t = start; t + 2 < end; t += 3) {
          const a = ia ? ia[t] : t;
          const b = ia ? ia[t + 1] : t + 1;
          const c = ia ? ia[t + 2] : t + 2;
          this.drawTriangle(verts, a, b, c, mat, !na, camera, view);
        }
      }
    }
  }

  // ---- 三角形：近平面裁剪 + 光栅化 ----
  private clipBuf: Float32Array[] = [new Float32Array(STRIDE * 8), new Float32Array(STRIDE * 8)];

  private drawTriangle(
    verts: Float32Array, ia: number, ib: number, ic: number, mat: THREE.Material, flatNormal: boolean,
    camera: THREE.Camera, view: THREE.Matrix4,
  ): void {
    this.stats.tris++;
    const oa = ia * STRIDE, ob = ib * STRIDE, oc = ic * STRIDE;
    const wa = verts[oa + 3], wb = verts[ob + 3], wc = verts[oc + 3];
    const xa = verts[oa], xb = verts[ob], xc = verts[oc];
    const ya = verts[oa + 1], yb = verts[ob + 1], yc = verts[oc + 1];
    const za = verts[oa + 2], zb = verts[ob + 2], zc = verts[oc + 2];
    // 视锥外快速剔除
    if (xa > wa && xb > wb && xc > wc) return;
    if (xa < -wa && xb < -wb && xc < -wc) return;
    if (ya > wa && yb > wb && yc > wc) return;
    if (ya < -wa && yb < -wb && yc < -wc) return;
    if (za < -wa && zb < -wb && zc < -wc) return;
    if (za > wa && zb > wb && zc > wc) return;

    let poly: Float32Array;
    let n: number;
    const inA = za >= -wa, inB = zb >= -wb, inC = zc >= -wc;
    if (inA && inB && inC) {
      poly = this.clipBuf[0];
      poly.set(verts.subarray(oa, oa + STRIDE), 0);
      poly.set(verts.subarray(ob, ob + STRIDE), STRIDE);
      poly.set(verts.subarray(oc, oc + STRIDE), STRIDE * 2);
      n = 3;
    } else {
      // Sutherland-Hodgman 对近平面 z + w >= 0
      const src = this.clipBuf[1];
      src.set(verts.subarray(oa, oa + STRIDE), 0);
      src.set(verts.subarray(ob, ob + STRIDE), STRIDE);
      src.set(verts.subarray(oc, oc + STRIDE), STRIDE * 2);
      const dst = this.clipBuf[0];
      let m = 0;
      for (let i = 0; i < 3; i++) {
        const cur = i * STRIDE;
        const nxt = ((i + 1) % 3) * STRIDE;
        const dc = src[cur + 2] + src[cur + 3];
        const dn = src[nxt + 2] + src[nxt + 3];
        if (dc >= 0) {
          dst.set(src.subarray(cur, cur + STRIDE), m * STRIDE); m++;
        }
        if ((dc >= 0) !== (dn >= 0)) {
          const t = dc / (dc - dn);
          for (let k = 0; k < STRIDE; k++) dst[m * STRIDE + k] = src[cur + k] + (src[nxt + k] - src[cur + k]) * t;
          m++;
        }
      }
      if (m < 3) return;
      poly = dst;
      n = m;
    }
    for (let i = 1; i + 1 < n; i++) {
      this.rasterTri(poly, 0, i * STRIDE, (i + 1) * STRIDE, mat, flatNormal, camera, view);
    }
  }

  private rasterTri(
    p: Float32Array, o0: number, o1: number, o2: number, mat: THREE.Material, flatNormal: boolean,
    camera: THREE.Camera, view: THREE.Matrix4,
  ): void {
    const W = this.width, H = this.height;
    const iw0 = 1 / p[o0 + 3], iw1 = 1 / p[o1 + 3], iw2 = 1 / p[o2 + 3];
    const nx0 = p[o0] * iw0, ny0 = p[o0 + 1] * iw0, nz0 = p[o0 + 2] * iw0;
    const nx1 = p[o1] * iw1, ny1 = p[o1 + 1] * iw1, nz1 = p[o1 + 2] * iw1;
    const nx2 = p[o2] * iw2, ny2 = p[o2 + 1] * iw2, nz2 = p[o2 + 2] * iw2;
    // NDC 面积（y 向上）
    const area = (nx1 - nx0) * (ny2 - ny0) - (nx2 - nx0) * (ny1 - ny0);
    if (area === 0) return;
    const side = (mat as THREE.MeshBasicMaterial).side;
    const frontFacing = area > 0;
    if (side === THREE.FrontSide && !frontFacing) return;
    if (side === THREE.BackSide && frontFacing) return;

    const sx0 = (nx0 * 0.5 + 0.5) * W, sy0 = (1 - (ny0 * 0.5 + 0.5)) * H;
    const sx1 = (nx1 * 0.5 + 0.5) * W, sy1 = (1 - (ny1 * 0.5 + 0.5)) * H;
    const sx2 = (nx2 * 0.5 + 0.5) * W, sy2 = (1 - (ny2 * 0.5 + 0.5)) * H;
    let minX = Math.floor(Math.min(sx0, sx1, sx2));
    let maxX = Math.ceil(Math.max(sx0, sx1, sx2));
    let minY = Math.floor(Math.min(sy0, sy1, sy2));
    let maxY = Math.ceil(Math.max(sy0, sy1, sy2));
    if (minX < 0) minX = 0;
    if (minY < 0) minY = 0;
    if (maxX > W) maxX = W;
    if (maxY > H) maxY = H;
    if (minX >= maxX || minY >= maxY) return;
    this.stats.drawn++;

    const sarea = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
    if (sarea === 0) return;
    const invArea = 1 / sarea;

    const m = mat as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
    const isBasic = (m as unknown as { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial === true
      || (m as unknown as { isSpriteMaterial?: boolean }).isSpriteMaterial === true;
    const depthTest = m.depthTest !== false;
    const depthWrite = m.depthWrite !== false;
    const map = m.map ? getTexData(m.map) : null;
    const useVC = m.vertexColors === true || this.forceVC;
    const alphaTest = m.alphaTest || 0;
    const opacity = m.opacity ?? 1;
    const blending = m.blending;
    const additive = blending === THREE.AdditiveBlending;
    const transparent = m.transparent === true;
    const cr = m.color ? m.color.r : 1, cg = m.color ? m.color.g : 1, cb = m.color ? m.color.b : 1;
    const emissive = (m as THREE.MeshStandardMaterial).emissive;
    const emI = (m as THREE.MeshStandardMaterial).emissiveIntensity ?? 1;
    const er = emissive && !isBasic ? emissive.r * emI : 0;
    const eg = emissive && !isBasic ? emissive.g * emI : 0;
    const eb = emissive && !isBasic ? emissive.b * emI : 0;
    const metal = isBasic ? 0 : (m as THREE.MeshStandardMaterial).metalness ?? 0;
    const useFog = m.fog !== false && this.fogInfo !== null;
    const toneMapped = m.toneMapped !== false && this.toneMapping !== THREE.NoToneMapping;
    const lit = !isBasic;

    // 面法线（当几何没有法线时）
    let fnx = 0, fny = 0, fnz = 1;
    if (flatNormal) {
      const ax = p[o1 + 4] - p[o0 + 4], ay = p[o1 + 5] - p[o0 + 5], az = p[o1 + 6] - p[o0 + 6];
      const bx = p[o2 + 4] - p[o0 + 4], by = p[o2 + 5] - p[o0 + 5], bz = p[o2 + 6] - p[o0 + 6];
      fnx = ay * bz - az * by; fny = az * bx - ax * bz; fnz = ax * by - ay * bx;
      const l = Math.hypot(fnx, fnz, fny) || 1;
      fnx /= l; fny /= l; fnz /= l;
    }

    const camPos = camera.matrixWorld.elements;
    const cpx = camPos[12], cpy = camPos[13], cpz = camPos[14];
    void cpx; void cpy; void cpz;
    const vm = view.elements;

    const color = this.color;
    const depth = this.depth;
    const tmp = this.tmp;
    const tm = this.tm;
    const texOut = this.texOut;
    const exposure = this.toneMappingExposure;
    const fog = this.fogInfo;

    for (let y = minY; y < maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x < maxX; x++) {
        const px = x + 0.5;
        // 重心坐标
        const w0 = ((sx1 - px) * (sy2 - py) - (sx2 - px) * (sy1 - py)) * invArea;
        const w1 = ((sx2 - px) * (sy0 - py) - (sx0 - px) * (sy2 - py)) * invArea;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const z = w0 * nz0 + w1 * nz1 + w2 * nz2;
        if (z < -1 || z > 1) continue;
        const di = y * W + x;
        if (depthTest && z >= depth[di]) continue;

        // 透视校正权重
        const pw0 = w0 * iw0, pw1 = w1 * iw1, pw2 = w2 * iw2;
        const ps = 1 / (pw0 + pw1 + pw2);
        const b0 = pw0 * ps, b1 = pw1 * ps, b2 = pw2 * ps;

        let r = cr, g = cg, b = cb;
        let alpha = opacity;
        if (useVC) {
          r *= b0 * p[o0 + 10] + b1 * p[o1 + 10] + b2 * p[o2 + 10];
          g *= b0 * p[o0 + 11] + b1 * p[o1 + 11] + b2 * p[o2 + 11];
          b *= b0 * p[o0 + 12] + b1 * p[o1 + 12] + b2 * p[o2 + 12];
        }
        if (map) {
          const u = b0 * p[o0 + 13] + b1 * p[o1 + 13] + b2 * p[o2 + 13];
          const v = b0 * p[o0 + 14] + b1 * p[o1 + 14] + b2 * p[o2 + 14];
          sampleTex(map, u, v, texOut);
          r *= texOut[0]; g *= texOut[1]; b *= texOut[2];
          alpha *= texOut[3];
        }
        if (alphaTest > 0 && alpha < alphaTest) continue;
        if (!transparent && alphaTest === 0) alpha = 1;

        let lr: number, lg: number, lb: number;
        if (lit) {
          const wx = b0 * p[o0 + 4] + b1 * p[o1 + 4] + b2 * p[o2 + 4];
          const wy = b0 * p[o0 + 5] + b1 * p[o1 + 5] + b2 * p[o2 + 5];
          const wz = b0 * p[o0 + 6] + b1 * p[o1 + 6] + b2 * p[o2 + 6];
          let nx: number, ny: number, nz: number;
          if (flatNormal) { nx = fnx; ny = fny; nz = fnz; }
          else {
            nx = b0 * p[o0 + 7] + b1 * p[o1 + 7] + b2 * p[o2 + 7];
            ny = b0 * p[o0 + 8] + b1 * p[o1 + 8] + b2 * p[o2 + 8];
            nz = b0 * p[o0 + 9] + b1 * p[o1 + 9] + b2 * p[o2 + 9];
            const l = Math.hypot(nx, ny, nz) || 1;
            nx /= l; ny /= l; nz /= l;
          }
          if (side === THREE.DoubleSide && !frontFacing) { nx = -nx; ny = -ny; nz = -nz; }
          // 光照
          let accR = 0, accG = 0, accB = 0;
          const ls = this.lights;
          for (let li = 0; li < ls.length; li++) {
            const L = ls[li];
            switch (L.kind) {
              case 0:
                accR += L.r; accG += L.g; accB += L.b;
                break;
              case 1: {
                const wgt = 0.5 * (nx * L.dx + ny * L.dy + nz * L.dz) + 0.5;
                accR += L.gr + (L.r - L.gr) * wgt;
                accG += L.gg + (L.g - L.gg) * wgt;
                accB += L.gb + (L.b - L.gb) * wgt;
                break;
              }
              case 2: {
                const ndl = nx * L.dx + ny * L.dy + nz * L.dz;
                if (ndl > 0) { accR += L.r * ndl; accG += L.g * ndl; accB += L.b * ndl; }
                break;
              }
              case 3:
              case 4: {
                let dx = L.px - wx, dy = L.py - wy, dz = L.pz - wz;
                const d2 = dx * dx + dy * dy + dz * dz;
                const d = Math.sqrt(d2) || 1e-6;
                dx /= d; dy /= d; dz /= d;
                const ndl = nx * dx + ny * dy + nz * dz;
                if (ndl <= 0) break;
                let att = 1 / Math.max(Math.pow(d, L.decay), 0.01);
                if (L.dist > 0) {
                  const q = d / L.dist;
                  const f = Math.min(1, Math.max(0, 1 - q * q * q * q));
                  att *= f * f;
                }
                if (L.kind === 4) {
                  const ang = -(dx * L.dx + dy * L.dy + dz * L.dz);
                  const t = Math.min(1, Math.max(0, (ang - L.coneCos) / Math.max(L.penCos - L.coneCos, 1e-5)));
                  att *= t * t * (3 - 2 * t);
                }
                const k = ndl * att;
                accR += L.r * k; accG += L.g * k; accB += L.b * k;
                break;
              }
            }
          }
          const dm = (1 - metal) / PI;
          lr = r * dm * accR + er;
          lg = g * dm * accG + eg;
          lb = b * dm * accB + eb;
        } else {
          lr = r; lg = g; lb = b;
        }

        // 色调映射 + sRGB
        if (toneMapped) {
          acesInto(tm, lr, lg, lb, exposure);
          lr = tm[0]; lg = tm[1]; lb = tm[2];
        }
        lr = encodeSRGB(lr); lg = encodeSRGB(lg); lb = encodeSRGB(lb);

        // 雾（显示空间）
        if (useFog && fog) {
          const wz = b0 * p[o0 + 6] + b1 * p[o1 + 6] + b2 * p[o2 + 6];
          const wx = b0 * p[o0 + 4] + b1 * p[o1 + 4] + b2 * p[o2 + 4];
          const wy = b0 * p[o0 + 5] + b1 * p[o1 + 5] + b2 * p[o2 + 5];
          const vz = -(vm[2] * wx + vm[6] * wy + vm[10] * wz + vm[14]);
          let f: number;
          if (fog.kind === 1) {
            const t = Math.min(1, Math.max(0, (vz - fog.near) / (fog.far - fog.near)));
            f = t * t * (3 - 2 * t);
          } else {
            f = 1 - Math.exp(-fog.density * fog.density * vz * vz);
          }
          lr += (fog.r - lr) * f; lg += (fog.g - lg) * f; lb += (fog.b - lb) * f;
        }

        const ci = di * 3;
        if (additive) {
          const k = alpha;
          color[ci] = Math.min(1, color[ci] + lr * k);
          color[ci + 1] = Math.min(1, color[ci + 1] + lg * k);
          color[ci + 2] = Math.min(1, color[ci + 2] + lb * k);
        } else if (alpha >= 0.999) {
          color[ci] = lr; color[ci + 1] = lg; color[ci + 2] = lb;
        } else {
          color[ci] += (lr - color[ci]) * alpha;
          color[ci + 1] += (lg - color[ci + 1]) * alpha;
          color[ci + 2] += (lb - color[ci + 2]) * alpha;
        }
        if (depthWrite && depthTest) depth[di] = z;
        void tmp;
      }
    }
  }

  // =============== Points / Sprite ===============
  private drawPoints(pts: THREE.Points, _camera: THREE.Camera, vp: THREE.Matrix4, view: THREE.Matrix4): void {
    const geo = pts.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute | undefined;
    const mat = pts.material as THREE.PointsMaterial;
    const W = this.width, H = this.height;
    const mvp = new THREE.Matrix4().multiplyMatrices(vp, pts.matrixWorld);
    const q = mvp.elements;
    const size = Math.max(1, Math.round(mat.size * this.pointScale * (mat.sizeAttenuation ? 1 : 1)));
    const useVC = mat.vertexColors === true && !!col;
    const cs = col ? col.itemSize : 3;
    const toneMapped = mat.toneMapped !== false && this.toneMapping !== THREE.NoToneMapping;
    const tm = this.tm;
    void view;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const cx = q[0] * x + q[4] * y + q[8] * z + q[12];
      const cy = q[1] * x + q[5] * y + q[9] * z + q[13];
      const cz = q[2] * x + q[6] * y + q[10] * z + q[14];
      const cw = q[3] * x + q[7] * y + q[11] * z + q[15];
      if (cw <= 0 || cz < -cw || cz > cw) continue;
      const nx = cx / cw, ny = cy / cw, nz = cz / cw;
      if (nx < -1 || nx > 1 || ny < -1 || ny > 1) continue;
      const sx = Math.floor((nx * 0.5 + 0.5) * W);
      const sy = Math.floor((1 - (ny * 0.5 + 0.5)) * H);
      let r = mat.color.r, g = mat.color.g, b = mat.color.b;
      if (useVC) {
        r *= col!.array[i * cs]; g *= col!.array[i * cs + 1]; b *= col!.array[i * cs + 2];
      }
      if (toneMapped) { acesInto(tm, r, g, b, this.toneMappingExposure); r = tm[0]; g = tm[1]; b = tm[2]; }
      r = encodeSRGB(r); g = encodeSRGB(g); b = encodeSRGB(b);
      const half = Math.floor(size / 2);
      for (let dy = -half; dy < size - half; dy++) {
        for (let dx = -half; dx < size - half; dx++) {
          const xx = sx + dx, yy = sy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const di = yy * W + xx;
          if (mat.depthTest !== false && nz >= this.depth[di]) continue;
          const a = mat.opacity;
          this.color[di * 3] += (r - this.color[di * 3]) * a;
          this.color[di * 3 + 1] += (g - this.color[di * 3 + 1]) * a;
          this.color[di * 3 + 2] += (b - this.color[di * 3 + 2]) * a;
        }
      }
    }
  }

  private drawSprite(sp: THREE.Sprite, camera: THREE.Camera, view: THREE.Matrix4): void {
    const mat = sp.material as THREE.SpriteMaterial;
    const c = new THREE.Vector3().setFromMatrixPosition(sp.matrixWorld).applyMatrix4(view);
    const sc = new THREE.Vector3();
    sp.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
    const rot = mat.rotation || 0;
    const cosr = Math.cos(rot), sinr = Math.sin(rot);
    const proj = camera.projectionMatrix;
    const corners: [number, number][] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    const uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const verts = new Float32Array(4 * STRIDE);
    const v4 = new THREE.Vector4();
    for (let i = 0; i < 4; i++) {
      const [cx, cy] = corners[i];
      const rx = (cx * cosr - cy * sinr) * sc.x;
      const ry = (cx * sinr + cy * cosr) * sc.y;
      v4.set(c.x + rx, c.y + ry, c.z, 1).applyMatrix4(proj);
      const o = i * STRIDE;
      verts[o] = v4.x; verts[o + 1] = v4.y; verts[o + 2] = v4.z; verts[o + 3] = v4.w;
      verts[o + 10] = 1; verts[o + 11] = 1; verts[o + 12] = 1;
      verts[o + 13] = uv[i][0]; verts[o + 14] = uv[i][1];
    }
    const spriteMat = mat as unknown as THREE.Material;
    // Sprite 的 uv 原点在左下，遵循 flipY=false 的 DataTexture：v 向上
    this.drawTriangle(verts, 0, 1, 2, spriteMat, true, camera, view);
    this.drawTriangle(verts, 0, 2, 3, spriteMat, true, camera, view);
  }

  // =============== 输出 ===============
  toRGB8(): Uint8Array {
    const out = new Uint8Array(this.width * this.height * 3);
    for (let i = 0; i < out.length; i++) {
      const v = this.color[i];
      out[i] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
    }
    return out;
  }

  toPNG(): Uint8Array {
    return encodePNG(this.width, this.height, this.toRGB8(), 3);
  }
}

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
export function encodePNG(w: number, h: number, pixels: Uint8Array, channels: 3 | 4): Uint8Array {
  const stride = w * channels;
  const raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = channels === 3 ? 2 : 6;
  const idat = zlib.deflateSync(raw);
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(idat)), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** 把多张 RGB 帧拼成 cols 列的联系表 */
export function contactSheet(frames: Uint8Array[], w: number, h: number, cols: number, gap = 4): { data: Uint8Array; w: number; h: number } {
  const rows = Math.ceil(frames.length / cols);
  const W = cols * w + (cols + 1) * gap;
  const H = rows * h + (rows + 1) * gap;
  const out = new Uint8Array(W * H * 3).fill(24);
  frames.forEach((f, i) => {
    const cx = gap + (i % cols) * (w + gap);
    const cy = gap + Math.floor(i / cols) * (h + gap);
    for (let y = 0; y < h; y++) {
      out.set(f.subarray(y * w * 3, (y + 1) * w * 3), ((cy + y) * W + cx) * 3);
    }
  });
  return { data: out, w: W, h: H };
}
