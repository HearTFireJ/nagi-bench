/**
 * 仅供 Bun 无头自检脚本使用的“迷你 DOM”：足够运行 mountCinematicControls / ThreeStage / 标题 / 开始遮罩。
 * 支持：innerHTML 解析、querySelector（类/属性/标签/后代）、classList、style、事件派发、虚拟 requestAnimationFrame、
 *       ResizeObserver、以及一个会记录节点与调用的 AudioContext 模拟。
 * 这不是浏览器——它不能替代真实浏览器里的点击测试，只用来在没有浏览器的环境里尽早发现运行时异常。
 */
import { FakeCanvas } from "./fakedom";
import { makeFakeGL } from "./fakegl";

type Listener = (ev: MiniEvent) => void;

export class MiniEvent {
  defaultPrevented = false;
  target: MiniNode | null = null;
  constructor(readonly type: string, init: Record<string, unknown> = {}) {
    Object.assign(this, init);
  }
  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

const VOID = new Set(["input", "br", "img", "hr", "meta", "link"]);

export class MiniNode {
  readonly children: MiniNode[] = [];
  parent: MiniNode | null = null;
  readonly attrs: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  private listeners = new Map<string, Listener[]>();
  private text = "";
  value = "";
  clientWidth = 1920;
  clientHeight = 817;
  constructor(readonly tagName: string) {}

