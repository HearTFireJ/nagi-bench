import * as THREE from "three";
import { buildVoxelGeometry, voxelMaterial, voxelSphere } from "@agentbench/voxel-kit";
import { VoxGrid, glow, matte } from "../util/vox";
import { fbm3, hash, hash3, jitter, mix, mulberry32, shade, TAU, vnoise3, type V3 } from "../util/math";

/**
 * Everything that lives in orbit. Far things (Earth, Sun, stars) sit in a
 * `backdrop` group that follows the camera, so they behave like the real sky:
 * no parallax, only direction. Near things (the Yellow River station, the shipyard
 * frame, drifting debris, the crowd) live in `local` in a shared layout where
 * Zhang floats at the origin looking down +Z at the station.
 */

// ---- layout ------------------------------------------------------------------
export const EARTH_CENTRE = new THREE.Vector3(-80, -830, 640);
export const EARTH_RADIUS = 700;
export const STATION_POS = new THREE.Vector3(-22, 26, 210);
export const SUN_RADIUS_DEG = 1.5;
/** Where the group photo is taken (centre of the front row). */
export const GROUP_POS = new THREE.Vector3(-9, -1, 56);

const EARTH_VOX = 72;

// ---- sun path (a pure function of absolute time) --------------------------------
/** Sun centre height above the limb, in sun radii. 1 = touching, 0 = half set, -1 = gone. */
export function sunHeight(t: number): number {
  const keys: Array<[number, number]> = [
    [0, 3.6], [22, 3.4], [176, 3.3], [191, 3.0], [203, 2.3], [214, 1.25], [216, 1.0], [226, 0],
    [246, -0.34], [270, -0.62], [288, -0.86], [302, -1.05], [345, -2.0],
  ];
  if (t <= keys[0]![0]) return keys[0]![1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i]![0]) {
      const [t0, v0] = keys[i - 1]!;
      const [t1, v1] = keys[i]!;
      return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
    }
  }
  return keys[keys.length - 1]![1];
}

const AZIMUTH = new THREE.Vector3(0.375, 0.0, 0.927).normalize();

export function sunDirection(t: number, earthCentre = EARTH_CENTRE, earthRadius = EARTH_RADIUS, out = new THREE.Vector3()): THREE.Vector3 {
  const n = earthCentre.clone().normalize();
  const perp = AZIMUTH.clone().sub(n.clone().multiplyScalar(AZIMUTH.dot(n))).normalize();
  const rho = Math.asin(earthRadius / earthCentre.length());
  const eps = (sunHeight(t) * SUN_RADIUS_DEG * Math.PI) / 180;
  return out.copy(n).multiplyScalar(Math.cos(rho + eps)).add(perp.multiplyScalar(Math.sin(rho + eps))).normalize();
}

// ---- Earth --------------------------------------------------------------------
function earthDirection(x: number, y: number, z: number): V3 {
  const c = EARTH_VOX;
  const dx = x + 0.5 - c, dy = y + 0.5 - c, dz = z + 0.5 - c;
  const l = Math.hypot(dx, dy, dz) || 1;
  return [dx / l, dy / l, dz / l];
}

function earthColour(x: number, y: number, z: number, r: number): number {
  if (r < 0.94) return 0x1c4a7a;
  const [dx, dy, dz] = earthDirection(x, y, z);
  const land = fbm3(dx * 2.3 + 4.2, dy * 2.3 - 1.1, dz * 2.3 + 7.7, 4, 3);
  const lat = Math.abs(dy);
  const cloud = fbm3(dx * 5.5 + 9, dy * 5.5, dz * 5.5 - 3, 4, 9);
  let c: number;
  if (lat > 0.9 + (hash3(x, y, z, 5) - 0.5) * 0.06) c = 0xe9f1f7;
  else if (land > 0.53) {
    const dry = vnoise3(dx * 8, dy * 8, dz * 8, 21);
    c = mix(0x3f7a45, 0xa68a55, Math.min(1, Math.max(0, (dry - 0.35) * 2.2)));
    if (lat > 0.72) c = mix(c, 0xdfe6df, (lat - 0.72) * 3);
  } else {
    c = mix(0x123f7e, 0x2a7ec2, Math.min(1, (0.53 - land) * 2.4));
  }
  if (cloud > 0.6) c = mix(c, 0xffffff, Math.min(0.92, (cloud - 0.6) * 5));
  return jitter(c, 0.035, x, y, z, 2);
}

