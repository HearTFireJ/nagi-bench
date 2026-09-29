// 太空场景的世界坐标约定（米）。原点 = 章北海；+Y 向上；方位角 az 自 -Z 向 +X 顺时针。
// 艺术化取舍：太阳/地球在他“左后方”（az≈-40°），黄河站在他右侧（az=100°）5 公里处；
// 合影队伍背对站体外壁、面朝章北海，太阳从他们右侧 40° 低角度打来（斜射：暖侧光 + 拖长的影子）。
import * as THREE from "three";
import { DEG } from "../../util/math";

export const dirAzEl = (azDeg: number, elDeg: number): THREE.Vector3 => {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
};

export const SUN_AZ = -40;
export const SUN_EL = -5;
/** 地球角半径（度）——艺术夸大 */
export const RHO = 27;
/** 太阳角半径（度）——艺术夸大 */
export const SUN_R = 1.43;
/** 太阳在地球边缘的极角（0=正上方，顺时针） */
export const SUN_THETA = 18;

export const EARTH_VOX = 52;
/** 地球球心到相机的距离，使其角半径恰为 RHO */
export const EARTH_DIST = EARTH_VOX / Math.sin(RHO * DEG);
export const SUN_DIST = 520;
export const STAR_DIST = 1500;

/** 地球中心方向（由太阳位置反推：太阳恰好贴在地球右上边缘） */
export function earthCenterDir(): THREE.Vector3 {
  const sun = dirAzEl(SUN_AZ, SUN_EL);
  // 在“太阳所在处的切平面”里，沿(-sinθ, -cosθ) 方向退回 (RHO+SUN_R) 度
  const az = SUN_AZ * DEG;
  const right = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)); // 水平向右
  const up = new THREE.Vector3().crossVectors(right, sun.clone().negate()).normalize();
  // 保证 up 朝上
  if (up.y < 0) up.negate();
  const th = SUN_THETA * DEG;
  const back = right.clone().multiplyScalar(-Math.sin(th)).addScaledVector(up, -Math.cos(th));
  const d = (RHO + SUN_R) * DEG;
  return sun.clone().multiplyScalar(Math.cos(d)).addScaledVector(back, Math.sin(d)).normalize();
}

/** 太阳圆心相对地球边缘的高度 h（单位：太阳半径）：h=1 恰好相切，h=0 一半沉入，h=-1 全部沉没 */
export function sunDirAt(h: number): THREE.Vector3 {
  const e = earthCenterDir();
  const s0 = dirAzEl(SUN_AZ, SUN_EL);
  // 从地球中心到太阳的方向绕地球中心缩放：角距 δ = RHO + SUN_R*h
  const az = SUN_AZ * DEG;
  const right = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const up = new THREE.Vector3().crossVectors(right, s0.clone().negate()).normalize();
  if (up.y < 0) up.negate();
  // 以 e 为中心的局部基：把 s0 相对 e 的偏移方向保持，仅改变角距
  const dir0 = s0.clone().sub(e.clone().multiplyScalar(s0.dot(e))).normalize();
  const delta = (RHO + SUN_R * h) * DEG;
  return e.clone().multiplyScalar(Math.cos(delta)).addScaledVector(dir0, Math.sin(delta)).normalize();
}

// ---- 黄河站与合影 ----
export const STATION_AZ = 100;
export const STATION_DIST = 5000;
export const STATION_Y = -800;
export const STATION = new THREE.Vector3(
  Math.sin(STATION_AZ * DEG) * STATION_DIST,
  STATION_Y,
  -Math.cos(STATION_AZ * DEG) * STATION_DIST,
);
export const RING_R = 90;
export const RING_W = 26; // 轴向（Y）
export const RING_T = 16; // 径向厚度
/** 站体外壁的外法线（水平，指向章北海） */
export const WALL_N = new THREE.Vector3(-Math.sin(STATION_AZ * DEG), 0, Math.cos(STATION_AZ * DEG)).normalize();
/** 外壁上气闸门的位置 */
export const HATCH = STATION.clone().addScaledVector(WALL_N, RING_R + RING_T / 2 + 3.4);
/** 站体外壁面（气闸模块外表面）朝向的航向角（人物 +Z 指向法线） */
export const WALL_HEADING = Math.atan2(WALL_N.x, WALL_N.z);
/** 合影队形中心（距外壁 34 米） */
export const GROUP_CENTER = HATCH.clone().addScaledVector(WALL_N, 34);
/** 摄影师位置（距队伍 46 米，朝向队伍） */
export const PHOTOGRAPHER = GROUP_CENTER.clone().addScaledVector(WALL_N, 46);

/** 章北海所在处（原点）到站体的视线方向（水平） */
export const TO_STATION = new THREE.Vector3(STATION.x, 0, STATION.z).normalize();

export const SHIPYARD = new THREE.Vector3(
  Math.sin(122 * DEG) * 7200,
  -60,
  -Math.cos(122 * DEG) * 7200,
);
export const BASE_ONE = new THREE.Vector3(
  Math.sin(-72 * DEG) * 80000,
  -900,
  -Math.cos(-72 * DEG) * 80000,
);
