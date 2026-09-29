import * as THREE from "three";
import type { Figure } from "@agentbench/voxel-kit";
import {
  backpackGeometry,
  cameraGeometry,
  jacketSheet,
  knitSheet,
  makeBodies,
  makeFigure,
  mount,
  pistolGeometry,
  scopeGeometry,
  suitSheet,
  type Bodies,
  type Look,
  type SuitTrim,
  type Visor,
} from "./characters";
import {
  brushGeometry,
  cupGeometry,
  knifeGeometry,
  loupeGeometry,
  magazineGeometry,
  phoneGeometry,
  pliersGeometry,
  propMesh,
  rockInHand,
} from "./props";
import type { Actor } from "./world";
import { voxelCylinder } from "./blocks";

const TRIM_COLORS: Record<SuitTrim, number> = { orange: 0xe0762a, blue: 0x2f6fb5, green: 0x3c9a5f, red: 0xc23a35, grey: 0x8b929b };

export const LOOKS: Record<string, Look> = {
  zhang: { skin: "#d9a880", shade: "#b98a64", hair: "#14161a", hairStyle: "crop" },
  collector: { skin: "#dfb08a", shade: "#c0916c", hair: "#d6d2cb", hairStyle: "receding", glasses: "#6a5f55" },
  c0: { skin: "#e0b48e", shade: "#c0916c", hair: "#1a1a1c", hairStyle: "short" },
  c1: { skin: "#c78f66", shade: "#a8724d", hair: "#2a1f1a", hairStyle: "crop" },
  c2: { skin: "#f0c9a5", shade: "#d3a983", hair: "#5a4a3a", hairStyle: "short" },
  c3: { skin: "#8d5a3c", shade: "#6f452c", hair: "#111111", hairStyle: "crop" },
  c4: { skin: "#d9a880", shade: "#b98a64", hair: "#9c9c9c", hairStyle: "receding" },
  c5: { skin: "#e8c3a0", shade: "#c9a082", hair: "#3a2a20", hairStyle: "long" },
};

export interface SuitSet {
  gold: THREE.Texture;
  clear: THREE.Texture;
  cracked: THREE.Texture;
}

export interface Props {
  pistol: THREE.Mesh;
  scope: THREE.Mesh;
  scopeFree: THREE.Mesh;
  magazine: THREE.Mesh;
  cup: THREE.Mesh;
  cupB: THREE.Mesh;
  loupe: THREE.Mesh;
  phone: THREE.Mesh;
  pliers: THREE.Mesh;
  knife: THREE.Mesh;
  brush: THREE.Mesh;
  rock: THREE.Mesh;
  rockL: THREE.Mesh;
  bit: THREE.Mesh;
  gravel: THREE.Mesh;
  suitPistol: THREE.Mesh;
  suitScope: THREE.Mesh;
  suitScopeFree: THREE.Mesh;
  suitMag: THREE.Mesh;
  suitLocator: THREE.Group | null;
  camera: THREE.Mesh;
  holster: THREE.Mesh;
}

export interface Cast {
  zhang: Actor;
  collector: Actor;
  zhangS: Actor;
  crowd: Actor[];
  crowdSuits: SuitSet[];
  photographer: Actor;
  props: Props;
  suits: Record<SuitTrim, SuitSet>;
  zhangSuit: SuitSet;
  jacket: THREE.Texture;
}

function suitSet(trim: SuitTrim): SuitSet {
  const mk = (v: Visor) => suitSheet(trim, v);
  return { gold: mk("gold"), clear: mk("clear"), cracked: mk("cracked") };
}

function actor(name: string, bodies: Bodies, fig: Figure): Actor {
  bodies.set(fig, "neutral", false);
  return { name, bodies, fig, mood: "neutral" };
}

