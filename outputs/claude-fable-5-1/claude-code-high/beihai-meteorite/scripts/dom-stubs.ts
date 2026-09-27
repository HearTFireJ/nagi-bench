/**
 * Minimal DOM stubs so the film scene graph can be built under Bun: a canvas 2D
 * context for the 64x64 skins and inert elements for the overlay.
 */
import * as THREE from "three";

// ----------------------------------------------------------- DOM stubs
class FakeCtx {
  fillStyle = "#000";
  imageSmoothingEnabled = false;
  private data: Uint8ClampedArray;
  constructor(private w: number, private h: number) { this.data = new Uint8ClampedArray(w * h * 4); }
  private colour(): [number, number, number, number] {
    const c = new THREE.Color();
    let a = 255;
    const s = String(this.fillStyle);
    if (/^#[0-9a-f]{8}$/i.test(s)) { a = parseInt(s.slice(7, 9), 16); c.set(s.slice(0, 7)); } else c.set(s);
    return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), a];
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const [r, g, b, a] = this.colour();
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
      const k = (j * this.w + i) * 4;
      this.data[k] = r; this.data[k + 1] = g; this.data[k + 2] = b; this.data[k + 3] = a;
    }
  }
  clearRect(x: number, y: number, w: number, h: number) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
      const k = (j * this.w + i) * 4;
      this.data[k] = this.data[k + 1] = this.data[k + 2] = this.data[k + 3] = 0;
    }
  }
  getImageData(x: number, y: number, w: number, h: number) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const src = ((y + j) * this.w + (x + i)) * 4, dst = (j * w + i) * 4;
      out.set(this.data.subarray(src, src + 4), dst);
    }
    return { data: out, width: w, height: h };
  }
  putImageData(img: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number) {
    for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) {
      const dst = ((y + j) * this.w + (x + i)) * 4, src = (j * img.width + i) * 4;
      this.data.set(img.data.subarray(src, src + 4), dst);
    }
  }
}
class FakeElement {
  children: FakeElement[] = [];
  style: Record<string, string> = {};
  className = "";
  textContent = "";
  innerHTML = "";
  width = 0; height = 0;
  classList = { add() {}, remove() {} };
  private listeners: Record<string, Array<() => void>> = {};
  constructor(public tag: string) {}
  getContext() { return new FakeCtx(this.width, this.height); }
  appendChild(c: FakeElement) { this.children.push(c); return c; }
  contains() { return true; }
  querySelector() { return new FakeElement("div"); }
  querySelectorAll() { return []; }
  addEventListener(type: string, fn: () => void) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener() {}
  setAttribute() {}
  remove() {}
  click() { for (const f of this.listeners.click ?? []) f(); }
  get clientWidth() { return 1280; }
  get clientHeight() { return 720; }
}
(globalThis as any).document = {
  createElement: (tag: string) => new FakeElement(tag),
  querySelector: () => new FakeElement("div"),
  body: new FakeElement("body"),
  head: new FakeElement("head"),
};
(globalThis as any).window = globalThis;
(globalThis as any).requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
(globalThis as any).cancelAnimationFrame = (h: number) => clearTimeout(h);
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };


export { FakeElement };
