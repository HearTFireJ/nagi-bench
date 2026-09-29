import * as THREE from "three";
import { deflateSync } from "node:zlib";
import { FakeCanvas } from "./shim";

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

export function encodePNG(w: number, h: number, rgb: Uint8Array): Uint8Array {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  }
  const z = deflateSync(raw);
  const chunks: Uint8Array[] = [];
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    chunks.push(out);
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 2;
  chunk("IHDR", ihdr);
  chunk("IDAT", z);
  chunk("IEND", new Uint8Array(0));
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const total = sig.length + chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  out.set(sig, 0);
  let o = sig.length;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

const fit = (v: number) => {
  const a = v * (v + 0.0245786) - 0.000090537;
  const b = v * (0.983729 * v + 0.432951) + 0.238081;
  return a / b;
};
function aces(r: number, g: number, b: number): [number, number, number] {
  r /= 0.6; g /= 0.6; b /= 0.6;
  let R = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  let G = 0.076 * r + 0.90834 * g + 0.01566 * b;
  let B = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  R = fit(R); G = fit(G); B = fit(B);
  return [1.60475 * R - 0.53108 * G - 0.07367 * B, -0.10208 * R + 1.10813 * G - 0.00605 * B, -0.00327 * R - 0.07276 * G + 1.07602 * B];
}
const srgbToLin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const linToSrgb = (v: number) => {
  v = Math.min(1, Math.max(0, v));
  return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
};

interface Vtx {
  x: number; y: number; z: number; w: number; // clip
  wx: number; wy: number; wz: number; // world
  nx: number; ny: number; nz: number;
  r: number; g: number; b: number; u: number; v: number;
}

