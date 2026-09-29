import * as THREE from "three";
import { CinematicPlayer, validateVoiceCues, type SoundCue, type TimelineCue } from "@agentbench/cinematic-player";
import { voxelMaterial } from "@agentbench/voxel-kit";
import { Rig, type Loc } from "../world";
import { buildAlley } from "../sets/alley";
import { buildBasement } from "../sets/basement";
import { buildCabin } from "../sets/cabin";
import { buildHouse } from "../sets/house";
import { buildShop } from "../sets/shop";
import { buildSpace } from "../sets/space";
import { buildCast } from "../cast";
import { scopeGeometry, suitSheet } from "../characters";
import { etchedSlab, ironLump } from "../props";
import { voiceCues } from "../voice";
import { T } from "../timing";
import { seg, smooth, mats } from "../blocks";
import { toPlayerShots, type Ctx, type Overlay, type ShotDef } from "./core";
import { act1Shots, animAlley, animHouse } from "./act1";
import { act2Shots, animBasement, animShop, muzzleWorld } from "./act2";
import { act3Shots, animCabin, animSpace, initSpace, updateMuzzle, flashbackLabels, type SpaceRuntime } from "./act3";
import { applyLights } from "./lights";
import { aim } from "@agentbench/voxel-kit";

export interface Film {
  player: CinematicPlayer<Ctx>;
  ctx: Ctx;
  cues: TimelineCue[];
  rt: SpaceRuntime;
  shots: ShotDef[];
}

const LOCS: Loc[] = ["space", "alley", "house", "shop", "basement", "cabin"];

