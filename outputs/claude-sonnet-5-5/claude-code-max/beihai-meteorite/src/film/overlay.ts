// 屏内叠层：全部用 MeshBasicMaterial + DataTexture 在同一块 WebGL 画布里合成，
// 不使用自定义着色器，避免无法在真实浏览器前验证的着色器风险。
import * as THREE from "three";
import { smooth, hash2 } from "../util/math";
import { textTexture, FONT_W, FONT_H } from "../util/pixelfont";
import type { FilmRenderer, OverlayState } from "./types";

function dataTex(
  data: Uint8Array, w: number, h: number, opts: { linear?: boolean; repeat?: boolean; nearest?: boolean } = {},
): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = opts.nearest ? THREE.NearestFilter : THREE.LinearFilter;
  tex.minFilter = opts.nearest ? THREE.NearestFilter : THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.needsUpdate = true;
  return tex;
}

function makeVignette(size = 128): THREE.DataTexture {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size * 2 - 1;
      const ny = (y + 0.5) / size * 2 - 1;
      const r = Math.hypot(nx, ny); // 0 .. 1.414
      const a = smooth((r - 0.55) / 0.95);
      const i = (y * size + x) * 4;
      d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = Math.round(a * 255);
    }
  }
  return dataTex(d, size, size);
}

function makeGrain(size = 128): THREE.DataTexture {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.round(hash2(x * 7 + 3, y * 13 + 5) * 255);
      const a = Math.round(hash2(x * 31 + 11, y * 17 + 7) * 255);
      const i = (y * size + x) * 4;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = a;
    }
  }
  return dataTex(d, size, size, { linear: true, repeat: true, nearest: true });
}

/** 瞄准镜遮罩：圆内透明，圆外黑，圆内边缘有轻微镜筒暗角 */
function makeScopeMask(size = 512): THREE.DataTexture {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size * 2 - 1;
      const ny = (y + 0.5) / size * 2 - 1;
      const r = Math.hypot(nx, ny); // 圆边缘 r = 1
      let a: number;
      if (r > 1) a = 1;
      else if (r > 0.992) a = smooth((r - 0.992) / 0.008);
      else a = 0.35 * smooth((r - 0.62) / 0.36);
      const i = (y * size + x) * 4;
      d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = Math.round(a * 255);
    }
  }
  return dataTex(d, size, size);
}

/** 十字线：黑色描边 + 红色内芯，任何背景都可读；粗外段 + 细内段 + 密位点 */
function makeReticle(size = 512): THREE.DataTexture {
  const d = new Uint8Array(size * size * 4);
  const c = size / 2;
  const put = (x: number, y: number, rgb: [number, number, number], a: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = ((size - 1 - y) * size + x) * 4; // DataTexture 底部为第 0 行
    d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = a;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number], a = 255) => {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) put(x, y, rgb, a);
  };
  const BLACK: [number, number, number] = [10, 8, 8];
  const RED: [number, number, number] = [255, 70, 50];
  const gap = 26;
  const post = 110;
  const edge = size * 0.485;
  // 外侧粗段（黑）
  rect(c + post, c - 3, edge, c + 3, BLACK);
  rect(c - edge, c - 3, c - post, c + 3, BLACK);
  rect(c - 3, c + post, c + 3, edge, BLACK);
  rect(c - 3, c - edge, c + 3, c - post, BLACK);
  // 内侧细段（黑描边 + 红芯）
  rect(c + gap, c - 2, c + post, c + 2, BLACK);
  rect(c - post, c - 2, c - gap, c + 2, BLACK);
  rect(c - 2, c + gap, c + 2, c + post, BLACK);
  rect(c - 2, c - post, c + 2, c - gap, BLACK);
  rect(c + gap, c - 1, c + post, c + 1, RED);
  rect(c - post, c - 1, c - gap, c + 1, RED);
  rect(c - 1, c + gap, c + 1, c + post, RED);
  rect(c - 1, c - post, c + 1, c - gap, RED);
  // 密位点
  for (let k = 1; k <= 6; k++) {
    const o = gap + k * 26;
    if (o > post - 10 && o < post + 6) continue;
    for (const [dx, dy] of [[o, 0], [-o, 0], [0, o], [0, -o]] as const) {
      rect(c + dx - 3, c + dy - 3, c + dx + 3, c + dy + 3, BLACK);
      rect(c + dx - 1, c + dy - 1, c + dx + 1, c + dy + 1, RED);
    }
  }
  // 中心点
  rect(c - 2, c - 2, c + 2, c + 2, BLACK);
  rect(c - 1, c - 1, c + 1, c + 1, RED);
  return dataTex(d, size, size, { nearest: true });
}

function quad(material: THREE.Material, order: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  m.renderOrder = order;
  m.frustumCulled = false;
  m.visible = false;
  return m;
}

function baseMat(params: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    ...params,
  });
}

