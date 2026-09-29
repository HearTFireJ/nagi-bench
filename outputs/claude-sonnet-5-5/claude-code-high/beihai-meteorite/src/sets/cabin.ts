import * as THREE from "three";
import { BoxBatch, glowSprite, mats, rng, seg } from "../blocks";
import { Frame, pixelPanel } from "../kit";

export interface CabinSet {
  group: THREE.Group;
  locator: THREE.Group;
  hatchLeaf: THREE.Object3D;
  update(t: number, hatchOpen: number, ledOn: boolean): void;
}

export const CABIN = {
  shelfPos: [1.58, 1.12, 0.5] as [number, number, number],
  hatch: [0, 0, 2.15] as [number, number, number],
};

export function buildCabin(): CabinSet {
  const solid = new BoxBatch(0.4, 0.04);
  const glow = new BoxBatch(0.1, 0);
  const F = new Frame(solid);
  const G = new Frame(glow);

  // shell
  F.box(-1.9, -0.3, -2.4, 3.8, 0.3, 4.8, 0x6b7078, { cell: 0.4, jitter: 0.06 });
  F.box(-1.9, 2.7, -2.4, 3.8, 0.3, 4.8, 0xc7ccd1);
  F.box(-1.9, 0, -2.4, 3.8, 2.7, 0.2, 0xd6dade);
  F.box(-1.9, 0, -2.4, 0.2, 2.7, 4.8, 0xd6dade);
  F.box(1.7, 0, -2.4, 0.2, 2.7, 4.8, 0xd6dade);
  F.box(-1.9, 0, 2.2, 3.8, 2.7, 0.2, 0xd6dade);
  // stripe + seams
  F.box(-1.7, 1.05, -2.2, 3.4, 0.14, 0.02, 0xe07a2c, { jitter: 0, cell: 3 });
  F.box(-1.7, 1.05, -1.9 + 4.0 + 0.1, 3.4, 0.14, 0.02, 0xe07a2c, { jitter: 0, cell: 3 });
  F.box(-1.7, 1.05, -2.2, 0.02, 0.14, 4.4, 0xe07a2c, { jitter: 0, cell: 3 });
  F.box(1.68, 1.05, -2.2, 0.02, 0.14, 4.4, 0xe07a2c, { jitter: 0, cell: 3 });
  for (let i = 1; i < 6; i++) {
    F.box(-1.7 + i * 0.57, 0, -2.2, 0.02, 2.7, 0.02, 0x9aa1a8, { jitter: 0, cell: 3 });
    F.box(-1.7, 0, -2.2 + i * 0.73, 0.02, 2.7, 0.02, 0x9aa1a8, { jitter: 0, cell: 3 });
    F.box(1.68, 0, -2.2 + i * 0.73, 0.02, 2.7, 0.02, 0x9aa1a8, { jitter: 0, cell: 3 });
  }
  // ceiling lights
  G.box(-0.9, 2.66, -1.2, 1.8, 0.04, 0.5, 0xf4f9ff, { jitter: 0, cell: 3 });
  G.box(-0.9, 2.66, 0.6, 1.8, 0.04, 0.5, 0xf4f9ff, { jitter: 0, cell: 3 });

  // porthole on the back wall showing the terminator
  const R = 0.55;
  const cell = 0.055;
  const cy = 1.55;
  const cx = 0;
  const rnd = rng(6);
  for (let i = -10; i <= 10; i++) {
    for (let j = -10; j <= 10; j++) {
      const x = i * cell;
      const y = j * cell;
      const r = Math.hypot(x, y);
      if (r > R - 0.04) continue;
      let c: number;
      const horizon = -0.05 + Math.sin(x * 4) * 0.02 - x * x * 0.7;
      if (y > horizon + 0.04) {
        c = rnd() > 0.965 ? 0xffffff : 0x05070d;
        if (y < horizon + 0.12 && x < -0.05) c = 0x2a1814;
      } else if (y > horizon - 0.02) c = x < -0.1 ? 0xffb060 : 0x8ab8ff;
      else {
        c = (i + j * 3) % 5 === 0 ? 0xf2f0ee : x < -0.15 ? 0x9a5a48 : 0x1f5da0;
        if (y < -0.3) c = (i * 7 + j) % 4 === 0 ? 0x3f7040 : 0x1a4d88;
      }
      G.box(cx + x - cell / 2, cy + y - cell / 2, -2.19, cell, cell, 0.02, c, { jitter: 0, cell: 1 });
    }
  }
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    F.box(cx + Math.cos(ang) * (R + 0.05) - 0.08, cy + Math.sin(ang) * (R + 0.05) - 0.08, -2.22, 0.16, 0.16, 0.14, 0x565c64, { jitter: 0.05, cell: 1 });
  }

  // bunk with strapped sleeping bag
  F.box(-1.7, 0.85, -1.4, 0.75, 0.08, 2.0, 0x565c64);
  F.box(-1.65, 0.93, -1.35, 0.65, 0.34, 1.9, 0x3a4a63, { cell: 0.2, jitter: 0.07 });
  for (let i = 0; i < 3; i++) F.box(-1.66, 1.0, -1.1 + i * 0.6, 0.66, 0.3, 0.06, 0xe07a2c, { jitter: 0, cell: 1 });
  // locker
  for (let i = 0; i < 3; i++) F.box(-1.7, 1.6 + i * 0.35, 0.5 + 0, 0.06, 0.3, 1.5, 0xbfc5cb);
  // desk on the right wall + shelf
  F.box(1.1, 0.85, -1.9, 0.6, 0.06, 1.1, 0x565c64);
  F.box(1.2, 0.5, -1.8, 0.4, 0.28, 0.5, 0x8f969e);
  F.box(1.55, 1.08, 0.2, 0.15, 0.04, 0.9, 0x565c64); // shelf
  // father's portrait (sepia pixel art)
  const fr = new Frame(solid, 1.66, 0.7, 3);
  fr.box(-0.13, 1.35, -0.02, 0.26, 0.32, 0.03, 0x2a2018);
  const face = ["bbbbbb", "bccccb", "bhffhb", "bfkfkb", "bffffb", "buuuub"];
  pixelPanel(fr, -0.11, 1.38, 0.005, face, { b: 0x8a7a5a, c: 0x3c4a3a, h: 0x2a2018, f: 0xc9a27a, k: 0x1a1512, u: 0x4a5a44 }, 0.036, 0.02);

  // hatch on the front wall
  const H = new Frame(solid, 0, 2.15, 0);
  H.box(-0.75, 0, -0.06, 0.15, 2.2, 0.2, 0x565c64);
  H.box(0.6, 0, -0.06, 0.15, 2.2, 0.2, 0x565c64);
  H.box(-0.75, 2.05, -0.06, 1.5, 0.15, 0.2, 0x565c64);
  G.box(-0.6, 0.02, 2.13, 1.2, 2.0, 0.03, 0x3a0d0a, { jitter: 0.05, cell: 0.5 }); // airlock red glow behind
  const leafB = new BoxBatch(0.3, 0.04);
  new Frame(leafB).box(-0.6, 0, 2.08, 1.2, 2.05, 0.06, 0xc7ccd1);
  new Frame(leafB).box(-0.5, 0.1, 2.05, 1.0, 1.85, 0.03, 0xaeb4ba);
  new Frame(leafB).box(-0.08, 0.9, 2.02, 0.16, 0.16, 0.05, 0xe07a2c);
  const hatchLeaf = leafB.mesh(mats.solid(0.5, 0.3));

  // the locator unit (moved by the film)
  const locator = new THREE.Group();
  const lb = new BoxBatch(0.03, 0.03);
  new Frame(lb).box(-0.07, 0, -0.05, 0.14, 0.055, 0.1, 0x2b3038);
  new Frame(lb).box(-0.05, 0.055, -0.03, 0.1, 0.008, 0.06, 0x4a5560);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.014, 0.02), new THREE.MeshBasicMaterial({ color: 0x40ff80 }));
  led.position.set(0.045, 0.062, 0.03);
  const ledHalo = glowSprite("70,255,130", 0.35, 0.9, 6);
  ledHalo.position.set(0.045, 0.08, 0.03);
  locator.add(lb.mesh(mats.solid(0.5, 0.3)), led, ledHalo);

  // floating pencil
  const pencil = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.16), new THREE.MeshBasicMaterial({ color: 0xe0b040 }));

  const group = new THREE.Group();
  group.add(solid.mesh(mats.solid(0.85, 0.1)), glow.mesh(mats.glow(), false), hatchLeaf, locator, pencil);

  return {
    group,
    locator,
    hatchLeaf,
    update(t: number, hatchOpen: number, ledOn: boolean) {
      hatchLeaf.position.y = hatchOpen * 2.1;
      const blink = 0.55 + 0.45 * Math.max(0, Math.sin(t * 5.0));
      led.visible = ledOn;
      ledHalo.visible = ledOn;
      ledHalo.material.opacity = blink;
      (led.material as THREE.MeshBasicMaterial).color.setRGB(0.25 * blink, 1 * blink, 0.5 * blink);
      pencil.position.set(0.6 + Math.sin(t * 0.3) * 0.15, 1.9 + Math.sin(t * 0.5) * 0.08, -0.6 + Math.cos(t * 0.27) * 0.12);
      pencil.rotation.set(t * 0.4, t * 0.6, 0.3);
      void seg;
    },
  };
}