export function createFilm(overlay: Overlay, soundCues: SoundCue[], renderer?: { toneMappingExposure: number }): Film {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 12000);
  const rig = new Rig(scene, renderer);
  const cast = buildCast();

  const house = buildHouse();
  const alley = buildAlley();
  const shop = buildShop();
  const basement = buildBasement();
  const cabin = buildCabin();
  const space = buildSpace();

  const groups: Record<Loc, THREE.Object3D> = {
    space: space.group,
    alley: alley.group,
    house: house.group,
    shop: shop.group,
    basement: basement.group,
    cabin: cabin.group,
  };
  for (const g of Object.values(groups)) scene.add(g);

  // iron meteorites (in hand / on the felt)
  const lumps = [ironLump(0.1, 3), ironLump(0.16, 5), ironLump(0.16, 6), ironLump(0.16, 7)];
  for (const l of lumps) {
    l.visible = false;
    house.group.add(l);
  }

  const slab = etchedSlab();
  slab.position.set(-1.65, 0.955, -0.05);
  slab.rotation.y = 0.4;
  slab.visible = false;
  house.group.add(slab);

  // actors
  scene.add(cast.zhang.fig.root, cast.collector.fig.root);
  space.group.add(...cast.crowd.map((c) => c.fig.root), cast.photographer.fig.root);
  scene.add(cast.zhangS.fig.root);

  // loose props that live in the world, not on a hand
  const floatScope = new THREE.Mesh(scopeGeometry(), voxelMaterial({ roughness: 0.5, metalness: 0.3 }));
  floatScope.scale.setScalar(0.05625);
  floatScope.visible = false;
  const glove = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.1), mats.solid(0.7));
  (glove.material as THREE.MeshStandardMaterial).vertexColors = false;
  (glove.material as THREE.MeshStandardMaterial).color.set(0xd6dade);
  glove.visible = false;
  space.group.add(floatScope, glove);

  const ctx: Ctx = {
    scene,
    camera,
    rig,
    cast,
    house,
    alley,
    shop,
    basement,
    cabin,
    space,
    groups,
    overlay,
    loc: "space",
    extra: {
      lumps,
      slab,
      zhangSuit: cast.zhangSuit,
      zhangSuitBare: suitSheet("grey", "clear", { bareRight: true }),
    },
  };

  const rt = initSpace(ctx, floatScope, glove);
  space.group.add(rt.puffs.mesh, rt.gas.mesh, rt.blood.mesh, rt.bullets, rt.flash, rt.zGlow);
  // a tiny pixel flare for the muzzle
  rt.flash.material.map = flashTexture();

  // basement muzzle: pose Zhang at the aim stance once to find where the barrel points
  {
    const z = cast.zhang.fig;
    z.root.position.set(1.4, 0, 1.2);
    z.root.rotation.set(0, 3.96, 0, "YXZ");
    const a = aim(0.02, 0);
    z.joints.armR.rotation.set(a.armR![0], a.armR![1], a.armR![2]);
    z.joints.armL.rotation.set(a.armL![0], a.armL![1], a.armL![2]);
    cast.props.pistol.visible = true;
    z.root.updateMatrixWorld(true);
    const m = muzzleWorld(ctx, cast.props.pistol);
    basement.muzzle[0] = m.x;
    basement.muzzle[1] = m.y;
    basement.muzzle[2] = m.z;
    cast.props.pistol.visible = false;
    z.joints.armR.rotation.set(0, 0, 0);
    z.joints.armL.rotation.set(0, 0, 0);
  }

  // flash sprite for the basement test
  const baseFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), color: 0xffe2b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  baseFlash.visible = false;
  basement.group.add(baseFlash);
  ctx.extra.baseFlash = baseFlash;

  const defs: ShotDef[] = [...act1Shots(), ...act2Shots(), ...act3Shots(ctx, rt)];
  const shots = toPlayerShots(ctx, defs, (loc, t) => enterLoc(ctx, rt, loc, t), (loc, t) => applyLights(ctx, loc, t, rt));

  const cues = [...validateVoiceCues(voiceCues, T.duration), ...soundCues] as TimelineCue[];
  const player = new CinematicPlayer<Ctx>({ duration: T.duration, context: ctx, shots, cues });

  // overlay furniture is derived from the timeline, never accumulated
  player.addTypedEventListener("frame", ({ detail }) => {
    const t = detail.time;
    const shot = defs.find((d) => t >= d.start && t < d.end);
    overlay.scope(shot?.scope ? 1 : 0, 1);
    overlay.lens(shot?.lens ? 1 : 0, "micro");
    overlay.fade(fadeAt(t));
    const ti = titleAt(t);
    overlay.title(ti.kind, ti.text, ti.sub, ti.alpha);
    overlay.flash(0);
  });

  return { player, ctx, cues, rt, shots: defs };
}

function flashTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, 32, 32);
  const rows = [
    "................",
    ".......ww.......",
    ".......ww.......",
    "......wwww......",
    "...w..wwww..w...",
    "....wwwwwwww....",
    "..wwwwwwwwwwww..",
    "wwwwwwwwwwwwwwww",
    "wwwwwwwwwwwwwwww",
    "..wwwwwwwwwwww..",
    "....wwwwwwww....",
    "...w..wwww..w...",
    "......wwww......",
    ".......ww.......",
    ".......ww.......",
    "................",
  ];
  rows.forEach((r, y) => {
    for (let x = 0; x < 16; x++) {
      if (r[x] === "w") {
        g.fillStyle = "#fff";
        g.fillRect(x * 2, y * 2, 2, 2);
      }
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------------------------------------------------------- locations */

function enterLoc(ctx: Ctx, rt: SpaceRuntime, loc: Loc, t: number): void {
  ctx.loc = loc;
  for (const k of LOCS) ctx.groups[k].visible = k === loc;
  const c = ctx.cast;
  c.zhang.fig.root.visible = loc === "alley" || loc === "house" || loc === "shop" || loc === "basement";
  c.collector.fig.root.visible = loc === "house";
  c.zhangS.fig.root.visible = loc === "space" || loc === "cabin";
  switch (loc) {
    case "alley":
      animAlley(ctx, t);
      break;
    case "house":
      animHouse(ctx, t);
      break;
    case "shop":
      animShop(ctx, t);
      break;
    case "basement":
      animBasement(ctx, t);
      basementFlash(ctx, t);
      break;
    case "cabin":
      animCabin(ctx, t);
      break;
    case "space":
      animSpace(ctx, t, rt);
      break;
  }
  if (loc !== "basement") ctx.extra.baseFlash.visible = false;
  // props that belong to other places are hidden so nothing bleeds across cuts
  if (loc !== "house") {
    c.props.cup.visible = false;
    c.props.cupB.visible = false;
    c.props.loupe.visible = false;
    c.props.phone.visible = false;
    c.props.rockL.visible = false;
  }
  if (loc !== "shop" && loc !== "basement") {
    c.props.rock.visible = false;
    c.props.brush.visible = false;
    c.props.bit.visible = false;
  }
  if (loc !== "basement") {
    c.props.pliers.visible = false;
    c.props.pistol.visible = false;
    c.props.magazine.visible = false;
    c.props.knife.visible = false;
    c.props.gravel.visible = false;
  }
  if (loc !== "space" && loc !== "cabin") c.props.camera.visible = false;
  if (loc === "space") updateMuzzle(ctx, rt, t);
}

function basementFlash(ctx: Ctx, t: number): void {
  const f = ctx.extra.baseFlash as THREE.Sprite;
  let k = 0;
  for (const s of T.bShots) if (t >= s && t < s + 0.08) k = 1 - (t - s) / 0.08;
  const mz = ctx.basement.muzzle;
  f.position.set(mz[0], mz[1], mz[2]);
  f.scale.setScalar(0.55 + k * 0.7);
  (f.material as THREE.SpriteMaterial).opacity = k;
  f.visible = k > 0;
  // smoke drift origin follows the real barrel
}

/* ---------------------------------------------------------- overlay timelines */

const fadeIn = (t: number, a: number, b: number) => smooth(seg(t, a, b));

export function fadeAt(t: number): number {
  let f = 0;
  f = Math.max(f, fadeIn(t, 18.2, 19.3) * (1 - fadeIn(t, 24.6, 25.6)));
  f = Math.max(f, fadeIn(t, 346.4, 348.6));
  // quick dips between the scenes
  for (const c of [T.shop0, T.basement0, T.space0]) f = Math.max(f, t < c ? fadeIn(t, c - 0.3, c) : 1 - fadeIn(t, c, c + 0.3));
  return Math.min(1, f);
}

export function titleAt(t: number): { kind: "none" | "title" | "end" | "place"; text: string; sub: string; alpha: number } {
  const win = (a: number, b: number, i = 0.6, o = 0.6) => smooth(Math.min(seg(t, a, a + i), 1 - seg(t, b - o, b)));
  if (t >= T.titleIn && t < T.titleOut) return { kind: "title", text: "陨石雨", sub: "根据刘慈欣《三体》改编", alpha: win(T.titleIn, T.titleOut, 1.2, 1.0) };
  if (t >= 349.4) return { kind: "end", text: "终", sub: "", alpha: win(349.4, 355.9, 1.4, 0.4) };
  const places: Array<[number, number, string, string]> = [
    [25.4, 29.6, "北京 · 胡同", "一个月前"],
    [119.0, 122.4, "太空军研究所", "当晚"],
    [149.0, 153.0, "地下室", "同一夜"],
    [198.6, 203.0, "同步轨道 · 黄河空间站", "三个月后"],
  ];
  for (const [a, b, text, sub] of places) if (t >= a && t < b) return { kind: "place", text, sub, alpha: win(a, b, 0.7, 0.7) };
  for (const f of flashbackLabels) if (t >= f.t0 && t < f.t1) return { kind: "place", text: f.label, sub: "", alpha: win(f.t0, f.t1, 0.2, 0.3) };
  return { kind: "none", text: "", sub: "", alpha: 0 };
}