export function buildEarth(): { earth: THREE.Mesh; atmosphere: THREE.Mesh; lights: THREE.Points } {
  const geo = voxelSphere(EARTH_VOX, earthColour, { voxel: 1 });
  // A planet is a smooth body wearing a blocky skin: radial normals give one clean
  // day/night terminator while the silhouette and every colour stay in voxels.
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const nor = geo.getAttribute("normal") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  const earth = new THREE.Mesh(geo, voxelMaterial({ roughness: 0.85 }));
  earth.name = "earth";

  // thin atmosphere shell: additive blocks just above the surface
  const R = EARTH_VOX;
  const span = Math.ceil(R + 4) * 2;
  const c = span / 2;
  const sunLocal = sunDirection(216);
  const atmoGeo = buildVoxelGeometry(
    {
      size: [span, span, span],
      at(x, y, z) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c, dz = z + 0.5 - c;
        const d = Math.hypot(dx, dy, dz);
        if (d < R + 0.4 || d > R + 3.6) return null;
        const k = (d - R) / 3.6;
        const toward = (dx * sunLocal.x + dy * sunLocal.y + dz * sunLocal.z) / d;
        const warm = Math.max(0, Math.min(1, (toward - 0.15) / 0.6));
        const blue = k < 0.34 ? 0x9fd0ff : k < 0.67 ? 0x4a86dc : 0x1f3f96;
        const orange = k < 0.34 ? 0xffd08a : k < 0.67 ? 0xff8f3a : 0xc0401c;
        return mix(blue, orange, warm);
      },
    },
    { voxel: 1 },
  );
  const atmosphere = new THREE.Mesh(
    atmoGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  atmosphere.name = "atmosphere";

  // night-side cities as square points on land
  const rand = mulberry32(88);
  const pts: number[] = [];
  const cols: number[] = [];
  for (let i = 0; i < 4200 && pts.length < 3 * 900; i++) {
    const u = rand() * 2 - 1;
    const th = rand() * TAU;
    const s = Math.sqrt(1 - u * u);
    const dx = s * Math.cos(th), dy = u, dz = s * Math.sin(th);
    if (Math.abs(dy) > 0.82) continue;
    const land = fbm3(dx * 2.3 + 4.2, dy * 2.3 - 1.1, dz * 2.3 + 7.7, 4, 3);
    if (land < 0.56) continue;
    const r = R + 0.7;
    pts.push(dx * r, dy * r, dz * r);
    const warm = 0.7 + rand() * 0.3;
    cols.push(1, 0.72 * warm, 0.34 * warm);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  lg.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  const lights = new THREE.Points(lg, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9 }));
  lights.name = "city-lights";
  return { earth, atmosphere, lights };
}

