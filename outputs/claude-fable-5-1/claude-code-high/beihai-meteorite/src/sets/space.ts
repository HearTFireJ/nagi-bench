import * as THREE from "three";
import { buildVoxelGeometry, voxelMaterial, voxelSphere } from "@agentbench/voxel-kit";
import { fbm3, hash3, rng, block, mat, clamp01, lerp, smooth } from "../util";
import { debrisField } from "../props";
import { ParticleField, starField } from "../fx";

/**
 * Geostationary orbit above the space elevator. Zhang's chosen position is the
 * origin. Earth hangs below (-Y). The Yellow River station wheel lies 5 km away
 * along -Z with the elevator cable dropping from its hub toward Earth.
 */

export const EARTH_CENTER = new THREE.Vector3(0, -36000, 0);
export const EARTH_RADIUS = 5400;
export const STATION_CENTER = new THREE.Vector3(0, -600, -5000);
export const STATION_RADIUS = 160;
/** Hatch on the rim, on the side facing Zhang. */
export const HATCH = new THREE.Vector3(0, -600, -5000 + STATION_RADIUS + 22);
/** Where the photo group assembles. */
export const GROUP_CENTER = new THREE.Vector3(0, -560, -4560);
export const BASE_ONE = new THREE.Vector3(52000, 4000, 58000);

export interface SunState {
  dir: THREE.Vector3;      // unit vector from the origin toward the sun
  visible: number;         // fraction of the disc above the limb, 0..1
  elev: number;            // degrees above the limb
}

const LIMB_DEG = (Math.asin(EARTH_RADIUS / EARTH_CENTER.length()) * 180) / Math.PI; // ~8.6
const SUN_RADIUS_DEG = 0.55;
const SUN_AZIMUTH = (34 * Math.PI) / 180;

/** Sun elevation above Earth's limb, in degrees, as a function of film time. */
export function sunElevation(t: number): number {
  if (t < 150) return 2.2;
  if (t < 201) return lerp(2.4, 0.7, smooth((t - 150) / 51));
  if (t < 212) return lerp(0.7, -0.05, smooth((t - 201) / 11));
  if (t < 256) return lerp(-0.05, -0.62, (t - 212) / 44);
  if (t < 276) return lerp(-0.62, -1.15, (t - 256) / 20);
  return -1.15 - (t - 276) * 0.02;
}

export function sunState(t: number): SunState {
  const elev = sunElevation(t);
  const theta = ((LIMB_DEG + elev) * Math.PI) / 180;      // angle from nadir
  const nadir = new THREE.Vector3(0, -1, 0);
  const az = new THREE.Vector3(Math.sin(SUN_AZIMUTH), 0, -Math.cos(SUN_AZIMUTH));
  const dir = nadir.multiplyScalar(Math.cos(theta)).addScaledVector(az, Math.sin(theta)).normalize();
  const visible = clamp01((elev + SUN_RADIUS_DEG) / (2 * SUN_RADIUS_DEG));
  return { dir, visible, elev };
}

export interface SpaceSet {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  sunDisc: THREE.Mesh;
  earthshine: THREE.HemisphereLight;
  station: THREE.Group;
  hatchLamp: THREE.Mesh;
  hatchDoor: THREE.Mesh;
  puffs: ParticleField;        // thruster and vent gas, additive white
  blood: ParticleField;        // ice crystals of blood, normal blend
  debris: THREE.Group;
  atmosphere: THREE.ShaderMaterial;
  update(time: number, camera: THREE.Camera): void;
}

