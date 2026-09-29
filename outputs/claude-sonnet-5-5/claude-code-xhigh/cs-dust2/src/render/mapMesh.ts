import * as THREE from 'three';
import type { World, Box } from '../core/physics/world.ts';
import type { CrateMat } from '../core/map/types.ts';
import { GeoBuilder } from './geo.ts';
import { crateTexture, floorTexture, roofTexture, wallTexture } from './textures.ts';
import type { CrateStyle } from './textures.ts';

// Palette per style index (see core/map/dust2.ts): [floor, wall]
const PALETTE: [number, number][] = [
  [0xe2c98f, 0xe6cf9c], // 0 sand
  [0xb9a57e, 0xb09a72], // 1 tunnel
  [0xcdbf9d, 0xf0e2bd], // 2 CT plaster
  [0xd9a672, 0xe0a25f], // 3 B orange
  [0xb3ab99, 0xbdb5a2], // 4 concrete (T spawn)
  [0xe6d29e, 0xf0dca8], // 5 A site
  [0xd6bd88, 0xdcc38f], // 6 mid
];

const CRATE_COLOR: Record<CrateMat, number> = {
  wood: 0xd0a15e,
  containerBlue: 0x3a6cb0,
  containerGreen: 0x4a8656,
  metal: 0x7d8592,
  car: 0xc9c0ae,
  doorWood: 0x9a6a3a,
};

/** Static level geometry (merged into a handful of meshes) plus the animated sliding doors. */
export class MapMesh {
  readonly group = new THREE.Group();
  private textures: THREE.Texture[] = [];
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private doors: { world: World; index: number; a: THREE.Mesh; b: THREE.Mesh }[] = [];

  constructor(world: World) {
    const floorB = new GeoBuilder();
    const wallB = new GeoBuilder();
    const roofB = new GeoBuilder();
    const crateB = new Map<CrateMat, GeoBuilder>();

    for (const b of world.boxes) {
      const pal = PALETTE[b.style] ?? PALETTE[0];
      switch (b.kind) {
        case 'floor':
          floorB.addBox(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, pal[0], { uv: 4, jitter: 0.03, skipBottom: true });
          break;
        case 'wall':
          wallB.addBox(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, pal[1], { uv: 4, grad: [0.84, 1], jitter: 0.035, skipBottom: true });
          break;
        case 'roof':
          roofB.addBox(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, 0x9a8e74, { uv: 4, grad: [0.7, 1], skipBottom: false });
          break;
        case 'lintel':
          wallB.addBox(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, 0x8a6a44, { uv: 4, grad: [0.75, 1] });
          break;
        case 'crate': {
          const mat = b.mat ?? 'wood';
          let cb = crateB.get(mat);
          if (!cb) {
            cb = new GeoBuilder();
            crateB.set(mat, cb);
          }
          cb.addBox(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, CRATE_COLOR[mat], { uv: 2, grad: [0.8, 1], jitter: 0.03 });
          break;
        }
        default:
          break;
      }
    }
    for (const r of world.ramps) {
      const pal = PALETTE[r.style] ?? PALETTE[0];
      floorB.addWedge(r.x0, r.z0, r.x1, r.z1, r.axis, r.hFrom, r.hTo, Math.min(r.hFrom, r.hTo) - 0.4, pal[0], 4);
    }

    this.addMesh(floorB, this.mat(floorTexture()));
    this.addMesh(wallB, this.mat(wallTexture()));
    this.addMesh(roofB, this.mat(roofTexture()));
    for (const [mat, builder] of crateB) this.addMesh(builder, this.mat(crateTexture(mat as CrateStyle)));

    // sliding doors: two leaves per door, animated from the collision boxes
    const doorTex = crateTexture('doorWood');
    this.textures.push(doorTex);
    const doorMat = new THREE.MeshBasicMaterial({ map: doorTex, vertexColors: true });
    this.materials.push(doorMat);
    const unit = new GeoBuilder();
    unit.addBox(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0xa9784a, { uv: 1, grad: [0.9, 1] });
    const unitGeo = unit.build();
    this.geometries.push(unitGeo);
    world.doors.forEach((d, index) => {
      const a = new THREE.Mesh(unitGeo, doorMat);
      const b = new THREE.Mesh(unitGeo, doorMat);
      this.group.add(a, b);
      this.doors.push({ world, index, a, b });
    });

    this.addSiteMarkers(world);
    this.update();
  }

  private mat(tex: THREE.Texture): THREE.MeshBasicMaterial {
    this.textures.push(tex);
    const m = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true });
    this.materials.push(m);
    return m;
  }

  private addMesh(builder: GeoBuilder, material: THREE.Material): void {
    if (builder.triangleCount === 0) return;
    const geo = builder.build();
    this.geometries.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    this.group.add(mesh);
  }

  /** Big painted "A" / "B" on the bombsite floors. */
  private addSiteMarkers(world: World): void {
    for (const id of ['A', 'B'] as const) {
      const site = world.map.sites[id];
      const S = 256;
      const c = document.createElement('canvas');
      c.width = S;
      c.height = S;
      const g = c.getContext('2d') as CanvasRenderingContext2D;
      g.clearRect(0, 0, S, S);
      g.strokeStyle = 'rgba(255,205,60,0.75)';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(S / 2, S / 2, S / 2 - 10, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(255,205,60,0.7)';
      g.font = 'bold 170px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(id, S / 2, S / 2 + 8);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(tex);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      this.materials.push(mat);
      const geo = new THREE.PlaneGeometry(8, 8);
      this.geometries.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      const spot = site.plantSpots[0];
      const h = world.terrainHeight(spot.x, spot.z);
      m.position.set(spot.x, (Number.isNaN(h) ? 0 : h) + 0.04, spot.z);
      this.group.add(m);
    }
  }

  private static placeLeaf(mesh: THREE.Mesh, b: Box): void {
    mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
    mesh.scale.set(Math.max(0.001, b.maxX - b.minX), Math.max(0.001, b.maxY - b.minY), Math.max(0.001, b.maxZ - b.minZ));
  }

  /** Sync door leaf meshes with the physics state. */
  update(): void {
    for (const d of this.doors) {
      const door = d.world.doors[d.index];
      MapMesh.placeLeaf(d.a, door.leafA);
      MapMesh.placeLeaf(d.b, door.leafB);
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
