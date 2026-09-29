// A small CPU rasteriser for THREE scenes. It exists only because the authoring
// sandbox has no browser or GPU: it lets the director *see* framing, staging and
// palette. It approximates MeshStandard/Basic materials (Lambert + emissive), vertex
// colours, canvas-texture sampling, fog and ACES-ish tone mapping. No shadows.
import * as THREE from "three";
import { deflateSync } from "node:zlib";

interface LightRec {
  kind: "amb" | "hemi" | "dir" | "point" | "spot";
  color: [number, number, number];
  ground?: [number, number, number];
  toLight?: THREE.Vector3;
  pos?: THREE.Vector3;
  distance?: number;
  decay?: number;
  spotDir?: THREE.Vector3;
  coneCos?: number;
  penumbraCos?: number;
}

export interface RasterResult {
  rgb: Uint8Array;
  width: number;
  height: number;
}

export interface RasterOptions {
  width: number;
  height: number;
  exposure?: number;
}

const FLOATS = 14; // view xyz, world xyz, normal xyz, rgb, uv

function srgbToLinear(v: number): number {
  return Math.pow(v, 2.2);
}

function toneMap(x: number): number {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  const y = (x * (a * x + b)) / (x * (c * x + d) + e);
  return y < 0 ? 0 : y > 1 ? 1 : y;
}

function collectLights(scene: THREE.Object3D): LightRec[] {
  const lights: LightRec[] = [];
  scene.traverseVisible((obj) => {
    if ((obj as THREE.Light).isLight) {
      const l = obj as THREE.Light;
      const c = l.color;
      const i = l.intensity;
      if (i <= 0) return;
      if ((obj as THREE.AmbientLight).isAmbientLight) {
        lights.push({ kind: "amb", color: [c.r * i, c.g * i, c.b * i] });
      } else if ((obj as THREE.HemisphereLight).isHemisphereLight) {
        const h = obj as THREE.HemisphereLight;
        lights.push({
          kind: "hemi",
          color: [c.r * i, c.g * i, c.b * i],
          ground: [h.groundColor.r * i, h.groundColor.g * i, h.groundColor.b * i],
        });
      } else if ((obj as THREE.DirectionalLight).isDirectionalLight) {
        const d = obj as THREE.DirectionalLight;
        const pos = new THREE.Vector3().setFromMatrixPosition(d.matrixWorld);
        const tgt = new THREE.Vector3().setFromMatrixPosition(d.target.matrixWorld);
        lights.push({ kind: "dir", color: [c.r * i, c.g * i, c.b * i], toLight: pos.sub(tgt).normalize() });
      } else if ((obj as THREE.SpotLight).isSpotLight) {
        const s = obj as THREE.SpotLight;
        const pos = new THREE.Vector3().setFromMatrixPosition(s.matrixWorld);
        const tgt = new THREE.Vector3().setFromMatrixPosition(s.target.matrixWorld);
        lights.push({
          kind: "spot",
          color: [c.r * i, c.g * i, c.b * i],
          pos,
          distance: s.distance,
          decay: s.decay,
          spotDir: tgt.sub(pos).normalize(),
          coneCos: Math.cos(s.angle),
          penumbraCos: Math.cos(s.angle * (1 - s.penumbra)),
        });
      } else if ((obj as THREE.PointLight).isPointLight) {
        const p = obj as THREE.PointLight;
        lights.push({
          kind: "point",
          color: [c.r * i, c.g * i, c.b * i],
          pos: new THREE.Vector3().setFromMatrixPosition(p.matrixWorld),
          distance: p.distance,
          decay: p.decay,
        });
      }
    }
  });
  return lights;
}

