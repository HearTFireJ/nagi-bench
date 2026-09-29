import * as THREE from "three";
import { buildVoxelGeometry, voxelMaterial, voxelModel } from "@agentbench/voxel-kit";
import { VoxGrid, glow, matte } from "../util/vox";
import { fbm3, hash3, jitter, mix, shade, vnoise3 } from "../util/math";

/** All hand props are authored in *figure pixels* (1 px = 0.05625 m on a 1.8 m figure). */

// ---- meteorites -------------------------------------------------------------------
export type RockKind = "iron" | "stone" | "pallasite" | "glass" | "moon" | "mars";

export function rockGeometry(seed: number, r: number, kind: RockKind, voxel: number): THREE.BufferGeometry {
  const span = Math.ceil(r * 2.8);
  const c = span / 2;
  const at = (x: number, y: number, z: number): number | null => {
    const dx = x + 0.5 - c, dy = (y + 0.5 - c) * 1.15, dz = z + 0.5 - c;
    const d = Math.hypot(dx, dy, dz);
    const warp = 0.72 + 0.6 * fbm3(dx * 0.42 + seed, dy * 0.42, dz * 0.42 - seed, 3, seed);
    if (d > r * warp) return null;
    const edge = d / (r * warp);
    const pit = vnoise3(x * 0.9 + seed, y * 0.9, z * 0.9, seed + 5);
    switch (kind) {
      case "iron": {
        let col = mix(0x4b4139, 0x6a5e52, vnoise3(x * 0.5, y * 0.5, z * 0.5, seed));
        if (pit > 0.72) col = 0x2b241f;
        if (edge > 0.86 && hash3(x, y, z, seed) > 0.75) col = 0x7a4a2c;
        if (edge > 0.9 && pit < 0.28) col = 0x8f8477;
        return jitter(col, 0.06, x, y, z, seed);
      }
      case "stone": {
        let col = edge > 0.82 ? 0x2c2724 : mix(0x8b8780, 0x6f6b66, vnoise3(x, y, z, seed));
        if (hash3(x, y, z, seed + 3) > 0.93) col = 0xb3a48a;
        return jitter(col, 0.07, x, y, z, seed);
      }
      case "pallasite": {
        const olive = vnoise3(x * 0.7, y * 0.7, z * 0.7, seed + 9) > 0.5;
        return jitter(olive ? 0x9caa3c : 0x8c9098, 0.06, x, y, z, seed);
      }
      case "glass":
        return jitter(hash3(x, y, z, seed) > 0.9 ? 0x5a6c78 : 0x14171c, 0.1, x, y, z, seed);
      case "moon":
        return jitter(pit > 0.7 ? 0x6e6c69 : mix(0xa5a39f, 0x8c8a86, pit), 0.05, x, y, z, seed);
      case "mars":
        return jitter(pit > 0.66 ? 0x4a2a20 : mix(0x9b5238, 0x7d3f2c, pit), 0.05, x, y, z, seed);
    }
  };
  return buildVoxelGeometry({ size: [span, span, span], at }, { voxel, anchor: "center" });
}

