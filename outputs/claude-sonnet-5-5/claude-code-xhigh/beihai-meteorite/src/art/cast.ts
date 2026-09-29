import * as THREE from "three";
import { applyPose, createFigure, type Figure, type Pose, type Skin } from "@agentbench/voxel-kit";
import {
  makeBody, makeCardigan, makeJacket, makeParka, makeSuit,
  type Eyes, type Look, type Mouth, type SuitOptions,
} from "./skins";
import { mulberry32 } from "../util/math";

/**
 * A cast member: one kit figure (fixed skeleton, fixed proportions), a set of
 * painted face states and a wardrobe of clothing sheets.
 */
export class Actor {
  readonly fig: Figure;
  private readonly faces = new Map<string, Skin>();
  private readonly wardrobe = new Map<string, Skin>();
  private faceKey = "";
  private dressKey = "";
  readonly heightM: number;

  constructor(readonly name: string, readonly look: Look, heightM: number, readonly arm: "classic" | "slim" = "classic") {
    this.heightM = heightM;
    const body = this.faceSkin("calm", "flat");
    this.fig = createFigure({ body: body.texture, clothes: null, heightM, arm });
    this.faceKey = "calm/flat";
    this.fig.root.name = `actor:${name}`;
  }

  private faceSkin(eyes: Eyes, mouth: Mouth): Skin {
    const key = `${eyes}/${mouth}`;
    let skin = this.faces.get(key);
    if (!skin) {
      skin = makeBody(this.look, eyes, mouth);
      this.faces.set(key, skin);
    }
    return skin;
  }

  get root(): THREE.Group {
    return this.fig.root;
  }

  face(eyes: Eyes, mouth: Mouth): this {
    const key = `${eyes}/${mouth}`;
    if (key !== this.faceKey) {
      this.faceKey = key;
      this.fig.setBody(this.faceSkin(eyes, mouth).texture);
    }
    return this;
  }

  addOutfit(name: string, skin: Skin): this {
    this.wardrobe.set(name, skin);
    return this;
  }

  dress(name: string): this {
    if (name === this.dressKey) return this;
    const skin = this.wardrobe.get(name);
    if (!skin) throw new Error(`${this.name} has no outfit "${name}"`);
    this.dressKey = name;
    this.fig.setClothes(skin.texture);
    return this;
  }

  pose(p: Pose): this {
    applyPose(this.fig, p);
    return this;
  }

  /** Stand on the ground at (x, z) facing yaw. */
  stand(x: number, y: number, z: number, yaw = 0): this {
    this.root.position.set(x, y, z);
    this.root.rotation.set(0, yaw, 0);
    return this;
  }

  /** Free-float: put the hip joint at `centre` and rotate the whole body about it. */
  drift(centre: THREE.Vector3 | [number, number, number], euler: [number, number, number]): this {
    const c = Array.isArray(centre) ? new THREE.Vector3(...centre) : centre;
    this.root.rotation.set(euler[0], euler[1], euler[2], "YXZ");
    const hip = new THREE.Vector3(0, 12 * this.root.scale.y, 0).applyEuler(this.root.rotation);
    this.root.position.copy(c).sub(hip);
    return this;
  }

  show(v: boolean): this {
    this.root.visible = v;
    return this;
  }
}

// ----------------------------------------------------------------------------
// The people of the film
// ----------------------------------------------------------------------------

export function makeZhang(): Actor {
  const look: Look = {
    skin: 0xd2a07c, hair: 0x14161a, hairStyle: "crop", brow: 0x101215, iris: 0x1a1512, base: 0x3b3f47,
  };
  const a = new Actor("章北海", look, 1.78);
  a.addOutfit("jacket", makeJacket());
  const suit = (o: Partial<SuitOptions>): Skin => makeSuit({ accent: 0x2f6fb5, visor: "clear", badge: 0xc0392b, ...o });
  a.addOutfit("suit", suit({}));
  a.addOutfit("suitBare", suit({ bareRight: true, frost: 0 }));
  a.addOutfit("suitFrost", suit({ bareRight: true, frost: 0.8 }));
  a.addOutfit("suitGold", suit({ visor: "gold" }));
  a.dress("jacket");
  return a;
}

export function makeCollector(): Actor {
  const look: Look = {
    skin: 0xd99672, hair: 0x8b8781, hairStyle: "thin", brow: 0x4a4540, iris: 0x2b1e14,
    glasses: 0xb89a5a, wrinkles: true, base: 0x6a6259,
  };
  const a = new Actor("收藏者", look, 1.72);
  a.addOutfit("cardigan", makeCardigan());
  a.addOutfit("parka", makeParka());
  a.dress("cardigan");
  return a;
}