// ---- the Sun ---------------------------------------------------------------------
function buildSun(): THREE.Group {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(
    voxelSphere(6, (x, y, z, k) => (k < 0.5 ? 0xffffff : k < 0.8 ? 0xfff2c4 : 0xffd98a), { voxel: 1 }),
    glow({ toneMapped: false }),
  );
  g.add(disc);
  const halo = new THREE.Mesh(
    voxelSphere(11, (x, y, z, k) => (k < 0.6 ? 0xffb86b : 0xff7a3a), { voxel: 1 }),
    glow({ transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  g.add(halo);
  const streak = new VoxGrid(120, 3, 3);
  streak.box(0, 1, 1, 120, 2, 2, (x) => (Math.abs(x - 60) < 6 ? 0xfff2d0 : Math.abs(x - 60) < 28 ? 0xffd9a0 : 0xff9a55));
  const sg = streak.geometry(1, "center");
  const streakMat = glow({ transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const s1 = new THREE.Mesh(sg, streakMat);
  const s2 = new THREE.Mesh(sg, streakMat);
  s2.rotation.z = Math.PI / 2;
  g.add(s1, s2);
  g.name = "sun";
  return g;
}

function buildStars(): THREE.Points {
  const rand = mulberry32(4242);
  const pos: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < 1800; i++) {
    const u = rand() * 2 - 1;
    const th = rand() * TAU;
    const s = Math.sqrt(1 - u * u);
    pos.push(s * Math.cos(th) * 4200, u * 4200, s * Math.sin(th) * 4200);
    const b = 0.25 + Math.pow(rand(), 3) * 0.75;
    const tint = rand();
    col.push(b * (tint > 0.8 ? 1 : 0.9), b * (tint > 0.5 ? 0.95 : 0.9), b * (tint < 0.2 ? 1 : 0.95));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, toneMapped: false }));
  stars.frustumCulled = false;
  return stars;
}

// ---- Yellow River station ----------------------------------------------------------
export const STATION = { major: 30, tube: 2.6, voxel: 0.5 };

export interface Station {
  root: THREE.Group;
  /** Group that yaws with the ring's exit door. */
  door: THREE.Group;
  doorLeft: THREE.Mesh;
  doorRight: THREE.Mesh;
  doorGlow: THREE.Mesh;
  lamp: THREE.Mesh;
  lampMat: THREE.MeshBasicMaterial;
  doorWorld: THREE.Vector3;
  doorNormal: THREE.Vector3;
  axis: THREE.Vector3;
}

function buildStation(toward: THREE.Vector3): Station {
  const { major, tube, voxel } = STATION;
  const R = Math.round(major / voxel);
  const T = Math.round(tube / voxel);
  const span = (R + T + 4) * 2;
  const c = span / 2;
  const hull = new VoxGrid(span, span, span);
  const lights = new VoxGrid(span, span, span);
  const panel = (x: number, y: number, z: number, base: number) => jitter(base, 0.03, x, y, z, 5);
  // torus around Y
  for (let y = 0; y < span; y++) {
    for (let z = 0; z < span; z++) {
      for (let x = 0; x < span; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c, dz = z + 0.5 - c;
        const rr = Math.hypot(dx, dz);
        const q = Math.hypot(rr - R, dy);
        if (q <= T) {
          const ang = Math.atan2(dz, dx);
          const seam = Math.floor(((ang + Math.PI) / TAU) * 48) % 2 === 0;
          const band = Math.abs(dy) < 1.2 && q > T - 1.2;
          let col = seam ? 0xdfe3e8 : 0xc9cfd6;
          if (Math.abs(dy) > T * 0.62) col = 0xaab2bd;
          if (band) col = 0x6b7482;
          hull.set(x, y, z, panel(x, y, z, col));
          // window ribbon on the outer face
          if (rr - R > T * 0.55 && Math.abs(dy) < 0.9 && Math.floor(((ang + Math.PI) / TAU) * 96) % 3 !== 0) {
            lights.set(x, y, z, 0xffcf7a);
          }
        }
      }
    }
  }
  // spokes + hub + spindle
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    for (let r = 4; r < R - T; r++) {
      const px = c + Math.cos(a) * r, pz = c + Math.sin(a) * r;
      for (let dy = -2; dy <= 1; dy++) {
        for (let dw = -1; dw <= 1; dw++) {
          hull.set(Math.floor(px + Math.sin(a) * dw), c + dy, Math.floor(pz - Math.cos(a) * dw), panel(px | 0, dy, pz | 0, 0xb4bcc6));
        }
      }
    }
  }
  hull.cyl(c, c, 5.5, c - 5, c + 5, (x, y, z) => panel(x, y, z, 0xd4d9df));
  hull.cyl(c, c, 3, c - 46, c + 46, (x, y, z) => panel(x, y, z, (Math.floor(y / 6) % 2 ? 0xc0c7d0 : 0xe2e6ea)));
  hull.cyl(c, c, 8, c - 50, c - 44, 0x8b93a0);
  // solar wings on the spindle (blue grids)
  for (const sgn of [-1, 1]) {
    for (let y = 22; y < 42; y++) {
      for (let x = -22; x <= 22; x++) {
        const gx = c + x;
        const line = (Math.abs(x) % 6 === 0) || (y % 6 === 0);
        hull.set(gx, c + sgn * (y + 4) * 1, c, line ? 0xc7ced6 : 0x1e3f7a);
      }
    }
  }
  const axis = toward.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  const root = new THREE.Group();
  const ring = new THREE.Group();
  ring.quaternion.copy(q);
  const hullMesh = hull.mesh(voxel, matte({ roughness: 0.6 }), "center");
  const lightMesh = lights.mesh(voxel, glow({ toneMapped: false }), "center");
  lightMesh.castShadow = false;
  ring.add(hullMesh, lightMesh);

  // elevator cable running from the hub toward the Earth (+Y in ring space)
  const cable = new VoxGrid(3, 3000, 3);
  cable.box(1, 0, 1, 2, 3000, 2, (x, y) => (Math.floor(y / 30) % 2 ? 0x8f99a6 : 0xd6dbe1));
  const cableMesh = cable.mesh(1, matte({ roughness: 0.6 }), "min");
  cableMesh.position.set(-1.5, 46 * voxel, -1.5);
  ring.add(cableMesh);
  root.add(ring);

  // exit airlock on the outer rim, turned toward the viewer
  const stationToCam = new THREE.Vector3(0, 0, 0).sub(STATION_POS).normalize();
  const radial = stationToCam.clone().sub(axis.clone().multiplyScalar(stationToCam.dot(axis))).normalize();
  const doorNormal = radial.clone();
  const doorWorld = radial.clone().multiplyScalar(major + tube - 0.1);

  const door = new THREE.Group();
  door.name = "airlock";
  // Local frame: +Z = outward normal, +Y = ring axis.
  const frame = new VoxGrid(28, 22, 8);
  frame.box(0, 0, 0, 28, 22, 8, (x, y, z) => jitter(0x6b7482, 0.04, x, y, z, 1));
  frame.clear(4, 3, 2, 24, 19, 8);
  frame.box(4, 3, 0, 24, 19, 2, 0x10141a);
  frame.box(0, 0, 6, 28, 2, 8, 0xe2e6ea);
  frame.box(0, 20, 6, 28, 22, 8, 0xe2e6ea);
  frame.box(0, 0, 6, 2, 22, 8, 0xe2e6ea);
  frame.box(26, 0, 6, 28, 22, 8, 0xe2e6ea);
  door.add(frame.mesh(0.4, matte(), "center"));
  const plate = new VoxGrid(10, 16, 2);
  plate.box(0, 0, 0, 10, 16, 2, (x, y, z) => (x === 0 || x === 9 || y === 0 || y === 15 ? 0xa9b2bd : jitter(0xd8dde3, 0.03, x, y, z, 2)));
  plate.box(4, 6, 1, 6, 10, 2, 0xe6b23a);
  const pg = plate.geometry(0.4, "center");
  const doorLeft = new THREE.Mesh(pg, matte());
  const doorRight = new THREE.Mesh(pg, matte());
  doorLeft.position.set(-2, 0, 0.3);
  doorRight.position.set(2, 0, 0.3);
  door.add(doorLeft, doorRight);
  const glowGrid = new VoxGrid(20, 16, 1).box(0, 0, 0, 20, 16, 1, (x, y) => (y < 2 ? 0xffd9a0 : 0xfff1d0));
  const doorGlow = new THREE.Mesh(glowGrid.geometry(0.4, "center"), glow({ toneMapped: false }));
  doorGlow.position.set(0, 0, 0.05);
  doorGlow.visible = false;
  door.add(doorGlow);
  const lampGeo = new VoxGrid(6, 3, 2).box(0, 0, 0, 6, 3, 2, 0xffffff).geometry(0.4, "center");
  const lampMat = glow({ toneMapped: false });
  const lamp = new THREE.Mesh(lampGeo, lampMat);
  lamp.position.set(0, 4.0, 1.9);
  door.add(lamp);
  lampMat.color.set(0xff2a1a);
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(axis, radial).normalize(), axis, radial);
  door.quaternion.setFromRotationMatrix(basis);
  door.position.copy(doorWorld);
  root.add(door);
  root.position.copy(STATION_POS);

  return { root, door, doorLeft, doorRight, doorGlow, lamp, lampMat, doorWorld, doorNormal, axis };
}

