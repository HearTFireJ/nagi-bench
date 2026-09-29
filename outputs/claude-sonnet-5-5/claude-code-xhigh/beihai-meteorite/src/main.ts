import * as THREE from "three";
import { ThreeStage, mountCinematicControls, type ThreeRendererLike, type ThreeStageOptions } from "@agentbench/cinematic-player";
import "./style.css";
import { createFilm } from "./film";
import { createSoundDesign } from "./audio/engine";
import { mountOverlay } from "./overlay";
import type { Ctx } from "./direction/ctx";

/**
 * 《陨石雨》 — a procedural voxel short film.
 * The player owns time; every frame below is derived from that one clock.
 */
function boot(): void {
  const container = document.getElementById("stage");
  if (!container) throw new Error("#stage missing");

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 1);

  const film = createFilm(renderer);
  const stageOptions: ThreeStageOptions<Ctx> = {
    player: film.player,
    renderer: renderer as unknown as ThreeRendererLike,
    scene: film.scene,
    camera: () => film.camera,
    container,
    maxPixelRatio: 1.5,
  };
  const stage = new ThreeStage(stageOptions);
  const audio = createSoundDesign(film.player);
  const overlay = mountOverlay(container, film.player);
  const controls = mountCinematicControls({ player: film.player, audio, container });

  // Quality governor: if the machine cannot keep up while playing, trade pixels (then shadows)
  // for smoothness, so the timeline never crawls. The film's look is otherwise untouched.
  let level = 0;
  let last = performance.now();
  const dts: number[] = [];
  const degrade = (): void => {
    level++;
    if (level === 1) stageOptions.maxPixelRatio = 1;
    else {
      stageOptions.maxPixelRatio = 0.8;
      renderer.shadowMap.enabled = false;
      film.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
        else if (m) m.needsUpdate = true;
      });
    }
    stage.resize();
  };
  film.player.addTypedEventListener("frame", () => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    if (!film.player.isPlaying || dt > 400) {
      dts.length = 0;
      return;
    }
    dts.push(dt);
    if (dts.length > 50) dts.shift();
    if (level < 2 && dts.length === 50 && dts.reduce((a, b) => a + b, 0) / dts.length > 52) {
      degrade();
      dts.length = 0;
    }
  });

  // Handy for inspection from the console: window.film.player.seek(240)
  (window as unknown as { film: unknown }).film = film;
  window.addEventListener("beforeunload", () => {
    controls.destroy();
    overlay.destroy();
    stage.destroy(true);
    audio.destroy();
  });
}

// Building the world takes a couple of seconds of synchronous work: paint a line first.
const host = document.getElementById("stage");
if (host) host.innerHTML = '<div class="loading">陨石雨 · 载入中……</div>';
requestAnimationFrame(() => {
  setTimeout(() => {
    try {
      boot();
      host?.querySelector(".loading")?.remove();
    } catch (error) {
      if (host) host.textContent = `启动失败：${(error as Error).message}`;
      throw error;
    }
  }, 30);
});