export class Overlay {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);

  private tint: THREE.Mesh;
  private vignette: THREE.Mesh;
  private grain: THREE.Mesh;
  private grainTex: THREE.DataTexture;
  private scopeMask: THREE.Mesh;
  private scopeBars: THREE.Mesh[];
  private reticle: THREE.Mesh;
  private hudMesh: THREE.Mesh;
  private hudMat: THREE.MeshBasicMaterial;
  private hudText = "";
  private flash: THREE.Mesh;
  private fade: THREE.Mesh;

  constructor() {
    this.camera.position.z = 5;

    const tintMat = baseMat({ color: 0x000000, opacity: 0 });
    this.tint = quad(tintMat, 0);

    const vigMat = baseMat({ color: 0x000000, map: makeVignette(), opacity: 0.5 });
    this.vignette = quad(vigMat, 1);

    this.grainTex = makeGrain();
    const grainMat = baseMat({ color: 0xffffff, map: this.grainTex, opacity: 0.05 });
    this.grain = quad(grainMat, 2);

    const maskMat = baseMat({ color: 0x000000, map: makeScopeMask(), opacity: 1 });
    this.scopeMask = quad(maskMat, 10);
    this.scopeBars = [0, 1, 2, 3].map(() => quad(baseMat({ color: 0x000000, opacity: 1 }), 10));
    this.reticle = quad(baseMat({ color: 0xffffff, map: makeReticle(), opacity: 0.95 }), 11);

    this.hudMat = baseMat({ color: 0xffffff, opacity: 0.9 });
    this.hudMesh = quad(this.hudMat, 12);

    this.flash = quad(baseMat({ color: 0xffffff, opacity: 0 }), 20);
    this.fade = quad(baseMat({ color: 0x000000, opacity: 0 }), 21);

    for (const m of [
      this.tint, this.vignette, this.grain, this.scopeMask, ...this.scopeBars, this.reticle, this.hudMesh, this.flash, this.fade,
    ]) {
      this.scene.add(m);
    }
  }

  update(s: OverlayState, aspect: number, frameSeed: number): void {
    // 调色叠色
    const tm = this.tint.material as THREE.MeshBasicMaterial;
    this.tint.visible = s.tintOpacity > 0.001;
    tm.color.setHex(s.tint);
    tm.opacity = s.tintOpacity;

    // 暗角
    const vm = this.vignette.material as THREE.MeshBasicMaterial;
    this.vignette.visible = s.vignette > 0.001;
    vm.opacity = Math.min(1, s.vignette);

    // 颗粒：每帧换偏移，形成动态噪点（帧号来自时间，回放一致）
    const gm = this.grain.material as THREE.MeshBasicMaterial;
    this.grain.visible = s.grain > 0.001;
    gm.opacity = 0.11 * s.grain;
    this.grainTex.offset.set(hash2(frameSeed, 3), hash2(frameSeed, 9));
    this.grainTex.repeat.set(2.4, 1.2);

    // 瞄准镜
    const on = s.scope > 0.001;
    const sy = s.scopeSize; // NDC 半高比例（quad 为 2×2，缩放 sy 即占画面高度 sy）
    const sx = sy / aspect;
    this.scopeMask.visible = on;
    this.reticle.visible = on && s.reticle > 0.5;
    this.scopeBars.forEach((b) => (b.visible = on));
    (this.scopeMask.material as THREE.MeshBasicMaterial).opacity = s.scope;
    (this.reticle.material as THREE.MeshBasicMaterial).opacity = 0.95 * s.scope;
    if (on) {
      this.scopeMask.scale.set(sx, sy, 1);
      this.scopeMask.position.set(0, 0, 0);
      this.reticle.scale.set(sx, sy, 1);
      this.reticle.position.set(s.reticleX * sx, s.reticleY * sy, 0);
      // 四块黑边，把圆外剩余区域盖住
      const [l, r, t, b] = this.scopeBars;
      // 左右
      const wSide = Math.max(0, 1 - sx);
      l.scale.set(wSide / 2 + 0.0005, 1, 1);
      l.position.set(-1 + wSide / 2, 0, 0);
      r.scale.set(wSide / 2 + 0.0005, 1, 1);
      r.position.set(1 - wSide / 2, 0, 0);
      // 上下（当 scopeSize < 1）
      const hSide = Math.max(0, 1 - sy);
      t.scale.set(1, hSide / 2 + 0.0005, 1);
      t.position.set(0, 1 - hSide / 2, 0);
      b.scale.set(1, hSide / 2 + 0.0005, 1);
      b.position.set(0, -1 + hSide / 2, 0);
      for (const bar of this.scopeBars) (bar.material as THREE.MeshBasicMaterial).opacity = s.scope;
    }

    // HUD 文本
    const showHud = on && s.hud.length > 0;
    this.hudMesh.visible = showHud;
    if (showHud) {
      if (s.hud !== this.hudText) {
        this.hudText = s.hud;
        this.hudMat.map?.dispose();
        this.hudMat.map = textTexture(s.hud, [255, 96, 70]);
        this.hudMat.needsUpdate = true;
      }
      const chars = s.hud.length;
      const wpx = chars * (FONT_W + 1) - 1;
      const heightNdc = 0.06; // 占画面高度 3%
      const widthNdc = (heightNdc * wpx) / FONT_H / aspect;
      this.hudMesh.scale.set(widthNdc / 2, heightNdc / 2, 1);
      this.hudMesh.position.set(0.34 * sx, -0.7 * sy, 0);
      this.hudMat.opacity = 0.9 * s.scope;
    }

    // 闪白 / 黑场
    const fm = this.flash.material as THREE.MeshBasicMaterial;
    this.flash.visible = s.flash > 0.002;
    fm.color.setHex(s.flashColor);
    fm.opacity = Math.min(1, s.flash);
    const bm = this.fade.material as THREE.MeshBasicMaterial;
    this.fade.visible = s.fade > 0.002;
    bm.opacity = Math.min(1, s.fade);
  }

  render(r: FilmRenderer): void {
    r.render(this.scene, this.camera);
  }
}