// ---- the shipyard's bare frame ---------------------------------------------------------
function buildShipyard(): THREE.Object3D {
  const L = 240, W = 90, H = 70;
  const g = new VoxGrid(L, H, W);
  const orange = 0xe8742a;
  const white = 0xd8dde3;
  // keel
  g.box(0, 0, W / 2 - 2, L, 3, W / 2 + 2, (x, y, z) => (Math.floor(x / 8) % 2 ? orange : white));
  // ribs: arches
  for (let x = 10; x < L - 10; x += 16) {
    const scale = 1 - Math.pow((x - L / 2) / (L / 2), 2) * 0.55;
    for (let a = 0; a < 200; a++) {
      const th = (a / 200) * Math.PI;
      const px = Math.round(W / 2 + Math.cos(th) * (W / 2 - 2) * scale);
      const py = Math.round(Math.sin(th) * (H - 6) * scale);
      g.box(x, py, px, x + 2, py + 2, px + 2, orange);
    }
  }
  // long stringers
  for (const k of [0.25, 0.5, 0.75]) {
    for (let x = 6; x < L - 6; x++) {
      const scale = 1 - Math.pow((x - L / 2) / (L / 2), 2) * 0.55;
      const th = k * Math.PI;
      const px = Math.round(W / 2 + Math.cos(th) * (W / 2 - 2) * scale);
      const py = Math.round(Math.sin(th) * (H - 6) * scale);
      g.box(x, py, px, x + 1, py + 1, px + 1, white);
    }
  }
  const mesh = g.mesh(0.5, matte({ roughness: 0.7 }), "min");
  mesh.name = "shipyard";
  return mesh;
}

