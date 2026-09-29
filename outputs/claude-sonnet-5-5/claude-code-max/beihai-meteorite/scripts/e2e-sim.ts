// 无头“点击测试”模拟（Bun）：用迷你 DOM + 模拟 AudioContext + 软渲染器，
// 走一遍真实的应用装配 bootstrap()：预热 → 点击“播放” → 时间前进 → 暂停 → 跳转 → 再播放 → 播到结尾 → 重播，
// 并把整片以 0.25 秒一帧“快放”一遍，让每一条音效 cue 的工厂都真正执行一次。
// 说明：这不是浏览器。它不能替代真实浏览器里的 Play/暂停/跳转点击测试与控制台检查，只用来提前发现运行时异常。
import { MiniEvent, MiniNode, pump, audioStats, bodyNode, clock } from "./minidom";
import { SoftRenderer } from "./softrender";
import { bootstrap, type GLRenderer } from "../src/app";
import { soundCues } from "../src/sound/cues";
import { voiceCues } from "../src/voice/voiceCues";

const errors: string[] = [];
const origError = console.error;
const origWarn = console.warn;
console.error = (...a: unknown[]) => {
  errors.push("console.error: " + a.map(String).join(" "));
  origError(...a);
};
console.warn = (...a: unknown[]) => {
  errors.push("console.warn: " + a.map(String).join(" "));
  origWarn(...a);
};
process.on("uncaughtException", (e) => errors.push("uncaught: " + String(e)));
process.on("unhandledRejection", (e) => errors.push("unhandledRejection: " + String(e)));

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = ""): void => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${extra ? "  — " + extra : ""}`);
};

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
async function pumpFor(seconds: number, step = 1 / 60): Promise<void> {
  const n = Math.round(seconds / step);
  for (let i = 0; i < n; i++) {
    pump(step);
    await Promise.resolve();
  }
  await tick();
}
async function pumpUntil(p: Promise<unknown>, max = 5000): Promise<void> {
  let done = false;
  p.then(() => (done = true), () => (done = true));
  for (let i = 0; i < max && !done; i++) {
    pump(1 / 60);
    await tick();
  }
}

// ---- 软渲染器适配（默认关闭渲染，只在需要时打开，避免整片快放太慢）----
const soft = new SoftRenderer({ width: 96, height: 41 });
let renderOn = false;
let renderCalls = 0;
const createRenderer = (): GLRenderer => {
  const canvas = document.createElement("canvas") as unknown as HTMLCanvasElement;
  return {
    domElement: canvas,
    get toneMappingExposure() {
      return soft.toneMappingExposure;
    },
    set toneMappingExposure(v: number) {
      soft.toneMappingExposure = v;
    },
    setClearColor: (c, a) => renderOn && soft.setClearColor(c, a),
    clear: () => renderOn && soft.clear(),
    clearDepth: () => renderOn && soft.clearDepth(),
    render: (scene, camera) => {
      renderCalls++;
      if (renderOn) soft.render(scene, camera);
    },
    setSize: () => undefined,
    setPixelRatio: () => undefined,
    dispose: () => undefined,
  } as unknown as GLRenderer;
};

const click = (n: MiniNode): void => {
  n.dispatchEvent(new MiniEvent("click"));
};

async function main(): Promise<void> {
  console.log("== 载入期间被点击（脚本触发的 click）：预热完成后应自动开始播放 ==");
  {
    const root0 = new MiniNode("div");
    bodyNode.appendChild(root0);
    const boot0 = bootstrap({ root: root0 as unknown as HTMLElement, createRenderer, warmStep: 60 });
    await pumpUntil(boot0);
    const app0 = await boot0;
    click(root0.querySelector<MiniNode>(".start .btn")!);
    await tick();
    check("载入期间点击：不会立刻播放", app0.player.state !== "playing");
    check("载入期间点击：在这次手势里解锁音频", audioStats.contexts === 1);
    await pumpUntil(app0.ready);
    await tick();
    await tick();
    check("预热完成后自动开始播放", app0.player.state === "playing");
    app0.player.pause();
    await tick();
  }
  const ctxBase = audioStats.contexts;

  console.log("== 装配 ==");
  const root = new MiniNode("div");
  root.attrs.id = "app";
  bodyNode.appendChild(root);
  const t0 = performance.now();
  const booting = bootstrap({ root: root as unknown as HTMLElement, createRenderer, warmStep: 30 });
  const start0 = root.querySelector<MiniNode>(".start");
  await pumpUntil(Promise.resolve().then(() => 0), 1);
  check("装配前先画出“载入中”遮罩", !!start0 && start0.classList.contains("loading"));
  await pumpUntil(booting);
  const app = await booting;
  const { player } = app;
  check("载入期间显示海报（第一帧截图）", !!root.querySelector<MiniNode>(".poster"));
  check("装配完成、总时长 ≤ 360 秒", player.duration <= 360, `duration=${player.duration}`);
  check("初始为暂停", player.state === "paused");

  const start = root.querySelector<MiniNode>(".start")!;
  check("开始遮罩存在且处于“载入中”", !!start && start.classList.contains("loading"));
  await pumpUntil(app.ready);
  console.log("   预热耗时 ms", (performance.now() - t0).toFixed(0), " 渲染调用次数", renderCalls);
  check("预热完成后不再是“载入中”", !start.classList.contains("loading"));
  check("就绪后海报已移除、动态标题接管", root.querySelector<MiniNode>(".poster") === null && root.querySelector<MiniNode>(".titles") !== null);
  check("预热完成后回到 t=0", player.currentTime === 0);

  const seekEl = root.querySelector<MiniNode>('[data-action="seek"]')!;
  const timeEl = root.querySelector<MiniNode>(".ab-cinematic-time")!;
  const subEl = root.querySelector<MiniNode>(".ab-cinematic-subtitle")!;
  const playBtn = root.querySelector<MiniNode>('[data-action="play"]')!;
  check("控制条/字幕已挂载", !!seekEl && !!timeEl && !!subEl && !!playBtn);
  check("音频尚未解锁（没有新的 AudioContext）", audioStats.contexts === ctxBase);

  console.log("== 点击“播放” ==");
  renderOn = true;
  click(root.querySelector<MiniNode>(".start .btn")!);
  await tick();
  await tick();
  check("点击后开始播放", player.state === "playing", `state=${player.state}`);
  check("音频只在点击手势里解锁", audioStats.contexts === ctxBase + 1);
  check("采样已解码", audioStats.decoded >= 60, `decoded=${audioStats.decoded}`);
  await pumpFor(3.0);
  const t1 = player.currentTime;
  check("时间轴连续前进（约 3 秒）", t1 > 2.5 && t1 < 3.5, `t=${t1.toFixed(2)}`);
  check("时间码文字同步", timeEl.textContent.startsWith("00:0"), timeEl.textContent);
  check("字幕显示为「【说话者】文本」", /^【章北海】/.test(subEl.textContent), subEl.textContent);
  check("开始遮罩已隐藏", start.classList.contains("hidden"));
  check("正在发声的节点 > 0（呼吸/嗡鸣/配乐）", audioStats.live > 0, `live=${audioStats.live}`);

  console.log("== 暂停 ==");
  click(playBtn);
  await tick();
  await tick();
  check("暂停", player.state === "paused");
  const tp = player.currentTime;
  await pumpFor(1.0);
  check("暂停后时间不再前进", Math.abs(player.currentTime - tp) < 1e-6);
  check("暂停后所有声音都停止", audioStats.live === 0, `live=${audioStats.live}`);

  console.log("== 跳转 ==");
  seekEl.value = "200";
  seekEl.dispatchEvent(new MiniEvent("input"));
  check("跳转到 200 秒（暂停中）", Math.abs(player.currentTime - 200) < 1e-6);
  check("跳转不产生声音", audioStats.live === 0, `live=${audioStats.live}`);
  check("跳转后进度条同步", Number(seekEl.value) === 200);
  click(playBtn);
  await tick();
  await tick();
  await pumpFor(2.0);
  check("从 200 秒继续播放并前进", player.state === "playing" && player.currentTime > 201.5, `t=${player.currentTime.toFixed(2)}`);

  console.log("== 播放中跳转 ==");
  const srcBefore = audioStats.sources;
  seekEl.value = "300";
  seekEl.dispatchEvent(new MiniEvent("input"));
  await tick();
  check("播放中跳转后仍在播放", player.state === "playing" && Math.abs(player.currentTime - 300) < 0.5, `t=${player.currentTime.toFixed(2)}`);
  check("持续型声音（呼吸/嗡鸣/配乐）在新位置自动接上", audioStats.live > 0, `live=${audioStats.live}`);
  check("跳转不会一次性创建大量音源", audioStats.sources - srcBefore < 40, `new sources=${audioStats.sources - srcBefore}`);

  console.log("== 键盘 ==");
  (window as unknown as { dispatch: (e: MiniEvent) => void }).dispatch(new MiniEvent("keydown", { code: "Space" }));
  await tick();
  await tick();
  check("空格暂停", player.state === "paused");
  (window as unknown as { dispatch: (e: MiniEvent) => void }).dispatch(new MiniEvent("keydown", { code: "ArrowRight" }));
  check("→ 快进 5 秒", player.currentTime > 304.5 && player.currentTime < 306.5, `t=${player.currentTime.toFixed(2)}`);

  console.log("== 整片快放（每 0.25 秒一帧）——让所有音效工厂真正执行一遍 ==");
  renderOn = false;
  player.seek(0);
  const startedBefore = audioStats.started;
  const cueSeen = new Set<string>();
  player.addTypedEventListener("cue", (e) => cueSeen.add(e.detail.cue.id));
  player.play();
  await tick();
  let frames = 0;
  const t2 = performance.now();
  while (player.state === "playing" && frames < 3000) {
    pump(0.25);
    frames++;
    if (frames % 4 === 0) await Promise.resolve();
  }
  await tick();
  console.log("   帧数", frames, "耗时 ms", (performance.now() - t2).toFixed(0), " 已启动音源", audioStats.started - startedBefore, " 卷积器", audioStats.convolvers);
  check("整片播放到结尾", player.state === "ended", `state=${player.state} t=${player.currentTime.toFixed(2)}`);
  const sndSeen = [...cueSeen].filter((id) => id.startsWith("snd-")).length;
  check("所有音效 cue 都被触发", sndSeen === soundCues.length, `${sndSeen}/${soundCues.length}`);
  const vSeen = [...cueSeen].filter((id) => id.startsWith("vc-")).length;
  check("所有语音 cue 都被触发（仅字幕）", vSeen === voiceCues.length, `${vSeen}/${voiceCues.length}`);
  check("片尾时没有残留发声节点", audioStats.live === 0, `live=${audioStats.live}`);

  console.log("== 重播 ==");
  check("结束后出现“重播”遮罩", !start.classList.contains("hidden") && start.textContent.includes("重播"));
  click(root.querySelector<MiniNode>(".start .btn")!);
  await tick();
  await tick();
  await pumpFor(1.0);
  check("点击重播后从头开始", player.state === "playing" && player.currentTime > 0.5 && player.currentTime < 2, `t=${player.currentTime.toFixed(2)}`);
  player.pause();

  console.log("== 随机跳转压力（不应抛错、不应遗留声音）==");
  for (let i = 0; i < 300; i++) player.seek(((i * 7919) % 3520) / 10);
  await tick();
  check("跳转压力后没有遗留声音", audioStats.live === 0, `live=${audioStats.live}`);

  console.log("== 汇总 ==");
  check("没有 console.error / warn / 未捕获异常", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(`通过 ${pass}，失败 ${fail}`);
  void clock;
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("e2e-sim crashed:", e);
  process.exit(2);
});
