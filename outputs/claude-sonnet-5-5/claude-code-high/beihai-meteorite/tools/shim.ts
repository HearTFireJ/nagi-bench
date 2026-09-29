// Minimal DOM shim so the scene code (canvas textures) can run under Bun without a browser.
function parseColor(s: string): [number, number, number, number] {
  s = s.trim();
  if (s[0] === "#") {
    if (s.length === 4) return [parseInt(s[1]! + s[1], 16), parseInt(s[2]! + s[2], 16), parseInt(s[3]! + s[3], 16), 255];
    return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 255];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1]!.split(",").map((v) => parseFloat(v));
    return [p[0]!, p[1]!, p[2]!, p[3] === undefined ? 255 : p[3]! * 255];
  }
  return [255, 0, 255, 255];
}

class FakeCtx {
  fillStyle = "#000";
  imageSmoothingEnabled = false;
  constructor(private c: FakeCanvas) {}
  fillRect(x: number, y: number, w: number, h: number): void {
    const [r, g, b, a] = parseColor(this.fillStyle);
    const c = this.c;
    for (let j = Math.max(0, y | 0); j < Math.min(c.height, (y + h) | 0); j++)
      for (let i = Math.max(0, x | 0); i < Math.min(c.width, (x + w) | 0); i++) {
        const k = (j * c.width + i) * 4;
        c.data[k] = r;
        c.data[k + 1] = g;
        c.data[k + 2] = b;
        c.data[k + 3] = a;
      }
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    const c = this.c;
    for (let j = Math.max(0, y | 0); j < Math.min(c.height, (y + h) | 0); j++)
      for (let i = Math.max(0, x | 0); i < Math.min(c.width, (x + w) | 0); i++) {
        const k = (j * c.width + i) * 4;
        c.data[k] = c.data[k + 1] = c.data[k + 2] = c.data[k + 3] = 0;
      }
  }
  getImageData(x: number, y: number, w: number, h: number) {
    const out = new Uint8ClampedArray(w * h * 4);
    const c = this.c;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const s = ((y + j) * c.width + (x + i)) * 4;
      const d = (j * w + i) * 4;
      for (let q = 0; q < 4; q++) out[d + q] = c.data[s + q]!;
    }
    return { data: out, width: w, height: h };
  }
  createImageData(w: number, h: number) {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  putImageData(img: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number): void {
    const c = this.c;
    for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) {
      const d = ((y + j) * c.width + (x + i)) * 4;
      const s = (j * img.width + i) * 4;
      for (let q = 0; q < 4; q++) c.data[d + q] = img.data[s + q]!;
    }
  }
}

export class FakeCanvas {
  width = 300;
  height = 150;
  private _data?: Uint8ClampedArray;
  style: Record<string, string> = {};
  get data(): Uint8ClampedArray {
    if (!this._data || this._data.length !== this.width * this.height * 4) this._data = new Uint8ClampedArray(this.width * this.height * 4);
    return this._data;
  }
  getContext(): FakeCtx {
    return new FakeCtx(this);
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

(globalThis as any).document = {
  createElement: (tag: string) => {
    if (tag === "canvas") return new FakeCanvas();
    return { style: {}, appendChild() {}, addEventListener() {}, setAttribute() {}, classList: { add() {}, remove() {} } };
  },
  body: { appendChild() {} },
};
(globalThis as any).window = { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
(globalThis as any).requestAnimationFrame = () => 0;
(globalThis as any).cancelAnimationFrame = () => {};

// used by the e2e harness for the overlay's grain texture
(FakeCanvas.prototype as any).toDataURL = () => "data:image/png;base64,AAAA";