// ---- Base One --------------------------------------------------------------------------
function buildBaseOne(): THREE.Group {
  const g = new VoxGrid(60, 30, 60);
  const c = 30;
  g.cyl(c, c, 7, 10, 20, (x, y, z) => jitter(y % 4 < 1 ? 0xaab2bd : 0xdde1e6, 0.03, x, y, z, 4));
  g.cyl(c, c, 3, 4, 26, 0xc2c9d1);
  g.box(2, 14, c - 1, 20, 15, c + 1, 0x1e3f7a);
  g.box(40, 14, c - 1, 58, 15, c + 1, 0x1e3f7a);
  g.box(c - 12, 14, c - 3, c - 8, 17, c + 3, 0xc2c9d1);
  const grp = new THREE.Group();
  grp.add(g.mesh(0.4, matte(), "center"));
  return grp;
}

// ---- debris ----------------------------------------------------------------------------
export interface Debris {
  mesh: THREE.Object3D;
  spin: V3;
  base: V3;
  drift: V3;
}

function buildDebris(): Debris[] {
  const out: Debris[] = [];
  const rand = mulberry32(31);
  const kinds: Array<() => THREE.Object3D> = [
    () => {
      const g = new VoxGrid(10, 8, 8);
      g.box(0, 0, 0, 10, 8, 8, (x, y, z) => (x % 5 === 0 || y === 0 || y === 7 || z === 0 || z === 7 ? 0x9a8a5a : jitter(0xe6d9a8, 0.06, x, y, z, 1)));
      g.box(2, 2, 7, 8, 6, 8, 0x3c3320);
      return g.mesh(0.22, matte(), "center");
    },
    () => {
      const g = new VoxGrid(8, 20, 8);
      g.cyl(4, 4, 3.8, 0, 20, (x, y, z) => jitter(y > 15 ? 0x5b6b80 : 0xcfd5dc, 0.04, x, y, z, 3));
      g.cyl(4, 4, 1.6, 20, 20, 0x8b93a0);
      return g.mesh(0.18, matte(), "center");
    },
    () => {
      const g = new VoxGrid(24, 1, 14);
      g.box(0, 0, 0, 24, 1, 14, (x, y, z) => (x % 6 === 0 || z % 7 === 0 ? 0xb9c1cb : 0x213f78));
      return g.mesh(0.2, matte(), "center");
    },
    () => {
      const g = new VoxGrid(16, 16, 4);
      g.cyl(8, 2, 7.5, 0, 4, (x, y, z) => jitter(0xb0b7c0, 0.05, x, y, z, 5));
      g.cyl(8, 2, 3.5, 0, 4, 0x2a2f37);
      g.box(0, 0, 0, 16, 16, 4, (x, y, z) => (Math.hypot(x - 7.5, y - 7.5) < 3.6 ? null : g.get(x, y, z)));
      return g.mesh(0.16, matte(), "center");
    },
  ];
  const place: V3[] = [
    [-17, 3, 52], [20, -4, 44], [-25, 9, 90], [14, 10, 78], [27, 0, 122], [-32, -6, 104], [5, -13, 88], [-10, 15, 142], [35, 6, 158],
  ];
  place.forEach((p, i) => {
    const mesh = kinds[i % kinds.length]!();
    mesh.scale.setScalar(0.8 + rand() * 0.6);
    out.push({
      mesh, base: p,
      spin: [(rand() - 0.5) * 0.5, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.35],
      drift: [(rand() - 0.5) * 0.12, (rand() - 0.5) * 0.06, (rand() - 0.5) * 0.08],
    });
  });
  return out;
}

