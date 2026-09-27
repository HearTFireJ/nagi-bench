import * as THREE from "three";
import { voxelModel, voxelSphere, voxelMaterial, buildVoxelGeometry } from "@agentbench/voxel-kit";
import { fbm3, hash3, rng } from "./util";

/*
 * Props are drawn as character grids: each slice is an elevation you can read.
 * Units for hand-held props are figure pixels (1 px = 0.05625 m at 1.8 m).
 */

const gunPalette = { "#": 0x23262c, "=": 0x2e323a, g: 0x3a3530, s: 0x14161a, o: 0x0a0a0c };

// Side elevation, 16 columns (back -> front along +Z), 9 rows (top -> bottom).
const GUN_SIDE = [
  "..#...........#.",
  ".=============#.",
  ".==============.",
  "..#############.",
  "..###.o.........",
  "..ggg...........",
  "..ggg...........",
  "..ggg...........",
  "...gg...........",
];
const GUN_MID = [
  "..#...........#.",
  ".=============#.",
  ".==============.",
  "..#############.",
  "..###.ss........",
  "..ggg...........",
  "..ggg...........",
  "..ggg...........",
  "...gg...........",
];

/** The 2010 service pistol: barrel along +Z, grip along -Y, ready for a hand anchor. */
export function pistol(): THREE.Group {
  const geo = voxelModel({ palette: gunPalette, layers: [GUN_SIDE, GUN_MID, GUN_SIDE], axis: "x", voxel: 0.34, anchor: "min" });
  const mesh = new THREE.Mesh(geo, voxelMaterial({ roughness: 0.55, metalness: 0.35 }));
  // Put the grip in the fist: grip is columns 2-4, rows 5-8 -> shift so it sits around the origin.
  mesh.position.set(-0.5, -0.9, -1.0);
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.name = "pistol";
  return g;
}

/** A rifle scope re-fitted with magnet clamps; sits on the slide, pointing +Z. */
export function scope(): THREE.Mesh {
  const pal = { "#": 0x1c1f24, l: 0x3f6fa8, m: 0x2a2d33, r: 0x7a1f1f };
  const side = [
    "..######......######..",
    ".########....########.",
    ".#######mmmmmm#######.",
    "l########....########.",
    "..######......######..",
    "......mm......mm......",
  ];
  const mid = [
    "..######......######..",
    ".########....########.",
    ".#######mmmmmm#######.",
    "l########....########.",
    "..######......######..",
    "......mm......mm......",
  ];
  const geo = voxelModel({ palette: pal, layers: [side, mid, side], axis: "x", voxel: 0.3, anchor: "min" });
  const m = new THREE.Mesh(geo, voxelMaterial({ roughness: 0.5, metalness: 0.4 }));
  m.position.set(-0.45, 2.15, -1.6);
  m.name = "scope";
  return m;
}

/** Caseless pistol magazine: a dark slab. */
export function magazine(): THREE.Mesh {
  const pal = { "#": 0x2b2f36, b: 0x6b6f77 };
  const side = ["###", "###", "###", "###", "###", "###", "###", "bbb"];
  const geo = voxelModel({ palette: pal, layers: [side, side], axis: "x", voxel: 0.34, anchor: "center" });
  return new THREE.Mesh(geo, voxelMaterial({ roughness: 0.6, metalness: 0.3 }));
}

/** One caseless round: a grey-green propellant block with the bullet on top. */
export function cartridge(meteorHead = false): THREE.Mesh {
  const pal = { p: 0x6e7a5c, h: meteorHead ? 0x3a3a40 : 0xb08a52, d: 0x4c5541 };
  const side = ["h", "h", "p", "p", "p", "d"];
  const geo = voxelModel({ palette: pal, layers: [side, side], axis: "x", voxel: 0.3, anchor: "min" });
  const m = new THREE.Mesh(geo, voxelMaterial({ roughness: 0.6, metalness: 0.25 }));
  return m;
}

/** An irregular iron meteorite. `radius` in voxels; `voxel` sets world size. */
export function meteorite(seed: number, radius: number, voxel: number): THREE.Mesh {
  const geo = voxelSphere(radius, (x, y, z, d) => {
    const n = fbm3(x * 0.35 + seed, y * 0.35, z * 0.35 - seed, 3);
    if (d > 0.78 + (n - 0.5) * 0.5) return null;      // pitted, irregular surface
    const h = hash3(x + seed, y, z);
    if (h < 0.08) return 0x6b4a33;                        // rust blooms
    if (h < 0.2) return 0x2a2b31;
    return n > 0.55 ? 0x4a4c52 : 0x3a3b41;
  }, { voxel });
  const m = new THREE.Mesh(geo, voxelMaterial({ roughness: 0.6, metalness: 0.55 }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A finished meteorite cylinder segment, pencil thick. */
export function meteorSegment(voxel: number): THREE.Mesh {
  const pal = { "#": 0x40424a, e: 0x5b5e66 };
  const layer = [".e#.", "e##e", "####", ".##."];
  const bottom = [".##.", "####", "####", ".##."];
  const geo = voxelModel({ palette: pal, layers: [bottom, layer, layer, layer, layer, layer, bottom], axis: "y", voxel, anchor: "center" });
  const m = new THREE.Mesh(geo, voxelMaterial({ roughness: 0.5, metalness: 0.6 }));
  m.castShadow = true;
  return m;
}

/** A small porcelain tea cup with a blue rim (world units in metres). */
export function teacup(): THREE.Mesh {
  const pal = { w: 0xf0ece2, b: 0x3b5b8f, t: 0x8a6a3c };
  const ring = ["wwww", "w..w", "w..w", "wwww"];
  const rim = ["bbbb", "b..b", "b..b", "bbbb"];
  const base = [".ww.", "wwww", "wwww", ".ww."];
  const tea = ["wwww", "wttw", "wttw", "wwww"];
  const geo = voxelModel({ palette: pal, layers: [base, ring, ring, tea, rim], axis: "y", voxel: 0.016, anchor: "min" });
  const m = new THREE.Mesh(geo, voxelMaterial({ roughness: 0.35 }));
  m.castShadow = true;
  return m;
}

/** Hand-held phone: a thin slab with a lit face. */
export function phone(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 2.8), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.4, metalness: 0.4 }));
  const screen = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 2.5), new THREE.MeshStandardMaterial({ color: 0x0b1a2a, emissive: 0x6fb2ff, emissiveIntensity: 0.9 }));
  screen.position.y = 0.15;
  g.add(body, screen);
  g.rotation.x = -0.4;
  return g;
}

