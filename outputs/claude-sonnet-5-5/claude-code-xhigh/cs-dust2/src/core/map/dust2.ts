import { MapBuilder } from './builder.ts';
import type { MapData, SpawnPoint } from './types.ts';

/**
 * Simplified Dust2, real-world scale (1 unit = 1 m, map footprint 120 x 128 m).
 * North is -Z (top of the radar), east is +X.
 *
 *   B site (NW)        CT spawn (N)          A site (NE)
 *   B tunnels (W)      Mid + Mid doors (C)   Long A (E)  Catwalk (C-E)
 *                      T spawn (S)
 *
 * Route lengths (approx.): T->A long 95 m, T->A cat 105 m, T->B tunnels 105 m,
 * T->mid doors 65 m, CT->A 30 m, CT->B 30 m.
 */
export const MAP_W = 120;
export const MAP_D = 128;

// palette styles (see render/materials.ts)
const SAND = 0;
const TUNNEL = 1;
const CTPLASTER = 2;
const BORANGE = 3;
const CONCRETE = 4;
const ASITE = 5;
const MIDSTYLE = 6;

export function buildDust2(): MapData {
  const b = new MapBuilder(MAP_W, MAP_D);

  // ------------------------------------------------------------ T spawn + exits
  b.floor(46, 102, 76, 124, 0, CONCRETE); // T spawn room
  b.floor(56, 100, 64, 102, 0, CONCRETE); // north exit -> mid
  b.floor(42, 110, 46, 118, 0, CONCRETE); // west exit -> outside tunnels
  b.floor(76, 108, 80, 118, 0, CONCRETE); // east exit -> outside long

  // ------------------------------------------------------------ Mid
  b.floor(52, 42, 68, 100, 0, MIDSTYLE); // lower mid .. top mid
  b.floor(52, 26, 68, 40, 0, CTPLASTER); // CT mid (behind the doors)
  b.floor(58, 40, 62, 42, 0, CTPLASTER); // door gap
  b.door('midDoors', 58, 40, 62, 42, 'x', 0, 3.2, 4.5);

  // ------------------------------------------------------------ CT spawn
  b.floor(38, 6, 68, 26, 0, CTPLASTER);

  // ------------------------------------------------------------ A side
  b.floor(84, 8, 114, 44, 2.4, ASITE); // A site platform
  b.ramp(68, 12, 84, 22, 'x', 0, 2.4, ASITE); // CT -> A ramp
  // Long A: outside long -> long doors -> long corridor (ramp) -> A site
  b.floor(80, 100, 108, 124, 0, SAND); // outside long
  b.floor(96, 84, 108, 100, 0, SAND); // long doors / lower long
  b.ramp(96, 44, 108, 84, 'z', 2.4, 0, SAND); // long corridor rising towards A
  // Catwalk (short A): mid east opening -> flat part -> ramp -> A site
  b.floor(68, 60, 78, 70, 0, MIDSTYLE);
  b.floor(78, 62, 90, 70, 0, MIDSTYLE);
  b.ramp(78, 44, 90, 62, 'z', 2.4, 0, MIDSTYLE);

  // ------------------------------------------------------------ B side
  b.floor(8, 8, 32, 38, 1.2, BORANGE); // B site
  b.ramp(32, 12, 38, 22, 'x', 1.2, 0, BORANGE); // CT -> B ramp
  b.floor(8, 46, 32, 58, 0, BORANGE); // B lobby (tunnel exit / mid-to-B)
  b.ramp(10, 38, 18, 46, 'z', 1.2, 0, BORANGE); // tunnel exit ramp
  b.ramp(24, 38, 30, 46, 'z', 1.2, 0, BORANGE); // B doors ramp
  b.floor(32, 48, 52, 56, 0, MIDSTYLE); // mid -> B corridor

  // B tunnels (B洞)
  b.floor(12, 58, 19, 106, 0, TUNNEL); // upper tunnels
  b.floor(14, 106, 42, 122, 0, SAND); // outside tunnels
  b.floor(19, 84, 52, 92, 0, TUNNEL); // lower tunnels
  b.roof(12, 62, 19, 100, 4.4, TUNNEL);
  b.roof(19, 84, 50, 92, 4.4, TUNNEL);
  b.roof(96, 92, 108, 100, 4.6, SAND); // long doors gateway

  // wall styling of the shell around each region
  b.paint(4, 4, 36, 60, BORANGE);
  b.paint(8, 58, 23, 110, TUNNEL);
  b.paint(19, 80, 52, 96, TUNNEL);
  b.paint(80, 4, 118, 48, ASITE);

  // ------------------------------------------------------------ Props (cover)
  // A site
  b.crate(100, 20, 104, 24, 1.2, 'wood'); // default box
  b.crate(104, 20, 108, 24, 1.6, 'wood');
  b.crate(104, 24, 108, 28, 1.2, 'wood');
  b.crate(92, 30, 97, 36, 1.6, 'car'); // car
  b.crate(108, 12, 112, 16, 1.6, 'wood');
  b.crate(90, 12, 94, 16, 1.2, 'metal');
  // long A
  b.crate(96, 62, 101, 72, 2.6, 'containerBlue'); // blue container (flush with the west wall)
  b.crate(104, 52, 108, 55, 1.2, 'wood');
  b.crate(96, 78, 99, 81, 1.2, 'wood');
  // mid
  b.crate(58, 74, 62, 78, 1.2, 'wood'); // xbox
  b.crate(53, 58, 56, 61, 1.0, 'wood');
  b.crate(64, 86, 67, 89, 1.6, 'metal');
  b.crate(53, 94, 56, 97, 1.2, 'wood');
  // catwalk
  b.crate(84, 65, 87, 68, 1.2, 'wood');
  // CT spawn / CT mid
  b.crate(42, 8, 46, 12, 1.2, 'wood');
  b.crate(60, 20, 64, 24, 1.6, 'metal');
  b.crate(54, 8, 57, 11, 1.2, 'wood');
  b.crate(54, 30, 57, 33, 1.2, 'wood');
  // B site
  b.crate(18, 22, 24, 28, 1.6, 'wood'); // default box
  b.crate(10, 10, 16, 16, 2.4, 'metal'); // closet
  b.crate(24, 10, 28, 14, 1.6, 'wood'); // window boxes
  b.crate(26, 28, 30, 32, 1.2, 'wood');
  b.crate(10, 28, 14, 32, 1.6, 'wood');
  // B lobby / tunnels
  b.crate(24, 50, 28, 54, 1.2, 'wood');
  b.crate(10, 50, 13, 54, 1.6, 'wood');
  b.crate(16, 76, 19, 79, 1.2, 'wood');
  b.crate(24, 108, 29, 113, 1.6, 'containerGreen');
  b.crate(34, 116, 38, 120, 1.2, 'wood');
  // T spawn / outside long
  b.crate(48, 104, 52, 108, 1.2, 'wood');
  b.crate(70, 104, 74, 108, 1.2, 'wood');
  b.crate(84, 104, 88, 108, 1.6, 'wood');
  b.crate(100, 112, 105, 118, 2.6, 'containerGreen');

  // ------------------------------------------------------------ Callout zones (first match wins)
  b.zone('midDoors', '中门', '中门', [52, 36, 68, 44]);
  b.zone('tSpawn', 'T出生点', 'T', [42, 100, 80, 124]);
  b.zone('ctSpawn', 'CT出生点', 'CT', [38, 6, 68, 26]);
  b.zone('aSite', 'A点', 'A', [84, 8, 114, 44]);
  b.zone('aRamp', 'A坡', 'A坡', [68, 10, 84, 24]);
  b.zone('catwalk', '猫道', '猫道', [68, 58, 90, 70], [78, 44, 90, 62]);
  b.zone('longA', 'A大', 'A大', [96, 44, 108, 100]);
  b.zone('outsideLong', 'A大外', 'A大外', [80, 100, 108, 124]);
  b.zone('bSite', 'B点', 'B', [8, 8, 32, 40]);
  b.zone('bTunnelExit', 'B洞出口', 'B洞口', [8, 40, 32, 60]);
  b.zone('ctB', 'B通道', 'B通道', [32, 10, 40, 24]);
  b.zone('midToB', '中路下B', '中B', [32, 46, 52, 58]);
  b.zone('lowerTunnels', '下B洞', '下洞', [19, 82, 52, 94]);
  b.zone('bTunnels', 'B洞', 'B洞', [10, 58, 24, 108], [14, 106, 42, 124]);
  b.zone('ctMid', 'CT中路', 'CT中', [52, 26, 68, 36]);
  b.zone('mid', '中路', '中路', [50, 40, 70, 102]);

  // ------------------------------------------------------------ Anchors for AI / tests
  const anchors: MapData['anchors'] = {
    T_SPAWN: { x: 60, z: 116 },
    T_EXIT_W: { x: 44, z: 114 },
    OUT_TUNNELS: { x: 32, z: 114 },
    UP_TUNNEL_S: { x: 15.5, z: 102 },
    UP_TUNNEL_JOIN: { x: 15.5, z: 88 },
    UP_TUNNEL_MID: { x: 15.5, z: 70 },
    UP_TUNNEL_N: { x: 15.5, z: 62 },
    B_LOBBY: { x: 20, z: 52 },
    B_RAMP_W: { x: 14, z: 42 },
    B_RAMP_E: { x: 27, z: 42 },
    B_SITE: { x: 20, z: 32 },
    LOWER_TUNNELS: { x: 36, z: 88 },
    MID_TO_B: { x: 42, z: 52 },
    MID_LOWER: { x: 60, z: 96 },
    MID_XBOX: { x: 56, z: 82 },
    MID_TOP: { x: 60, z: 50 },
    MID_DOORS: { x: 60, z: 41 },
    CT_MID: { x: 60, z: 32 },
    CT_SPAWN: { x: 54, z: 16 },
    CT_B: { x: 35, z: 17 },
    A_RAMP: { x: 76, z: 17 },
    CAT_ENTRY: { x: 72, z: 65 },
    CAT_BOTTOM: { x: 84, z: 69 },
    CAT_MID: { x: 84, z: 54 },
    CAT_TOP: { x: 87, z: 46 },
    OUT_LONG: { x: 92, z: 112 },
    LONG_DOORS: { x: 102, z: 96 },
    LONG_MID: { x: 104, z: 72 },
    LONG_CORNER: { x: 104, z: 50 },
    A_SITE: { x: 99, z: 28 },
  };

  const spawns: MapData['spawns'] = {
    T: [52, 56, 60, 64, 68].map((x, i): SpawnPoint => ({ x, z: 118 + (i % 2) * 2, yaw: 0 })),
    CT: [46, 50, 54, 58, 62].map((x, i): SpawnPoint => ({ x, z: 15 + (i % 2) * 2, yaw: Math.PI })),
  };

  const sites: MapData['sites'] = {
    A: {
      id: 'A',
      name: 'A点',
      plantRect: [88, 12, 112, 40],
      center: { x: 99, z: 28 },
      plantSpots: [
        { x: 102, z: 27 },
        { x: 109, z: 19 },
        { x: 93, z: 21 },
      ],
      guardSpots: [
        { x: 96, z: 20 },
        { x: 108, z: 32 },
        { x: 94, z: 40 },
        { x: 110, z: 20 },
      ],
      defendSpots: [
        { x: 90, z: 38 },
        { x: 100, z: 40 },
        { x: 88, z: 16 },
        { x: 110, z: 30 },
      ],
    },
    B: {
      id: 'B',
      name: 'B点',
      plantRect: [10, 10, 30, 36],
      center: { x: 20, z: 30 },
      plantSpots: [
        { x: 21, z: 31 },
        { x: 13, z: 22 },
        { x: 29, z: 21 },
      ],
      guardSpots: [
        { x: 12, z: 34 },
        { x: 28, z: 34 },
        { x: 20, z: 12 },
        { x: 30, z: 24 },
      ],
      defendSpots: [
        { x: 15, z: 35 },
        { x: 26, z: 35 },
        { x: 30, z: 17 },
        { x: 20, z: 20 },
      ],
    },
  };

  const routes: MapData['routes'] = {
    T_A_LONG: ['T_SPAWN', 'OUT_LONG', 'LONG_DOORS', 'LONG_MID', 'LONG_CORNER', 'A_SITE'],
    T_A_CAT: ['T_SPAWN', 'MID_LOWER', 'CAT_ENTRY', 'CAT_BOTTOM', 'CAT_MID', 'CAT_TOP', 'A_SITE'],
    T_B_TUNNELS: ['T_SPAWN', 'T_EXIT_W', 'OUT_TUNNELS', 'UP_TUNNEL_S', 'UP_TUNNEL_MID', 'UP_TUNNEL_N', 'B_LOBBY', 'B_RAMP_W', 'B_SITE'],
    T_B_LOWER: ['T_SPAWN', 'MID_LOWER', 'LOWER_TUNNELS', 'UP_TUNNEL_JOIN', 'UP_TUNNEL_N', 'B_LOBBY', 'B_RAMP_W', 'B_SITE'],
    T_B_MID: ['T_SPAWN', 'MID_LOWER', 'MID_XBOX', 'MID_TOP', 'MID_TO_B', 'B_LOBBY', 'B_RAMP_E', 'B_SITE'],
    T_MID: ['T_SPAWN', 'MID_LOWER', 'MID_XBOX', 'MID_TOP'],
    T_MID_DOORS: ['T_SPAWN', 'MID_LOWER', 'MID_XBOX', 'MID_TOP', 'MID_DOORS', 'CT_MID', 'CT_SPAWN'],
    CT_A: ['CT_SPAWN', 'A_RAMP', 'A_SITE'],
    CT_A_LONG: ['CT_SPAWN', 'A_RAMP', 'A_SITE', 'LONG_CORNER'],
    CT_MID: ['CT_SPAWN', 'CT_MID', 'MID_DOORS', 'MID_TOP'],
    CT_B: ['CT_SPAWN', 'CT_B', 'B_SITE'],
    CT_B_RAMP: ['CT_SPAWN', 'CT_B', 'B_SITE', 'B_RAMP_E'],
  };

  return b.build('de_dust2', { anchors, spawns, sites, routes });
}
