import * as THREE from "three";
import { CinematicPlayer, validateVoiceCues, type Shot } from "@agentbench/cinematic-player";
import { Rig } from "./direction/rig";
import type { Ctx, SetName } from "./direction/ctx";
import { makeCollector, makeCrowd, makeWorkers, makeZhang } from "./art/cast";
import { Fx } from "./art/fx";
import { backpack, scopeMesh, clothBundle, gluetube, knife, magnifier, makePistol, phoneProp, pliers, rock, cameraProp, magazineGeometry } from "./art/props";
import { voxelMaterial } from "@agentbench/voxel-kit";
import { VoxGrid } from "./util/vox";
import { buildSpace } from "./world/space";
import { buildHutong } from "./world/hutong";
import { buildRoom } from "./world/room";
import { buildSnow } from "./world/snow";
import { buildShop } from "./world/shop";
import { buildBasement } from "./world/basement";
import { buildCabin } from "./world/cabin";
import { DURATION, T } from "./timeline";
import { defineShot } from "./direction/ctx";
import { voiceCues } from "./voiceCues";
import { soundCues } from "./audio/soundCues";
import { prologue } from "./seq/prologue";
import { act1a } from "./seq/act1a";
import { act1b } from "./seq/act1b";
import { act2 } from "./seq/act2";
import { makeOrbitals } from "./seq/orbitals";
import { act3a } from "./seq/act3a";
import { act3b } from "./seq/act3b";
import { act3c } from "./seq/act3c";
import { epilogue } from "./seq/epilogue";

export interface Film {
  player: CinematicPlayer<Ctx>;
  ctx: Ctx;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rig: Rig;
}