export function buildCast(): Cast {
  const jacket = jacketSheet(
    { torso: "#2c3540", torsoDark: "#1c232b", arm: "#2c3540", leg: "#1e2127", shoe: "#0e0e10" },
    { badge: true },
  );
  const zhangBodies = makeBodies(LOOKS.zhang!, "#d8dade");
  const zhang = actor("章北海", zhangBodies, makeFigure(new THREE.Texture(), jacket, 1.8));
  zhangBodies.set(zhang.fig, "grim", false);

  const collBodies = makeBodies(LOOKS.collector!, "#e6e1d2");
  const collector = actor("收藏者", collBodies, makeFigure(new THREE.Texture(), knitSheet(), 1.72));
  collBodies.set(collector.fig, "smile", false);

  const suits: Record<SuitTrim, SuitSet> = {
    orange: suitSet("orange"),
    blue: suitSet("blue"),
    green: suitSet("green"),
    red: suitSet("red"),
    grey: suitSet("grey"),
  };
  const zhangSuit = suits.grey;
  const zhangS = actor("章北海", zhangBodies, makeFigure(new THREE.Texture(), zhangSuit.clear, 1.8));
  zhangBodies.set(zhangS.fig, "grim", false);
  mount(zhangS.fig.anchors.back, backpackGeometry(TRIM_COLORS.grey), [0, 0, -5.4]);

  const crowd: Actor[] = [];
  const crowdSuits: SuitSet[] = [];
  const trims: SuitTrim[] = ["orange", "blue", "green", "red", "grey"];
  const heights = [1.78, 1.7, 1.84, 1.66, 1.75, 1.8, 1.72, 1.69, 1.82, 1.76, 1.68, 1.79, 1.73, 1.81, 1.67, 1.77, 1.74];
  const bodyPool = ["c0", "c1", "c2", "c3", "c4", "c5"].map((k) => makeBodies(LOOKS[k]!, "#d8dade"));
  for (let i = 0; i < 17; i++) {
    const trim = trims[(i * 2 + (i > 5 ? 1 : 0)) % 5]!;
    const set = suits[trim];
    const bodies = bodyPool[i % 6]!;
    const a = actor(`合影者${i + 1}`, bodies, makeFigure(new THREE.Texture(), set.gold, heights[i]!));
    mount(a.fig.anchors.back, backpackGeometry(TRIM_COLORS[trim]), [0, 0, -5.4]);
    crowd.push(a);
    crowdSuits.push(set);
  }
  const phoBodies = makeBodies(LOOKS.c1!, "#d8dade");
  const photographer = actor("摄影师", phoBodies, makeFigure(new THREE.Texture(), suits.blue.clear, 1.76));
  mount(photographer.fig.anchors.back, backpackGeometry(TRIM_COLORS.blue), [0, 0, -5.4]);

  // ---- props (each lives on an anchor and is shown/hidden by the choreography)
  const pistol = mount(zhang.fig.anchors.handR, pistolGeometry(), [0, 1.2, 1.6]);
  const magazine = mount(zhang.fig.anchors.handL, magazineGeometry(), [0, 0.5, 0.5]);
  const scope = mount(zhang.fig.anchors.handR, scopeGeometry(), [0, 3.55, 2.4]);
  const scopeFree = mount(zhang.fig.anchors.handL, scopeGeometry(), [0, 0.4, 1.6]);
  const cup = mount(zhang.fig.anchors.handR, cupGeometry(), [0, 0.4, 1.0]);
  const cupB = mount(collector.fig.anchors.handR, cupGeometry(), [0, 0.4, 1.0]);
  const loupe = mount(collector.fig.anchors.handR, loupeGeometry(), [0.2, 0.6, 2.5], [0, Math.PI / 2, 0]);
  const phone = mount(zhang.fig.anchors.handR, phoneGeometry(), [0, 0.8, 1.6], [0, 0, 0]);
  phone.material = new THREE.MeshBasicMaterial({ vertexColors: true });
  const pliers = mount(zhang.fig.anchors.handR, pliersGeometry(), [0, 0.5, 1.8]);
  const knife = mount(zhang.fig.anchors.handR, knifeGeometry(), [0, 0.5, 1.5]);
  const brush = mount(zhang.fig.anchors.handR, brushGeometry(), [0, 0.5, 1.2]);
  const rock = mount(zhang.fig.anchors.handL, rockInHand(), [0, 0.5, 1.2]);
  const rockL = mount(collector.fig.anchors.handL, rockInHand(), [0, 0.5, 1.2]);
  const bit = mount(zhang.fig.anchors.handR, voxelCylinder(1.6, 9, (x, y, z) => ((Math.floor((y + x + z) / 2) % 2) ? 0xc4cad0 : 0x5b626a), 0.32, "z"), [0, 0.3, 1.6]);
  const gravel = mount(zhang.fig.anchors.handL, rockInHand(), [0, 0.7, 1.0]);
  gravel.scale.setScalar(0.5);
  const holster = mount(zhang.fig.anchors.hipL, pistolGeometry(), [0, 0, 0], [0, 0, 0]);
  const suitPistol = mount(zhangS.fig.anchors.handR, pistolGeometry(), [0, 1.2, 1.6]);
  const suitScope = mount(zhangS.fig.anchors.handR, scopeGeometry(), [0, 3.55, 2.4]);
  const suitScopeFree = mount(zhangS.fig.anchors.handL, scopeGeometry(), [0, 0.4, 1.6]);
  const suitMag = mount(zhangS.fig.anchors.handL, magazineGeometry(), [0, 0.5, 0.5]);
  const camera = mount(photographer.fig.anchors.handR, cameraGeometry(), [0, 0.5, 2.4]);
  for (const p of [bit, gravel, pistol, magazine, scope, scopeFree, cup, cupB, loupe, phone, pliers, knife, brush, rock, rockL, holster, suitPistol, suitScope, suitScopeFree, suitMag]) p.visible = false;
  camera.visible = true;
  holster.scale.setScalar(0.8);
  holster.rotation.x = Math.PI / 2;

  return {
    zhang,
    collector,
    zhangS,
    crowd,
    crowdSuits,
    photographer,
    props: { bit, gravel, pistol, scope, scopeFree, magazine, cup, cupB, loupe, phone, pliers, knife, brush, rock, rockL, suitPistol, suitScope, suitScopeFree, suitMag, suitLocator: null, camera, holster },
    suits,
    zhangSuit,
    jacket,
  };
}