  get className(): string {
    return this.attrs.class ?? "";
  }
  set className(v: string) {
    this.attrs.class = v;
  }
  get classList() {
    const self = this;
    const list = (): string[] => self.className.split(/\s+/).filter(Boolean);
    return {
      add: (...c: string[]) => (self.className = [...new Set([...list(), ...c])].join(" ")),
      remove: (...c: string[]) => (self.className = list().filter((x) => !c.includes(x)).join(" ")),
      contains: (c: string) => list().includes(c),
    };
  }
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
    if (k === "value") this.value = v;
  }
  getAttribute(k: string): string | null {
    return this.attrs[k] ?? null;
  }
  appendChild<T extends MiniNode>(c: T): T {
    if (c.parent) c.parent.removeChild(c);
    c.parent = this;
    this.children.push(c);
    return c;
  }
  get firstChild(): MiniNode | null {
    return this.children[0] ?? null;
  }
  insertBefore<T extends MiniNode>(c: T, ref: MiniNode | null): T {
    if (c.parent) c.parent.removeChild(c);
    c.parent = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c);
    else this.children.splice(i, 0, c);
    return c;
  }
  removeChild(c: MiniNode): void {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parent = null;
  }
  remove(): void {
    this.parent?.removeChild(this);
  }
  contains(n: MiniNode): boolean {
    if (n === this) return true;
    return this.children.some((c) => c.contains(n));
  }
  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(v: string) {
    this.children.length = 0;
    this.text = String(v);
  }
  set innerHTML(html: string) {
    this.children.length = 0;
    this.text = "";
    parseHTML(html, this);
  }
  addEventListener(type: string, fn: Listener): void {
    const l = this.listeners.get(type) ?? [];
    l.push(fn);
    this.listeners.set(type, l);
  }
  removeEventListener(type: string, fn: Listener): void {
    const l = this.listeners.get(type);
    if (l) this.listeners.set(type, l.filter((x) => x !== fn));
  }
  dispatchEvent(ev: MiniEvent): boolean {
    ev.target ??= this;
    for (let n: MiniNode | null = this; n; n = n.parent) {
      for (const fn of n.listeners.get(ev.type) ?? []) fn(ev);
    }
    return !ev.defaultPrevented;
  }
  matches(sel: string): boolean {
    // 单个复合选择器：tag / .class / [attr="v"] 的任意组合
    const re = /(\.[\w-]+)|(\[[\w-]+(?:="[^"]*")?\])|(#[\w-]+)|([a-zA-Z][\w-]*)/g;
    let m: RegExpExecArray | null;
    let ok = true;
    let any = false;
    while ((m = re.exec(sel))) {
      any = true;
      if (m[1]) ok &&= this.classList.contains(m[1].slice(1));
      else if (m[2]) {
        const mm = /\[([\w-]+)(?:="([^"]*)")?\]/.exec(m[2])!;
        ok &&= mm[2] === undefined ? mm[1] in this.attrs : this.attrs[mm[1]] === mm[2];
      } else if (m[3]) ok &&= this.attrs.id === m[3].slice(1);
      else if (m[4]) ok &&= this.tagName === m[4].toLowerCase();
    }
    return any && ok;
  }
  private walk(fn: (n: MiniNode) => boolean): MiniNode | null {
    for (const c of this.children) {
      if (fn(c)) return c;
      const r = c.walk(fn);
      if (r) return r;
    }
    return null;
  }
  querySelector<T = MiniNode>(sel: string): T | null {
    const parts = sel.trim().split(/\s+/);
    const last = parts[parts.length - 1];
    const hit = this.walk((n) => {
      if (!n.matches(last)) return false;
      let anc: MiniNode | null = n.parent;
      for (let i = parts.length - 2; i >= 0; i--) {
        while (anc && !anc.matches(parts[i])) anc = anc.parent;
        if (!anc) return false;
        anc = anc.parent;
      }
      return true;
    });
    return hit as unknown as T | null;
  }
  requestFullscreen(): Promise<void> {
    return Promise.resolve();
  }
  getContext(): null {
    return null;
  }
}

function parseHTML(html: string, into: MiniNode): void {
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  const stack: MiniNode[] = [into];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[1]) {
      // 关闭标签
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === m[1].toLowerCase()) {
          stack.length = i;
          break;
        }
      }
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const node = new MiniNode(tag);
      const attrRe = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let a: RegExpExecArray | null;
      while ((a = attrRe.exec(m[3] ?? ""))) node.setAttribute(a[1], a[2] ?? a[3] ?? a[4] ?? "");
      top.appendChild(node);
      if (tag === "style") {
        // 原始文本：吞到 </style>
        const end = html.indexOf("</style>", re.lastIndex);
        re.lastIndex = end < 0 ? html.length : end + 8;
        continue;
      }
      if (!VOID.has(tag) && !m[4]) stack.push(node);
    } else if (m[5]) {
      const t = m[5];
      if (t.trim()) {
        const tn = new MiniNode("#text");
        (tn as unknown as { text: string }).text = t;
        top.appendChild(tn);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 全局对象
// ---------------------------------------------------------------------------
class MiniCanvas extends MiniNode {
  private readonly fake = new FakeCanvas();
  constructor() {
    super("canvas");
  }
  get width(): number {
    return this.fake.width;
  }
  set width(v: number) {
    this.fake.width = v;
  }
  get height(): number {
    return this.fake.height;
  }
  set height(v: number) {
    this.fake.height = v;
  }
  toDataURL(): string {
    return "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD";
  }
  private gl: unknown;
  override getContext(type?: string): never | null {
    if (type === "webgl2" || type === "webgl") {
      // 仅当外部打开了“假 GL”时提供（默认没有 WebGL，用来测试致命错误路径）
      if (!(globalThis as { __fakeGL?: boolean }).__fakeGL) return null;
      return (this.gl ??= makeFakeGL(this)) as never;
    }
    return this.fake.getContext(type ?? "2d") as never;
  }
}

/** 虚拟时钟 + requestAnimationFrame */
export const clock = {
  now: 0,
  queue: new Map<number, (t: number) => void>(),
  nextId: 1,
};
export function pump(dtSeconds: number): void {
  clock.now += dtSeconds * 1000;
  const q = [...clock.queue.entries()];
  clock.queue.clear();
  for (const [, cb] of q) cb(clock.now);
}

// ---------------------------------------------------------------------------
// AudioContext 模拟：记录被创建/启动的节点，供自检统计
// ---------------------------------------------------------------------------
class FakeParam {
  value = 0;
  setValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number): this {
    if (!(v > 0)) throw new Error("exponentialRampToValueAtTime: value must be > 0");
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number): this {
    this.value = v;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

export const audioStats = { contexts: 0, sources: 0, started: 0, stopped: 0, convolvers: 0, decoded: 0, nodes: 0, live: 0 };

class FakeNode {
  private outs = new Set<unknown>();
  constructor() {
    audioStats.nodes++;
  }
  connect<T>(dest: T): T {
    this.outs.add(dest);
    return dest;
  }
  disconnect(): void {
    this.outs.clear();
  }
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakeFilter extends FakeNode {
  type = "lowpass";
  frequency = new FakeParam();
  Q = new FakeParam();
  gain = new FakeParam();
}
class FakeSource extends FakeNode {
  private on = false;
  buffer: unknown = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  type = "sine";
  playbackRate = new FakeParam();
  detune = new FakeParam();
  frequency = new FakeParam();
  constructor() {
    super();
    audioStats.sources++;
  }
  start(_when?: number, offset?: number): void {
    if (offset !== undefined && !(offset >= 0)) throw new Error("start(): negative offset");
    if (this.on) throw new Error("InvalidStateError: start called twice");
    this.on = true;
    audioStats.started++;
    audioStats.live++;
  }
  stop(): void {
    if (!this.on) throw new Error("InvalidStateError: stop before start");
    this.on = false;
    audioStats.stopped++;
    audioStats.live--;
  }
}
class FakeCompressor extends FakeNode {
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
}
class FakeShaper extends FakeNode {
  curve: Float32Array | null = null;
}
class FakeConvolver extends FakeNode {
  buffer: unknown = null;
  constructor() {
    super();
    audioStats.convolvers++;
  }
}

export class FakeAudioContext {
  state = "suspended";
  currentTime = 0;
  sampleRate = 44100;
  destination = new FakeNode();
  constructor() {
    audioStats.contexts++;
  }
  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
  createGain(): FakeGain {
    return new FakeGain();
  }
  createBufferSource(): FakeSource {
    return new FakeSource();
  }
  createOscillator(): FakeSource {
    return new FakeSource();
  }
  createBiquadFilter(): FakeFilter {
    return new FakeFilter();
  }
  createConvolver(): FakeConvolver {
    return new FakeConvolver();
  }
  createDynamicsCompressor(): FakeCompressor {
    return new FakeCompressor();
  }
  createWaveShaper(): FakeShaper {
    return new FakeShaper();
  }
  createBuffer(ch: number, len: number, sr: number): unknown {
    const data = Array.from({ length: ch }, () => new Float32Array(len));
    return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: (i: number) => data[i] };
  }
  decodeAudioData(buf: ArrayBuffer): Promise<unknown> {
    audioStats.decoded++;
    if (!(buf.byteLength > 100)) return Promise.reject(new Error("bad audio data"));
    return Promise.resolve(this.createBuffer(1, 44100, 44100));
  }
}

const g = globalThis as Record<string, unknown>;
const documentEl = new MiniNode("document");
const body = new MiniNode("body");
g.document = {
  createElement(tag: string): MiniNode {
    return tag === "canvas" ? new MiniCanvas() : new MiniNode(tag);
  },
  createElementNS(_ns: string, tag: string): MiniNode {
    return this.createElement(tag);
  },
  body,
  hidden: false,
  querySelector: (s: string) => body.querySelector(s),
  querySelectorAll: () => [],
  addEventListener: (t: string, f: Listener) => documentEl.addEventListener(t, f),
  removeEventListener: (t: string, f: Listener) => documentEl.removeEventListener(t, f),
  dispatch: (ev: MiniEvent) => documentEl.dispatchEvent(ev),
};
const win = new MiniNode("window");
g.window = Object.assign(win, {
  devicePixelRatio: 1,
  innerWidth: 1920,
  innerHeight: 1080,
  AudioContext: FakeAudioContext,
});
(g.window as { dispatch: (ev: MiniEvent) => void }).dispatch = (ev: MiniEvent) => win.dispatchEvent(ev);
g.requestAnimationFrame = (cb: (t: number) => void): number => {
  const id = clock.nextId++;
  clock.queue.set(id, cb);
  return id;
};
g.cancelAnimationFrame = (id: number): void => {
  clock.queue.delete(id);
};
g.MutationObserver = class {
  observe(): void {}
  disconnect(): void {}
};
g.ResizeObserver = class {
  constructor(private cb: () => void) {}
  observe(): void {
    queueMicrotask(() => this.cb());
  }
  disconnect(): void {}
};
export { body as bodyNode };
