import * as THREE from 'three';
import { CELL, ROOF_HEIGHT, WALL_HEIGHT } from '../map/MapData';
import type { MapGrid, MapRect, RampRun } from '../map/MapGrid';
import { boxGeo, getMapMaterials } from './Textures';

function rectBox(r: MapRect, y0: number, y1: number, material: THREE.Material, tile = 2): THREE.Mesh {
  const w = (r.x1 - r.x0 + 1) * CELL;
  const d = (r.z1 - r.z0 + 1) * CELL;
  const h = y1 - y0;
  const mesh = new THREE.Mesh(boxGeo(w, h, d, tile), material);
  mesh.position.set(r.x0 * CELL + w / 2, y0 + h / 2, r.z0 * CELL + d / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Sloped prism for a ramp run: flat bottom at y=0, top surface from hLow to hHigh. */
function rampMesh(run: RampRun, material: THREE.Material): THREE.Mesh {
  const x0 = run.x0 * CELL;
  const x1 = (run.x1 + 1) * CELL;
  const z0 = run.z0 * CELL;
  const z1 = (run.z1 + 1) * CELL;
  const info = run.info;
  const hAt = (x: number, z: number) => {
    const coord = info.axis === 'z' ? z : x;
    const t = Math.max(0, Math.min(1, (coord - info.lowEdge) / (info.highEdge - info.lowEdge)));
    return info.hLow + (info.hHigh - info.hLow) * t;
  };
  // corners (top): a=(x0,z0) b=(x1,z0) c=(x1,z1) d=(x0,z1)
  const ya = hAt(x0, z0);
  const yb = hAt(x1, z0);
  const yc = hAt(x1, z1);
  const yd = hAt(x0, z1);
  const base = -0.02;
  const P = (x: number, y: number, z: number) => [x, y, z];
  const quads: number[][][] = [
    // top (counter-clockwise seen from above => normal +y)
    [P(x0, ya, z0), P(x0, yd, z1), P(x1, yc, z1), P(x1, yb, z0)],
    // bottom
    [P(x0, base, z0), P(x1, base, z0), P(x1, base, z1), P(x0, base, z1)],
    // north side (z0), normal -z
    [P(x0, base, z0), P(x0, ya, z0), P(x1, yb, z0), P(x1, base, z0)],
    // south side (z1), normal +z
    [P(x0, base, z1), P(x1, base, z1), P(x1, yc, z1), P(x0, yd, z1)],
    // west side (x0), normal -x
    [P(x0, base, z0), P(x0, base, z1), P(x0, yd, z1), P(x0, ya, z0)],
    // east side (x1), normal +x
    [P(x1, base, z0), P(x1, yb, z0), P(x1, yc, z1), P(x1, base, z1)],
  ];
  const pos: number[] = [];
  const uv: number[] = [];
  for (const q of quads) {
    const [a, b, c, d] = q;
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    const s = 0.5;
    // simple planar uvs
    const uvOf = (p: number[]) => [(p[0] + p[1]) * s, (p[2] + p[1]) * s];
    uv.push(...uvOf(a), ...uvOf(b), ...uvOf(c), ...uvOf(a), ...uvOf(c), ...uvOf(d));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface BuiltMap {
  group: THREE.Group;
  dispose: () => void;
}

/** Build all static geometry for the map. */
export function buildMapScene(map: MapGrid): BuiltMap {
  const mats = getMapMaterials();
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const add = (m: THREE.Mesh) => {
    group.add(m);
    geos.push(m.geometry);
  };

  // Ground plane (h=0) covering everything
  const size = map.worldSize;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), mats.floor);
  const guv = ground.geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) * (size / 2), guv.getY(i) * (size / 2));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(size / 2, 0, size / 2);
  ground.receiveShadow = true;
  add(ground);

  // Walls
  for (const r of map.wallRects) add(rectBox(r, -0.05, WALL_HEIGHT, mats.wall, 2.5));

  // Elevated floors
  for (const r of map.elevatedRects) add(rectBox(r, -0.02, 2, mats.elevated, 2));

  // Ramps
  for (const run of map.rampRuns) add(rampMesh(run, mats.elevated));

  // Roofs over tunnels
  for (const r of map.roofRects) {
    add(rectBox(r, ROOF_HEIGHT, ROOF_HEIGHT + 0.3, mats.roof, 2));
  }

  // Crates (each 1m stack rendered as separate boxes for visual variety)
  for (const c of map.cells) {
    if (c.crateH <= 0) continue;
    for (let i = 0; i < c.crateH; i++) {
      const s = CELL - 0.12 - i * 0.04;
      const m = new THREE.Mesh(boxGeo(s, 0.98, s, 1), mats.crate);
      m.position.set(c.x * CELL + CELL / 2, c.floorH + i + 0.49, c.z * CELL + CELL / 2);
      m.rotation.y = ((c.x * 7 + c.z * 13 + i * 5) % 7) * 0.02 - 0.06;
      m.castShadow = true;
      m.receiveShadow = true;
      add(m);
    }
  }

  // Doors (frame + open panel + header)
  for (const c of map.doorCells) {
    const g = map.doorGeometry(c);
    for (const [box, material] of [
      [g.panel, mats.door],
      [g.header, mats.frame],
      [g.post, mats.frame],
    ] as const) {
      const w = box.max.x - box.min.x;
      const h = box.max.y - box.min.y;
      const d = box.max.z - box.min.z;
      const m = new THREE.Mesh(boxGeo(w, h, d, 1), material);
      m.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      add(m);
    }
    // Handle on the panel
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.12), mats.frame);
    const p = g.panel;
    if (g.axis === 'z') handle.position.set((p.min.x + p.max.x) / 2 + (g.hingeAtMin ? 0.1 : -0.1), 1.05, p.max.z - 0.15);
    else handle.position.set(p.max.x - 0.15, 1.05, (p.min.z + p.max.z) / 2 + (g.hingeAtMin ? 0.1 : -0.1));
    add(handle);
  }

  // Bombsite decals (letter painted on the floor)
  for (const site of ['A', 'B'] as const) {
    let sx = 0;
    let sz = 0;
    let n = 0;
    let h = 0;
    for (const c of map.cells) {
      if (c.zone === site) {
        sx += c.x * CELL + CELL / 2;
        sz += c.z * CELL + CELL / 2;
        h = c.floorH;
        n++;
      }
    }
    if (n === 0) continue;
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), site === 'A' ? mats.siteA : mats.siteB);
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(sx / n, h + 0.02, sz / n);
    decal.renderOrder = 1;
    add(decal);
    // faint zone outline
    const outlineGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(12, 12));
    const outline = new THREE.LineSegments(outlineGeo, new THREE.LineBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.6 }));
    outline.rotation.x = -Math.PI / 2;
    outline.position.set(sx / n, h + 0.03, sz / n);
    group.add(outline);
    geos.push(outlineGeo);
  }

  return {
    group,
    dispose: () => {
      for (const g of geos) g.dispose();
    },
  };
}