// ---- assembly --------------------------------------------------------------------------
export interface SpaceWorld {
  backdrop: THREE.Group;
  local: THREE.Group;
  earth: THREE.Mesh;
  atmosphere: THREE.Mesh;
  cityLights: THREE.Points;
  sun: THREE.Group;
  stars: THREE.Points;
  station: Station;
  shipyard: THREE.Object3D;
  baseOne: THREE.Group;
  debris: Debris[];
  /** Position the celestial backdrop for a given Earth scale/centre and time. */
  setSky(t: number, opts?: { centre?: THREE.Vector3; radius?: number; sunScale?: number; sunLift?: number }): THREE.Vector3;
  animateDebris(t: number): void;
}

export function buildSpace(): SpaceWorld {
  const backdrop = new THREE.Group();
  backdrop.name = "backdrop";
  const { earth, atmosphere, lights } = buildEarth();
  const stars = buildStars();
  const sun = buildSun();
  backdrop.add(stars, earth, atmosphere, lights, sun);

  const local = new THREE.Group();
  local.name = "space-local";
  const station = buildStation(EARTH_CENTRE.clone().sub(STATION_POS));
  local.add(station.root);
  const shipyard = buildShipyard();
  shipyard.position.set(170, -48, 300);
  shipyard.rotation.set(0.1, -0.5, 0.05);
  local.add(shipyard);
  const baseOne = buildBaseOne();
  baseOne.position.set(-260, 25, 600);
  local.add(baseOne);
  const debris = buildDebris();
  for (const d of debris) local.add(d.mesh);

  const world: SpaceWorld = {
    backdrop, local, earth, atmosphere, cityLights: lights, sun, stars, station, shipyard, baseOne, debris,
    setSky(t, opts = {}) {
      const centre = opts.centre ?? EARTH_CENTRE;
      const radius = opts.radius ?? EARTH_RADIUS;
      const s = radius / EARTH_VOX;
      for (const m of [earth, atmosphere, lights]) {
        m.position.copy(centre);
        m.scale.setScalar(s);
      }
      const dir = sunDirection(t + (opts.sunLift ?? 0) * 0, centre, radius);
      sun.position.copy(dir).multiplyScalar(2600);
      sun.scale.setScalar((opts.sunScale ?? 2.4) * 2600 * Math.tan((SUN_RADIUS_DEG * Math.PI) / 180) / 6);
      sun.lookAt(0, 0, 0);
      return dir;
    },
    animateDebris(t) {
      for (const d of debris) {
        d.mesh.position.set(d.base[0] + d.drift[0] * t, d.base[1] + d.drift[1] * t, d.base[2] + d.drift[2] * t);
        d.mesh.rotation.set(d.spin[0] * t, d.spin[1] * t, d.spin[2] * t);
      }
    },
  };
  return world;
}

export { hash, shade };
