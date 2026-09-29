/**
 * 仅供 Bun 预览/测试脚本使用：提供一个最小的 `document` / 2D canvas 实现，
 * 让 Voxel Kit 的 createSkin（用 <canvas> 画 64×64 贴图）能在没有浏览器的环境里运行。
 * 只实现项目实际用到的接口：fillRect / clearRect / getImageData / putImageData / fillStyle。
 * 文字绘制等在预览里被忽略（不会抛错）。
 */

function parseColor(input: string): [number, number, number, number] {
  const s = input.trim().toLowerCase();
  if (s[0] === "#") {
    if (s.length === 4) {
      return [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16), 1];
    }
    if (s.length === 7) {
      return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
    }
    if (s.length === 9) {
      return [
        parseInt(s.slice(1, 3), 16),
        parseInt(s.slice(3, 5), 16),
        parseInt(s.slice(5, 7), 16),
        parseInt(s.slice(7, 9), 16) / 255,
      ];
    }
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(",").map((v) => parseFloat(v));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  if (s === "white") return [255, 255, 255, 1];
  if (s === "black") return [0, 0, 0, 1];
  if (s === "transparent") return [0, 0, 0, 0];
  return [0, 0, 0, 1];
}

export class FakeCtx2D {
  fillStyle: string = "#000000";
  strokeStyle = "#000000";
  imageSmoothingEnabled = true;
  globalAlpha = 1;
  font = "";
  textAlign = "left";
  textBaseline = "alphabetic";
  lineWidth = 1;
  constructor(readonly canvas: FakeCanvas) {}

  fillRect(x: number, y: number, w: number, h: number): void {
    const [r, g, b, a0] = parseColor(this.fillStyle);
    const a = a0 * this.globalAlpha;
    const c = this.canvas;
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(c.width, Math.ceil(x + w));
    const y1 = Math.min(c.height, Math.ceil(y + h));
    const d = c.data;
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * c.width + xx) * 4;
        if (a >= 0.999) {
          d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
        } else {
          const da = d[i + 3] / 255;
          const oa = a + da * (1 - a);
          if (oa > 0) {
            d[i] = (r * a + d[i] * da * (1 - a)) / oa;
            d[i + 1] = (g * a + d[i + 1] * da * (1 - a)) / oa;
            d[i + 2] = (b * a + d[i + 2] * da * (1 - a)) / oa;
          }
          d[i + 3] = oa * 255;
        }
      }
    }
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    const c = this.canvas;
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(c.width, Math.ceil(x + w));
    const y1 = Math.min(c.height, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * c.width + xx) * 4;
        c.data[i] = c.data[i + 1] = c.data[i + 2] = c.data[i + 3] = 0;
      }
    }
  }
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray; width: number; height: number } {
    const out = new Uint8ClampedArray(w * h * 4);
    const c = this.canvas;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const sx = x + xx;
        const sy = y + yy;
        const di = (yy * w + xx) * 4;
        if (sx < 0 || sy < 0 || sx >= c.width || sy >= c.height) continue;
        const si = (sy * c.width + sx) * 4;
        out[di] = c.data[si]; out[di + 1] = c.data[si + 1]; out[di + 2] = c.data[si + 2]; out[di + 3] = c.data[si + 3];
      }
    }
    return { data: out, width: w, height: h };
  }
  putImageData(img: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number): void {
    const c = this.canvas;
    for (let yy = 0; yy < img.height; yy++) {
      for (let xx = 0; xx < img.width; xx++) {
        const dx = x + xx;
        const dy = y + yy;
        if (dx < 0 || dy < 0 || dx >= c.width || dy >= c.height) continue;
        const si = (yy * img.width + xx) * 4;
        const di = (dy * c.width + dx) * 4;
        c.data[di] = img.data[si]; c.data[di + 1] = img.data[si + 1]; c.data[di + 2] = img.data[si + 2]; c.data[di + 3] = img.data[si + 3];
      }
    }
  }
  // 预览中忽略的绘制指令
  fillText(): void {}
  strokeText(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arc(): void {}
  fill(): void {}
  stroke(): void {}
  save(): void {}
  restore(): void {}
  translate(): void {}
  scale(): void {}
  rotate(): void {}
  measureText(t: string): { width: number } {
    return { width: t.length * 10 };
  }
  createLinearGradient(): { addColorStop(): void } {
    return { addColorStop() {} };
  }
  createRadialGradient(): { addColorStop(): void } {
    return { addColorStop() {} };
  }
}

export class FakeCanvas {
  data: Uint8ClampedArray = new Uint8ClampedArray(300 * 150 * 4);
  style: Record<string, string> = {};
  private w = 300;
  private h = 150;
  private ctx?: FakeCtx2D;
  get width(): number {
    return this.w;
  }
  set width(v: number) {
    this.w = v;
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
  }
  get height(): number {
    return this.h;
  }
  set height(v: number) {
    this.h = v;
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
  }
  getContext(type: string): FakeCtx2D | null {
    if (type !== "2d") return null;
    if (!this.ctx) this.ctx = new FakeCtx2D(this);
    return this.ctx;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

const documentStub = {
  createElement(tag: string): unknown {
    if (tag === "canvas") return new FakeCanvas();
    return { style: {}, addEventListener() {}, removeEventListener() {}, appendChild() {}, setAttribute() {} };
  },
  createElementNS(_ns: string, tag: string): unknown {
    return documentStub.createElement(tag);
  },
  body: { appendChild() {}, style: {} },
};

(globalThis as unknown as { document: unknown }).document = documentStub;
(globalThis as unknown as { window?: unknown }).window ??= {
  devicePixelRatio: 1,
  addEventListener() {},
  removeEventListener() {},
};
