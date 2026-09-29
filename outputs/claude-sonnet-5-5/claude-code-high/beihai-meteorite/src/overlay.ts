import type { Overlay } from "./film/core";

const CSS = `
html,body{margin:0;height:100%;background:#000;overflow:hidden}
#stage{position:fixed;inset:0;background:#000}
#stage canvas{display:block;width:100%;height:100%}
.mr-layer{position:fixed;inset:0;pointer-events:none;z-index:12;font-family:"Noto Serif SC","Source Han Serif SC","Songti SC","STSong","SimSun",serif}
.mr-scope{position:absolute;inset:0;opacity:0;transition:none}
.mr-scope .ring{position:absolute;left:50%;top:50%;width:76vh;height:76vh;transform:translate(-50%,-50%);border-radius:50%;box-shadow:0 0 0 200vmax #000, inset 0 0 12vh 2vh rgba(0,0,0,.65);background:radial-gradient(circle,rgba(120,255,170,.035) 0,rgba(0,0,0,0) 70%)}
.mr-scope svg{position:absolute;left:50%;top:50%;width:76vh;height:76vh;transform:translate(-50%,-50%)}
.mr-lens{position:absolute;inset:0;opacity:0}
.mr-lens .ring{position:absolute;left:50%;top:50%;width:80vh;height:80vh;transform:translate(-50%,-50%);border-radius:50%;box-shadow:0 0 0 200vmax #000, inset 0 0 10vh 3vh rgba(0,0,0,.7);overflow:hidden}
.mr-lens canvas{width:100%;height:100%;image-rendering:pixelated;display:block}
.mr-bars::before,.mr-bars::after{content:"";position:absolute;left:0;right:0;background:#000;height:max(0px,calc((100vh - 100vw / 2.1) / 2))}
.mr-bars::before{top:0}.mr-bars::after{bottom:0}
.mr-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 55%,rgba(0,0,0,.42) 100%)}
.mr-grain{position:absolute;inset:-10%;opacity:.07;background-size:160px 160px;mix-blend-mode:overlay}
.mr-title{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#f2ead8;opacity:0;text-align:center}
.mr-title .main{font-size:13vh;letter-spacing:.42em;padding-left:.42em;font-weight:600;text-shadow:0 0 3vh rgba(255,190,120,.35)}
.mr-title .sub{font-size:2.4vh;letter-spacing:.5em;padding-left:.5em;margin-top:3.5vh;color:#b9ad96}
.mr-title.end .main{font-size:9vh}
.mr-place{position:absolute;left:5vw;top:max(4vh,calc((100vh - 100vw / 2.1) / 2 + 2.6vh));color:#e9dfc8;opacity:0;text-shadow:0 0 1vh #000,0 0 2vh #000}
.mr-place .a{font-size:2.6vh;letter-spacing:.32em}
.mr-place .b{font-size:1.9vh;letter-spacing:.42em;margin-top:.8vh;color:#b7a98c;border-top:1px solid #b7a98c66;padding-top:.7vh;display:inline-block}
.mr-fade{position:absolute;inset:0;background:#000;opacity:0}
.mr-flash{position:absolute;inset:0;background:#fff;opacity:0}
.mr-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:15vh;height:15vh;border-radius:50%;border:2px solid #f2ead8cc;background:#0008;color:#f2ead8;font-size:6vh;display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;z-index:30;backdrop-filter:blur(3px);transition:opacity .3s}
.mr-play:hover{background:#000b}
.mr-play.hide{opacity:0;pointer-events:none}
`;

