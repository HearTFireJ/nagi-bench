/**
 * DOM layers over the canvas: title cards, location captions, the scope mask and
 * a large play button for the first frame. Subtitles are NOT here; they come
 * from the player's controls, driven by the voice manifest.
 */
export interface Overlay {
  root: HTMLElement;
  title(main: string, sub: string, opacity: number): void;
  caption(text: string, opacity: number): void;
  scope(on: boolean, drift?: [number, number]): void;
  card(lines: string[], opacity: number): void;
  hidePlayHint(): void;
  showPlayHint(): void;
}

export function mountOverlay(container: HTMLElement, onPlay: () => void): Overlay {
  const root = document.createElement("div");
  root.className = "film-overlay";
  root.innerHTML = `
    <style>
      .film-overlay{position:absolute;inset:0;pointer-events:none;z-index:15;font-family:"Noto Serif CJK SC","Source Han Serif SC","Songti SC","SimSun",serif;color:#efe9dc}
      .film-title{position:absolute;left:0;right:0;top:34%;text-align:center;opacity:0;letter-spacing:.35em}
      .film-title h1{margin:0;font-size:clamp(40px,7vw,104px);font-weight:500;text-shadow:0 0 30px #000,0 2px 6px #000}
      .film-title p{margin:.6em 0 0;font-size:clamp(14px,1.5vw,22px);letter-spacing:.5em;opacity:.85}
      .film-caption{position:absolute;left:5%;bottom:20%;font-size:clamp(14px,1.4vw,20px);letter-spacing:.25em;opacity:0;text-shadow:0 1px 4px #000}
      .film-caption::before{content:"";display:inline-block;width:2.2em;height:1px;background:#efe9dc;vertical-align:middle;margin-right:1em;opacity:.7}
      .film-scope{position:absolute;inset:0;display:none;background:radial-gradient(circle at 50% 50%,transparent 0,transparent 33vmin,rgba(0,0,0,.94) 34.5vmin,#000 100%)}
      .film-scope .ret{position:absolute;left:50%;top:50%;width:70vmin;height:70vmin;transform:translate(-50%,-50%);border-radius:50%;box-shadow:inset 0 0 0 2px #0a0a0a,inset 0 0 60px rgba(0,0,0,.9)}
      .film-scope .h,.film-scope .v{position:absolute;left:50%;top:50%;background:#0d0d0d;transform:translate(-50%,-50%)}
      .film-scope .h{width:70vmin;height:1.5px}.film-scope .v{height:70vmin;width:1.5px}
      .film-scope .tick{position:absolute;left:50%;top:50%;width:6vmin;height:2px;background:#0d0d0d;transform-origin:0 50%}
      .film-scope .num{position:absolute;left:50%;bottom:14%;transform:translateX(-50%);font-family:ui-monospace,monospace;font-size:clamp(11px,1.2vw,16px);color:#b7c4a0;letter-spacing:.2em;opacity:.8}
      .film-card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0;gap:.9em}
      .film-card div{font-size:clamp(14px,1.7vw,26px);letter-spacing:.3em;text-shadow:0 1px 4px #000}
      .film-card div:first-child{font-size:clamp(28px,4vw,60px);letter-spacing:.4em;margin-bottom:.4em}
      .film-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:auto;width:110px;height:110px;border-radius:50%;border:2px solid rgba(255,255,255,.55);background:rgba(0,0,0,.35);color:#fff;font-size:44px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);transition:opacity .3s ease,transform .3s ease}
      .film-play:hover{transform:translate(-50%,-50%) scale(1.06);background:rgba(0,0,0,.5)}
      .film-play span{margin-left:8px}
      .film-play-label{position:absolute;left:50%;top:calc(50% + 80px);transform:translateX(-50%);font-size:14px;letter-spacing:.4em;opacity:.8}
      .film-hidden{opacity:0 !important;pointer-events:none !important}
    </style>
    <div class="film-title"><h1></h1><p></p></div>
    <div class="film-caption"></div>
    <div class="film-scope"><div class="ret"></div><div class="h"></div><div class="v"></div>
      <div class="tick" style="transform:rotate(45deg)"></div><div class="tick" style="transform:rotate(135deg)"></div>
      <div class="tick" style="transform:rotate(225deg)"></div><div class="tick" style="transform:rotate(315deg)"></div>
      <div class="num">RNG 4600 · MAG ×12 · Δv 0.00</div></div>
    <div class="film-card"></div>
    <button class="film-play" type="button" aria-label="播放"><span>▶</span></button>
    <div class="film-play-label">点击播放 · 陨石雨</div>
  `;
  container.appendChild(root);
  const title = root.querySelector<HTMLElement>(".film-title")!;
  const h1 = title.querySelector("h1")!;
  const p = title.querySelector("p")!;
  const caption = root.querySelector<HTMLElement>(".film-caption")!;
  const scope = root.querySelector<HTMLElement>(".film-scope")!;
  const card = root.querySelector<HTMLElement>(".film-card")!;
  const play = root.querySelector<HTMLButtonElement>(".film-play")!;
  const playLabel = root.querySelector<HTMLElement>(".film-play-label")!;
  play.addEventListener("click", () => onPlay());

  let lastTitle = "", lastCard = "";
  return {
    root,
    title(main, sub, opacity) {
      const key = main + "|" + sub;
      if (main && key !== lastTitle) { h1.textContent = main; p.textContent = sub; lastTitle = key; }
      title.style.opacity = String(opacity);
    },
    caption(text, opacity) {
      if (text && caption.textContent !== text) caption.textContent = text;
      caption.style.opacity = String(opacity);
    },
    scope(on, drift) {
      scope.style.display = on ? "block" : "none";
      if (on && drift) scope.style.transform = `translate(${drift[0]}px, ${drift[1]}px)`;
    },
    card(lines, opacity) {
      const key = lines.join("\n");
      if (lines.length && key !== lastCard) { card.innerHTML = lines.map((l) => `<div>${l}</div>`).join(""); lastCard = key; }
      card.style.opacity = String(opacity);
    },
    hidePlayHint() { play.classList.add("film-hidden"); playLabel.classList.add("film-hidden"); },
    showPlayHint() { play.classList.remove("film-hidden"); playLabel.classList.remove("film-hidden"); },
  };
}