const SKINS = [0xd2a07c, 0xc98d63, 0xe0b48c, 0xb87a52, 0xd8a582, 0xc29070];
const HAIRS = [0x14161a, 0x1d1a17, 0x2b2622, 0x3a322b, 0x565049];
const IRIS = [0x1a1512, 0x2b1e14, 0x1f2a33];
const ACCENTS = [0x2f6fb5, 0x2f9e6b, 0xc0392b, 0x8e5bb5, 0xd98a1f, 0x2aa1b3];

export interface Crowd {
  /** [0..2] are the three leaders, [3] the photographer, the rest attendees. */
  people: Actor[];
  leaders: [Actor, Actor, Actor];
  photographer: Actor;
}

export function makeCrowd(count = 30): Crowd {
  const rand = mulberry32(2010);
  const people: Actor[] = [];
  const leaderLooks: Look[] = [
    { skin: 0xd8a582, hair: 0xd9d9d6, hairStyle: "receding", brow: 0x8a8a86, iris: 0x1f2a33, wrinkles: true, glasses: 0x3d3d40 },
    { skin: 0xc98d63, hair: 0xa9a7a2, hairStyle: "thin", brow: 0x4a4744, iris: 0x2b1e14, wrinkles: true, stubble: true },
    { skin: 0xe0b48c, hair: 0x7c7a76, hairStyle: "crop", brow: 0x3b3936, iris: 0x1a1512, wrinkles: true },
  ];
  const heights = [1.7, 1.75, 1.68];
  for (let i = 0; i < 3; i++) {
    const a = new Actor(`leader${i + 1}`, leaderLooks[i]!, heights[i]!);
    for (const v of ["clear", "cracked", "gold"] as const) {
      a.addOutfit(v, makeSuit({ accent: 0xd4a017, visor: v, badge: 0xc0392b, stripes: 1 }));
    }
    a.dress("clear");
    people.push(a);
  }
  const photoLook: Look = { skin: 0xd2a07c, hair: 0x1d1a17, hairStyle: "crop", brow: 0x1a1816, iris: 0x1a1512, glasses: 0x2f2f33 };
  const photo = new Actor("photographer", photoLook, 1.76);
  photo.addOutfit("clear", makeSuit({ accent: 0x2aa1b3, visor: "clear" }));
  photo.addOutfit("gold", makeSuit({ accent: 0x2aa1b3, visor: "gold" }));
  photo.dress("clear");
  people.push(photo);
  const outfitCache = new Map<number, Skin>();
  for (let i = people.length; i < count; i++) {
    const look: Look = {
      skin: SKINS[Math.floor(rand() * SKINS.length)]!,
      hair: HAIRS[Math.floor(rand() * HAIRS.length)]!,
      hairStyle: rand() > 0.8 ? "thin" : "crop",
      brow: 0x1c1a18,
      iris: IRIS[Math.floor(rand() * IRIS.length)]!,
      wrinkles: rand() > 0.6,
      glasses: rand() > 0.85 ? 0x2f2f33 : undefined,
    };
    const a = new Actor(`attendee${i}`, look, 1.62 + rand() * 0.24, rand() > 0.7 ? "slim" : "classic");
    const accent = ACCENTS[Math.floor(rand() * ACCENTS.length)]!;
    let skin = outfitCache.get(accent);
    if (!skin) {
      skin = makeSuit({ accent, visor: "clear" });
      outfitCache.set(accent, skin);
    }
    let gold = outfitCache.get(accent + 0x1000000);
    if (!gold) {
      gold = makeSuit({ accent, visor: "gold" });
      outfitCache.set(accent + 0x1000000, gold);
    }
    a.addOutfit("clear", skin);
    a.addOutfit("gold", gold);
    a.dress("clear");
    people.push(a);
  }
  return { people, leaders: [people[0]!, people[1]!, people[2]!], photographer: photo };
}

/** Orange-suited station workers who cross the frame and make the void look busy. */
export function makeWorkers(count = 4): Actor[] {
  const out: Actor[] = [];
  const outfit = makeSuit({ accent: 0x222a33, visor: "clear", cloth: 0xf08a2a });
  for (let i = 0; i < count; i++) {
    const a = new Actor(`worker${i}`, {
      skin: SKINS[(i * 2 + 1) % SKINS.length]!, hair: HAIRS[i % HAIRS.length]!, hairStyle: "crop",
      brow: 0x1c1a18, iris: 0x1a1512,
    }, 1.7 + i * 0.03);
    a.addOutfit("clear", outfit);
    a.dress("clear");
    out.push(a);
  }
  return out;
}
