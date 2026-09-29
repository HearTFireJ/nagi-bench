import * as THREE from "three";
import {
  BoxBatch,
  clamp,
  glowSprite,
  hash3,
  mats,
  mix,
  rng,
  smooth,
  type V3,
} from "../blocks";
import { buildVoxelGeometry, voxelMaterial, voxelSphere } from "@agentbench/voxel-kit";
import { Frame } from "../kit";

const d2r = Math.PI / 180;
const dirAE = (az: number, el: number): THREE.Vector3 =>
  new THREE.Vector3(Math.sin(az * d2r) * Math.cos(el * d2r), Math.sin(el * d2r), -Math.cos(az * d2r) * Math.cos(el * d2r));

/* --------------------------------------------------------------- geometry */

export const EARTH_R = 496;
const earthCenterDir = dirAE(-20, -40);
export const EARTH_C = earthCenterDir.clone().multiplyScalar(800);
export const EARTH_RHO = Math.asin(EARTH_R / EARTH_C.length());

/** Sun direction as seen from the origin at `delta` radians above the Earth's limb at the given azimuth. */
function sunDirection(azDeg: number, delta: number): THREE.Vector3 {
  // find the limb point on that azimuth line, then step `delta` further from the disc centre
  const c = earthCenterDir;
  let el = Math.asin(c.y) / d2r;
  for (; el < 60; el += 0.05) {
    if (Math.acos(Math.min(1, dirAE(azDeg, el).dot(c))) >= EARTH_RHO) break;
  }
  const limb = dirAE(azDeg, el);
  const away = limb.clone().sub(c.clone().multiplyScalar(limb.dot(c))).normalize();
  const ang = EARTH_RHO + delta;
  return c.clone().multiplyScalar(Math.cos(ang)).add(away.multiplyScalar(Math.sin(ang))).normalize();
}

const SUN_AZ = -32;
const SUN_DIST = 1900;
const SUN_R_ANG = Math.atan(36 / SUN_DIST);

/** Sun elevation above the limb over the film, in radians. */
export function sunDelta(t: number): number {
  const deg = (v: number) => v * d2r;
  const lerpSeg = (a: number, b: number, va: number, vb: number) => deg(mix(va, vb, clamp((t - a) / (b - a))));
  if (t < 26) return deg(2.6 - t * 0.012);
  if (t < 240) return deg(3.4);
  if (t < 249) return lerpSeg(240, 249, 3.4, 1.15);
  if (t < 262) return lerpSeg(249, 262, 1.15, -0.35);
  if (t < 300) return lerpSeg(262, 300, -0.35, -0.9);
  if (t < 330) return lerpSeg(300, 330, -0.9, -1.6);
  return lerpSeg(330, 350, -1.6, -2.8);
}

export function sunState(t: number): { dir: THREE.Vector3; color: number; intensity: number; delta: number } {
  const delta = sunDelta(t);
  const dir = sunDirection(SUN_AZ, delta);
  const k = clamp((delta / d2r + 1.2) / 3.4);
  const c = new THREE.Color().setRGB(1, mix(0.56, 0.95, k), mix(0.3, 0.86, k));
  return { dir, color: c.getHex(), intensity: mix(0.05, 3.4, Math.pow(k, 0.8)), delta };
}

/* ------------------------------------------------------------------ noise */

function vnoise(x: number, y: number, z: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const f = (v: number) => v * v * (3 - 2 * v);
  const fx = f(x - xi);
  const fy = f(y - yi);
  const fz = f(z - zi);
  let v = 0;
  for (let dx = 0; dx < 2; dx++)
    for (let dy = 0; dy < 2; dy++)
      for (let dz = 0; dz < 2; dz++) {
        const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
        v += w * hash3(xi + dx, yi + dy, zi + dz, s);
      }
  return v;
}
const fbm = (x: number, y: number, z: number, s: number) =>
  vnoise(x, y, z, s) * 0.55 + vnoise(x * 2.1, y * 2.1, z * 2.1, s + 1) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3, s + 2) * 0.15;

const CITY = 0xffd060;

