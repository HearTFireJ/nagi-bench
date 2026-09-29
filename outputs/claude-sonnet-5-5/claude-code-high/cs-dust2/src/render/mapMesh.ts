// Builds the static Dust2 render geometry from the same data the collision world uses:
// floor (per grid cell, tinted per area), merged wall boxes, crates, site letters.
// Doors are dynamic and built separately (see DoorMeshes).

import * as THREE from 'three';
import { AREAS, DOORS, SITES, WALL_H } from '../sim/map.ts';
import type { World } from '../sim/world.ts';
import type { GameSim } from '../sim/game.ts';
import { makeCrateTexture, makeLetterTexture, makePlasterTexture } from './textures.ts';

class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  quad(
    p: [number, number, number][],
    n: [number, number, number],
    uvs: [number, number][],
    c0: THREE.Color,
    c1: THREE.Color,
  ): void {
    const base = this.pos.length / 3;
    // p0,p1 bottom (c0), p2,p3 top (c1) for side faces; callers pass consistent order
    const cs = [c0, c0, c1, c1];
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uvs[i][0], uvs[i][1]);
      this.col.push(cs[i].r, cs[i].g, cs[i].b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Axis-aligned box without bottom face. `shade` darkens the lower `band` meters. */
  box(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    color: THREE.Color,
    band = 1.2,
    bandShade = 0.78,
    uvScale = 3,
  ): void {
    const low = color.clone().multiplyScalar(bandShade);
    const mid = color.clone();
    const top = color.clone().multiplyScalar(1.06);
    const s = uvScale;
    const yb = Math.min(y1, y0 + band);
    const sides: { n: [number, number, number]; a: [number, number]; b: [number, number]; shade: number }[] = [
      { n: [0, 0, 1], a: [x0, z1], b: [x1, z1], shade: 1 },
      { n: [0, 0, -1], a: [x1, z0], b: [x0, z0], shade: 1 },
      { n: [1, 0, 0], a: [x1, z1], b: [x1, z0], shade: 0.94 },
      { n: [-1, 0, 0], a: [x0, z0], b: [x0, z1], shade: 0.94 },
    ];
    for (const sd of sides) {
      const [ax, az] = sd.a;
      const [bx, bz] = sd.b;
      const along0 = sd.n[0] !== 0 ? az : ax;
      const along1 = sd.n[0] !== 0 ? bz : bx;
      const lo = low.clone().multiplyScalar(sd.shade);
      const mi = mid.clone().multiplyScalar(sd.shade);
      const tp = top.clone().multiplyScalar(sd.shade);
      // lower band
      this.quad(
        [
          [ax, y0, az],
          [bx, y0, bz],
          [bx, yb, bz],
          [ax, yb, az],
        ],
        sd.n,
        [
          [along0 / s, y0 / s],
          [along1 / s, y0 / s],
          [along1 / s, yb / s],
          [along0 / s, yb / s],
        ],
        lo,
        mi,
      );
      if (y1 > yb + 0.001) {
        this.quad(
          [
            [ax, yb, az],
            [bx, yb, bz],
            [bx, y1, bz],
            [ax, y1, az],
          ],
          sd.n,
          [
            [along0 / s, yb / s],
            [along1 / s, yb / s],
            [along1 / s, y1 / s],
            [along0 / s, y1 / s],
          ],
          mi,
          tp,
        );
      }
    }
    // top
    const t = top;
    this.quad(
      [
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y1, z0],
        [x0, y1, z0],
      ],
      [0, 1, 0],
      [
        [x0 / s, z1 / s],
        [x1 / s, z1 / s],
        [x1 / s, z0 / s],
        [x0 / s, z0 / s],
      ],
      t,
      t,
    );
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

function hash(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

const CRATE_COLORS: Record<string, number> = {
  crate: 0xb98a4e,
  container: 0x2f6aa8,
  car: 0x6b8a72,
  platform: 0xc9a468,
};

export function buildStaticMap(world: World): THREE.Group {
  const group = new THREE.Group();
  const plaster = makePlasterTexture();
  const crateTex = makeCrateTexture();

  // ---- floor ----------------------------------------------------------------------------------
  const floor = new GeoBuilder();
  const { W, H, walk, area } = world.grid;
  for (let z = 0; z < H; z++) {
    let x = 0;
    while (x < W) {
      const i = z * W + x;
      if (!walk[i]) {
        x++;
        continue;
      }
      const a = area[i];
      const x0 = x;
      while (x < W && walk[z * W + x] && area[z * W + x] === a && x - x0 < 4) x++;
      const tint = new THREE.Color(AREAS[a]?.tint ?? 0xcdb27a);
      tint.multiplyScalar(0.93 + hash(x0, z) * 0.1);
      floor.quad(
        [
          [x0, 0, z + 1],
          [x, 0, z + 1],
          [x, 0, z],
          [x0, 0, z],
        ],
        [0, 1, 0],
        [
          [x0 / 4, (z + 1) / 4],
          [x / 4, (z + 1) / 4],
          [x / 4, z / 4],
          [x0 / 4, z / 4],
        ],
        tint,
        tint,
      );
    }
  }
  const floorMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: plaster });
  group.add(new THREE.Mesh(floor.build(), floorMat));

  // outer ground (so the void beyond walls is not see-through when looking over them)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshLambertMaterial({ color: 0xa8956a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(W / 2, -0.05, H / 2);
  group.add(ground);

  // ---- walls -------------------------------------------------------------------------------------
  const walls = new GeoBuilder();
  const crates = new GeoBuilder();
  for (const b of world.boxes) {
    if (b.kind === 'wall') {
      const c = new THREE.Color(0xd8bc86);
      const v = 0.92 + hash(b.minX, b.minZ) * 0.14;
      // a few cooler blue-ish walls, like the painted Dust2 sections
      if (hash(b.minX * 3.1, b.minZ * 1.7) > 0.86) c.set(0xb9c3c6);
      c.multiplyScalar(v);
      walls.box(b.minX, 0, b.minZ, b.maxX, WALL_H, b.maxZ, c, 1.3, 0.74, 3.5);
      // wall cap so the top edge reads against the sky
    } else if (b.kind === 'crate') {
      const c = new THREE.Color(CRATE_COLORS[b.style ?? 'crate'] ?? 0xb98a4e);
      crates.box(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, c, 0.15, 0.9, 2);
    }
  }
  group.add(new THREE.Mesh(walls.build(), new THREE.MeshLambertMaterial({ vertexColors: true, map: plaster })));
  group.add(new THREE.Mesh(crates.build(), new THREE.MeshLambertMaterial({ vertexColors: true, map: crateTex })));

  // ---- site markers ----------------------------------------------------------------------------------
  for (const s of SITES) {
    const tex = makeLetterTexture(s.id, s.id === 'A' ? '#ffd23f' : '#5fd0ff');
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(s.center.x, 0.03, s.center.z);
    group.add(m);
  }
  return group;
}