export function rasterize(scene: THREE.Scene, camera: THREE.PerspectiveCamera, options: RasterOptions): RasterResult {
  const W = options.width;
  const H = options.height;
  const exposure = options.exposure ?? 1;
  scene.updateMatrixWorld(true);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const viewMatrix = camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  const P00 = camera.projectionMatrix.elements[0]!;
  const P11 = camera.projectionMatrix.elements[5]!;
  const near = camera.near;

  const lights = collectLights(scene);
  const fog = scene.fog as (THREE.Fog | THREE.FogExp2 | null);
  const fogColour = fog ? [fog.color.r, fog.color.g, fog.color.b] : [0, 0, 0];

  const colour = new Float32Array(W * H * 3);
  const depth = new Float32Array(W * H); // stores 1/w, larger = nearer
  const bg = scene.background instanceof THREE.Color ? scene.background : new THREE.Color(0, 0, 0);
  for (let i = 0; i < W * H; i++) {
    colour[i * 3] = bg.r; colour[i * 3 + 1] = bg.g; colour[i * 3 + 2] = bg.b;
  }

  interface Job {
    order: number;
    transparent: boolean;
    run: () => void;
  }
  const jobs: Job[] = [];

  const tmpV = new THREE.Vector3();
  const tmpM = new THREE.Matrix4();
  const normalMat = new THREE.Matrix3();

  // ---- polygon clipping + triangle raster ---------------------------------
  const polyA = new Float32Array(FLOATS * 8);
  const polyB = new Float32Array(FLOATS * 8);

  function shadePixel(
    wx: number, wy: number, wz: number, nx: number, ny: number, nz: number,
    br: number, bg2: number, bb: number, viewDist: number,
    mat: MaterialInfo, out: number[],
  ): void {
    let r = br, g = bg2, b = bb;
    if (mat.lit) {
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      let ir = 0, ig = 0, ib = 0;
      for (const light of lights) {
        switch (light.kind) {
          case "amb":
            ir += light.color[0]; ig += light.color[1]; ib += light.color[2];
            break;
          case "hemi": {
            const k = 0.5 + 0.5 * ny;
            ir += light.ground![0] + (light.color[0] - light.ground![0]) * k;
            ig += light.ground![1] + (light.color[1] - light.ground![1]) * k;
            ib += light.ground![2] + (light.color[2] - light.ground![2]) * k;
            break;
          }
          case "dir": {
            const d = nx * light.toLight!.x + ny * light.toLight!.y + nz * light.toLight!.z;
            if (d > 0) { ir += light.color[0] * d; ig += light.color[1] * d; ib += light.color[2] * d; }
            break;
          }
          default: {
            const lx = light.pos!.x - wx, ly = light.pos!.y - wy, lz = light.pos!.z - wz;
            const dist = Math.hypot(lx, ly, lz) || 1e-4;
            const d = (nx * lx + ny * ly + nz * lz) / dist;
            if (d <= 0) break;
            let att = 1 / Math.max(Math.pow(dist, light.decay ?? 2), 0.01);
            if (light.distance && light.distance > 0) {
              const f = Math.min(1, Math.max(0, 1 - Math.pow(dist / light.distance, 4)));
              att *= f * f;
            }
            if (light.kind === "spot") {
              const cosT = (-lx * light.spotDir!.x - ly * light.spotDir!.y - lz * light.spotDir!.z) / dist;
              const t = Math.min(1, Math.max(0, (cosT - light.coneCos!) / Math.max(1e-4, light.penumbraCos! - light.coneCos!)));
              att *= t * t * (3 - 2 * t);
            }
            const k = d * att;
            ir += light.color[0] * k; ig += light.color[1] * k; ib += light.color[2] * k;
          }
        }
      }
      r = r * ir / Math.PI + mat.emissive[0];
      g = g * ig / Math.PI + mat.emissive[1];
      b = b * ib / Math.PI + mat.emissive[2];
    }
    if (fog) {
      let f: number;
      if ((fog as THREE.FogExp2).isFogExp2) {
        const dd = (fog as THREE.FogExp2).density * viewDist;
        f = 1 - Math.exp(-dd * dd);
      } else {
        const lf = fog as THREE.Fog;
        f = Math.min(1, Math.max(0, (viewDist - lf.near) / (lf.far - lf.near)));
      }
      r += (fogColour[0]! - r) * f; g += (fogColour[1]! - g) * f; b += (fogColour[2]! - b) * f;
    }
    out[0] = r; out[1] = g; out[2] = b;
  }

  const shaded: number[] = [0, 0, 0];

  function rasterTriangle(
    v0: Float32Array, o0: number, v1: Float32Array, o1: number, v2: Float32Array, o2: number,
    mat: MaterialInfo, flip: boolean,
  ): void {
    const w0 = -v0[o0 + 2]!, w1 = -v1[o1 + 2]!, w2 = -v2[o2 + 2]!;
    const iz0 = 1 / w0, iz1 = 1 / w1, iz2 = 1 / w2;
    const x0 = (v0[o0]! * P00 * iz0 * 0.5 + 0.5) * W, y0 = (1 - (v0[o0 + 1]! * P11 * iz0 * 0.5 + 0.5)) * H;
    const x1 = (v1[o1]! * P00 * iz1 * 0.5 + 0.5) * W, y1 = (1 - (v1[o1 + 1]! * P11 * iz1 * 0.5 + 0.5)) * H;
    const x2 = (v2[o2]! * P00 * iz2 * 0.5 + 0.5) * W, y2 = (1 - (v2[o2 + 1]! * P11 * iz2 * 0.5 + 0.5)) * H;
    let area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area === 0) return;
    let front = area < 0;
    if (flip) front = !front;
    if (mat.side === THREE.FrontSide && !front) return;
    if (mat.side === THREE.BackSide && front) return;
    const backFacing = !front;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) return;
    const inv = 1 / area;
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const sx = px + 0.5, sy = py + 0.5;
        let b0 = ((x1 - sx) * (y2 - sy) - (x2 - sx) * (y1 - sy)) * inv;
        let b1 = ((x2 - sx) * (y0 - sy) - (x0 - sx) * (y2 - sy)) * inv;
        let b2 = 1 - b0 - b1;
        if (b0 < 0 || b1 < 0 || b2 < 0) continue;
        const izp = b0 * iz0 + b1 * iz1 + b2 * iz2;
        const idx = py * W + px;
        if (mat.depthTest && izp <= depth[idx]!) continue;
        const p0 = b0 * iz0 / izp, p1 = b1 * iz1 / izp, p2 = b2 * iz2 / izp;
        let alpha = mat.opacity;
        let br = (v0[o0 + 9]! * p0 + v1[o1 + 9]! * p1 + v2[o2 + 9]! * p2) * mat.colour[0];
        let bgc = (v0[o0 + 10]! * p0 + v1[o1 + 10]! * p1 + v2[o2 + 10]! * p2) * mat.colour[1];
        let bb = (v0[o0 + 11]! * p0 + v1[o1 + 11]! * p1 + v2[o2 + 11]! * p2) * mat.colour[2];
        if (mat.tex) {
          const u = v0[o0 + 12]! * p0 + v1[o1 + 12]! * p1 + v2[o2 + 12]! * p2;
          const v = v0[o0 + 13]! * p0 + v1[o1 + 13]! * p1 + v2[o2 + 13]! * p2;
          const tx = Math.min(mat.tex.w - 1, Math.max(0, Math.floor(u * mat.tex.w)));
          const ty = Math.min(mat.tex.h - 1, Math.max(0, Math.floor((mat.tex.flipY ? 1 - v : v) * mat.tex.h)));
          const ti = (ty * mat.tex.w + tx) * 4;
          const ta = mat.tex.data[ti + 3]! / 255;
          if (mat.alphaTest > 0 && ta < mat.alphaTest) continue;
          alpha *= ta;
          const conv = mat.tex.srgb ? srgbToLinear : (x: number) => x;
          br *= conv(mat.tex.data[ti]! / 255);
          bgc *= conv(mat.tex.data[ti + 1]! / 255);
          bb *= conv(mat.tex.data[ti + 2]! / 255);
        }
        if (alpha <= 0.003) continue;
        let nx = v0[o0 + 6]! * p0 + v1[o1 + 6]! * p1 + v2[o2 + 6]! * p2;
        let ny = v0[o0 + 7]! * p0 + v1[o1 + 7]! * p1 + v2[o2 + 7]! * p2;
        let nz = v0[o0 + 8]! * p0 + v1[o1 + 8]! * p1 + v2[o2 + 8]! * p2;
        if (backFacing && mat.side !== THREE.FrontSide) { nx = -nx; ny = -ny; nz = -nz; }
        const wx = v0[o0 + 3]! * p0 + v1[o1 + 3]! * p1 + v2[o2 + 3]! * p2;
        const wy = v0[o0 + 4]! * p0 + v1[o1 + 4]! * p1 + v2[o2 + 4]! * p2;
        const wz = v0[o0 + 5]! * p0 + v1[o1 + 5]! * p1 + v2[o2 + 5]! * p2;
        shadePixel(wx, wy, wz, nx, ny, nz, br, bgc, bb, 1 / izp, mat, shaded);
        const ci = idx * 3;
        if (mat.additive) {
          colour[ci] = colour[ci]! + shaded[0]! * alpha;
          colour[ci + 1] = colour[ci + 1]! + shaded[1]! * alpha;
          colour[ci + 2] = colour[ci + 2]! + shaded[2]! * alpha;
        } else if (alpha < 0.999) {
          colour[ci] = colour[ci]! * (1 - alpha) + shaded[0]! * alpha;
          colour[ci + 1] = colour[ci + 1]! * (1 - alpha) + shaded[1]! * alpha;
          colour[ci + 2] = colour[ci + 2]! * (1 - alpha) + shaded[2]! * alpha;
        } else {
          colour[ci] = shaded[0]!; colour[ci + 1] = shaded[1]!; colour[ci + 2] = shaded[2]!;
        }
        if (mat.depthWrite && alpha >= 0.5) depth[idx] = izp;
      }
    }
  }

  function clipAndRaster(
    verts: Float32Array, i0: number, i1: number, i2: number, mat: MaterialInfo, flip: boolean,
  ): void {
    // Sutherland-Hodgman against the near plane in view space.
    let count = 3;
    polyA.set(verts.subarray(i0 * FLOATS, i0 * FLOATS + FLOATS), 0);
    polyA.set(verts.subarray(i1 * FLOATS, i1 * FLOATS + FLOATS), FLOATS);
    polyA.set(verts.subarray(i2 * FLOATS, i2 * FLOATS + FLOATS), FLOATS * 2);
    const a0 = -polyA[2]!, a1 = -polyA[FLOATS + 2]!, a2 = -polyA[FLOATS * 2 + 2]!;
    if (a0 < near && a1 < near && a2 < near) return;
    let src = polyA;
    if (a0 < near || a1 < near || a2 < near) {
      let n = 0;
      for (let i = 0; i < count; i++) {
        const cur = i * FLOATS;
        const nxt = ((i + 1) % count) * FLOATS;
        const cIn = -src[cur + 2]! >= near;
        const nIn = -src[nxt + 2]! >= near;
        if (cIn) { polyB.set(src.subarray(cur, cur + FLOATS), n * FLOATS); n++; }
        if (cIn !== nIn) {
          const t = (-src[cur + 2]! - near) / (-src[cur + 2]! - -src[nxt + 2]!);
          for (let k = 0; k < FLOATS; k++) polyB[n * FLOATS + k] = src[cur + k]! + (src[nxt + k]! - src[cur + k]!) * t;
          n++;
        }
      }
      count = n;
      src = polyB;
      if (count < 3) return;
    }
    for (let i = 1; i < count - 1; i++) rasterTriangle(src, 0, src, i * FLOATS, src, (i + 1) * FLOATS, mat, flip);
  }

  // ---- materials -----------------------------------------------------------
  interface MaterialInfo {
    lit: boolean;
    colour: [number, number, number];
    emissive: [number, number, number];
    opacity: number;
    alphaTest: number;
    side: THREE.Side;
    additive: boolean;
    depthTest: boolean;
    depthWrite: boolean;
    tex: { data: Uint8ClampedArray; w: number; h: number; flipY: boolean; srgb: boolean } | null;
    vertexColors: boolean;
  }

  function materialInfo(m: THREE.Material): MaterialInfo | null {
    if (!m.visible) return null;
    const any = m as THREE.MeshStandardMaterial;
    const isBasic = (m as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    const c = any.color ?? new THREE.Color(1, 1, 1);
    const em = any.emissive ?? new THREE.Color(0, 0, 0);
    const ei = any.emissiveIntensity ?? 1;
    let tex: MaterialInfo["tex"] = null;
    const map = any.map as THREE.Texture | null | undefined;
    if (map && map.image && (map.image as { __pixels?: Uint8ClampedArray }).__pixels) {
      const img = map.image as unknown as { __pixels: Uint8ClampedArray; width: number; height: number };
      tex = { data: img.__pixels, w: img.width, h: img.height, flipY: map.flipY, srgb: map.colorSpace === THREE.SRGBColorSpace };
    }
    return {
      lit: !isBasic && !(m as THREE.PointsMaterial).isPointsMaterial,
      colour: [c.r, c.g, c.b],
      emissive: [em.r * ei, em.g * ei, em.b * ei],
      opacity: m.transparent ? m.opacity : 1,
      alphaTest: m.alphaTest,
      side: m.side,
      additive: m.blending === THREE.AdditiveBlending,
      depthTest: m.depthTest,
      depthWrite: m.depthWrite,
      tex,
      vertexColors: Boolean(any.vertexColors),
    };
  }

  function isVisible(obj: THREE.Object3D): boolean {
    for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  let order = 0;
  scene.traverse((obj) => {
    if (!isVisible(obj)) return;
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh || (obj as THREE.InstancedMesh).isInstancedMesh) {
      const geometry = mesh.geometry as THREE.BufferGeometry;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const pos = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (!pos) return;
      const index = geometry.getIndex();
      const nor = geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
      const uv = geometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
      const col = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
      const instanced = obj as THREE.InstancedMesh;
      const instCount = instanced.isInstancedMesh ? instanced.count : 1;
      const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
      for (const group of groups) {
        const matIndex = Array.isArray(mesh.material) ? (group.materialIndex ?? 0) : 0;
        const mat = materialInfo(materials[matIndex]!);
        if (!mat) continue;
        const useVC = mat.vertexColors && !!col;
        const job: Job = {
          order: order++,
          transparent: (materials[matIndex]! as THREE.Material).transparent,
          run: () => {
            const verts = new Float32Array(pos.count * FLOATS);
            const cm = new THREE.Color();
            for (let inst = 0; inst < instCount; inst++) {
              const world = tmpM.copy(mesh.matrixWorld);
              if (instanced.isInstancedMesh) {
                const im = new THREE.Matrix4().fromArray(instanced.instanceMatrix.array as unknown as number[], inst * 16);
                world.multiply(im);
              }
              const toView = new THREE.Matrix4().multiplyMatrices(viewMatrix, world);
              normalMat.getNormalMatrix(world);
              const flip = world.determinant() < 0;
              let ic: THREE.Color | null = null;
              if (instanced.isInstancedMesh && instanced.instanceColor) {
                ic = cm.fromArray(instanced.instanceColor.array as unknown as number[], inst * 3);
              }
              for (let i = 0; i < pos.count; i++) {
                const o = i * FLOATS;
                tmpV.fromBufferAttribute(pos, i);
                const wv = tmpV.clone().applyMatrix4(world);
                const vv = tmpV.clone().applyMatrix4(toView);
                verts[o] = vv.x; verts[o + 1] = vv.y; verts[o + 2] = vv.z;
                verts[o + 3] = wv.x; verts[o + 4] = wv.y; verts[o + 5] = wv.z;
                if (nor) {
                  tmpV.fromBufferAttribute(nor, i).applyMatrix3(normalMat);
                  verts[o + 6] = tmpV.x; verts[o + 7] = tmpV.y; verts[o + 8] = tmpV.z;
                }
                let r = 1, g = 1, b = 1;
                if (useVC) { r = col!.getX(i); g = col!.getY(i); b = col!.getZ(i); }
                if (ic) { r *= ic.r; g *= ic.g; b *= ic.b; }
                verts[o + 9] = r; verts[o + 10] = g; verts[o + 11] = b;
                if (uv) { verts[o + 12] = uv.getX(i); verts[o + 13] = uv.getY(i); }
              }
              const triCount = Math.floor(group.count / 3);
              for (let t = 0; t < triCount; t++) {
                const k = group.start + t * 3;
                const a = index ? index.getX(k) : k;
                const b = index ? index.getX(k + 1) : k + 1;
                const c = index ? index.getX(k + 2) : k + 2;
                if (!nor) {
                  // flat normal from world positions
                  const pa = new THREE.Vector3(verts[a * FLOATS + 3], verts[a * FLOATS + 4], verts[a * FLOATS + 5]);
                  const pb = new THREE.Vector3(verts[b * FLOATS + 3], verts[b * FLOATS + 4], verts[b * FLOATS + 5]);
                  const pc = new THREE.Vector3(verts[c * FLOATS + 3], verts[c * FLOATS + 4], verts[c * FLOATS + 5]);
                  const n = pb.sub(pa).cross(pc.sub(pa)).normalize();
                  for (const v of [a, b, c]) { verts[v * FLOATS + 6] = n.x; verts[v * FLOATS + 7] = n.y; verts[v * FLOATS + 8] = n.z; }
                }
                clipAndRaster(verts, a, b, c, mat, flip);
              }
            }
          },
        };
        jobs.push(job);
      }
    } else if ((obj as THREE.Points).isPoints) {
      const pts = obj as THREE.Points;
      const geometry = pts.geometry as THREE.BufferGeometry;
      const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
      const col = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
      const m = pts.material as THREE.PointsMaterial;
      jobs.push({
        order: order++,
        transparent: false,
        run: () => {
          const world = pts.matrixWorld;
          const size = Math.max(1, Math.round(m.size));
          for (let i = 0; i < pos.count; i++) {
            const v = tmpV.fromBufferAttribute(pos, i).applyMatrix4(world).applyMatrix4(viewMatrix);
            const w = -v.z;
            if (w < near) continue;
            const sx = Math.floor((v.x * P00 / w * 0.5 + 0.5) * W);
            const sy = Math.floor((1 - (v.y * P11 / w * 0.5 + 0.5)) * H);
            const iz = 1 / w;
            let r = m.color.r, g = m.color.g, b = m.color.b;
            if (m.vertexColors && col) { r *= col.getX(i); g *= col.getY(i); b *= col.getZ(i); }
            for (let dy = 0; dy < size; dy++) {
              for (let dx = 0; dx < size; dx++) {
                const x = sx + dx, y = sy + dy;
                if (x < 0 || y < 0 || x >= W || y >= H) continue;
                const idx = y * W + x;
                if (iz <= depth[idx]!) continue;
                colour[idx * 3] = r; colour[idx * 3 + 1] = g; colour[idx * 3 + 2] = b;
              }
            }
          }
        },
      });
    }
  });

  jobs.sort((a, b) => Number(a.transparent) - Number(b.transparent) || a.order - b.order);
  for (const job of jobs) job.run();

  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H * 3; i++) {
    const lin = toneMap(colour[i]! * exposure);
    rgb[i] = Math.round(Math.pow(lin, 1 / 2.2) * 255);
  }
  return { rgb, width: W, height: H };
}

// ---- PNG output --------------------------------------------------------------
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePNG(rgb: Uint8Array, width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}
