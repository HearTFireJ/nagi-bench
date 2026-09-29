// 入口：创建 WebGL 渲染器并启动应用（应用装配见 app.ts）。
import "./style.css";
import * as THREE from "three";
import { bootstrap, type GLRenderer } from "./app";

function createRenderer(): GLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false; // 三段式渲染（天穹 → 前景 → 屏内叠层）由 renderFilm 自己清屏
  renderer.setClearColor(0x000000, 1);
  return renderer;
}

const root = document.querySelector<HTMLDivElement>("#app")!;
const showFatal = (e: unknown): void => {
  console.error(e);
  if (root.querySelector(".fatal")) return;
  const el = document.createElement("div");
  el.className = "fatal";
  el.textContent = `影片载入失败：${e instanceof Error ? e.message : String(e)}`;
  root.appendChild(el);
};
bootstrap({ root, createRenderer })
  .then((app) => app.ready)
  .catch(showFatal);
