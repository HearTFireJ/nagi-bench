// 片头与片尾的标题：DOM 叠层，透明度是“播放时间”的纯函数——任意跳转、暂停、重播都一致。
// 片头：开播前（t=0）就可见，作为海报式的第一帧；片尾：黑场里的星空上淡入。
import type { CinematicPlayer } from "@agentbench/cinematic-player";
import { T } from "../film/timing";

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** 淡入淡出：在 [a, d] 内可见，a→b 淡入，c→d 淡出 */
const window4 = (t: number, a: number, b: number, c: number, d: number): number => smooth((t - a) / (b - a)) * (1 - smooth((t - c) / (d - c)));

const OPEN_HTML = `
    <div class="open">
      <h1>陨石雨</h1>
      <p class="sub">改编自刘慈欣《三体》</p>
      <p class="tag">全片由代码生成 · 体素影像</p>
    </div>`;

/** 载入期间的静态片头标题（与 t=0 时的动态标题完全一致），就绪后由调用者移除 */
export function posterTitle(stage: HTMLElement, before?: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  el.className = "titles";
  el.innerHTML = OPEN_HTML;
  stage.insertBefore(el, before ?? null);
  return el;
}

export function mountTitles(stage: HTMLElement, player: CinematicPlayer<any>): () => void {
  const root = document.createElement("div");
  root.className = "titles";
  root.innerHTML = `${OPEN_HTML}
    <div class="end">
      <h1>陨石雨</h1>
      <p class="sub">改编自刘慈欣《三体》</p>
      <p class="credits">Three.js 程序生成的体素影像<br>音效取自 Kenney CC0 音效库</p>
    </div>`;
  stage.appendChild(root);
  const open = root.querySelector<HTMLElement>(".open")!;
  const end = root.querySelector<HTMLElement>(".end")!;

  const update = (t: number): void => {
    // 片头：0 → 4.4 秒保持，之后 2 秒内淡出
    const o = 1 - smooth((t - 4.4) / 2.0);
    open.style.opacity = String(o);
    open.style.transform = `translateY(${(-t * 1.2).toFixed(2)}px)`;
    open.style.visibility = o < 0.003 ? "hidden" : "visible";
    // 片尾：黑场里淡入，末尾淡出
    const e = window4(t, T.end + 1.0, T.end + 2.4, T.end + 4.6, T.end + 5.9);
    end.style.opacity = String(e);
    end.style.visibility = e < 0.003 ? "hidden" : "visible";
  };
  update(player.currentTime);
  const detach = player.addTypedEventListener("frame", (ev) => update(ev.detail.time));
  return () => {
    detach();
    root.remove();
  };
}