export function rock(seed: number, r: number, kind: RockKind, voxel: number): THREE.Mesh {
  const m = new THREE.Mesh(rockGeometry(seed, r, kind, voxel), voxelMaterial({ roughness: kind === "glass" ? 0.25 : 0.85, metalness: kind === "iron" ? 0.25 : 0 }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A cut, polished iron-meteorite slice showing Widmanstätten lines. */
export function ironSlice(voxel: number): THREE.Mesh {
  const g = new VoxGrid(22, 2, 16);
  g.box(0, 0, 0, 22, 2, 16, (x, y, z) => {
    const cx = x - 10.5, cz = z - 7.5;
    if ((cx * cx) / 121 + (cz * cz) / 64 > 1) return null;
    const a = (x + z) % 7 < 2;
    const b = (x - z + 40) % 9 < 2;
    if (y === 0) return 0x3a352f;
    return a || b ? 0xd9dadc : 0x8c8f94;
  });
  return g.mesh(voxel, voxelMaterial({ roughness: 0.3, metalness: 0.4 }), "center");
}

// ---- the pistol (2010 pattern) ----------------------------------------------------
const PISTOL_MID = [
  "..A.......B.....",
  ".SSSSSSSSSSSSSS.",
  ".SSSSSSSSSSSSSSS",
  ".GGGGFFFFFFFF...",
  ".GGGG.FT..F.....",
  ".GGGG.FFFFF.....",
  ".GGGG...........",
  ".GGGG...........",
];
const PISTOL_SIDE = [
  "................",
  ".SSSSSSSSSSSSSS.",
  ".SSSSSSSSSSSSSSS",
  ".GGGGFFFFFFFF...",
  ".GGGG.F...F.....",
  ".GGGG.FFFFF.....",
  ".GGGG...........",
  ".GGGG...........",
];

export interface PistolRig {
  root: THREE.Group;
  /** Scope on its magnet mount; hidden until it is fitted. */
  scope: THREE.Group;
  flash: THREE.Group;
  /** Magazine seated in the grip. */
  mag: THREE.Mesh;
  voxel: number;
}

export function magazineGeometry(voxel: number): THREE.BufferGeometry {
  return voxelModel({
    palette: { M: 0x8c9198, m: 0x5e636b, b: 0xc98f3a },
    layers: [["bbbb", "MMMM", "MmmM", "MmmM", "MmmM"], ["bbbb", "MMMM", "MmmM", "MmmM", "MmmM"]],
    axis: "x",
    voxel,
    anchor: "center",
  });
}

export function makePistol(voxel = 0.34): PistolRig {
  const root = new THREE.Group();
  root.name = "pistol";
  const geo = voxelModel({
    palette: { S: 0x2a2e35, F: 0x383d45, G: 0x1c1e22, T: 0x9aa0a8, A: 0x111214, B: 0x111214 },
    layers: [PISTOL_SIDE, PISTOL_MID, PISTOL_SIDE],
    axis: "x",
    voxel,
    anchor: "min",
  });
  // grip centre (col 2, row 5 of 8) at the origin so the fist closes around it
  geo.translate(-1.5 * voxel, -(8 - 5.5) * voxel, -2.5 * voxel);
  const body = new THREE.Mesh(geo, voxelMaterial({ roughness: 0.55, metalness: 0.15 }));
  body.castShadow = true;
  root.add(body);

  const mag = new THREE.Mesh(magazineGeometry(voxel), voxelMaterial({ roughness: 0.5, metalness: 0.2 }));
  mag.position.set(0, -2.6 * voxel - 0.15, -0.4 * voxel);
  mag.castShadow = true;
  root.add(mag);

  // scope on a magnet plate, sitting on the slide
  const scope = new THREE.Group();
  const sg = new VoxGrid(3, 4, 14);
  sg.box(0, 1, 2, 3, 4, 12, (x, y, z) => ((x === 0 || x === 2) && (y === 1 || y === 3) ? null : 0x3b4048));
  sg.box(0, 1, 11, 3, 4, 14, 0x2a2e35);
  sg.box(0, 1, 13, 3, 4, 14, 0x7ec8ff);
  sg.box(0, 1, 0, 3, 4, 2, 0x16181c);
  sg.box(0, 0, 3, 3, 1, 10, 0xc0c6ce);
  const sm = new THREE.Mesh(sg.geometry(voxel * 0.8, "center"), voxelMaterial({ roughness: 0.4, metalness: 0.3 }));
  sm.castShadow = true;
  scope.add(sm);
  scope.position.set(0, 5.2 * voxel + 0.2, 0.2);
  scope.visible = false;
  root.add(scope);

  // muzzle flash: two crossed voxel stars
  const flash = new THREE.Group();
  const star = new VoxGrid(9, 9, 1);
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const dx = Math.abs(x - 4), dy = Math.abs(y - 4);
      if (dx + dy <= 2 || dx === 0 || dy === 0 || (dx === dy && dx <= 3)) {
        star.set(x, y, 0, dx + dy <= 1 ? 0xffffff : dx + dy <= 3 ? 0xffe7a0 : 0xff9a3c);
      }
    }
  }
  const fg = star.geometry(0.22, "center");
  const fm = glow({ toneMapped: false, side: THREE.DoubleSide });
  const f1 = new THREE.Mesh(fg, fm);
  const f2 = new THREE.Mesh(fg, fm);
  f2.rotation.y = Math.PI / 2;
  flash.add(f1, f2);
  flash.position.set(0, 1.5 * voxel, 9.3 * voxel);
  flash.visible = false;
  root.add(flash);
  return { root, scope, flash, mag, voxel };
}

// ---- small hand props -------------------------------------------------------------
export function pliers(voxel = 0.3): THREE.Mesh {
  const geo = voxelModel({
    palette: { r: 0xb02a25, m: 0x9aa1aa, d: 0x50555c },
    layers: [
      ["........", "..mmmm..", ".mm..mm.", "..rrrr..", "..rr.rr.", ".rr...rr", ".rr...rr"],
      ["........", "..mmmm..", ".mmddmm.", "..rrrr..", "..rrrr..", ".rr...rr", ".rr...rr"],
    ],
    axis: "x",
    voxel,
    anchor: "center",
  });
  return new THREE.Mesh(geo, voxelMaterial({ roughness: 0.5, metalness: 0.2 }));
}

export function gluetube(voxel = 0.3): THREE.Mesh {
  const geo = voxelModel({
    palette: { w: 0xe6e8ea, o: 0xe0742a, k: 0x2d3138, c: 0x9aa1aa },
    layers: [
      ["cccc", "wwww", "owow", "wowo", "wwww", "wwww", "oooo", "kkkk"],
      ["cccc", "wwww", "wwww", "wwww", "wwww", "wwww", "oooo", "kkkk"],
      ["cccc", "wwww", "owow", "wowo", "wwww", "wwww", "oooo", "kkkk"],
    ],
    axis: "z",
    voxel,
    anchor: "center",
  });
  return new THREE.Mesh(geo, voxelMaterial({ roughness: 0.6 }));
}

export function knife(voxel = 0.3): THREE.Mesh {
  const geo = voxelModel({
    palette: { b: 0xd6dbe0, e: 0x9aa1aa, h: 0x2a2320 },
    layers: [["..........", "bbbbbbbbbb", "eeeeeeehhh", "........hh"]],
    axis: "x",
    voxel,
    anchor: "center",
  });
  return new THREE.Mesh(geo, voxelMaterial({ roughness: 0.35, metalness: 0.35 }));
}

export function magnifier(voxel = 0.11): THREE.Group {
  const g = new THREE.Group();
  const frame = new VoxGrid(1, 13, 20);
  const ring = 0x8a6a32;
  for (let y = 0; y < 13; y++) {
    for (let z = 8; z < 20; z++) {
      const d = Math.hypot(y - 6, z - 13.5);
      if (d > 5.0 && d <= 6.4) frame.set(0, y, z, ring);
    }
  }
  frame.box(0, 6, 0, 1, 7, 8, 0x3a2a1c);
  const fm = new THREE.Mesh(frame.geometry(voxel * 2, "center"), matte());
  fm.scale.x = 1.4;
  g.add(fm);
  const lens = new VoxGrid(1, 13, 20);
  for (let y = 0; y < 13; y++) {
    for (let z = 8; z < 20; z++) if (Math.hypot(y - 6, z - 13.5) <= 5.0) lens.set(0, y, z, 0xcfeaff);
  }
  const lm = new THREE.Mesh(lens.geometry(voxel * 2, "center"), new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.32, roughness: 0.1, depthWrite: false }));
  lm.scale.x = 0.5;
  g.add(lm);
  return g;
}

