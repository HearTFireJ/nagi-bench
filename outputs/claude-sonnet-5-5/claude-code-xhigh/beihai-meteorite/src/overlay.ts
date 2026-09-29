import type { CinematicPlayer } from "@agentbench/cinematic-player";
import { T } from "./timeline";
import { seg, smooth } from "./util/math";

/**
 * Screen-space layer that is not speech: fades to black, the title and end cards,
 * place/time captions, and the optic overlays (rifle scope, microscope eyepiece).
 * `overlayAt(t)` is a pure function of absolute time; `mountOverlay` only paints it.
 */
export type OpticKind = "rifle" | "eye";

/** Filled in by shot definitions (`optic` field) so overlay and camera never disagree. */
export const opticSpans: Array<[number, number, OpticKind]> = [];

export interface OverlayState {
  fade: number;
  title: number;
  endCard: number;
  caption: { text: string; a: number } | null;
  optic: OpticKind | null;
  /** 0..1 how deep into the night the frame is (used for vignette strength). */
  vignette: number;
}

const blackouts: Array<{ t0: number; t1: number; inn: number; out: number }> = [
  { t0: 17.0, t1: 22.4, inn: 0.7, out: 0.5 },
  { t0: 175.2, t1: 176.5, inn: 0.35, out: 0.3 },
  { t0: 316.2, t1: 319.6, inn: 1.6, out: 1.0 },
  { t0: 335.4, t1: 350, inn: 1.4, out: 1.0 },
];

const captions: Array<{ t0: number; t1: number; text: string }> = [
  { t0: 22.6, t1: 26.2, text: "四个月前 · 北京" },
  { t0: 110.5, t1: 113.9, text: "当夜 · 太空军研究所 · 模型车间" },
  { t0: 138.9, t1: 142.4, text: "同夜 · 地下室" },
  { t0: 176.6, t1: 180.4, text: "四个月后 · 同步轨道 · 一号基地" },
  { t0: 214.4, t1: 218.6, text: "同步轨道 · 黄河空间站外 · 十公里" },
];

export function overlayAt(t: number): OverlayState {
  let fade = 0;
  for (const b of blackouts) {
    if (t >= b.t0 && t <= b.t1) {
      fade = Math.max(fade, Math.min(smooth(seg(t, b.t0, b.t0 + b.inn)), 1 - smooth(seg(t, b.t1 - b.out, b.t1))));
    }
  }
  const title = Math.min(smooth(seg(t, 18.0, 18.8)), 1 - smooth(seg(t, 21.2, 22.0)));
  const endCard = Math.min(smooth(seg(t, 338.4, 340.0)), 1 - smooth(seg(t, 343.2, 344)));
  let caption: OverlayState["caption"] = null;
  for (const c of captions) {
    if (t >= c.t0 && t <= c.t1) caption = { text: c.text, a: Math.min(smooth(seg(t, c.t0, c.t0 + 0.4)), 1 - smooth(seg(t, c.t1 - 0.5, c.t1))) };
  }
  let optic: OpticKind | null = null;
  for (const [a, b, k] of opticSpans) if (t >= a && t < b) optic = k;
  return { fade, title: Math.max(0, title), endCard: Math.max(0, endCard), caption, optic, vignette: 0.55 };
}

// ---- DOM binding ------------------------------------------------------------------
const CSS = `
.mv-layer{position:absolute;inset:0;pointer-events:none;z-index:10;overflow:hidden}
.mv-vignette{background:radial-gradient(ellipse at center,rgba(0,0,0,0) 52%,rgba(0,0,0,.55) 100%)}
.mv-grain{opacity:.07;mix-blend-mode:overlay;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>")}
.mv-fade{background:#000;opacity:0;z-index:12}
.mv-caption{position:absolute;left:4.2vw;top:5.5vh;font:600 clamp(13px,1.35vw,20px)/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,"Noto Sans Mono CJK SC","Microsoft YaHei",monospace;letter-spacing:.14em;color:#eae3d0;text-shadow:0 1px 6px #000;opacity:0;border-left:3px solid #e2bd76;padding-left:.8em}
.mv-title{z-index:13;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2.4vh;opacity:0}
.mv-title canvas{width:min(46vw,640px);image-rendering:pixelated}
.mv-title .sub{font:400 clamp(12px,1.2vw,18px)/1.6 "Noto Serif CJK SC","Songti SC",serif;letter-spacing:.5em;color:#a8a08c}
.mv-optic{z-index:11;opacity:0}
.mv-optic svg{position:absolute;inset:0;width:100%;height:100%}
.mv-optic .hud{position:absolute;font:600 clamp(10px,1vw,15px) ui-monospace,Menlo,Consolas,monospace;letter-spacing:.12em;color:#9dffb4;text-shadow:0 0 6px #063}
`;

