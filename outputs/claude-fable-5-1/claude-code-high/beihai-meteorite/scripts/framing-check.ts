/**
 * Framing audit: for each shot, project its intended subject into the camera at
 * a sample time and report normalised device coordinates plus the apparent
 * height of a figure. Catches subjects behind the camera or out of frame.
 */
import * as THREE from "three";
import "./dom-stubs";
import { FakeElement } from "./dom-stubs";

const { buildFilm, poseGroup, seedInteriorParticles } = await import("../src/film");
const { makeShots, FILM_DURATION } = await import("../src/shots");
const { voiceCues } = await import("../src/voice");
const { soundCues } = await import("../src/sound");
const { CinematicPlayer } = await import("@agentbench/cinematic-player");
const { GROUP_CENTER, HATCH, STATION_CENTER } = await import("../src/sets/space");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 400000);
const overlay = { root: new FakeElement("div"), title() {}, caption() {}, scope() {}, card() {}, hidePlayHint() {}, showPlayHint() {} };
const grade = { fade: 0, flash: 0, vignette: 0.55, grain: 0.05, time: 0, warm: 0 };
const film = buildFilm(scene, camera, overlay as any, grade);
seedInteriorParticles(film);
const shots = makeShots(film);
const player = new CinematicPlayer({ duration: FILM_DURATION, context: film, shots, cues: [...voiceCues, ...soundCues] });
player.addTypedEventListener("frame", ({ detail }) => {
  const t = detail.time;
  const set = film.currentSet;
  if (set === "space") { film.sets.space.update(t, camera); poseGroup(film, t); }
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
});

const headOf = (a: { figure: { parts: { head: THREE.Mesh } } }) => a.figure.parts.head.getWorldPosition(new THREE.Vector3());
const feetOf = (a: { root: THREE.Object3D }) => a.root.getWorldPosition(new THREE.Vector3());
const ndc = (p: THREE.Vector3) => {
  const v = p.clone().project(camera);
  const behind = camera.position.distanceTo(p) > 0 && (new THREE.Vector3().subVectors(p, camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) < 0);
  return { x: v.x, y: v.y, behind, dist: camera.position.distanceTo(p) };
};
const figureHeight = (a: { figure: { parts: { head: THREE.Mesh } }; root: THREE.Object3D }) => {
  const h = headOf(a).clone().add(new THREE.Vector3(0, 0.25, 0)).project(camera);
  const f = feetOf(a).project(camera);
  return Math.abs(h.y - f.y) / 2; // fraction of frame height
};