export function buildSpace(): SpaceSet {
  const g = new THREE.Group();
  g.name = "set:space";

  g.add(starField(5000, 300000, 77));

  // Earth: a voxel sphere coloured by noise, plus cloud shell, plus atmosphere glow.
  const R = 40;
  const earthGeo = voxelSphere(R, (x, y, z, d) => {
    if (d < 0.9) return 0x0c1a33;                       // interior, never visible
    const nx = (x - R) / R, ny = (y - R) / R, nz = (z - R) / R;
    const n = fbm3(nx * 2.1 + 5, ny * 2.1, nz * 2.1, 4);
    const lat = Math.abs(ny);
    if (lat > 0.86 + (n - 0.5) * 0.1) return 0xe8eef2; // ice
    if (n > 0.6) {
      const m = fbm3(nx * 6, ny * 6, nz * 6, 2);
      return lat > 0.6 ? 0x6a7a55 : m > 0.55 ? 0x4c7a3d : 0x8a7a4a;
    }
    if (n > 0.56) return 0x2c6d9a;                      // shelf water
    return n > 0.4 ? 0x1c4a86 : 0x163d74;               // deep ocean
  }, { voxel: EARTH_RADIUS / R });
  const earth = new THREE.Mesh(earthGeo, voxelMaterial({ roughness: 0.85 }));
  earth.position.copy(EARTH_CENTER);
  g.add(earth);
  const cloudGeo = voxelSphere(R + 1.5, (x, y, z, d) => {
    if (d < 0.965) return null;
    const nx = (x - R - 1.5) / R, ny = (y - R - 1.5) / R, nz = (z - R - 1.5) / R;
    const c = fbm3(nx * 3.3 + 20, ny * 3.3, nz * 3.3 - 9, 3);
    return c > 0.585 ? 0xf4f6f8 : null;
  }, { voxel: EARTH_RADIUS / R });
  const clouds = new THREE.Mesh(cloudGeo, voxelMaterial({ roughness: 1, transparent: true, opacity: 0.9 }));
  clouds.position.copy(EARTH_CENTER);
  g.add(clouds);

  const atmosphere = new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: new THREE.Vector3(0, -1, 0) },
      uCam: { value: new THREE.Vector3() },
      uCenter: { value: EARTH_CENTER.clone() },
      uSunset: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform vec3 uCam; uniform vec3 uCenter; uniform float uSunset;
      varying vec3 vWorld;
      void main() {
        vec3 n = normalize(vWorld - uCenter);
        vec3 v = normalize(uCam - vWorld);
        float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.2);
        float day = clamp(dot(n, uSun) * 0.5 + 0.5, 0.0, 1.0);
        float toward = pow(clamp(dot(n, uSun), 0.0, 1.0), 6.0);
        vec3 blue = vec3(0.30, 0.55, 0.95);
        vec3 warm = vec3(1.0, 0.45, 0.16);
        vec3 col = mix(blue, warm, clamp(toward * 1.4 + uSunset * toward, 0.0, 1.0));
        float a = rim * (0.12 + 0.9 * pow(day, 0.9)) * (1.0 + 1.8 * toward * uSunset);
        gl_FragColor = vec4(col * (1.0 + toward * 1.5), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
  const atmo = new THREE.Mesh(voxelSphere(R + 3, () => 0xffffff, { voxel: EARTH_RADIUS / R }), atmosphere);
  atmo.position.copy(EARTH_CENTER);
  g.add(atmo);

  // Sun: a hard bright voxel disc very far away, plus the directional light.
  const sunDisc = new THREE.Mesh(voxelSphere(4, () => 0xffffff, { voxel: 300 }), new THREE.MeshBasicMaterial({ color: 0xfff3d6, toneMapped: false }));
  g.add(sunDisc);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.target.position.set(0, 0, 0);
  g.add(sun, sun.target);
  const earthshine = new THREE.HemisphereLight(0x0a0f1a, 0x27528c, 0.45);
  g.add(earthshine);

  // Yellow River station: a wheel, a hub, six spokes.
  const station = new THREE.Group();
  station.position.copy(STATION_CENTER);
  const SV = 4, N = 92, half = N / 2;
  const ringR = STATION_RADIUS / SV, tube = 5.5, hubR = 9;
  const isHull = (x: number, y: number, z: number): "hull" | "window" | "dark" | null => {
    const dx = x + 0.5 - half, dz = z + 0.5 - half, dy = y + 0.5 - 7;
    const rad = Math.sqrt(dx * dx + dz * dz);
    const inTube = Math.sqrt((rad - ringR) ** 2 + dy * dy) <= tube;
    const inHub = rad <= hubR && Math.abs(dy) <= 6;
    const ang = Math.atan2(dz, dx);
    const spoke = Math.abs(dy) <= 1.5 && rad < ringR && Math.abs(((ang * 3) / Math.PI + 0.5) % 1 - 0.5) < 0.02 + 1.4 / Math.max(3, rad);
    if (!inTube && !inHub && !spoke) return null;
    if (inTube && Math.abs(dy) < 0.6 && Math.floor(ang * 40) % 2 === 0 && rad > ringR + 2) return "window";
    const seam = Math.floor(ang * 24) % 4 === 0 || Math.abs(Math.floor(dy)) === 3;
    return seam ? "dark" : "hull";
  };
  const hull = buildVoxelGeometry({
    size: [N, 14, N],
    at(x, y, z) {
      const k = isHull(x, y, z);
      if (k === null || k === "window") return null;
      return k === "dark" ? 0x8d939c : (hash3(x, y, z) > 0.5 ? 0xc3c8cf : 0xb4bac2);
    },
  }, { voxel: SV, anchor: "center" });
  const windows = buildVoxelGeometry({
    size: [N, 14, N],
    at(x, y, z) { return isHull(x, y, z) === "window" ? 0xffd9a0 : null; },
  }, { voxel: SV, anchor: "center" });
  station.add(new THREE.Mesh(hull, voxelMaterial({ roughness: 0.6, metalness: 0.35 })));
  station.add(new THREE.Mesh(windows, new THREE.MeshBasicMaterial({ color: 0xffd9a0 })));
  // Hatch and its indicator lamp, on the near side of the rim.
  const hatchLocal = HATCH.clone().sub(STATION_CENTER);
  const hatchDoor = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 1.2), mat(0x2b2f36, { roughness: 0.5, metalness: 0.6 }));
  hatchDoor.position.copy(hatchLocal);
  station.add(hatchDoor);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(11, 11, 0.8), mat(0x6c727b, { roughness: 0.6, metalness: 0.5 }));
  frame.position.copy(hatchLocal).add(new THREE.Vector3(0, 0, -0.5));
  station.add(frame);
  const hatchLamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 0.6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  hatchLamp.position.copy(hatchLocal).add(new THREE.Vector3(7.5, 5, 0.3));
  station.add(hatchLamp);
  // Floodlights around the hatch.
  for (const sx of [-1, 1]) {
    const fl = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
    fl.position.copy(hatchLocal).add(new THREE.Vector3(sx * 9, -6, 0.3));
    station.add(fl);
  }
  g.add(station);

  // The elevator cable: from the hub down toward Earth, with marker lamps.
  const cableLen = EARTH_CENTER.distanceTo(STATION_CENTER) - EARTH_RADIUS;
  const cable = new THREE.Mesh(new THREE.BoxGeometry(6, cableLen, 6), mat(0x9aa0a8, { roughness: 0.5, metalness: 0.6 }));
  cable.position.copy(STATION_CENTER).add(new THREE.Vector3(0, -cableLen / 2, 0));
  g.add(cable);
  for (let i = 1; i < 14; i++) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(14, 14, 14), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff5a3a : 0xffffff }));
    lamp.position.copy(STATION_CENTER).add(new THREE.Vector3(0, -i * 600, 0));
    g.add(lamp);
  }

  // Shipyard skeleton: a lattice frame, ten times the station's scale.
  const yard = new THREE.Group();
  yard.position.set(7000, 900, -12000);
  yard.rotation.y = 0.5;
  const beam = mat(0xb9bec6, { roughness: 0.5, metalness: 0.6 });
  const L = 2400, Hh = 700, Dd = 700;
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) yard.add(block(L, 12, 12, beam, 0, sy * Hh / 2, sz * Dd / 2, false));
  for (let i = 0; i <= 8; i++) {
    const x = -L / 2 + (L / 8) * i;
    for (const sz of [-1, 1]) yard.add(block(12, Hh, 12, beam, x, 0, sz * Dd / 2, false));
    for (const sy of [-1, 1]) yard.add(block(12, 12, Dd, beam, x, sy * Hh / 2, 0, false));
    if (i % 2 === 0) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(18, 18, 18), new THREE.MeshBasicMaterial({ color: 0xffd0a0 }));
      lamp.position.set(x, Hh / 2 + 10, Dd / 2);
      yard.add(lamp);
    }
  }
  g.add(yard);

  // Other outposts scattered around: small lit boxes.
  const r = rng(909);
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Vector3((r() - 0.5) * 40000, (r() - 0.5) * 8000, (r() - 0.5) * 40000);
    if (p.length() < 3000) p.multiplyScalar(3);
    const o = new THREE.Group();
    o.position.copy(p);
    o.add(block(60 + r() * 120, 30 + r() * 40, 40 + r() * 60, mat(0xa5abb3, { roughness: 0.6, metalness: 0.4 }), 0, 0, 0, false));
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0xfff0d0 }));
    lamp.position.set(0, 30, 0);
    o.add(lamp);
    g.add(o);
  }
  // Base One: a small wheel, a bright point 80 km away.
  const base = new THREE.Group();
  base.position.copy(BASE_ONE);
  base.add(block(120, 30, 120, mat(0xb0b6be, { metalness: 0.4 }), 0, 0, 0, false));
  const baseLamp = new THREE.Mesh(new THREE.BoxGeometry(60, 60, 60), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  base.add(baseLamp);
  g.add(base);

  // Debris near Zhang and near the station.
  const debris = new THREE.Group();
  debris.add(debrisField(70, 900, 31));
  const nearStation = debrisField(90, 1400, 32);
  nearStation.position.set(200, -400, -4200);
  debris.add(nearStation);
  g.add(debris);

  const puffs = new ParticleField(6000, true);
  g.add(puffs.points);
  const blood = new ParticleField(600, false);
  g.add(blood.points);

  return {
    group: g,
    sun, sunDisc, earthshine, station, hatchLamp, hatchDoor, puffs, blood, debris, atmosphere,
    update(time, camera) {
      const s = sunState(time);
      sun.position.copy(s.dir).multiplyScalar(20000);
      const warmth = clamp01(1 - (s.elev + 0.3) / 2.2);
      sun.color.setRGB(1, lerp(0.95, 0.55, warmth), lerp(0.88, 0.25, warmth));
      sun.intensity = 0.15 + 3.1 * s.visible;
      sunDisc.position.copy(s.dir).multiplyScalar(180000);
      (sunDisc.material as THREE.MeshBasicMaterial).color.setRGB(1, lerp(0.96, 0.6, warmth), lerp(0.85, 0.3, warmth));
      sunDisc.visible = s.elev > -SUN_RADIUS_DEG - 0.4;
      atmosphere.uniforms.uSun!.value.copy(s.dir);
      atmosphere.uniforms.uSunset!.value = clamp01(1 - Math.abs(s.elev + 0.2) / 1.4) * 1.6;
      camera.getWorldPosition(atmosphere.uniforms.uCam!.value);
      earthshine.intensity = 0.25 + 0.3 * s.visible;
      for (const d of debris.children) for (const m of d.children) {
        const sp = m.userData.spin as number[] | undefined;
        if (sp) m.rotation.set(sp[0]! * time, sp[1]! * time, sp[2]! * time);
      }
    },
  };
}