function craters(canvas: HTMLCanvasElement): void {
  const n = 96;
  canvas.width = n;
  canvas.height = n;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(n, n);
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const holes = Array.from({ length: 34 }, () => ({ x: rnd() * n, y: rnd() * n, r: 2 + rnd() * 5.5 }));
  const worms = Array.from({ length: 5 }, () => ({ x: rnd() * n, y: rnd() * n, a: rnd() * 6 }));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      let v = 96 + Math.floor(rnd() * 28) + Math.floor((Math.sin(x * 0.21) + Math.cos(y * 0.17)) * 8);
      let r = v + 24;
      let gr = v * 0.62 + 30;
      let b = v * 0.44 + 24;
      for (const h of holes) {
        const d = Math.hypot(x - h.x, y - h.y);
        if (d < h.r) {
          const k = d / h.r;
          const shade = k < 0.7 ? 0.28 : 0.6;
          r *= shade;
          gr *= shade;
          b *= shade;
        } else if (d < h.r + 1.2) {
          r *= 1.25;
          gr *= 1.2;
          b *= 1.15;
        }
      }
      for (const w of worms) {
        for (let k = 0; k < 9; k++) {
          const wx = w.x + Math.cos(w.a + k * 0.35) * k * 1.4;
          const wy = w.y + Math.sin(w.a + k * 0.35) * k * 1.4;
          if (Math.hypot(x - wx, y - wy) < 1.15) {
            r = 190;
            gr = 176;
            b = 150;
          }
        }
      }
      img.data[i] = Math.min(255, r);
      img.data[i + 1] = Math.min(255, gr);
      img.data[i + 2] = Math.min(255, b);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

function grainURL(): string {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

export interface OverlayHandle extends Overlay {
  root: HTMLElement;
  playButton: HTMLElement;
  jitter(): void;
}

export function createOverlay(): OverlayHandle {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement("div");
  root.className = "mr-layer";
  root.innerHTML = `
    <div class="mr-scope"><div class="ring"></div>
      <svg viewBox="-100 -100 200 200" xmlns="http://www.w3.org/2000/svg">
        <g stroke="#0a0a0a" fill="none" stroke-linecap="butt">
          <path d="M-98 0H-14M14 0H98M0 -98V-14M0 14V98" stroke-width="0.7" opacity=".85"/>
          <path d="M-98 0H-40M40 0H98M0 -98V-40M0 40V98" stroke-width="2.2"/>
          <circle r="97.5" stroke-width="1.4" stroke="#000"/>
        </g>
        <g stroke="#d83a2a" stroke-width="0.35" fill="none" opacity=".9">
          <circle r="2.2"/><path d="M-6 0H-2.5M2.5 0H6M0 -6V-2.5M0 2.5V6"/>
        </g>
        <g fill="#0a0a0a">${[-30, -20, -10, 10, 20, 30].map((v) => `<circle cx="${v}" cy="0" r="0.9"/><circle cx="0" cy="${v}" r="0.9"/>`).join("")}</g>
      </svg>
    </div>
    <div class="mr-lens"><div class="ring"><canvas></canvas></div></div>
    <div class="mr-vignette"></div>
    <div class="mr-grain"></div>
    <div class="mr-bars" style="position:absolute;inset:0"></div>
    <div class="mr-place"><div class="a"></div><div class="b"></div></div>
    <div class="mr-title"><div class="main"></div><div class="sub"></div></div>
    <div class="mr-fade"></div>
    <div class="mr-flash"></div>`;
  document.body.appendChild(root);
  craters(root.querySelector<HTMLCanvasElement>(".mr-lens canvas")!);
  const grain = root.querySelector<HTMLElement>(".mr-grain")!;
  grain.style.backgroundImage = `url(${grainURL()})`;
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const scope = q(".mr-scope");
  const lens = q(".mr-lens");
  const title = q(".mr-title");
  const place = q(".mr-place");
  const fade = q(".mr-fade");
  const flash = q(".mr-flash");
  const playButton = document.createElement("button");
  playButton.className = "mr-play";
  playButton.setAttribute("aria-label", "播放");
  playButton.textContent = "▶";
  document.body.appendChild(playButton);
  let last = "";
  return {
    root,
    playButton,
    scope(alpha) {
      scope.style.opacity = String(alpha);
    },
    lens(alpha) {
      lens.style.opacity = String(alpha);
    },
    title(kind, text, sub, alpha) {
      const key = `${kind}|${text}|${sub}`;
      if (key !== last) {
        last = key;
        if (kind === "place") {
          place.querySelector(".a")!.textContent = text;
          place.querySelector(".b")!.textContent = sub;
          (place.querySelector(".b") as HTMLElement).style.display = sub ? "inline-block" : "none";
        } else {
          title.className = `mr-title ${kind === "end" ? "end" : ""}`;
          title.querySelector(".main")!.textContent = text;
          title.querySelector(".sub")!.textContent = sub;
        }
      }
      title.style.opacity = kind === "title" || kind === "end" ? String(alpha) : "0";
      place.style.opacity = kind === "place" ? String(alpha) : "0";
    },
    fade(alpha) {
      fade.style.opacity = String(alpha);
    },
    flash(alpha) {
      flash.style.opacity = String(alpha);
    },
    jitter() {
      grain.style.transform = `translate(${(Math.random() * 8 - 4).toFixed(1)}%, ${(Math.random() * 8 - 4).toFixed(1)}%)`;
    },
  };
}