function earthColor(x: number, y: number, z: number, span: number): number {
  const cx = x + 0.5 - span / 2;
  const cy = y + 0.5 - span / 2;
  const cz = z + 0.5 - span / 2;
  const len = Math.hypot(cx, cy, cz);
  const nx = cx / len;
  const ny = cy / len;
  const nz = cz / len;
  const face = nx * 0.262 + ny * 0.643 + nz * 0.72; // the hemisphere that looks at us
  const land = fbm(nx * 1.9 + 3, ny * 1.9 + 1, nz * 1.9 - 2, 1) + Math.max(0, Math.min(1, (face - 0.3) / 0.6)) * 0.2;
  const cloud = fbm(nx * 3.4 - 7, ny * 3.4 + 5, nz * 3.4 + 9, 7);
  const lat = Math.abs(nx * -0.94 + nz * 0.34);
  const c = new THREE.Color();
  if (lat > 0.93 + (land - 0.5) * 0.1) c.setHex(0xe8eef4);
  else if (land > 0.53) {
    const dry = fbm(nx * 5, ny * 5, nz * 5, 4);
    if (land > 0.66) c.setHex(0x6a6a52);
    else if (dry > 0.55) c.setHex(0xb59a62);
    else c.setHex(0x3f7040);
    c.multiplyScalar(0.85 + hash3(x, y, z, 2) * 0.3);
    if (land < 0.66 && lat < 0.8 && hash3(x, y, z, 9) > 0.982) return CITY;
  } else {
    const depth = clamp((0.53 - land) * 3.4);
    c.setRGB(mix(0.13, 0.05, depth), mix(0.42, 0.18, depth), mix(0.66, 0.42, depth));
    c.multiplyScalar(0.92 + hash3(x, y, z, 3) * 0.16);
  }
  if (cloud > 0.52) {
    const k = clamp((cloud - 0.52) * 5);
    c.lerp(new THREE.Color(0xf4f2f0), 0.35 + k * 0.6);
  }
  return c.getHex();
}

/* --------------------------------------------------------------- the world */

export interface SpaceSet {
  group: THREE.Group;
  zhang0: THREE.Vector3;
  station: THREE.Group;
  door: { pos: THREE.Vector3; out: THREE.Vector3; leaf: THREE.Object3D; lamp: THREE.Mesh; lampMat: THREE.MeshBasicMaterial; glowInside: THREE.Mesh };
  groupCenter: THREE.Vector3;
  base1: THREE.Vector3;
  shipyard: THREE.Vector3;
  update(t: number): void;
  sunMesh: THREE.Object3D;
}

