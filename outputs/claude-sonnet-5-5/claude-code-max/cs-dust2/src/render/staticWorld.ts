// Builds the level meshes from the collision boxes (so what you see is exactly what you collide with):
// boxes are grouped by surface style and merged into one BufferGeometry per style, with world-space UVs and baked
// per-vertex lighting (classic lightmap look, independent of scene lights). Also owns the door meshes and site decals.
import * as THREE from 'three';
import type { Box } from '../game/collision';
import type { Level } from '../game/level';
import { floorAt } from '../game/map/build';
import * as tx from './textures';

interface Style {
  map: THREE.Texture;
  /** Metres per texture repeat. */
  tile: number;
  tint: [number, number, number];
}

interface Part {
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[];
  idx: number[];
}

const newPart = (): Part => ({ pos: [], nor: [], uv: [], col: [], idx: [] });

// Sun direction used for the baked shading.
const SUN = (() => {
  const v = new THREE.Vector3(0.45, 0.8, 0.35);
  return v.normalize();
})();

const faceLight = (nx: number, ny: number, nz: number): number => {
  if (ny < -0.5) return 0.3;
  const lambert = Math.max(0, nx * SUN.x + ny * SUN.y + nz * SUN.z);
  return 0.5 + 0.5 * lambert;
};

interface FaceDef {
  n: [number, number, number];
  /** Four corners, counter-clockwise seen from outside, given as [xSel, ySel, zSel] with 0 = min, 1 = max. */
  v: [number, number, number][];
}

const FACES: FaceDef[] = [
  { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

const hash = (x: number, y: number, z: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

const addBox = (part: Part, b: Box, style: Style, skipBottom: boolean): void => {
  const lo = [b.minX, b.minY, b.minZ];
  const hi = [b.maxX, b.maxY, b.maxZ];
  // Slight per-box brightness variation breaks up flat repetition.
  const variation = 0.93 + hash(b.minX, b.minY, b.minZ) * 0.14;
  for (const f of FACES) {
    if (skipBottom && f.n[1] < 0) continue;
    const base = part.pos.length / 3;
    const light = faceLight(f.n[0], f.n[1], f.n[2]) * variation;
    for (const c of f.v) {
      const x = c[0] ? hi[0] : lo[0];
      const y = c[1] ? hi[1] : lo[1];
      const z = c[2] ? hi[2] : lo[2];
      part.pos.push(x, y, z);
      part.nor.push(f.n[0], f.n[1], f.n[2]);
      // World-space UVs keep the texture scale identical across merged boxes.
      let u: number;
      let v: number;
      if (f.n[0] !== 0) {
        u = z;
        v = y;
      } else if (f.n[1] !== 0) {
        u = x;
        v = z;
      } else {
        u = x;
        v = y;
      }
      part.uv.push(u / style.tile, v / style.tile);
      // Walls get a soft darkening towards the ground (fake ambient occlusion).
      const ao = f.n[1] === 0 ? 0.72 + 0.28 * Math.min(1, Math.max(0, (y + 0.2) / 2.4)) : 1;
      const k = light * ao;
      part.col.push(style.tint[0] * k, style.tint[1] * k, style.tint[2] * k);
    }
    part.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
};

const toGeometry = (p: Part): THREE.BufferGeometry => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3));
  g.setIndex(p.idx);
  g.computeBoundingSphere();
  return g;
};

export class StaticWorld {
  readonly group = new THREE.Group();
  private readonly disposables: { dispose: () => void }[] = [];
  private readonly doorMeshes: { mesh: THREE.Mesh; box: Box }[] = [];

  constructor(level: Level) {
    const textures = {
      sand: tx.makeSandTexture(),
      wall: tx.makeWallTexture(),
      stone: tx.makeStoneTexture(),
      roof: tx.makeRoofTexture(),
      wood: tx.makeWoodTexture(),
      crate: tx.makeCrateTexture(),
      container: tx.makeContainerTexture(),
      door: tx.makeDoorTexture(),
    };
    for (const t of Object.values(textures)) this.disposables.push(t);

    const styles: Record<string, Style> = {
      'floor:sand': { map: textures.sand, tile: 4, tint: [1, 1, 1] },
      'floor:stone': { map: textures.stone, tile: 4, tint: [1, 1, 1] },
      'floor:wood': { map: textures.wood, tile: 3, tint: [1, 1, 1] },
      'floor:metal': { map: textures.container, tile: 3, tint: [1, 1, 1] },
      wall: { map: textures.wall, tile: 3, tint: [1, 0.97, 0.9] },
      roof: { map: textures.roof, tile: 3, tint: [0.85, 0.85, 0.85] },
      'crate:wood': { map: textures.crate, tile: 1.5, tint: [1, 1, 1] },
      'crate:metal': { map: textures.container, tile: 2.5, tint: [1, 1, 1] },
      'crate:stone': { map: textures.stone, tile: 2.5, tint: [0.9, 0.9, 0.95] },
    };

    const parts = new Map<string, Part>();
    for (const b of level.map.boxes) {
      const style = styles[b.tag];
      if (!style) continue;
      let part = parts.get(b.tag);
      if (!part) {
        part = newPart();
        parts.set(b.tag, part);
      }
      // Bottoms of the ground slabs / wall columns are never visible.
      addBox(part, b, style, b.tag.startsWith('floor') || b.tag === 'wall' || b.tag === 'roof' ? b.minY <= -2.9 : false);
    }
    for (const [tag, part] of parts) {
      const geo = toGeometry(part);
      const mat = new THREE.MeshBasicMaterial({ map: styles[tag].map, vertexColors: true });
      const mesh = new THREE.Mesh(geo, mat);
      this.group.add(mesh);
      this.disposables.push(geo, mat);
    }

    // Sliding doors: unit boxes scaled to the (moving) collision leaves every frame.
    const doorGeo = new THREE.BoxGeometry(1, 1, 1);
    const doorMat = new THREE.MeshBasicMaterial({ map: textures.door, color: 0xdddddd });
    this.disposables.push(doorGeo, doorMat);
    for (const door of level.doors) {
      for (const leaf of [door.leafA, door.leafB]) {
        const mesh = new THREE.Mesh(doorGeo, doorMat);
        this.group.add(mesh);
        this.doorMeshes.push({ mesh, box: leaf });
      }
    }

    // Bombsite decals.
    for (const site of level.map.sites) {
      const tex = tx.makeSiteLabelTexture(site.id);
      const size = site.radius * 2.15;
      const geo = new THREE.PlaneGeometry(size, size);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      const fy = floorAt(level.map, site.x, site.z);
      mesh.position.set(site.x, (Number.isNaN(fy) ? 0 : fy) + 0.03, site.z);
      this.group.add(mesh);
      this.disposables.push(tex, geo, mat);
    }

    this.update();
  }

  /** Sync door meshes with their collision leaves. */
  update(): void {
    for (const d of this.doorMeshes) {
      const b = d.box;
      d.mesh.visible = b.enabled;
      d.mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
      d.mesh.scale.set(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.clear();
  }
}
