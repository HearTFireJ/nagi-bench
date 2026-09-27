import * as THREE from "three";
import {
  CinematicPlayer,
  ThreeStage,
  WebAudioCueBus,
  mountCinematicControls,
  validateVoiceCues,
} from "@agentbench/cinematic-player";
import { buildFilm, poseGroup, seedInteriorParticles, type Film } from "./film";
import { makeShots, FILM_DURATION } from "./shots";
import { voiceCues } from "./voice";
import { soundCues, defineSounds } from "./sound";
import { mountOverlay } from "./overlay";
import { createPost } from "./post";
import "./style.css";

const container = document.querySelector<HTMLElement>("#stage")!;

// ----------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", logarithmicDepthBuffer: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 400000);

// ------------------------------------------------------------------ film
const post = createPost(renderer, scene, () => camera);
let controlsPlay: (() => void) | null = null;
const overlay = mountOverlay(container, () => controlsPlay?.());
const film: Film = buildFilm(scene, camera, overlay, post.grade);
seedInteriorParticles(film);

validateVoiceCues(voiceCues, FILM_DURATION);
const shots = makeShots(film);

const player = new CinematicPlayer<Film>({
  duration: FILM_DURATION,
  context: film,
  shots,
  cues: [...voiceCues, ...soundCues],
});

// Runs after every shot update and before the render: set animation, particles, the crowd.
player.addTypedEventListener("frame", ({ detail }) => {
  const t = detail.time;
  post.grade.time = t;
  const set = film.currentSet;
  if (set === "study") film.sets.study.update(t);
  else if (set === "workshop") film.sets.workshop.update(t);
  else if (set === "basement") film.sets.basement.update(t);
  else if (set === "cabin") film.sets.cabin.update(t);
  else if (set === "space") { film.sets.space.update(t, camera); poseGroup(film, t); }
  const hPx = post.size.h * post.size.ratio;
  for (const p of film.particles) { p.setPixelScale(hPx || 1080, camera.fov); p.update(t); }
});

const stage = new ThreeStage({
  player,
  renderer: post.facade,
  scene,
  camera: () => camera,
  container,
  maxPixelRatio: 1.5,
});

const audio = new WebAudioCueBus(player);
defineSounds(audio);
audio.setMasterGain(0.8);
const controls = mountCinematicControls({ player, audio, container });

// The big play button forwards to the transport's own button so the audio
// unlock happens inside the user's gesture.
controlsPlay = () => controls.root.querySelector<HTMLButtonElement>('[data-action="play"]')?.click();
player.addTypedEventListener("statechange", ({ detail }) => {
  if (detail.state === "playing") overlay.hidePlayHint();
  else if (detail.state === "ended") overlay.showPlayHint();
});

// Subtitle typography: the required 【speaker】text form is untouched, only the face changes.
const style = document.createElement("style");
style.textContent = `
  .ab-cinematic-subtitle{font-family:"Noto Serif CJK SC","Source Han Serif SC","Songti SC","SimSun",serif;font-size:clamp(17px,1.9vw,27px);letter-spacing:.06em;color:#f3eee4;bottom:84px}
  .ab-cinematic-transport{border-color:#ffffff1a;background:#05070ac0}
`;
document.head.appendChild(style);

// Debug handle for inspection in the console.
(window as unknown as { film: { player: CinematicPlayer<Film>; stage: ThreeStage<Film>; audio: WebAudioCueBus<Film>; scene: THREE.Scene } }).film = { player, stage, audio, scene };