/** A hand lens on a brass handle. */
export function magnifier(): THREE.Mesh {
  const pal = { r: 0x8a6a2c, g: 0x9fc3d8, h: 0x3a2a1c };
  const face = [
    "..rrrr..",
    ".rggggr.",
    "rggggggr",
    "rggggggr",
    ".rggggr.",
    "..rrrr..",
    "...hh...",
    "...hh...",
    "...hh...",
  ];
  const geo = voxelModel({ palette: pal, layers: [face], axis: "z", voxel: 0.012, anchor: "center" });
  const m = new THREE.Mesh(geo, voxelMaterial({ roughness: 0.4, metalness: 0.4 }));
  m.castShadow = true;
  return m;
}

/** Pliers: two dark jaws and red grips. */
export function pliers(): THREE.Mesh {
  const pal = { "#": 0x3a3d44, r: 0x9a2b2b };
  const top = ["..#####", ".#.....", "#......", ".#.....", "..#####"];
  const grips = ["rrrrr..", ".......", ".......", ".......", "rrrrr.."];
  const geo = voxelModel({ palette: pal, layers: [grips, top], axis: "y", voxel: 0.012, anchor: "center" });
  return new THREE.Mesh(geo, voxelMaterial({ roughness: 0.5, metalness: 0.4 }));
}

/** Suit positioning unit: a small grey puck with a lamp. */
export function beacon(): THREE.Group {
  const g = new THREE.Group();
  const pal = { "#": 0x7d838c, d: 0x4a4f57 };
  const layer = [".###.", "#####", "#####", "#####", ".###."];
  const geo = voxelModel({ palette: pal, layers: [layer, layer], axis: "y", voxel: 0.02, anchor: "min" });
  const body = new THREE.Mesh(geo, voxelMaterial({ roughness: 0.5, metalness: 0.4 }));
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.02), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3b1f, emissiveIntensity: 2 }));
  lamp.position.set(0, 0.046, 0);
  lamp.name = "lamp";
  g.add(body, lamp);
  return g;
}

/** Photographer's camera: a boxy body with a lens, sits in a hand anchor, lens along +Z. */
export function stillCamera(): THREE.Mesh {
  const pal = { "#": 0x1e2126, l: 0x3a6fa0, s: 0x8a8f98 };
  const side = ["..ss..", "######", "####ll", "####ll", "######"];
  const mid = ["..ss..", "######", "####ll", "####ll", "######"];
  const geo = voxelModel({ palette: pal, layers: [side, mid, mid, side], axis: "x", voxel: 0.5, anchor: "center" });
  return new THREE.Mesh(geo, voxelMaterial({ roughness: 0.5, metalness: 0.3 }));
}

/** A voxel wedge of raw beef, dark red with fat marbling. */
export function beef(): THREE.Mesh {
  const geo = buildVoxelGeometry({
    size: [14, 6, 10],
    at(x, y, z) {
      const n = fbm3(x * 0.4, y * 0.6, z * 0.4, 2);
      if (n < 0.28) return null;
      const h = hash3(x, y, z);
      if (h < 0.14) return 0xd9c7b5;     // fat
      return n > 0.6 ? 0x7a1e22 : 0x5e161a;
    },
  }, { voxel: 0.02 });
  return new THREE.Mesh(geo, voxelMaterial({ roughness: 0.7 }));
}

/** A field of small drifting construction debris: one merged geometry. */
export function debrisField(count: number, spread: number, seed: number): THREE.Group {
  const r = rng(seed);
  const g = new THREE.Group();
  const mat = voxelMaterial({ roughness: 0.7, metalness: 0.3 });
  for (let i = 0; i < count; i++) {
    const kind = r();
    let geo: THREE.BufferGeometry;
    if (kind < 0.4) {
      geo = new THREE.BoxGeometry(1 + r() * 6, 0.4 + r() * 1.2, 0.4 + r() * 1.2);
    } else if (kind < 0.7) {
      geo = voxelSphere(2 + Math.floor(r() * 2), (x, y, z) => (hash3(x, y, z + i) > 0.5 ? 0x8a8f98 : 0x5f646c), { voxel: 0.5 });
    } else {
      geo = new THREE.BoxGeometry(0.6, 0.6, 3 + r() * 10);
    }
    const m = new THREE.Mesh(geo, kind < 0.4 || kind >= 0.7
      ? new THREE.MeshStandardMaterial({ color: r() < 0.5 ? 0x9aa0a8 : 0x6d7178, roughness: 0.6, metalness: 0.4 })
      : mat);
    m.position.set((r() - 0.5) * spread, (r() - 0.5) * spread * 0.6, (r() - 0.5) * spread);
    m.rotation.set(r() * 6.28, r() * 6.28, r() * 6.28);
    m.userData.spin = [(r() - 0.5) * 0.2, (r() - 0.5) * 0.2, (r() - 0.5) * 0.2];
    g.add(m);
  }
  return g;
}