export function render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, W: number, H: number): Uint8Array {
  scene.updateMatrixWorld(true);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const view = camera.matrixWorldInverse;
  const proj = camera.projectionMatrix;
  const vp = new THREE.Matrix4().multiplyMatrices(proj, view);

  const color = new Float32Array(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);
  const bg = scene.background instanceof THREE.Color ? scene.background : new THREE.Color(0);
  for (let i = 0; i < W * H; i++) {
    color[i * 3] = bg.r;
    color[i * 3 + 1] = bg.g;
    color[i * 3 + 2] = bg.b;
  }

  // lights
  const dirs: Array<{ d: THREE.Vector3; c: THREE.Color; i: number }> = [];
  const pts: Array<{ p: THREE.Vector3; c: THREE.Color; i: number; dist: number; spot?: { dir: THREE.Vector3; cos: number } }> = [];
  let hemi: THREE.HemisphereLight | null = null;
  scene.traverse((o) => {
    if (!o.visible) return;
    if (o instanceof THREE.HemisphereLight) hemi = o;
    else if (o instanceof THREE.DirectionalLight && o.intensity > 0) {
      const t = new THREE.Vector3();
      o.target.getWorldPosition(t);
      const p = new THREE.Vector3();
      o.getWorldPosition(p);
      dirs.push({ d: p.sub(t).normalize(), c: o.color, i: o.intensity });
    } else if (o instanceof THREE.SpotLight && o.intensity > 0) {
      const t = new THREE.Vector3();
      o.target.getWorldPosition(t);
      const p = new THREE.Vector3();
      o.getWorldPosition(p);
      pts.push({ p, c: o.color, i: o.intensity, dist: o.distance, spot: { dir: t.sub(p).normalize(), cos: Math.cos(o.angle) } });
    } else if (o instanceof THREE.PointLight && o.intensity > 0) {
      const p = new THREE.Vector3();
      o.getWorldPosition(p);
      pts.push({ p, c: o.color, i: o.intensity, dist: o.distance });
    }
  });
  const fog = scene.fog as THREE.Fog | null;
  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  const exposure = 1;

  const lightAt = (wx: number, wy: number, wz: number, nx: number, ny: number, nz: number, out: number[]) => {
    let r = 0, g = 0, b = 0;
    const h = hemi as THREE.HemisphereLight | null;
    if (h) {
      const k = ny * 0.5 + 0.5;
      r += ((h.groundColor.r * (1 - k) + h.color.r * k) * h.intensity) / Math.PI;
      g += ((h.groundColor.g * (1 - k) + h.color.g * k) * h.intensity) / Math.PI;
      b += ((h.groundColor.b * (1 - k) + h.color.b * k) * h.intensity) / Math.PI;
    }
    for (const L of dirs) {
      const d = (Math.max(0, nx * L.d.x + ny * L.d.y + nz * L.d.z) * L.i) / Math.PI;
      r += L.c.r * d;
      g += L.c.g * d;
      b += L.c.b * d;
    }
    for (const L of pts) {
      const dx = L.p.x - wx, dy = L.p.y - wy, dz = L.p.z - wz;
      const dd = Math.hypot(dx, dy, dz) + 1e-4;
      let d = Math.max(0, (nx * dx + ny * dy + nz * dz) / dd);
      if (L.spot) {
        const c = (-dx * L.spot.dir.x - dy * L.spot.dir.y - dz * L.spot.dir.z) / dd;
        if (c < L.spot.cos) d = 0;
        else d *= Math.min(1, (c - L.spot.cos) / 0.08);
      }
      const win = L.dist > 0 ? Math.pow(Math.max(0, Math.min(1, 1 - Math.pow(dd / L.dist, 4))), 2) : 1;
      d *= (L.i * win) / Math.max(0.01, dd * dd) / Math.PI;
      r += L.c.r * d;
      g += L.c.g * d;
      b += L.c.b * d;
    }
    out[0] = r; out[1] = g; out[2] = b;
  };

  const tmpLight = [0, 0, 0];
  const normalMat = new THREE.Matrix3();

  function drawTri(a: Vtx, b: Vtx, c: Vtx, mat: THREE.Material, mode: "lit" | "basic", tex: FakeCanvas | null, alphaTest: boolean, opacity: number, additive: boolean, flatN: THREE.Vector3 | null) {
    // near clip in clip space (w > near)
    const nearW = 0.05;
    let poly: Vtx[] = [a, b, c];
    const out: Vtx[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const pin = p.w > nearW;
      const qin = q.w > nearW;
      if (pin) out.push(p);
      if (pin !== qin) {
        const t = (nearW - p.w) / (q.w - p.w);
        const l = (x: number, y: number) => x + (y - x) * t;
        out.push({
          x: l(p.x, q.x), y: l(p.y, q.y), z: l(p.z, q.z), w: nearW,
          wx: l(p.wx, q.wx), wy: l(p.wy, q.wy), wz: l(p.wz, q.wz),
          nx: l(p.nx, q.nx), ny: l(p.ny, q.ny), nz: l(p.nz, q.nz),
          r: l(p.r, q.r), g: l(p.g, q.g), b: l(p.b, q.b), u: l(p.u, q.u), v: l(p.v, q.v),
        });
      }
    }
    if (out.length < 3) return;
    for (let k = 1; k + 1 < out.length; k++) raster(out[0]!, out[k]!, out[k + 1]!);

    function raster(p0: Vtx, p1: Vtx, p2: Vtx) {
      const sx = (p: Vtx) => (p.x / p.w * 0.5 + 0.5) * W;
      const sy = (p: Vtx) => (1 - (p.y / p.w * 0.5 + 0.5)) * H;
      const x0 = sx(p0), y0 = sy(p0), x1 = sx(p1), y1 = sy(p1), x2 = sx(p2), y2 = sy(p2);
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-6) return;
      const side = (mat as any).side as number;
      if (side === THREE.FrontSide && area > 0) return; // screen y is flipped: front faces have negative area
      if (side === THREE.BackSide && area < 0) return;
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
      const iw0 = 1 / p0.w, iw1 = 1 / p1.w, iw2 = 1 / p2.w;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5, py = y + 0.5;
          let l0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
          let l1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
          let l2 = 1 - l0 - l1;
          if (l0 < 0 || l1 < 0 || l2 < 0) continue;
          const iw = l0 * iw0 + l1 * iw1 + l2 * iw2;
          const z = 1 / iw;
          const idx = y * W + x;
          if (z >= depth[idx]!) continue;
          const b0 = (l0 * iw0) / iw, b1 = (l1 * iw1) / iw, b2 = (l2 * iw2) / iw;
          let r = p0.r * b0 + p1.r * b1 + p2.r * b2;
          let g = p0.g * b0 + p1.g * b1 + p2.g * b2;
          let bl = p0.b * b0 + p1.b * b1 + p2.b * b2;
          let alpha = opacity;
          if (tex) {
            const u = p0.u * b0 + p1.u * b1 + p2.u * b2;
            const v = p0.v * b0 + p1.v * b1 + p2.v * b2;
            const tx = Math.min(tex.width - 1, Math.max(0, Math.floor(u * tex.width)));
            const ty = Math.min(tex.height - 1, Math.max(0, Math.floor(v * tex.height)));
            const k = (ty * tex.width + tx) * 4;
            const ta = tex.data[k + 3]! / 255;
            if (alphaTest && ta < 0.5) continue;
            r *= srgbToLin(tex.data[k]!);
            g *= srgbToLin(tex.data[k + 1]!);
            bl *= srgbToLin(tex.data[k + 2]!);
            if (!alphaTest) alpha *= ta;
          }
          if (mode === "lit") {
            const wx = p0.wx * b0 + p1.wx * b1 + p2.wx * b2;
            const wy = p0.wy * b0 + p1.wy * b1 + p2.wy * b2;
            const wz = p0.wz * b0 + p1.wz * b1 + p2.wz * b2;
            let nx = p0.nx * b0 + p1.nx * b1 + p2.nx * b2;
            let ny = p0.ny * b0 + p1.ny * b1 + p2.ny * b2;
            let nz = p0.nz * b0 + p1.nz * b1 + p2.nz * b2;
            const nl = Math.hypot(nx, ny, nz) || 1;
            nx /= nl; ny /= nl; nz /= nl;
            if (side === THREE.DoubleSide || side === THREE.BackSide) {
              const vx = camPos.x - wx, vy = camPos.y - wy, vz = camPos.z - wz;
              if (nx * vx + ny * vy + nz * vz < 0) { nx = -nx; ny = -ny; nz = -nz; }
            }
            lightAt(wx, wy, wz, nx, ny, nz, tmpLight);
            const em = (mat as THREE.MeshStandardMaterial).emissive;
            r = r * tmpLight[0]! * exposure + (em ? em.r * ((mat as any).emissiveIntensity ?? 1) : 0);
            g = g * tmpLight[1]! * exposure + (em ? em.g * ((mat as any).emissiveIntensity ?? 1) : 0);
            bl = bl * tmpLight[2]! * exposure + (em ? em.b * ((mat as any).emissiveIntensity ?? 1) : 0);
          }
          if (fog && mode !== "basic-nofog") {
            const dist = z;
            const f = Math.min(1, Math.max(0, (dist - fog.near) / (fog.far - fog.near)));
            r += (fog.color.r - r) * f; g += (fog.color.g - g) * f; bl += (fog.color.b - bl) * f;
          }
          const o = idx * 3;
          if (additive) {
            color[o] = color[o]! + r * alpha; color[o + 1] = color[o + 1]! + g * alpha; color[o + 2] = color[o + 2]! + bl * alpha;
          } else if (alpha < 0.999) {
            color[o] = color[o]! * (1 - alpha) + r * alpha; color[o + 1] = color[o + 1]! * (1 - alpha) + g * alpha; color[o + 2] = color[o + 2]! * (1 - alpha) + bl * alpha;
            continue; // transparent: no depth write
          } else {
            color[o] = r; color[o + 1] = g; color[o + 2] = bl;
          }
          if (!additive) depth[idx] = z;
        }
      }
    }
  }

  const transparents: Array<() => void> = [];
  const v3 = new THREE.Vector3();

  scene.traverse((obj) => {
    if (!obj.visible) return;
    let p: THREE.Object3D | null = obj;
    while (p) { if (!p.visible) return; p = p.parent; }
    if (obj instanceof THREE.Sprite) {
      const mat = obj.material as THREE.SpriteMaterial;
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      const cv = wp.clone().applyMatrix4(vp.clone());
      const vv = new THREE.Vector4(wp.x, wp.y, wp.z, 1).applyMatrix4(vp);
      if (vv.w < 0.1) return;
      const sc = new THREE.Vector3();
      obj.getWorldScale(sc);
      const size = (sc.x * proj.elements[5]!) / vv.w * H * 0.5;
      const cx = (vv.x / vv.w * 0.5 + 0.5) * W;
      const cy = (1 - (vv.y / vv.w * 0.5 + 0.5)) * H;
      const tex = (mat.map?.image as FakeCanvas | undefined) ?? null;
      const add = mat.blending === THREE.AdditiveBlending;
      const dist = vv.w;
      transparents.push(() => {
        const x0 = Math.max(0, Math.floor(cx - size / 2)), x1 = Math.min(W - 1, Math.ceil(cx + size / 2));
        const y0 = Math.max(0, Math.floor(cy - size / 2)), y1 = Math.min(H - 1, Math.ceil(cy + size / 2));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const idx = y * W + x;
          if (dist >= depth[idx]!) continue;
          const u = (x + 0.5 - (cx - size / 2)) / size;
          const v = (y + 0.5 - (cy - size / 2)) / size;
          let a = mat.opacity;
          let r = mat.color.r, g = mat.color.g, b = mat.color.b;
          if (tex) {
            const tx = Math.min(tex.width - 1, Math.floor(u * tex.width)), ty = Math.min(tex.height - 1, Math.floor(v * tex.height));
            const k = (ty * tex.width + tx) * 4;
            a *= tex.data[k + 3]! / 255;
            r *= srgbToLin(tex.data[k]!); g *= srgbToLin(tex.data[k + 1]!); b *= srgbToLin(tex.data[k + 2]!);
          }
          const o = idx * 3;
          if (add) { color[o] = color[o]! + r * a; color[o + 1] = color[o + 1]! + g * a; color[o + 2] = color[o + 2]! + b * a; }
          else { color[o] = color[o]! * (1 - a) + r * a; color[o + 1] = color[o + 1]! * (1 - a) + g * a; color[o + 2] = color[o + 2]! * (1 - a) + b * a; }
        }
      });
      void cv;
      return;
    }
    if (!(obj instanceof THREE.Mesh)) return;
    const mesh = obj as THREE.Mesh;
    const geom = mesh.geometry as THREE.BufferGeometry;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const mat = mats[0] as THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null; vertexColors?: boolean; alphaTest?: number; opacity: number; transparent: boolean };
    if (!mat) return;
    const posA = geom.attributes.position as THREE.BufferAttribute;
    if (!posA) return;
    const norA = geom.attributes.normal as THREE.BufferAttribute | undefined;
    const uvA = geom.attributes.uv as THREE.BufferAttribute | undefined;
    const colA = geom.attributes.color as THREE.BufferAttribute | undefined;
    const index = geom.index;
    const basic = mat instanceof THREE.MeshBasicMaterial || (mat as any).userData?.rim === true;
    const tex = mat.map && (mat.map.image as unknown) instanceof FakeCanvas ? (mat.map.image as FakeCanvas) : null;
    const instanced = mesh instanceof THREE.InstancedMesh ? mesh : null;
    const count = instanced ? instanced.count : 1;
    const baseColor = mat.color ?? new THREE.Color(1, 1, 1);
    const useVC = !!mat.vertexColors && !!colA;
    const additive = mat.blending === THREE.AdditiveBlending;
    const isTransparent = mat.transparent && (mat.opacity < 0.999 || additive || (mat.map != null && mat.alphaTest === 0));
    const triCount = index ? index.count / 3 : posA.count / 3;
    let drawCount = triCount;
    if (geom.drawRange && geom.drawRange.count !== Infinity) drawCount = Math.min(triCount, geom.drawRange.count / 3);
    const inst = new THREE.Matrix4();
    const instCol = new THREE.Color();
    const work = () => {
      for (let ii = 0; ii < count; ii++) {
        const world = mesh.matrixWorld.clone();
        if (instanced) {
          instanced.getMatrixAt(ii, inst);
          world.multiply(inst);
        }
        const mvp = new THREE.Matrix4().multiplyMatrices(vp, world);
        normalMat.getNormalMatrix(world);
        let ic: THREE.Color | null = null;
        if (instanced && instanced.instanceColor) {
          instanced.getColorAt(ii, instCol);
          ic = instCol;
        }
        const cache = new Map<number, Vtx>();
        const getV = (i: number): Vtx => {
          const hit = cache.get(i);
          if (hit) return hit;
          v3.fromBufferAttribute(posA, i);
          const wv = v3.clone().applyMatrix4(world);
          const c4 = new THREE.Vector4(v3.x, v3.y, v3.z, 1).applyMatrix4(mvp);
          const n = norA ? new THREE.Vector3().fromBufferAttribute(norA, i).applyMatrix3(normalMat) : new THREE.Vector3(0, 1, 0);
          let r = baseColor.r, g = baseColor.g, b = baseColor.b;
          if (useVC) { r *= colA!.getX(i); g *= colA!.getY(i); b *= colA!.getZ(i); }
          if (ic) { r *= ic.r; g *= ic.g; b *= ic.b; }
          if ((mat as any).userData?.rim) {
            const cn = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
            const nn = wv.clone().sub(cn).normalize();
            const vv = camPos.clone().sub(wv).normalize();
            let rr = Math.pow(1 - Math.max(0, Math.min(1, nn.dot(vv))), 4.6);
            rr = Math.floor(rr * 5 + 0.5) / 5;
            r = 0.34 * rr * 1.1; g = 0.62 * rr * 1.1; b = 1.0 * rr * 1.1;
          }
          const vt: Vtx = { x: c4.x, y: c4.y, z: c4.z, w: c4.w, wx: wv.x, wy: wv.y, wz: wv.z, nx: n.x, ny: n.y, nz: n.z, r, g, b, u: uvA ? uvA.getX(i) : 0, v: uvA ? uvA.getY(i) : 0 };
          cache.set(i, vt);
          return vt;
        };
        for (let t = 0; t < drawCount; t++) {
          const i0 = index ? index.getX(t * 3) : t * 3;
          const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
          const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
          const A = getV(i0), B = getV(i1), C = getV(i2);
          // trivial reject
          if (A.w < 0 && B.w < 0 && C.w < 0) continue;
          if (A.x > A.w && B.x > B.w && C.x > C.w) continue;
          if (A.x < -A.w && B.x < -B.w && C.x < -C.w) continue;
          if (A.y > A.w && B.y > B.w && C.y > C.w) continue;
          if (A.y < -A.w && B.y < -B.w && C.y < -C.w) continue;
          drawTri(A, B, C, mat, basic ? "basic" : "lit", tex, (mat.alphaTest ?? 0) > 0, mat.transparent ? mat.opacity : 1, additive, null);
        }
      }
    };
    if (isTransparent) transparents.push(work);
    else work();
  });
  for (const fn of transparents) fn();

  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const [r, g, b] = aces(color[i * 3]!, color[i * 3 + 1]!, color[i * 3 + 2]!);
    rgb[i * 3] = linToSrgb(r);
    rgb[i * 3 + 1] = linToSrgb(g);
    rgb[i * 3 + 2] = linToSrgb(b);
  }
  return rgb;
}