/** Dynamic door leaves: slide into the walls according to GameSim door state. */
export class DoorMeshes {
  private meshes: { mesh: THREE.Mesh; base: THREE.Vector3; slide: THREE.Vector3; door: number; size: THREE.Vector3 }[] = [];
  readonly group = new THREE.Group();

  constructor() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x5a7386 });
    const trim = new THREE.MeshLambertMaterial({ color: 0x2f3d49 });
    DOORS.forEach((d, di) => {
      for (const l of d.leaves) {
        const w = l.x1 - l.x0;
        const dd = l.z1 - l.z0;
        const inset = 0.06;
        const size = new THREE.Vector3(w - inset * 2, WALL_H - 0.4, dd - inset * 2);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
        const base = new THREE.Vector3((l.x0 + l.x1) / 2, size.y / 2, (l.z0 + l.z1) / 2);
        mesh.position.copy(base);
        this.group.add(mesh);
        // a dark band so doors read as doors
        const band = new THREE.Mesh(new THREE.BoxGeometry(size.x + 0.02, 0.3, size.z + 0.02), trim);
        band.position.set(0, 1.0 - size.y / 2, 0);
        mesh.add(band);
        const band2 = band.clone();
        band2.position.set(0, 2.2 - size.y / 2, 0);
        mesh.add(band2);
        const slide =
          l.slide.x !== 0 ? new THREE.Vector3(l.slide.x * (l.x1 - l.x0), 0, 0) : new THREE.Vector3(0, 0, l.slide.z * (l.z1 - l.z0));
        this.meshes.push({ mesh, base, slide, door: di, size });
      }
    });
  }

  update(sim: GameSim): void {
    for (const m of this.meshes) {
      const open = sim.doors[m.door].open;
      m.mesh.position.set(m.base.x + m.slide.x * open, m.base.y, m.base.z + m.slide.z * open);
    }
  }
}