export function teacup(voxel = 0.28): THREE.Mesh {
  const g = new VoxGrid(9, 6, 9);
  g.cyl(4.5, 4.5, 4.4, 1, 6, (x, y) => (y >= 5 ? 0x3d63a8 : jitter(0xf2f0e8, 0.02, x, y, 0, 3)));
  g.cyl(4.5, 4.5, 3.2, 1, 6, () => null);
  g.cyl(4.5, 4.5, 3.2, 1, 4, 0x8a4f1c);
  g.cyl(4.5, 4.5, 2.6, 0, 1, 0xd9d6cc);
  return g.mesh(voxel, matte({ roughness: 0.4 }), "center");
}

export function teapot(voxel = 0.28): THREE.Group {
  const grp = new THREE.Group();
  const g = new VoxGrid(16, 10, 12);
  g.cyl(6, 6, 5.4, 0, 8, (x, y) => (y > 6 ? 0x3d63a8 : jitter(0xece8de, 0.02, x, y, 0, 4)));
  g.cyl(6, 6, 1.6, 8, 10, 0xece8de);
  g.box(11, 3, 5, 15, 5, 7, 0xece8de);
  g.box(12, 5, 5, 15, 7, 7, 0xece8de);
  g.box(0, 3, 5, 1, 7, 7, 0xd8d4c8);
  grp.add(g.mesh(voxel, matte({ roughness: 0.4 }), "center"));
  return grp;
}

