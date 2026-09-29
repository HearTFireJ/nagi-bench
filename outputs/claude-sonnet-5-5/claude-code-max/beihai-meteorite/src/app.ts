// 应用装配：先画出“载入中”的舞台 → 装配影片 → 渲染器/舞台 → 声音 → 预热（画布隐藏）→ 挂载控制条与标题 → 开始/重播。
//  · 一个主 CinematicPlayer（时长 352 秒，≤ 360），镜头/字幕/音效全部由它的时间轴驱动；
//  · 语音清单 voiceCues 是唯一来源，字幕由 mountCinematicControls 直接读取并渲染为「【说话者】文本」；
//  · Web Audio 只在用户点击“播放”的手势里解锁；第一帧在开播前就已渲染（海报式的片头）。
import { ThreeStage, mountCinematicControls } from "@agentbench/cinematic-player";
import { buildFilm, ASPECT } from "./film/build";
import { TOTAL } from "./film/timing";
import { FilmAudio, createCueGate } from "./sound/engine";
import type { FilmRenderer } from "./film/types";
import { mountTitles, posterTitle } from "./ui/titles";

/** 应用需要的“渲染器”最小接口：THREE.WebGLRenderer 满足它；无头自检脚本用软渲染器实现它 */
export interface GLRenderer extends FilmRenderer {
  domElement: HTMLCanvasElement;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

export interface BootstrapOptions {
  /** 挂载点（全屏、position: relative） */
  root: HTMLElement;
  createRenderer: () => GLRenderer;
  maxPixelRatio?: number;
  /** 预热的时间步长（秒） */
  warmStep?: number;
}

export interface AppHandle {
  player: ReturnType<typeof buildFilm>["player"];
  film: ReturnType<typeof buildFilm>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  audio: FilmAudio<any>;
  /** 预热完成、可以播放 */
  ready: Promise<void>;
}

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

export async function bootstrap(opts: BootstrapOptions): Promise<AppHandle> {
  const app = opts.root;

  const fatal = (message: string): void => {
    const el = document.createElement("div");
    el.className = "fatal";
    el.textContent = message;
    app.appendChild(el);
  };

  // ---------- 1. 先把舞台与“载入中”画出来（影片装配会占用主线程几秒）----------
  const stageEl = document.createElement("div");
  stageEl.className = "stage";
  app.appendChild(stageEl);

  const start = document.createElement("div");
  start.className = "start loading";
  start.innerHTML = `
    <button class="btn" type="button" aria-label="播放">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5v17l14-8.5z"/></svg>
    </button>
    <div class="hint"><span class="label">载入中…</span><small>建议佩戴耳机 · 全片约 5 分 52 秒</small></div>
    <div class="bar"><i></i></div>`;
  stageEl.appendChild(start);
  const label = start.querySelector<HTMLElement>(".label")!;
  const barFill = start.querySelector<HTMLElement>(".bar i")!;
  const btn = start.querySelector<HTMLButtonElement>(".btn")!;
  await nextFrame();
  await nextFrame();

  // ---------- 2. 渲染器 ----------
  let renderer: GLRenderer;
  try {
    renderer = opts.createRenderer();
  } catch (e) {
    fatal("无法创建 WebGL 画布：请使用支持 WebGL 的现代浏览器。");
    throw e;
  }

  // ---------- 3. 影片 ----------
  const film = buildFilm();
  const { player } = film;

  // ThreeStage 只认“renderer-like”：这里把 render 转发给影片自己的三段式渲染；
  // 尺寸变化时（暂停中也一样）排一次重绘，避免画面被清空。
  let refreshQueued = false;
  const queueRefresh = (): void => {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      player.refresh();
    });
  };
  const stage = new ThreeStage({
    player,
    renderer: {
      domElement: renderer.domElement,
      setSize: (w, h, updateStyle) => {
        renderer.setSize(w, h, updateStyle);
        queueRefresh();
      },
      setPixelRatio: (ratio) => renderer.setPixelRatio(ratio),
      render: () => film.renderFrame(renderer),
      dispose: () => renderer.dispose(),
    },
    scene: null,
    camera: () => film.ctx.camera,
    container: stageEl,
    maxPixelRatio: opts.maxPixelRatio ?? 1.5,
  });
  // 画布放在“开始”遮罩下面（ThreeStage 是把它追加到容器末尾的）
  stageEl.insertBefore(renderer.domElement, stageEl.firstChild);

  // 海报：第一帧渲染好后立刻截一张（连同片头标题），作为“载入中”时的背景——
  // 预热要反复跳转时间轴，所以预热期间画布是隐藏的。
  await nextFrame();
  let poster: HTMLElement | null = null;
  let posterTitleEl: HTMLElement | null = null;
  try {
    const url = renderer.domElement.toDataURL("image/jpeg", 0.88);
    if (url.startsWith("data:image")) {
      const img = document.createElement("img");
      img.className = "poster";
      img.alt = "";
      img.src = url;
      stageEl.insertBefore(img, start);
      poster = img;
      posterTitleEl = posterTitle(stageEl, start);
    }
  } catch {
    // 拿不到画布内容就算了：载入期间显示黑底
  }

  // ---------- 4. 声音（在监听器顺序上，门控必须先于总线）----------
  const gate = createCueGate(player);
  const audio = new FilmAudio(player, gate);

  // ---------- 4b. 开始 / 重播 ----------
  let canPlay = false;
  let started = false;
  let pendingPlay = false;

  /**
   * 与控制条里的“播放”同一条路径：先在手势里解锁音频，再播放。
   * 如果在载入/预热期间被点击（例如脚本触发的 click），先记下意图并立刻在这次手势里解锁音频，
   * 预热完成后自动开始播放。
   */
  const playFromGesture = async (): Promise<void> => {
    if (!canPlay) {
      pendingPlay = true;
      label.textContent = "载入完成后自动播放…";
      audio.unlock().catch((e) => console.warn("音频解锁失败，将静音播放：", e));
      return;
    }
    try {
      await audio.unlock();
    } catch (e) {
      console.warn("音频解锁失败，将静音播放：", e);
    }
    started = true;
    player.play();
  };
  const togglePlay = async (): Promise<void> => {
    if (player.isPlaying) player.pause();
    else await playFromGesture();
  };

  btn.addEventListener("click", () => void playFromGesture());
  start.addEventListener("click", (e) => {
    if (e.target === start) void playFromGesture();
  });

  const syncOverlay = (): void => {
    const s = player.state;
    if (s === "playing") {
      start.classList.add("hidden");
    } else if (s === "ended") {
      label.textContent = "重播";
      start.classList.remove("hidden");
    } else if (!started) {
      start.classList.remove("hidden");
    } else {
      start.classList.add("hidden");
    }
  };
  player.addTypedEventListener("statechange", syncOverlay);

  // 键盘：空格 播放/暂停；←/→ 跳 5 秒；F 全屏
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      void togglePlay();
    } else if (!canPlay) {
      return;
    } else if (e.code === "ArrowRight") {
      player.seek(Math.min(TOTAL, player.currentTime + 5));
    } else if (e.code === "ArrowLeft") {
      player.seek(Math.max(0, player.currentTime - 5));
    } else if (e.code === "KeyF") {
      void app.requestFullscreen?.();
    }
  });
  // 切到后台时暂停（避免声音与时间轴脱节）
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && player.isPlaying) player.pause();
  });

  // ---------- 5. 预热：逐段渲染一遍所有世界，让着色器/纹理在开播前就编译好 ----------
  // 预热期间画布隐藏、控制条与标题尚未挂载：外界既看不到乱跳的画面，也没有可点的播放键去和预热抢时间轴。
  stageEl.classList.add("warm");
  start.classList.add("warming");
  const parts: { controls?: ReturnType<typeof mountCinematicControls>; titles?: () => void } = {};
  const ready = (async () => {
    const warm: number[] = [];
    for (let t = 1; t < TOTAL - 1; t += opts.warmStep ?? 7.5) warm.push(t);
    warm.push(347.5);
    for (let i = 0; i < warm.length; i++) {
      player.seek(warm[i]);
      barFill.style.width = `${Math.round(((i + 1) / warm.length) * 100)}%`;
      await nextFrame();
    }
    player.seek(0);
    // ---------- 6. 控制条 + 字幕 + 标题（此时才挂载）----------
    parts.controls = mountCinematicControls({ player, audio, container: app });
    parts.titles = mountTitles(stageEl, player);
    stageEl.classList.remove("warm");
    poster?.remove();
    posterTitleEl?.remove();
    await nextFrame();
    canPlay = true;
    start.classList.remove("loading");
    start.classList.remove("warming");
    label.textContent = "点击播放";
    syncOverlay();
    if (pendingPlay) {
      pendingPlay = false;
      started = true;
      player.play();
    }
  })();

  const handle: AppHandle = { player, film, audio, ready };
  (globalThis as unknown as { __film?: unknown }).__film = { ...handle, stage, parts, ASPECT };
  return handle;
}
