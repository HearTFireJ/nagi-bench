import * as THREE from "three";
import { voxelMaterial, voxelTerrain } from "@agentbench/voxel-kit";
import { VoxGrid, glow } from "../util/vox";
import { fbm2, hash2, jitter, mix } from "../util/math";
import { rock } from "../art/props";
import type { LightPreset } from "../direction/rig";

/** Antarctic snowfield: the collector's memory of finding his first meteorite. */
export interface SnowSet {
  group: THREE.Group;
  stone: THREE.Mesh;
  stonePos: THREE.Vector3;
  /** Ground height (m) at x,z, so figures can be planted. */
  heightAt(x: number, z: number): number;
  previewLight: LightPreset;
}

const SIZE = 240;
const VOX = 0.125;
const OFFY = -1.0;

function terrainHeight(x: number, z: number): number {
  const wx = x * 0.05, wz = z * 0.05;
  const dune = fbm2(wx * 1.4, wz * 0.8, 3, 3) * 5;
  const ridge = Math.abs(Math.sin((x * 0.5 + z * 0.22) * 0.2 + fbm2(wx, wz, 2, 8) * 4)) * 1.4;
  return 3 + dune * 0.5 + ridge * 0.5;
}

export function buildSnow(): SnowSet {
  const group = new THREE.Group();
  group.name = "snow";
  const heightAt = (wx: number, wz: number): number => {
    const gx = wx / VOX + SIZE / 2, gz = wz / VOX + SIZE / 2;
    return Math.max(1, Math.round(terrainHeight(gx, gz))) * VOX + OFFY;
  };
  const footprint = (x: number, z: number): boolean => {
    // footprints trailing away from the stone toward +z
    if (z < 130 || z > 236) return false;
    const step = Math.floor((z - 130) / 6);
    const cx = SIZE / 2 + Math.sin(step * 0.3) * 2.5;
    const side = step % 2 === 0 ? -2 : 2;
    return Math.abs(x - (cx + side)) < 1.3 && (z - 130) % 6 < 3;
  };
  const geo = voxelTerrain(
    SIZE, SIZE,
    (x, z) => terrainHeight(x, z),
    (x, y, z, top) => {
      if (top) {
        if (footprint(x, z)) return 0x9db4cf;
        const n = fbm2(x * 0.1, z * 0.1, 3, 5);
        return jitter(mix(0xf6fafd, mix(0xc9dcf0, 0xa9c4e2, Math.min(1, y / 9)), n * 0.9), 0.03, x, y, z, 4);
      }
      return jitter(0xc4d8ee, 0.03, x, y, z, 6);
    },
    { voxel: VOX, anchor: "min" },
  );
  const terrain = new THREE.Mesh(geo, voxelMaterial({ roughness: 0.85 }));
  terrain.position.set(-SIZE * VOX / 2, OFFY, -SIZE * VOX / 2);
  terrain.receiveShadow = true;
  group.add(terrain);

  // black stone half-buried where the trail ends
  const stonePos = new THREE.Vector3(0, heightAt(0, 0), 0);
  const stone = rock(5, 4, "stone", 0.022);
  stone.position.copy(stonePos).add(new THREE.Vector3(0, 0.03, 0));
  group.add(stone);

  // banded, pale polar sky standing far behind
  const sky = new VoxGrid(200, 40, 1);
  const bands = [0x6ea6e0, 0x82b5e8, 0x99c3ee, 0xb2d2f3, 0xc9e0f6, 0xdeebf9, 0xf1f6fc];
  for (let y = 0; y < 40; y++) {
    const c = bands[Math.min(bands.length - 1, Math.floor((y / 40) * bands.length))]!;
    for (let x = 0; x < 200; x++) sky.set(x, y, 0, c);
  }
  for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const m = sky.mesh(1, glow({ toneMapped: false, fog: false }), "min");
    const holder = new THREE.Group();
    m.position.set(-100, -6, -90);
    holder.add(m);
    holder.rotation.y = rot;
    group.add(holder);
  }

  const previewLight: LightPreset = {
    bg: 0xb4d0ee,
    exposure: 0.8,
    fog: { color: 0xc4dcf2, density: 0.01 },
    hemi: [0xbcd6fb, 0xd9e6f3, 1.2],
    sun: { color: 0xfff1d6, intensity: 3.4, from: [-18, 7, 12], to: [0, 0, 0], box: 14 },
  };
  return { group, stone, stonePos, heightAt, previewLight };
}