const { zhang, collector, zhangSpace, attendees } = film.cast;
type Probe = [time: number, label: string, point: () => THREE.Vector3, figure?: any];
const probes: Probe[] = [
  [1, "P1 zhang", () => headOf(zhangSpace), zhangSpace],
  [13, "P1 end zhang", () => headOf(zhangSpace), zhangSpace],
  [18, "P2 visor", () => headOf(zhangSpace), zhangSpace],
  [27, "C1 cabinet", () => new THREE.Vector3(-4.3, 1.2, -0.6)],
  [36, "C2 zhang walking", () => headOf(zhang), zhang],
  [36, "C2 collector", () => headOf(collector), collector],
  [45, "C3 zhang", () => headOf(zhang), zhang],
  [45, "C3 collector", () => headOf(collector), collector],
  [65, "C4 zhang cup", () => headOf(zhang), zhang],
  [71, "C5 collector", () => headOf(collector), collector],
  [88.6, "C6 stones", () => film.sets.study.stones[1]!.getWorldPosition(new THREE.Vector3())],
  [87, "C6 collector hand", () => collector.figure.anchors.handR.getWorldPosition(new THREE.Vector3())],
  [92, "C7a zhang", () => headOf(zhang), zhang],
  [92, "C7a collector", () => headOf(collector), collector],
  [99, "C7b zhang face", () => headOf(zhang), zhang],
  [105, "W1 cut point", () => film.sets.workshop.cutPoint.clone()],
  [105, "W1 zhang", () => headOf(zhang), zhang],
  [111, "W1 end cut point", () => film.sets.workshop.cutPoint.clone()],
  [115, "W2 cloth", () => new THREE.Vector3(0.95, 1.02, 0.35)],
  [124, "B1 table", () => new THREE.Vector3(0.1, 0.78, 0.2)],
  [124, "B1 zhang", () => headOf(zhang), zhang],
  [134, "B2 zhang", () => headOf(zhang), zhang],
  [134, "B2 bundle", () => film.sets.basement.bundlePoint.clone()],
  [134, "B2 muzzle", () => film.props.flashGround.group.getWorldPosition(new THREE.Vector3())],
  [146, "B3 fragments", () => film.sets.basement.fragments.getWorldPosition(new THREE.Vector3())],
  [146, "B3 beef", () => film.sets.basement.beef.getWorldPosition(new THREE.Vector3())],
  [156, "S1 station", () => STATION_CENTER.clone()],
  [167, "S2 shelf", () => film.sets.cabin.shelfPoint.clone()],
  [167, "S2 zhang", () => headOf(zhangSpace), zhangSpace],
  [169.6, "S2 zhang walking", () => headOf(zhangSpace), zhangSpace],
  [174, "S3 zhang far", () => headOf(zhangSpace), zhangSpace],
  [181, "S3 zhang near", () => headOf(zhangSpace), zhangSpace],
  [188, "S4a zhang", () => headOf(zhangSpace), zhangSpace],
  [197, "S4b visor", () => headOf(zhangSpace), zhangSpace],
  [203, "S5a hatch", () => HATCH.clone()],
  [211, "S5c attendee0", () => headOf(attendees[0]!), attendees[0]],
  [216, "S6a attendee0", () => headOf(attendees[0]!), attendees[0]],
  [216, "S6a hatch", () => HATCH.clone()],
  [224, "S6b target4", () => headOf(attendees[4]!), attendees[4]],
  [224, "S6b attendee0", () => headOf(attendees[0]!), attendees[0]],
  [224, "S6b attendee9", () => headOf(attendees[9]!), attendees[9]],
  [229, "S7 zhang hand", () => zhangSpace.figure.anchors.handR.getWorldPosition(new THREE.Vector3())],
  [235, "S7 floating scope", () => film.props.scopeFloating.getWorldPosition(new THREE.Vector3())],
  [238, "S7 pistol", () => film.props.pistolSpace.getWorldPosition(new THREE.Vector3())],
  [245, "S8a target4", () => headOf(attendees[4]!), attendees[4]],
  [245, "S8a target3", () => headOf(attendees[3]!), attendees[3]],
  [252, "S8b visor", () => headOf(zhangSpace), zhangSpace],
  [258, "S9 zhang", () => headOf(zhangSpace), zhangSpace],
  [258, "S9 muzzle", () => film.props.flashSpace.group.getWorldPosition(new THREE.Vector3())],
  [262, "S10 far flash", () => new THREE.Vector3(0, 1.5, 0)],
  [262, "S10 attendee 25", () => headOf(attendees[25]!), attendees[25]],
  [265, "S11 zhang", () => headOf(zhangSpace), zhangSpace],
  [265, "S11 station", () => STATION_CENTER.clone()],
  [271, "S12a target4", () => headOf(attendees[4]!), attendees[4]],
  [271, "S12a attendee6", () => headOf(attendees[6]!), attendees[6]],
  [277, "S12b attendee 20", () => headOf(attendees[20]!), attendees[20]],
  [277, "S12b group", () => GROUP_CENTER.clone()],
  [282, "S13a hatch", () => HATCH.clone()],
  [282, "S13a rescuer2", () => headOf(attendees[2]!), attendees[2]],
  [287, "S13b visor", () => headOf(zhangSpace), zhangSpace],
  [292, "S14 zhang", () => headOf(zhangSpace), zhangSpace],
  [305, "S14 zhang far", () => headOf(zhangSpace), zhangSpace],
  [313, "X1 collector", () => headOf(collector), collector],
];

let bad = 0;
for (const [t, label, pt, fig] of probes) {
  player.seek(t);
  scene.updateMatrixWorld(true);
  const p = pt();
  const n = ndc(p);
  const h = fig ? figureHeight(fig) : NaN;
  const vis = fig ? fig.root.visible && (fig.root.parent?.visible ?? true) : true;
  const off = n.behind || Math.abs(n.x) > 1 || Math.abs(n.y) > 1;
  if (off || !vis) bad++;
  console.log(`${String(t).padStart(6)}  ${label.padEnd(22)} ndc=(${n.x.toFixed(2).padStart(6)}, ${n.y.toFixed(2).padStart(6)}) dist=${n.dist.toFixed(1).padStart(8)} ${fig ? `h=${(h * 100).toFixed(0)}%`.padEnd(7) : "".padEnd(7)} fov=${camera.fov.toFixed(0)} ${off ? "OFF-SCREEN" : ""}${!vis ? " HIDDEN" : ""}`);
}
console.log(bad ? `${bad} problems` : "framing OK");