export function radio(): { group: THREE.Group; dial: THREE.Mesh; dialMat: THREE.MeshBasicMaterial } {
  const g = new VoxGrid(28, 18, 12);
  g.box(0, 0, 0, 28, 18, 12, (x, y, z) => jitter(0x6b4526, 0.06, x, y, z, 2));
  g.box(2, 3, 11, 15, 15, 12, (x, y) => ((x + y) % 2 === 0 ? 0x2a1d12 : 0x4a3520));
  g.box(17, 10, 11, 26, 16, 12, 0x1a1512);
  g.box(18, 3, 11, 20, 6, 12, 0xd8c9a3);
  g.box(22, 3, 11, 24, 6, 12, 0xd8c9a3);
  g.box(24, 18, 9, 25, 30, 10, 0xaab0b8);
  const group = new THREE.Group();
  group.add(g.mesh(0.016, matte({ roughness: 0.6 }), "center"));
  const d = new VoxGrid(8, 3, 1);
  d.box(0, 0, 0, 8, 3, 1, (x) => (x === 4 ? 0xff4a1a : 0xffb347));
  const dialMat = glow({ toneMapped: false });
  const dial = new THREE.Mesh(d.geometry(0.016, "center"), dialMat);
  dial.position.set(0.081, 0.05, 0.095);
  group.add(dial);
  return { group, dial, dialMat };
}

export function cameraProp(voxel = 0.42): THREE.Group {
  const g = new VoxGrid(10, 7, 8);
  g.box(0, 0, 0, 10, 6, 8, (x, y, z) => jitter(y >= 4 ? 0x2c3037 : 0x191b1f, 0.05, x, y, z, 6));
  g.box(3, 1, 8, 7, 5, 9, 0x8f98a4);
  g.box(4, 2, 9, 6, 4, 10, 0x1b2733);
  g.box(0, 6, 1, 3, 7, 4, 0x9aa1aa);
  const grp = new THREE.Group();
  const m = g.mesh(voxel, matte({ roughness: 0.5, metalness: 0.15 }), "center");
  grp.add(m);
  return grp;
}

