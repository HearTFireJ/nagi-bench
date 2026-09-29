// 生产包冒烟测试（Bun）：直接执行 `bun run build` 产出的 dist/assets/*.js，
// 用迷你 DOM + 模拟 AudioContext + “假 WebGL2”（什么都成功、什么都不画），让**真实的 three.js WebGLRenderer**
// 在构建后的包里把整片渲染一遍（每 0.25 秒一帧）。它能发现：模块初始化/循环依赖问题、打包后的运行时异常、
// 场景/材质设置在 three 渲染路径里引起的 JS 异常。它不能验证：着色器在真实 GPU 上是否编译、画面是否正确。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MiniEvent, MiniNode, pump, audioStats, bodyNode } from "./minidom";
import { glStats } from "./fakegl";

(globalThis as unknown as { __fakeGL: boolean }).__fakeGL = true;

const errors: string[] = [];
const origErr = console.error;
const origWarn = console.warn;
console.error = (...a: unknown[]) => {
  errors.push("console.error: " + a.map(String).join(" ").slice(0, 300));
  origErr(...a);
};
console.warn = (...a: unknown[]) => {
  errors.push("console.warn: " + a.map(String).join(" ").slice(0, 300));
  origWarn(...a);
};
process.on("uncaughtException", (e) => errors.push("uncaught: " + String(e).slice(0, 300)));
process.on("unhandledRejection", (e) => errors.push("unhandledRejection: " + String(e).slice(0, 300)));

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = ""): void => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${extra ? "  — " + extra : ""}`);
};
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

async function main(): Promise<void> {
  const html = fs.readFileSync("dist/index.html", "utf-8");
  const m = /src="\.\/(assets\/[^"]+\.js)"/.exec(html);
  if (!m) throw new Error("dist/index.html 里找不到入口脚本");
  const css = /href="\.\/(assets\/[^"]+\.css)"/.exec(html);
  check("dist/index.html 引用本地 assets（相对路径）", !!m && !!css, `${m[1]} ${css?.[1] ?? ""}`);

  const root = new MiniNode("div");
  root.attrs.id = "app";
  bodyNode.appendChild(root);

  const t0 = performance.now();
  await import(pathToFileURL(path.resolve("dist", m[1])).href);
  console.log("   包加载并执行入口 ms", (performance.now() - t0).toFixed(0));

  // 等待“载入中”→ 可播放
  const start = root.querySelector<MiniNode>(".start");
  check("入口执行后立即画出舞台与开始遮罩", !!start);
  let n = 0;
  while (start && start.classList.contains("loading") && n++ < 4000) {
    pump(1 / 60);
    await tick();
  }
  check("预热完成（真实 three 渲染 + 假 GL）", !!start && !start.classList.contains("loading"), `pump 次数=${n}`);
  check("预热期间没有异常", errors.length === 0, errors.slice(0, 2).join(" | "));

  const F = (globalThis as unknown as { __film: { player: import("@agentbench/cinematic-player").CinematicPlayer<unknown> } }).__film;
  const player = F.player;
  check("时长 ≤ 360", player.duration <= 360, `${player.duration}`);
  check("画布在舞台里", root.querySelector<MiniNode>("canvas") !== null);
  const seekEl = root.querySelector<MiniNode>('[data-action="seek"]');
  const playBtn = root.querySelector<MiniNode>('[data-action="play"]');
  const timeEl = root.querySelector<MiniNode>(".ab-cinematic-time");
  const subEl = root.querySelector<MiniNode>(".ab-cinematic-subtitle");
  check("控制条已挂载", !!seekEl && !!playBtn && !!timeEl && !!subEl);

  console.log("== 点击播放 ==");
  root.querySelector<MiniNode>(".start .btn")!.dispatchEvent(new MiniEvent("click"));
  await tick();
  await tick();
  check("播放中", player.state === "playing");
  const r0 = performance.now();
  for (let i = 0; i < 180; i++) {
    pump(1 / 60);
    await Promise.resolve();
  }
  await tick();
  console.log("   3 秒（180 帧）真实 three 渲染耗时 ms", (performance.now() - r0).toFixed(0));
  check("时间轴连续前进（约 3 秒）", player.currentTime > 2.5 && player.currentTime < 3.5, player.currentTime.toFixed(2));
  check("字幕为「【说话者】文本」", /^【章北海】/.test(subEl!.textContent), subEl!.textContent);
  check("音频只在点击手势里解锁", audioStats.contexts === 1);

  console.log("== 暂停 / 跳转 ==");
  playBtn!.dispatchEvent(new MiniEvent("click"));
  await tick();
  await tick();
  check("暂停", player.state === "paused");
  seekEl!.value = "250";
  seekEl!.dispatchEvent(new MiniEvent("input"));
  check("跳转到 250 秒", Math.abs(player.currentTime - 250) < 1e-6);
  playBtn!.dispatchEvent(new MiniEvent("click"));
  await tick();
  await tick();
  for (let i = 0; i < 60; i++) {
    pump(1 / 60);
    await Promise.resolve();
  }
  check("从 250 秒继续前进", player.state === "playing" && player.currentTime > 250.5, player.currentTime.toFixed(2));

  console.log("== 整片（0.25 秒一帧）真实 three 渲染 ==");
  player.seek(0);
  const f0 = performance.now();
  let frames = 0;
  while (player.state === "playing" && frames < 3000) {
    pump(0.25);
    frames++;
    if (frames % 8 === 0) await Promise.resolve();
  }
  await tick();
  console.log("   帧数", frames, "耗时 ms", (performance.now() - f0).toFixed(0));
  check("播放到结尾", player.state === "ended", `${player.state} ${player.currentTime.toFixed(2)}`);

  console.log("   假 GL 收到的调用：", JSON.stringify(glStats));
  check("three 真的执行了绘制（drawElements/Arrays 调用数 > 10000）", (glStats.drawElements ?? 0) + (glStats.drawArrays ?? 0) + (glStats.drawElementsInstanced ?? 0) > 10000);
  check("three 装配了着色器程序（linkProgram > 20）", (glStats.linkProgram ?? 0) > 20, `linkProgram=${glStats.linkProgram ?? 0}`);
  console.log("== 汇总 ==");
  check("没有 console.error / warn / 未捕获异常", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(`通过 ${pass}，失败 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("bundle-smoke crashed:", e);
  process.exit(2);
});
