// 体素地球：陆海分布、云层、日落色调、海面耀斑、夜面城市灯光、大气辉光——全部烘焙进体素顶点色。
import * as THREE from "three";
import { buildVoxelGeometry, voxelMaterial } from "@agentbench/voxel-kit";
import { fbm3, hash3, smooth, clamp, DEG } from "../../util/math";
import { mix, rgb, shade } from "../../util/color";
import { landAt } from "./earthdata";

export interface EarthOptions {
  /** 半径（体素数） */
  radiusVox: number;
  /** 单个体素的世界尺寸 */
  voxel: number;
  /** 行星→观察者的方向（世界系，单位向量） */
  viewDir: THREE.Vector3;
  /** 行星→太阳光的方向（世界系，单位向量） */
  lightDir: THREE.Vector3;
  /** 面向观察者的经度（度） */
  subLon: number;
}

export interface EarthMeshes {
  group: THREE.Group;
  planet: THREE.Mesh;
  atmosphere: THREE.Mesh;
  cityLights: THREE.Mesh;
}

const PINK = 0xffb4b0;
const CLOUD = 0xf5f8fc;

export function buildEarth(o: EarthOptions): EarthMeshes {
  const R = o.radiusVox;
  // 让可视半球正对体素立方体的对角线方向，避开 6 个轴向“极点”处的大块台阶
  const worldView = o.viewDir.clone().normalize();
  const diag = new THREE.Vector3(1, 1, 1).normalize();
  const orient = new THREE.Quaternion().setFromUnitVectors(diag, worldView);
  orient.premultiply(new THREE.Quaternion().setFromAxisAngle(worldView, 0.21));
  const qInv = orient.clone().invert();
  // 以下向量全部换算到星球局部系
  const view = worldView.clone().applyQuaternion(qInv);
  const light = o.lightDir.clone().normalize().applyQuaternion(qInv);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(qInv); // 北极方向（局部）
  const right = new THREE.Vector3().crossVectors(up, view).normalize();
  const vh = view.clone().sub(up.clone().multiplyScalar(view.dot(up))).normalize();
  const half = new THREE.Vector3().addVectors(light, view).normalize();

  const centre = Math.ceil(R);
  const span = centre * 2;

  interface Surf { lon: number; lat: number; nx: number; ny: number; nz: number; ndl: number }
  const surface = (dx: number, dy: number, dz: number): Surf => {
    const l = Math.hypot(dx, dy, dz) || 1;
    const nx = dx / l, ny = dy / l, nz = dz / l;
    const lat = Math.asin(clamp(nx * up.x + ny * up.y + nz * up.z, -1, 1)) / DEG;
    const phi = Math.atan2(nx * right.x + ny * right.y + nz * right.z, nx * vh.x + ny * vh.y + nz * vh.z);
    const lon = o.subLon + phi / DEG;
    const ndl = nx * light.x + ny * light.y + nz * light.z;
    return { lon, lat, nx, ny, nz, ndl };
  };

  const landKind = (s: Surf): number => {
    const jl = (fbm3(s.nx * 7 + 3, s.ny * 7, s.nz * 7, 2) - 0.5) * 8;
    const jt = (fbm3(s.nx * 7, s.ny * 7 + 9, s.nz * 7, 2) - 0.5) * 8;
    return landAt(s.lon + jl, s.lat + jt);
  };

  const surfaceColor = (dx: number, dy: number, dz: number): { c: number; ocean: boolean; s: Surf; cloud: number } => {
    const s = surface(dx, dy, dz);
    const kind = landKind(s);
    // 云
    const cn = fbm3(s.nx * 2.7 + 11, s.ny * 3.6 + 2, s.nz * 2.7 + 5, 4);
    const cloud = clamp((cn - 0.53) * 7, 0, 1);
    let c: number;
    let ocean = false;
    if (kind === 2) {
      c = mix(0xe4ecf2, 0xf8fbfd, hash3(Math.floor(s.lon), Math.floor(s.lat), 5));
    } else if (kind === 1) {
      const dry = fbm3(s.nx * 5 + 30, s.ny * 5, s.nz * 5, 3);
      const ax = Math.abs(s.lat);
      let base = 0x5a9a4a;
      if (ax > 55) base = mix(0x6f8a62, 0x9aa88a, dry);
      else if (ax < 18) base = mix(0x2f9048, 0x4fa64a, dry);
      else base = mix(0x62a050, 0x8aa858, dry);
      const sahara = s.lon > -16 && s.lon < 36 && s.lat > 14 && s.lat < 30;
      const arabia = s.lon > 35 && s.lon < 58 && s.lat > 14 && s.lat < 32;
      const gobi = s.lon > 88 && s.lon < 118 && s.lat > 37 && s.lat < 47;
      const aus = s.lon > 115 && s.lon < 145 && s.lat < -18 && s.lat > -32;
      const tibet = s.lon > 76 && s.lon < 100 && s.lat > 27 && s.lat < 37;
      if (sahara || arabia || gobi || aus) base = mix(0xe0b96c, 0xc99652, dry);
      else if (tibet) base = mix(0xc4b89e, 0x9d8f74, dry);
      else if (dry > 0.7) base = mix(base, 0x8f7f55, 0.65);
      c = base;
    } else {
      ocean = true;
      // 近岸浅水更青
      const nearLand =
        landAt(s.lon + 4, s.lat) === 1 || landAt(s.lon - 4, s.lat) === 1 || landAt(s.lon, s.lat + 4) === 1 || landAt(s.lon, s.lat - 4) === 1;
      const deepVar = fbm3(s.nx * 4 + 50, s.ny * 4, s.nz * 4, 3);
      c = nearLand ? mix(0x2a86d0, 0x3aa0dc, deepVar) : mix(0x1450a6, 0x1f68c4, deepVar);
    }
    // 海面耀斑（橘红镜面）
    if (ocean && cloud < 0.6) {
      const h = Math.max(0, s.nx * half.x + s.ny * half.y + s.nz * half.z);
      const g = Math.pow(h, 140);
      const g2 = Math.pow(h, 16);
      c = mix(c, 0xd8632b, clamp(g2 * 0.75, 0, 0.8));
      c = mix(c, 0xffc070, clamp(g * 1.8, 0, 1));
    }
    // 云（临近晨昏线偏粉）
    if (cloud > 0) {
      const band = smooth(1 - Math.abs(s.ndl - 0.12) / 0.34);
      const cc = mix(CLOUD, PINK, band * 0.85);
      c = mix(c, cc, cloud);
    }
    return { c, ocean, s, cloud };
  };

  // ---- 星球主体 ----
  const planetGeo = buildVoxelGeometry(
    {
      size: [span, span, span],
      at(x, y, z) {
        const dx = x + 0.5 - centre, dy = y + 0.5 - centre, dz = z + 0.5 - centre;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > R) return null;
        if (d < R - 1.8) return 0x0b1730; // 内部（不可见），廉价着色
        return surfaceColor(dx, dy, dz).c;
      },
    },
    { voxel: o.voxel },
  );
  // 方块的轮廓 + 像素色块，但光照使用球面法线：避免“梯田”式的台阶明暗，读起来像一颗被均匀照亮的像素行星
  {
    const pos = planetGeo.attributes.position as THREE.BufferAttribute;
    const nrm = planetGeo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const l = Math.hypot(x, y, z) || 1;
      nrm.setXYZ(i, x / l, y / l, z / l);
    }
    nrm.needsUpdate = true;
  }
  const planetMat = voxelMaterial({ roughness: 1, metalness: 0 });
  const planet = new THREE.Mesh(planetGeo, planetMat);

  // ---- 夜面城市灯光（贴在地表上方 1 体素的稀疏方块） ----
  const litCentre = Math.ceil(R + 2);
  const litSpan = litCentre * 2;
  const lightsGeo = buildVoxelGeometry(
    {
      size: [litSpan, litSpan, litSpan],
      at(x, y, z) {
        const dx = x + 0.5 - litCentre, dy = y + 0.5 - litCentre, dz = z + 0.5 - litCentre;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < R - 0.1 || d > R + 1.15) return null;
        const nx = dx / d, ny = dy / d, nz = dz / d;
        const ndl = nx * light.x + ny * light.y + nz * light.z;
        if (ndl > -0.08) return null;
        // 仅可见半球（背对观察者的不必生成）
        if (nx * view.x + ny * view.y + nz * view.z < -0.1) return null;
        const s = surface(dx, dy, dz);
        if (landKind(s) !== 1) return null;
        if (Math.abs(s.lat) > 62) return null;
        const cluster = fbm3(s.nx * 16 + 3, s.ny * 16, s.nz * 16, 2);
        if (cluster < 0.6) return null;
        if (hash3(x, y, z) < 0.55) return null;
        return hash3(x + 5, y, z) > 0.5 ? 0xffd88a : 0xffb35c;
      },
    },
    { voxel: o.voxel },
  );
  const lightsMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true, fog: false });
  lightsMat.color.setScalar(1.6);
  const cityLights = new THREE.Mesh(lightsGeo, lightsMat);

  // ---- 大气辉光壳 ----
  const atmoCentre = Math.ceil(R + 5);
  const atmoSpan = atmoCentre * 2;
  const atmoGeo = buildVoxelGeometry(
    {
      size: [atmoSpan, atmoSpan, atmoSpan],
      at(x, y, z) {
        const dx = x + 0.5 - atmoCentre, dy = y + 0.5 - atmoCentre, dz = z + 0.5 - atmoCentre;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < R + 0.2 || d > R + 3.2) return null;
        const nx = dx / d, ny = dy / d, nz = dz / d;
        const facing = Math.abs(nx * view.x + ny * view.y + nz * view.z);
        const rim = 1 - facing;
        const k = Math.pow(rim, 2.4);
        if (k < 0.06) return null;
        const ndl = nx * light.x + ny * light.y + nz * light.z;
        const sunSide = smooth((ndl + 0.15) / 0.75);
        // 越靠外越淡
        const fall = 1 - clamp((d - R - 0.2) / 3.0, 0, 1) * 0.75;
        const dayBlue = 0x3f86e6;
        const dusk = 0xff9b52;
        const col = mix(mix(0x1c3f7a, dayBlue, sunSide), dusk, Math.pow(sunSide, 3) * 0.75);
        return shade(col, k * fall * 1.5);
      },
    },
    { voxel: o.voxel },
  );
  const atmoMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);

  const group = new THREE.Group();
  group.add(planet, cityLights, atmosphere);
  group.quaternion.copy(orient);
  return { group, planet, atmosphere, cityLights };
}

export { rgb };
