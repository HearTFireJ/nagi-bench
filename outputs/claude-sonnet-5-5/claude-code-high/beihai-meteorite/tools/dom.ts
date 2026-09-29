// A very small DOM: just enough surface for the transport UI, the overlay and ThreeStage to run under Bun.
import { FakeCanvas } from "./shim";

type Listener = (e: any) => void;

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g)) out[m[1]!] = m[2] ?? "";
  return out;
}

export class El {
  tag: string;
  attrs: Record<string, string> = {};
  children: El[] = [];
  parent: El | null = null;
  style: Record<string, string> = {};
  text = "";
  listeners = new Map<string, Listener[]>();
  value = "";
  width = 300;
  height = 150;
  private fc = new FakeCanvas();
  getContext(): any {
    this.fc.width = this.width;
    this.fc.height = this.height;
    return this.fc.getContext();
  }
  toDataURL(): string {
    return "data:image/png;base64,AAAA";
  }
  clientWidth = 1280;
  clientHeight = 720;
  private classes = new Set<string>();
  constructor(tag: string) {
    this.tag = tag.toLowerCase();
  }
  get className(): string {
    return [...this.classes].join(" ");
  }
  set className(v: string) {
    this.classes = new Set(v.split(/\s+/).filter(Boolean));
  }
  classList = {
    add: (c: string) => this.classes.add(c),
    remove: (c: string) => this.classes.delete(c),
    toggle: (c: string, force?: boolean) => {
      const on = force ?? !this.classes.has(c);
      if (on) this.classes.add(c);
      else this.classes.delete(c);
      return on;
    },
    contains: (c: string) => this.classes.has(c),
  };
  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(v: string) {
    this.text = v;
    this.children = [];
  }
  set innerHTML(html: string) {
    this.children = [];
    this.text = "";
    const stack: El[] = [this];
    const re = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)([^>]*?)(\/?)>|([^<]+)/g;
    const voidTags = new Set(["input", "br", "img", "path", "circle", "canvas"]);
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      if (m[1]) {
        if (stack.length > 1) stack.pop();
      } else if (m[2]) {
        const tag = m[2]!;
        if (tag === "style" || tag === "script") {
          // swallow raw text until the closing tag
          const end = html.indexOf(`</${tag}>`, re.lastIndex);
          re.lastIndex = end + tag.length + 3;
          continue;
        }
        const el = new El(tag);
        el.attrs = parseAttrs(m[3] ?? "");
        if (el.attrs.class) el.className = el.attrs.class;
        if (tag === "canvas") (el as any).width = 300;
        if (tag === "input") el.value = el.attrs.value ?? "";
        el.parent = stack[stack.length - 1]!;
        stack[stack.length - 1]!.children.push(el);
        if (!m[4] && !voidTags.has(tag.toLowerCase())) stack.push(el);
      } else if (m[5]) {
        const t = m[5]!.trim();
        if (t) stack[stack.length - 1]!.text += t;
      }
    }
  }
  appendChild(c: El): El {
    if (c.parent) c.parent.children = c.parent.children.filter((x) => x !== c);
    c.parent = this;
    this.children.push(c);
    return c;
  }
  contains(c: El): boolean {
    for (let n: El | null = c; n; n = n.parent) if (n === this) return true;
    return false;
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this);
  }
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  getAttribute(k: string): string | null {
    return this.attrs[k] ?? null;
  }
  addEventListener(type: string, fn: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn));
  }
  dispatch(type: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn({ type, target: this });
  }
  click(): void {
    this.dispatch("click");
  }
  requestFullscreen(): void {}
  private matches(sel: string): boolean {
    const attr = sel.match(/^\[([a-z-]+)="([^"]*)"\]$/);
    if (attr) return this.attrs[attr[1]!] === attr[2];
    if (sel.startsWith(".")) return this.classes.has(sel.slice(1));
    if (sel.startsWith("#")) return this.attrs.id === sel.slice(1);
    return this.tag === sel.toLowerCase();
  }
  querySelectorAll(selector: string): El[] {
    const parts = selector.trim().split(/\s+/);
    let scope: El[] = [this];
    for (const part of parts) {
      const next: El[] = [];
      const walk = (n: El) => {
        for (const c of n.children) {
          if (!(c instanceof El)) continue;
          if (c.matches(part)) next.push(c);
          walk(c);
        }
      };
      for (const s of scope) walk(s);
      scope = next;
    }
    return scope;
  }
  querySelector<T = El>(selector: string): T | null {
    return (this.querySelectorAll(selector)[0] as unknown as T) ?? null;
  }
}

export function installDom(): { document: any; window: any } {
  const body = new El("body");
  const head = new El("head");
  const stage = new El("div");
  stage.attrs.id = "stage";
  body.appendChild(stage);
  const document = {
    body,
    head,
    createElement: (tag: string) => (tag === "canvas" ? new FakeCanvas() : new El(tag)),
    querySelector: (sel: string) => body.querySelector(sel),
    addEventListener() {},
  };
  const winListeners = new Map<string, Listener[]>();
  const window: any = {
    devicePixelRatio: 1,
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: (t: string, fn: Listener) => {
      if (!winListeners.has(t)) winListeners.set(t, []);
      winListeners.get(t)!.push(fn);
    },
    removeEventListener() {},
    emit: (t: string, e: any) => (winListeners.get(t) ?? []).forEach((f) => f(e)),
  };
  (globalThis as any).document = document;
  (globalThis as any).window = window;
  return { document, window };
}