export function locator(voxel = 0.1): { group: THREE.Group; led: THREE.Mesh; ledMat: THREE.MeshBasicMaterial; halo: THREE.Mesh } {
  const g = new VoxGrid(12, 4, 8);
  g.box(0, 0, 0, 12, 4, 8, (x, y, z) => jitter(0x9aa2ad, 0.05, x, y, z, 1));
  g.box(1, 3, 1, 11, 4, 7, 0x2a2f37);
  g.box(6, 3, 2, 10, 4, 6, 0x123a52);
  const grp = new THREE.Group();
  grp.add(g.mesh(voxel, matte({ roughness: 0.5 }), "center"));
  const l = new VoxGrid(3, 2, 3).box(0, 0, 0, 3, 2, 3, 0xffffff);
  const ledMat = glow({ toneMapped: false });
  ledMat.color.set(0x37ff7a);
  const led = new THREE.Mesh(l.geometry(voxel, "center"), ledMat);
  led.position.set(-3 * voxel, 2.6 * voxel, 0);
  grp.add(led);
  const h = new VoxGrid(6, 1, 6).box(0, 0, 0, 6, 1, 6, (x, y, z) => (Math.hypot(x - 2.5, z - 2.5) < 3.0 ? 0xffffff : null));
  const haloMat = glow({ toneMapped: false, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
  haloMat.color.set(0x37ff7a);
  const halo = new THREE.Mesh(h.geometry(voxel, "center"), haloMat);
  halo.position.set(-3 * voxel, 2.1 * voxel, 0);
  grp.add(halo);
  return { group: grp, led, ledMat, halo };
}

/** One caseless 7.62 round: propellant block topped by a projectile. */
export function roundGeometry(voxel: number, meteor: boolean): THREE.BufferGeometry {
  const g = new VoxGrid(2, 2, 8);
  g.box(0, 0, 0, 2, 2, 5, (x, y, z) => jitter(0xa9793a, 0.08, x, y, z, 2));
  g.box(0, 0, 5, 2, 2, 8, (x, y, z) => (meteor ? jitter(0x4e4a46, 0.1, x, y, z, 3) : jitter(0xc98f3a, 0.06, x, y, z, 3)));
  return g.geometry(voxel, "center");
}

export function shade1(hex: number, k: number): number {
  return shade(hex, k);
}

// ---- more hand props ---------------------------------------------------------------
export function phoneProp(voxel = 0.16): { group: THREE.Group; screenMat: THREE.MeshBasicMaterial } {
  const group = new THREE.Group();
  const body = new VoxGrid(6, 11, 1).box(0, 0, 0, 6, 11, 1, (x, y, z) => jitter(0x1b1d22, 0.05, x, y, z, 2));
  const bm = body.mesh(voxel, matte({ roughness: 0.3 }), "center");
  group.add(bm);
  const scr = new VoxGrid(5, 9, 1).box(0, 0, 0, 5, 9, 1, 0xffffff);
  const screenMat = glow({ toneMapped: false });
  screenMat.color.set(0x9fd8ff);
  const sm = new THREE.Mesh(scr.geometry(voxel, "center"), screenMat);
  sm.position.z = voxel * 0.55;
  group.add(sm);
  return { group, screenMat };
}

/** Three meteorites rolled in green felt and knotted. */
export function clothBundle(voxel = 0.2): THREE.Group {
  const g = new VoxGrid(12, 7, 8);
  g.ball(6, 3, 4, 3.4, (x, y, z) => jitter(hash3(x, y, z, 2) > 0.5 ? 0x2f5a44 : 0x2a4f3b, 0.08, x, y, z, 3));
  g.ball(3, 2.5, 4, 2.6, (x, y, z) => jitter(0x2f5a44, 0.08, x, y, z, 4));
  g.ball(9, 2.5, 4, 2.6, (x, y, z) => jitter(0x2a4f3b, 0.08, x, y, z, 5));
  g.box(5, 5, 3, 7, 7, 5, 0x3a6e54);
  const grp = new THREE.Group();
  grp.add(g.mesh(voxel, matte({ roughness: 1 }), "center"));
  return grp;
}

export function shade2(hex: number, k: number): number {
  return shade(hex, k);
}

/** A rifle scope on its own, for the hand (figure-pixel units). */
export function scopeMesh(voxel = 0.34): THREE.Mesh {
  const sg = new VoxGrid(3, 4, 14);
  sg.box(0, 1, 2, 3, 4, 12, (x, y, z) => ((x === 0 || x === 2) && (y === 1 || y === 3) ? null : 0x3b4048));
  sg.box(0, 1, 11, 3, 4, 14, 0x2a2e35);
  sg.box(0, 1, 13, 3, 4, 14, 0x7ec8ff);
  sg.box(0, 1, 0, 3, 4, 2, 0x16181c);
  sg.box(0, 0, 3, 3, 1, 10, 0xc0c6ce);
  const m = new THREE.Mesh(sg.geometry(voxel * 0.8, "center"), voxelMaterial({ roughness: 0.4, metalness: 0.3 }));
  m.castShadow = true;
  return m;
}

/** Life-support pack: goes on `anchors.back`. Figure-pixel units. */
export function backpack(): THREE.Group {
  const g = new VoxGrid(7, 9, 3);
  g.box(0, 0, 0, 7, 9, 3, (x, y, z) => jitter(y > 6 ? 0xdde2e7 : 0xc4ccd4, 0.03, x, y, z, 2));
  g.box(1, 2, 0, 6, 5, 1, 0x8d97a3);
  g.box(2, 7, 2, 5, 8, 3, 0x4b525c);
  const n = new VoxGrid(7, 2, 3);
  n.box(1, 0, 0, 3, 2, 2, 0x4b525c);
  n.box(4, 0, 0, 6, 2, 2, 0x4b525c);
  const grp = new THREE.Group();
  const m = g.mesh(1, matte({ roughness: 0.55 }), "center");
  grp.add(m);
  const nm = n.mesh(1, matte({ roughness: 0.4 }), "center");
  nm.position.set(0, -5.4, 0);
  grp.add(nm);
  grp.position.set(0, -1.5, -1.9);
  return grp;
}