export function createFilm(renderer?: { toneMappingExposure: number }): Film {
  validateVoiceCues(voiceCues, DURATION);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 6000);
  const rig = new Rig(scene, renderer);

  const w = {
    space: buildSpace(),
    hutong: buildHutong(),
    room: buildRoom(),
    snow: buildSnow(),
    shop: buildShop(),
    basement: buildBasement(),
    cabin: buildCabin(),
  };
  scene.add(w.space.backdrop, w.space.local, w.hutong.group, w.room.group, w.snow.group, w.shop.group, w.basement.group, w.cabin.group);

  const zhang = makeZhang();
  const collector = makeCollector();
  const crowd = makeCrowd(30);
  const workers = makeWorkers(4);
  const all = [zhang, collector, ...crowd.people, ...workers];
  for (const a of all) scene.add(a.root);
  for (const a of [zhang, ...crowd.people, ...workers]) a.fig.anchors.back.add(backpack());

  const pistol = makePistol();
  const o: Record<string, THREE.Object3D> = {};
  const magHand = magnifier(0.11);
  o.magHand = magHand;
  o.heroRock = rock(77, 3.2, "pallasite", 0.3);
  o.stoneHand = rock(31, 4.2, "iron", 0.34);
  o.bundle = clothBundle(0.2);
  o.pliers = pliers(0.3);
  o.glue = gluetube(0.3);
  o.knife = knife(0.3);
  o.camera = cameraProp(0.42);
  o.scopeHand = scopeMesh(0.34);
  o.glove = new VoxGrid(5, 6, 5).box(0, 0, 0, 5, 6, 5, (x, y, z) => (y < 2 ? 0x8d97a3 : 0xdde2e7)).mesh(0.2, voxelMaterial({ roughness: 0.6 }), "center");
  o.toolBit = new VoxGrid(3, 10, 3).box(0, 0, 0, 3, 10, 3, 0xc9ced4).mesh(0.16, voxelMaterial({ roughness: 0.3, metalness: 0.3 }), "center");
  o.dustPile = new VoxGrid(6, 3, 6).box(0, 0, 0, 6, 3, 6, (x, y, z) => (y + Math.abs(x - 2.5) + Math.abs(z - 2.5) > 5 ? null : 0x8f8b86)).mesh(0.14, voxelMaterial({ roughness: 1 }), "center");
  o.bag = new VoxGrid(6, 8, 4).box(0, 0, 0, 6, 8, 4, (x, y, z) => (y > 6 && x % 2 ? 0x8a6a44 : 0xb59a70)).mesh(0.2, voxelMaterial({ roughness: 1 }), "center");
  o.brush = new VoxGrid(2, 2, 10).box(0, 0, 0, 2, 2, 10, (x, y, z) => (z > 6 ? 0xd8c690 : 0x6a4a2c)).mesh(0.16, voxelMaterial({ roughness: 1 }), "center");
  for (const name of ["magA", "magB", "magC"]) {
    const m = new THREE.Mesh(magazineGeometry(0.34), voxelMaterial({ roughness: 0.5, metalness: 0.2 }));
    m.castShadow = true;
    o[name] = m;
  }
  const phone = phoneProp(0.16);
  for (const obj of Object.values(o)) {
    obj.visible = false;
    scene.add(obj);
  }
  phone.group.visible = false;
  scene.add(phone.group, pistol.root);
  pistol.root.visible = false;
  const fx = {
    space: new Fx(w.space.local, 4200),
    shop: new Fx(w.shop.group, 600),
    basement: new Fx(w.basement.group, 400),
    hutong: new Fx(w.hutong.group, 100),
    room: new Fx(w.room.group, 100),
  };

  const groups: Record<SetName, THREE.Object3D[]> = {
    space: [w.space.backdrop, w.space.local],
    sky: [w.space.backdrop],
    hutong: [w.hutong.group],
    room: [w.room.group],
    snow: [w.snow.group],
    shop: [w.shop.group],
    basement: [w.basement.group],
    cabin: [w.cabin.group],
  };
  const everything = new Set<THREE.Object3D>(Object.values(groups).flat());

  const ctx: Ctx = {
    scene, camera, rig, w,
    cast: { zhang, collector, crowd, workers, all },
    props: { pistol, phone, o },
    fx,
    groups,
    use(...sets) {
      const show = new Set<THREE.Object3D>();
      for (const s of sets) for (const o of groups[s]) show.add(o);
      for (const o of everything) o.visible = show.has(o);
    },
    hideActors() {
      for (const a of all) a.root.visible = false;
      for (const obj of Object.values(o)) obj.visible = false;
      pistol.root.visible = false;
      phone.group.visible = false;
    },
  };

  const orb = makeOrbitals(ctx);
  const act3 = (cx: Ctx): Shot<Ctx>[] => [...act3a(cx, orb), ...act3b(cx, orb), ...act3c(cx, orb)];
  // Deliberate black: the title card, the pause before the house, the end card.
  const black = (id: string, start: number, end: number): Shot<Ctx> =>
    defineShot({
      id, start, end, sets: [], light: { bg: 0x000000 },
      cam: { pos: [[0, 0, 0, 5]], look: [[0, 0, 0, 0]], fov: 40 },
    });
  const blackouts = [black("title-card", T.title[0], T.title[1]), black("black-before-house", T.d14c[1], T.e1[0]), black("end-card", T.end[0], DURATION)];
  const shots: Shot<Ctx>[] = [...blackouts, ...prologue(ctx), ...act1a(ctx), ...act1b(ctx), ...act2(ctx), ...act3(ctx), ...epilogue(ctx)];

  const player = new CinematicPlayer<Ctx>({
    duration: DURATION,
    context: ctx,
    shots,
    cues: [...voiceCues, ...soundCues],
  });

  // Per-frame world animation and particles: pure functions of the master clock.
  const tick = (t: number): void => {
    w.space.backdrop.position.copy(camera.position);
    w.hutong.animate(t);
    fx.space.update(t);
    fx.shop.update(t);
    fx.basement.update(t);
    fx.hutong.update(t);
    fx.room.update(t);
  };
  player.addTypedEventListener("frame", (e) => tick(e.detail.time));
  tick(0);

  return { player, ctx, scene, camera, rig };
}
