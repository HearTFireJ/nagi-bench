// Minimal DOM / canvas stand-ins so the film can be built and stepped under Bun
// (no browser is available in the authoring sandbox). The 2D context is a real
// RGBA pixel buffer, so painted skins can be sampled by the preview rasteriser.

export interface StubCanvas {
  width: number;
  height: number;
  __pixels: Uint8ClampedArray;
  getContext: (kind: string) => unknown;
  style: Record<string, string>;
}

function parseColour(input: unknown): [number, number, number, number] {
  const s = String(input).trim();
  if (s[0] === "#") {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const n = parseInt(hex.slice(0, 6), 16);
    const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) : 255;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1]!.split(",").map((v) => parseFloat(v));
    return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] === undefined ? 255 : Math.round(p[3] * 255)];
  }
  return [255, 0, 255, 255];
}

class Context2D {
  fillStyle: unknown = "#000000";
  strokeStyle: unknown = "#000000";
  imageSmoothingEnabled = true;
  globalAlpha = 1;
  font = "";
  textAlign = "left";
  textBaseline = "alphabetic";
  lineWidth = 1;
  constructor(private readonly canvas: StubCanvas) {}

  private clip(x: number, y: number, w: number, h: number): [number, number, number, number] {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.canvas.width, Math.ceil(x + w));
    const y1 = Math.min(this.canvas.height, Math.ceil(y + h));
    return [x0, y0, x1, y1];
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const style = this.fillStyle;
    if (typeof style === "object" && style !== null && "stops" in style) {
      const stops = (style as { stops: Array<[number, string]> }).stops;
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (!first || !last) return;
      const [x0, y0, x1, y1] = this.clip(x, y, w, h);
      for (let py = y0; py < y1; py++) {
        const k = h > 0 ? (py - y) / h : 0;
        const a = parseColour(first[1]);
        const b = parseColour(last[1]);
        for (let px = x0; px < x1; px++) {
          const i = (py * this.canvas.width + px) * 4;
          for (let c = 0; c < 4; c++) this.canvas.__pixels[i + c] = a[c]! + (b[c]! - a[c]!) * k;
        }
      }
      return;
    }
    const [r, g, b, a] = parseColour(style);
    const [x0, y0, x1, y1] = this.clip(x, y, w, h);
    const data = this.canvas.__pixels;
    const alpha = (a / 255) * this.globalAlpha;
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * this.canvas.width + px) * 4;
        if (alpha >= 0.999) {
          data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
        } else {
          const da = data[i + 3]! / 255;
          const outA = alpha + da * (1 - alpha);
          const mix = (s: number, d: number) => (outA === 0 ? 0 : (s * alpha + d * da * (1 - alpha)) / outA);
          data[i] = mix(r, data[i]!); data[i + 1] = mix(g, data[i + 1]!); data[i + 2] = mix(b, data[i + 2]!);
          data[i + 3] = outA * 255;
        }
      }
    }
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    const [x0, y0, x1, y1] = this.clip(x, y, w, h);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * this.canvas.width + px) * 4;
        this.canvas.__pixels[i] = 0; this.canvas.__pixels[i + 1] = 0;
        this.canvas.__pixels[i + 2] = 0; this.canvas.__pixels[i + 3] = 0;
      }
    }
  }

  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray; width: number; height: number } {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const sx = x + px;
        const sy = y + py;
        if (sx < 0 || sy < 0 || sx >= this.canvas.width || sy >= this.canvas.height) continue;
        const si = (sy * this.canvas.width + sx) * 4;
        const di = (py * w + px) * 4;
        for (let c = 0; c < 4; c++) out[di + c] = this.canvas.__pixels[si + c]!;
      }
    }
    return { data: out, width: w, height: h };
  }

  putImageData(image: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number): void {
    for (let py = 0; py < image.height; py++) {
      for (let px = 0; px < image.width; px++) {
        const dx = x + px;
        const dy = y + py;
        if (dx < 0 || dy < 0 || dx >= this.canvas.width || dy >= this.canvas.height) continue;
        const di = (dy * this.canvas.width + dx) * 4;
        const si = (py * image.width + px) * 4;
        for (let c = 0; c < 4; c++) this.canvas.__pixels[di + c] = image.data[si + c]!;
      }
    }
  }

  createLinearGradient(): { stops: Array<[number, string]>; addColorStop: (o: number, c: string) => void } {
    const g = { stops: [] as Array<[number, string]>, addColorStop(o: number, c: string) { g.stops.push([o, c]); } };
    return g;
  }

  drawImage(image: StubCanvas, dx: number, dy: number, dw?: number, dh?: number): void {
    const w = dw ?? image.width;
    const h = dh ?? image.height;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const sx = Math.floor((px / w) * image.width);
        const sy = Math.floor((py / h) * image.height);
        const tx = dx + px;
        const ty = dy + py;
        if (tx < 0 || ty < 0 || tx >= this.canvas.width || ty >= this.canvas.height) continue;
        const si = (sy * image.width + sx) * 4;
        const di = (ty * this.canvas.width + tx) * 4;
        if (image.__pixels[si + 3]! < 8) continue;
        for (let c = 0; c < 4; c++) this.canvas.__pixels[di + c] = image.__pixels[si + c]!;
      }
    }
  }

  // Text, paths, transforms: not needed to judge composition.
  fillText(): void {}
  strokeText(): void {}
  measureText(text: string): { width: number } { return { width: text.length * 8 }; }
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
}

function makeCanvas(): StubCanvas {
  const canvas: StubCanvas = {
    width: 300,
    height: 150,
    __pixels: new Uint8ClampedArray(300 * 150 * 4),
    style: {},
    getContext(kind: string) {
      if (kind !== "2d") return null;
      const want = canvas.width * canvas.height * 4;
      if (canvas.__pixels.length !== want) canvas.__pixels = new Uint8ClampedArray(want);
      return (canvas as unknown as { __ctx?: Context2D }).__ctx
        ?? ((canvas as unknown as { __ctx?: Context2D }).__ctx = new Context2D(canvas));
    },
  };
  // Re-allocate the pixel store when width/height are assigned.
  let w = 300;
  let h = 150;
  Object.defineProperty(canvas, "width", {
    get: () => w,
    set: (v: number) => { w = v; canvas.__pixels = new Uint8ClampedArray(w * h * 4); },
  });
  Object.defineProperty(canvas, "height", {
    get: () => h,
    set: (v: number) => { h = v; canvas.__pixels = new Uint8ClampedArray(w * h * 4); },
  });
  return canvas;
}

function makeElement(tag: string): Record<string, unknown> {
  if (tag === "canvas") return makeCanvas() as unknown as Record<string, unknown>;
  const el: Record<string, unknown> = {
    tagName: tag.toUpperCase(),
    style: {},
    children: [] as unknown[],
    classList: { add() {}, remove() {}, toggle() {} },
    dataset: {},
    appendChild(child: unknown) { (el.children as unknown[]).push(child); return child; },
    append() {},
    remove() {},
    contains: () => false,
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => makeElement("div"),
    getContext: () => null,
    textContent: "",
    innerHTML: "",
    clientWidth: 1280,
    clientHeight: 720,
  };
  return el;
}

export function installDomStub(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = {
    createElement: (tag: string) => makeElement(tag),
    getElementById: () => makeElement("div"),
    body: makeElement("body"),
    addEventListener() {},
  };
  g.window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
  };
  g.requestAnimationFrame = () => 0;
  g.cancelAnimationFrame = () => {};
}