export function buildSpace(): SpaceSet {
  const group = new THREE.Group();

  // ---- stars
  const starN = 1400;
  const stars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), starN);
  const sr = rng(2024);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  for (let i = 0; i < starN; i++) {
    const u = sr() * 2 - 1;
    const a = sr() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const p = new THREE.Vector3(r * Math.cos(a), u, r * Math.sin(a)).multiplyScalar(5200);
    const s = 5 + Math.pow(sr(), 3) * 22;
    m4.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(sr() * 3, sr() * 3, sr() * 3)), new THREE.Vector3(s, s, s));
    stars.setMatrixAt(i, m4);
    const k = 0.55 + sr() * 0.45;
    col.setRGB(k, k * (0.9 + sr() * 0.1), k * (0.8 + sr() * 0.2));
    if (sr() > 0.85) col.setRGB(0.7, 0.8, 1);
    stars.setColorAt(i, col);
  }
  stars.frustumCulled = false;
  group.add(stars);

  // ---- Earth
  const eSpan = 124;
  // only the visible skin of the planet is coloured; the interior is never seen
  const earthGeo = voxelSphere(62, (x, y, z, d) => (d < 0.93 ? 0x0b1a2c : earthColor(x, y, z, eSpan)), { voxel: 8 });
  {
    // city lights: push the marker colour above 1 so it glows through the earthshine term below
    const ca = earthGeo.attributes.color as THREE.BufferAttribute;
    const mark = new THREE.Color(CITY);
    for (let i = 0; i < ca.count; i++) {
      if (Math.abs(ca.getX(i) - mark.r) < 1e-3 && Math.abs(ca.getY(i) - mark.g) < 1e-3 && Math.abs(ca.getZ(i) - mark.b) < 1e-3) ca.setXYZ(i, mark.r * 3.2, mark.g * 3.2, mark.b * 3.2);
    }
  }
  const earthMat = voxelMaterial({ roughness: 0.42, metalness: 0.12 });
  earthMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor * 0.2;");
  };
  const earth = new THREE.Mesh(earthGeo, earthMat);
  earth.position.copy(EARTH_C);
  earth.castShadow = false;
  earth.receiveShadow = false;
  group.add(earth);
  const atmoGeo = voxelSphere(65, 0x5fa8ff, { voxel: 8 });
  // a rim-light shell: analytic sphere normal, posterised so the halo keeps the pixel-art steps
  const atmoMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {},
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(position); vec4 wp = modelMatrix * vec4(position, 1.0); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }",
    fragmentShader: "varying vec3 vN; varying vec3 vV; void main(){ float d = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0); float r = pow(1.0 - d, 4.6); r = floor(r * 5.0 + 0.5) / 5.0; gl_FragColor = vec4(vec3(0.34, 0.62, 1.0) * r * 1.1, 1.0); }",
  });
  atmoMat.userData.rim = true;
  const atmo = new THREE.Mesh(atmoGeo, atmoMat);
  atmo.position.copy(EARTH_C);
  group.add(atmo);

  // ---- Sun
  const sunGeo = voxelSphere(6, (x, y, z, d) => (d > 0.72 ? 0xffd27a : 0xfff4d6), { voxel: 6 });
  const sun = new THREE.Mesh(sunGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  group.add(sun);
  const halo1 = glowSprite("255,206,120", 300, 0.9, 8);
  const halo2 = glowSprite("255,120,50", 900, 0.5, 6);
  const halo3 = glowSprite("255,240,210", 110, 1, 6);
  group.add(halo1, halo2, halo3);

  // ---- space station (Yellow River): a voxel wheel whose axis is the elevator cable
  const Rr = 34;
  const span = 2 * (Rr + 8);
  const hubR = 7;
  const hullAt = (x: number, y: number, z: number, windows: boolean): number | null => {
    const cx = x + 0.5 - span / 2;
    const cz = z + 0.5 - span / 2;
    const r = Math.hypot(cx, cz);
    const ang = Math.atan2(cz, cx);
    // y: 0..31 → wheel body in 12..19 (7 tall), hub -> full
    const inRing = r >= Rr - 4 && r <= Rr + 4 && y >= 12 && y < 20;
    const spoke = (Math.abs(cx) < 1.6 || Math.abs(cz) < 1.6) && r < Rr - 3.5 && r > hubR - 1 && y >= 14 && y < 18;
    const hub = r <= hubR && y >= 4 && y < 28;
    const hubCap = r <= 3 && y >= 0 && y < 32;
    if (!(inRing || spoke || hub || hubCap)) return null;
    if (inRing) {
      const outer = r > Rr + 3.2;
      const winRow = y === 16;
      const segIdx = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 96);
      const isWin = outer && winRow && segIdx % 2 === 0;
      if (windows) return isWin ? 0xffe6a0 : null;
      if (isWin) return null;
      const seam = segIdx % 12 === 0;
      let base = seam ? 0x8f969e : 0xd6dade;
      if (y === 12 || y === 19) base = 0xb2b8be;
      if (r < Rr - 3) base = 0xaab1b8;
      if (y === 15 && outer) base = 0xe07a2c;
      return new THREE.Color(base).multiplyScalar(0.92 + hash3(x, y, z, 5) * 0.14).getHex();
    }
    if (windows) return null;
    if (spoke) return 0xbcc2c8;
    if (hub) return (y + Math.floor(r)) % 6 === 0 ? 0x8f969e : 0xd0d5da;
    return 0x9aa1a8;
  };
  const hullGeo = buildVoxelGeometry({ size: [span, 32, span], at: (x, y, z) => hullAt(x, y, z, false) }, { voxel: 1, anchor: "center" });
  const winGeo = buildVoxelGeometry({ size: [span, 32, span], at: (x, y, z) => hullAt(x, y, z, true) }, { voxel: 1, anchor: "center" });
  const station = new THREE.Group();
  const hull = new THREE.Mesh(hullGeo, voxelMaterial({ roughness: 0.55, metalness: 0.35 }));
  hull.castShadow = true;
  hull.receiveShadow = true;
  const wins = new THREE.Mesh(winGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  station.add(hull, wins);
  // cable, counterweight, solar wings
  const sb = new BoxBatch(2, 0.06);
  const SF = new Frame(sb);
  SF.box(-0.7, -16 - 900, -0.7, 1.4, 900, 1.4, 0x565c64, { cell: 6, jitter: 0.1 }); // down to Earth
  SF.box(-1.4, 16, -1.4, 2.8, 26, 2.8, 0x8f969e, { cell: 3 });
  SF.box(-5, 42, -5, 10, 6, 10, 0xb7bdc3, { cell: 2.5 });
  for (const s of [-1, 1]) {
    SF.box(s > 0 ? 5 : -5 - 26, 28, -6, 26, 0.6, 12, 0x233a66, { cell: 2, jitter: 0.1 });
    for (let i = 1; i < 6; i++) SF.box(s > 0 ? 5 + i * 4.2 : -5 - i * 4.2 - 0.2, 28.01, -6, 0.3, 0.6, 12, 0x7a8db3, { cell: 6, jitter: 0 });
    SF.box(s > 0 ? 5 : -5 - 26, 27.6, -0.4, 26, 0.8, 0.8, 0x9aa1a8, { cell: 4 });
  }
  station.add(sb.mesh(mats.solid(0.6, 0.3)));
  // climber cars on the cable
  const cars: THREE.Mesh[] = [];
  const carBatch = new BoxBatch(1, 0);
  new Frame(carBatch).box(-1.6, -1.5, -1.6, 3.2, 3, 3.2, 0xe9edf0);
  new Frame(carBatch).box(-1.7, 0.2, -1.7, 3.4, 0.6, 3.4, 0xe07a2c);
  const carMat = mats.solid(0.5, 0.2);
  for (let i = 0; i < 4; i++) {
    const car = carBatch.mesh(carMat);
    cars.push(car);
    station.add(car);
  }
  // airlock hatch, positioned after we know where the station sits
  const Sdir = dirAE(4, -12);
  const S = Sdir.clone().multiplyScalar(196);
  const a = S.clone().sub(EARTH_C).normalize(); // local +Y (away from Earth)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), a);
  station.quaternion.copy(q);
  station.position.copy(S);
  // outward direction = projection of the viewer direction onto the ring plane
  const toViewer = S.clone().negate().normalize();
  const O = toViewer.clone().sub(a.clone().multiplyScalar(toViewer.dot(a))).normalize();
  const Oloc = O.clone().applyQuaternion(q.clone().invert());
  const phi = Math.atan2(Oloc.z, Oloc.x);
  const hatch = new THREE.Group();
  const hatchLocalY = 16 - 16; // ring mid-height is voxel y=16 → local y 0 (grid is centred)
  hatch.position.set((Rr + 4) * Math.cos(phi), hatchLocalY, (Rr + 4) * Math.sin(phi));
  hatch.rotation.y = -phi;
  const hb = new BoxBatch(0.4, 0.04);
  const HF = new Frame(hb);
  HF.box(0, -3.6, -3.6, 1.4, 0.8, 7.2, 0x8f969e);
  HF.box(0, 2.8, -3.6, 1.4, 0.8, 7.2, 0x8f969e);
  HF.box(0, -3.6, -3.6, 1.4, 7.2, 0.8, 0x8f969e);
  HF.box(0, -3.6, 2.8, 1.4, 7.2, 0.8, 0x8f969e);
  HF.box(0.5, -3.7, -3.7, 1.0, 0.2, 7.4, 0xe07a2c);
  HF.box(0.5, 3.5, -3.7, 1.0, 0.2, 7.4, 0xe07a2c);
  hatch.add(hb.mesh(mats.solid(0.5, 0.4)));
  const inside = new THREE.Mesh(new THREE.BoxGeometry(0.2, 6.4, 6.4), new THREE.MeshBasicMaterial({ color: 0xffe2b0, fog: false }));
  inside.position.set(0.05, 0, 0);
  hatch.add(inside);
  const leaf = new THREE.Group();
  const leafMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 6.4, 6.4), voxelMaterial({ roughness: 0.5, metalness: 0.4 }));
  const lc: number[] = [];
  const lg = leafMesh.geometry as THREE.BufferGeometry;
  const pos = lg.attributes.position!;
  const cAttr: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const ring = Math.hypot(py, pz) > 2.4;
    const cc = new THREE.Color(ring ? 0xb9bfc5 : 0xe6eaee);
    cAttr.push(cc.r, cc.g, cc.b);
  }
  lg.setAttribute("color", new THREE.Float32BufferAttribute(cAttr, 3));
  void lc;
  leafMesh.position.set(0.55, 0, 0);
  leaf.add(leafMesh);
  hatch.add(leaf);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff2a20, fog: false });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.9), lampMat);
  lamp.position.set(1.2, 3.6, 4.4);
  hatch.add(lamp);
  const lampHalo = glowSprite("255,60,40", 6, 0.9, 6);
  lampHalo.position.copy(lamp.position);
  hatch.add(lampHalo);
  station.add(hatch);
  group.add(station);

  station.updateMatrixWorld(true);
  const doorPos = new THREE.Vector3(1.4, 0, 0).applyMatrix4(hatch.matrixWorld);
  const doorOut = new THREE.Vector3(1, 0, 0).transformDirection(hatch.matrixWorld);
  const groupCenter = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 0, 0), doorPos, 0.8);

  // ---- shipyard skeleton
  const yard = new THREE.Group();
  const yb = new BoxBatch(3, 0.06);
  const YF = new Frame(yb);
  const nx = 10;
  const ny = 4;
  const nz = 4;
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) YF.box(i * 7 - 0.5, j * 7 - 0.5, -0.5, 1, 1, nz * 7 + 1, 0x8d949b);
  for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) YF.box(i * 7 - 0.5, -0.5, k * 7 - 0.5, 1, ny * 7 + 1, 1, 0x8d949b);
  for (let j = 0; j <= ny; j++) for (let k = 0; k <= nz; k++) YF.box(-0.5, j * 7 - 0.5, k * 7 - 0.5, nx * 7 + 1, 1, 1, 0x8d949b);
  for (let i = 0; i < 6; i++) YF.box(i * 7 + 3, 7, 7, 6.6, 6.6, 0.4, 0xc6cbd0, { cell: 3 });
  for (let i = 0; i < 5; i++) YF.box(i * 7 + 3, 0.2, 14, 6.6, 0.4, 6.6, 0xb0b6bc, { cell: 3 });
  YF.box(70, 10, 6, 14, 3, 3, 0xe07a2c, { cell: 3 });
  yard.add(yb.mesh(mats.solid(0.6, 0.4)));
  const ylights = new BoxBatch(1, 0);
  const YL = new Frame(ylights);
  for (const [x, y, z] of [[0, 28, 0], [35, 28, 28], [70, 28, 0], [70, 0, 28], [0, 0, 28]] as V3[]) YL.box(x - 0.8, y - 0.8, z - 0.8, 1.6, 1.6, 1.6, 0xffb048, { jitter: 0, cell: 3 });
  yard.add(ylights.mesh(mats.glow(), false));
  const yardPos = new THREE.Vector3(-170, -70, -330);
  yard.position.copy(yardPos);
  yard.rotation.set(0.2, 0.4, 0.05);
  group.add(yard);

  // ---- neighbouring small stations, like tents on a plain
  const tents = new THREE.Group();
  const tb = new BoxBatch(1.5, 0.06);
  const TF = new Frame(tb);
  for (const [x, y, z, s] of [[130, -40, -250, 1], [-60, 60, -380, 0.8], [240, 30, -330, 1.3], [-260, 10, -180, 0.7]] as Array<[number, number, number, number]>) {
    TF.box(x, y, z, 8 * s, 6 * s, 8 * s, 0xc6cbd0);
    TF.box(x + 8 * s, y + 2 * s, z + 2 * s, 5 * s, 2 * s, 4 * s, 0xe07a2c);
    TF.box(x + 3 * s, y + 6 * s, z + 3 * s, 2 * s, 8 * s, 2 * s, 0x8f969e);
  }
  tents.add(tb.mesh(mats.solid(0.6, 0.3)));
  group.add(tents);

  // ---- Base One, a tiny wheel far to the right-behind
  const base1 = dirAE(-6, 4).multiplyScalar(520); // far ahead, past the station: eighty kilometres of dark
  const b1Geo = buildVoxelGeometry(
    {
      size: [24, 8, 24],
      at(x, y, z) {
        const cx = x + 0.5 - 12;
        const cz = z + 0.5 - 12;
        const r = Math.hypot(cx, cz);
        if (r < 10 && r > 6 && y >= 2 && y < 6) return 0xd6dade;
        if (r <= 2.5) return 0x9aa1a8;
        if ((Math.abs(cx) < 0.8 || Math.abs(cz) < 0.8) && r < 8) return 0xb2b8be;
        return null;
      },
    },
    { voxel: 1, anchor: "center" },
  );
  const b1 = new THREE.Mesh(b1Geo, voxelMaterial({ roughness: 0.6, metalness: 0.3 }));
  b1.position.copy(base1);
  b1.rotation.set(0.6, 0.3, 0.4);
  group.add(b1);
  const b1Light = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.6), new THREE.MeshBasicMaterial({ color: 0x66ff99, fog: false }));
  b1Light.position.copy(base1).add(new THREE.Vector3(0, 6, 0));
  const b1Halo = glowSprite("90,255,150", 26, 0.8, 6);
  b1Halo.position.copy(b1Light.position);
  group.add(b1Light, b1Halo);

  // ---- floating debris
  const dbN = 34;
  const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), voxelMaterial({ roughness: 0.7, metalness: 0.3 }), dbN);
  const dr = rng(31);
  const dbSeed = Array.from({ length: dbN }, () => ({
    p: new THREE.Vector3((dr() - 0.5) * 220, (dr() - 0.5) * 90, -dr() * 260 + 20),
    s: new THREE.Vector3(0.3 + dr() * 1.6, 0.2 + dr() * 0.8, 0.3 + dr() * 1.6),
    w: new THREE.Vector3(dr() - 0.5, dr() - 0.5, dr() - 0.5).multiplyScalar(0.5),
    c: [0xb9bfc5, 0x8b7355, 0xd8d0c0, 0x5a6068][Math.floor(dr() * 4)]!,
  }));
  dbSeed.forEach((d, i) => debris.setColorAt(i, new THREE.Color(d.c)));
  debris.frustumCulled = false;
  group.add(debris);

  const zhang0 = new THREE.Vector3(0, 0, 0);
  const q2 = new THREE.Quaternion();
  const e2 = new THREE.Euler();
  return {
    group,
    zhang0,
    station,
    door: { pos: doorPos, out: doorOut, leaf, lamp, lampMat, glowInside: inside },
    groupCenter,
    base1,
    shipyard: yardPos,
    sunMesh: sun,
    update(t: number) {
      const ss = sunState(t);
      sun.position.copy(ss.dir).multiplyScalar(SUN_DIST);
      halo1.position.copy(sun.position);
      halo2.position.copy(sun.position);
      halo3.position.copy(sun.position);
      const glare = clamp((ss.delta / d2r + 2.6) / 2.4);
      (halo1.material as THREE.SpriteMaterial).opacity = 0.35 + glare * 0.6;
      (halo2.material as THREE.SpriteMaterial).opacity = 0.18 + glare * 0.4;
      (halo3.material as THREE.SpriteMaterial).opacity = glare;
      sun.visible = ss.delta > -SUN_R_ANG * 2.2;
      for (const h of [halo1, halo2, halo3]) h.visible = ss.delta > -SUN_R_ANG * 6;
      cars.forEach((c, i) => {
        const p = ((t * 2.5 + i * 60) % 240) / 240;
        c.position.set(0, -20 - p * 210, 0);
      });
      debris.count = dbN;
      dbSeed.forEach((d, i) => {
        e2.set(d.w.x * t, d.w.y * t, d.w.z * t);
        q2.setFromEuler(e2);
        m4.compose(d.p.clone().add(new THREE.Vector3(Math.sin(t * 0.05 + i) * 2, Math.cos(t * 0.04 + i) * 1.5, 0)), q2, d.s);
        debris.setMatrixAt(i, m4);
      });
      debris.instanceMatrix.needsUpdate = true;
      b1Light.visible = Math.floor(t * 0.7) % 2 === 0;
      b1Halo.visible = b1Light.visible;
    },
  };
}
