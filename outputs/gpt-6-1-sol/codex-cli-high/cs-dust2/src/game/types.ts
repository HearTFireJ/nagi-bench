import type * as THREE from "three";
export type Team = "CT" | "T";
export type WeaponId =
  "ak" | "m4" | "awp" | "glock" | "usp" | "deagle" | "knife";
export type HitZone = "head" | "chest" | "abdomen" | "arm" | "leg";
export type AIState =
  "advance" | "engage" | "plant" | "defuse" | "recover" | "guard";
export interface GunState {
  id: WeaponId;
  ammo: number;
  reserve: number;
  reloadUntil: number;
  nextShot: number;
}
export interface Actor {
  id: number;
  name: string;
  team: Team;
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
  hp: number;
  armor: number;
  alive: boolean;
  vy: number;
  grounded: boolean;
  guns: (GunState | null)[];
  slot: number;
  model: THREE.Group;
  limbs: THREE.Mesh[];
  state: AIState;
  target: number | null;
  path: { x: number; z: number }[];
  thinkAt: number;
  routeAt: number;
  action: number;
  actionKind: "plant" | "defuse" | null;
  kills: number;
  deaths: number;
  moving: boolean;
  stepAt: number;
  lastPos: THREE.Vector3;
  stuck: number;
}
export interface Bomb {
  state: "carried" | "dropped" | "planted" | "defused" | "exploded";
  carrier: number | null;
  x: number;
  z: number;
  remaining: number;
  site: "A" | "B" | null;
}
export interface Kill {
  id: number;
  killer: string;
  victim: string;
  team: Team;
  weapon: string;
  headshot: boolean;
  at: number;
}
export interface Options {
  team: Team;
  pistol: boolean;
  primary: "ak" | "m4" | "awp";
  secondary: "default" | "deagle";
  sensitivity: number;
  volume: number;
}
export interface Snapshot {
  phase: "menu" | "playing" | "over";
  locked: boolean;
  team: Team;
  name: string;
  alive: boolean;
  health: number;
  armor: number;
  weapon: WeaponId;
  ammo: number;
  reserve: number;
  reloading: number;
  scoped: boolean;
  spread: number;
  time: number;
  round: number;
  score: { CT: number; T: number };
  ctAlive: number;
  tAlive: number;
  bomb: Bomb;
  action: number;
  actionKind: string;
  message: string;
  winner: Team | null;
  reason: string;
  feed: Kill[];
  hit: boolean;
  damage: boolean;
  location: string;
  players: {
    id: number;
    name: string;
    team: Team;
    alive: boolean;
    kills: number;
    deaths: number;
  }[];
  dots: {
    id: number;
    x: number;
    z: number;
    yaw: number;
    team: Team;
    self: boolean;
    alive: boolean;
  }[];
}
