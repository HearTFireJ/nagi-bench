import * as THREE from "three";
import { ThreeStage, WebAudioCueBus, mountCinematicControls } from "@agentbench/cinematic-player";
import { createFilm } from "./film";
import { createOverlay } from "./overlay";
import { audioFiles } from "./audiofiles";
import { installAudio, soundCues } from "./sound";

const container = document.querySelector<HTMLElement>("#stage")!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;

const overlay = createOverlay();
const film = createFilm(overlay, soundCues, renderer);
const { player, ctx } = film;

const stage = new ThreeStage({
  player,
  renderer: renderer as unknown as ConstructorParameters<typeof ThreeStage>[0]["renderer"],
  scene: ctx.scene,
  camera: () => ctx.camera,
  container,
  maxPixelRatio: 1.75,
});

const audio = new WebAudioCueBus(player);
installAudio(audio, audioFiles);
const controls = mountCinematicControls({ player, audio });

// compile every shader variant up front so no scene change ever stalls playback
for (const t of [0, 12, 30, 60, 100, 122, 132, 158, 178, 190, 205, 222, 250, 290, 300, 312, 340]) player.seek(t);
player.seek(0);

// the big play button is just a friendlier handle on the transport's own control
const playControl = controls.root.querySelector<HTMLButtonElement>('[data-action="play"]')!;
overlay.playButton.addEventListener("click", () => playControl.click());
player.addTypedEventListener("statechange", ({ detail }) => {
  overlay.playButton.classList.toggle("hide", detail.state === "playing");
  overlay.playButton.textContent = detail.state === "ended" ? "↻" : "▶";
});
player.addTypedEventListener("frame", () => overlay.jitter());

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    playControl.click();
  } else if (e.code === "ArrowRight") player.seek(Math.min(player.duration, player.currentTime + 5));
  else if (e.code === "ArrowLeft") player.seek(Math.max(0, player.currentTime - 5));
});

// handles for inspection
Object.assign(window, { film: { player, audio, stage, voice: film.cues } });