export interface OverlayHandle {
  destroy(): void;
}

function pixelTitle(text: string, colour: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 84;
  c.height = 30;
  const g = c.getContext("2d")!;
  g.fillStyle = colour;
  g.textBaseline = "middle";
  g.textAlign = "center";
  g.font = `900 25px "Noto Sans CJK SC","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif`;
  g.fillText(text, 42, 16);
  // hard-threshold the anti-aliasing so the letters are made of square pixels
  const img = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = img.data[i + 3]! > 100 ? 255 : 0;
  g.putImageData(img, 0, 0);
  return c;
}

export function mountOverlay<Ctx>(parent: HTMLElement, player: CinematicPlayer<Ctx>): OverlayHandle {
  const style = document.createElement("style");
  style.textContent = CSS;
  const root = document.createElement("div");
  root.className = "mv-layer";
  root.style.zIndex = "10";
  root.append(style);

  const vignette = document.createElement("div");
  vignette.className = "mv-layer mv-vignette";
  const grain = document.createElement("div");
  grain.className = "mv-layer mv-grain";
  const optic = document.createElement("div");
  optic.className = "mv-layer mv-optic";
  optic.innerHTML = `
    <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice">
      <defs>
        <mask id="mv-hole"><rect width="160" height="90" fill="#fff"/><circle cx="80" cy="45" r="41" fill="#000"/></mask>
      </defs>
      <rect width="160" height="90" fill="#000" mask="url(#mv-hole)"/>
      <circle cx="80" cy="45" r="41" fill="none" stroke="#1b1f22" stroke-width="1.2"/>
      <g stroke="#0a0a0a" stroke-width=".28" opacity=".85">
        <line x1="39" y1="45" x2="76" y2="45"/><line x1="84" y1="45" x2="121" y2="45"/>
        <line x1="80" y1="4" x2="80" y2="41"/><line x1="80" y1="49" x2="80" y2="86"/>
      </g>
      <g stroke="#111" stroke-width=".12" opacity=".8">
        <line x1="76" y1="45" x2="84" y2="45"/><line x1="80" y1="41" x2="80" y2="49"/>
      </g>
      <g stroke="#0a0a0a" stroke-width=".22" opacity=".8">
        <line x1="60" y1="43.4" x2="60" y2="46.6"/><line x1="70" y1="43.8" x2="70" y2="46.2"/>
        <line x1="90" y1="43.8" x2="90" y2="46.2"/><line x1="100" y1="43.4" x2="100" y2="46.6"/>
        <line x1="78.4" y1="55" x2="81.6" y2="55"/><line x1="78.8" y1="65" x2="81.2" y2="65"/>
      </g>
    </svg>
    <div class="hud" data-hud="a" style="left:26vw;top:74vh"></div>
    <div class="hud" data-hud="b" style="right:26vw;top:74vh;text-align:right"></div>`;
  const hudA = optic.querySelector<HTMLElement>('[data-hud="a"]')!;
  const hudB = optic.querySelector<HTMLElement>('[data-hud="b"]')!;
  const caption = document.createElement("div");
  caption.className = "mv-caption";
  const title = document.createElement("div");
  title.className = "mv-layer mv-title";
  title.append(pixelTitle("陨石雨", "#f0e6cf"));
  const sub = document.createElement("div");
  sub.className = "sub";
  sub.textContent = "章北海";
  title.append(sub);
  const endCard = document.createElement("div");
  endCard.className = "mv-layer mv-title";
  endCard.append(pixelTitle("陨石雨", "#8d8676"));
  const credit = document.createElement("div");
  credit.className = "sub";
  credit.textContent = "改编自刘慈欣《三体》";
  endCard.append(credit);
  const fade = document.createElement("div");
  fade.className = "mv-layer mv-fade";
  root.append(vignette, grain, optic, caption, title, endCard, fade);
  parent.appendChild(root);

  const paint = (t: number): void => {
    const s = overlayAt(t);
    fade.style.opacity = String(s.fade);
    title.style.opacity = String(s.title);
    endCard.style.opacity = String(s.endCard);
    caption.textContent = s.caption?.text ?? "";
    caption.style.opacity = String(s.caption?.a ?? 0);
    optic.style.opacity = s.optic ? "1" : "0";
    if (s.optic === "rifle") {
      hudA.textContent = "RNG 10 000 m";
      hudB.textContent = "×8";
    } else if (s.optic === "eye") {
      hudA.textContent = "";
      hudB.textContent = "";
    }
  };
  const detach = player.addTypedEventListener("frame", (e) => paint(e.detail.time));
  paint(player.currentTime);
  return { destroy: () => { detach(); root.remove(); } };
}

export { T };
