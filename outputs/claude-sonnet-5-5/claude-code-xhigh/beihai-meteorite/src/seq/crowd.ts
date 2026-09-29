import * as THREE from "three";
import { float, lerpPose, type Pose } from "@agentbench/voxel-kit";
import type { Actor } from "../art/cast";
import type { Ctx } from "../direction/ctx";
import { zeroG } from "../direction/poses";
import { addPose } from "../util/kf";
import { clamp, easeIn, easeOut, hash, lerp, mulberry32, seg, smooth, wobble, type V3 } from "../util/math";
import { EV, SHOT_TIMES } from "../timeline";
import { GROUP_POS, STATION_POS } from "../world/space";

/**
 * The photo call: thirty people leave the airlock, drift to their marks, pose,
 * and — ten seconds after the first shot — are struck and flee. Every position is
 * a closed-form function of absolute time.
 */
export const FLIGHT = EV.flight;
export const EXIT_DUR = 7.0;

export type Role = "leaderA" | "leaderB" | "leaderC" | "witness" | "attendee" | "photographer";

export interface Person {
  actor: Actor;
  id: number;
  role: Role;
  row: number;
  final: V3;
  exit: number;
  arc: number;
  clear: number;
  /** Times at which bullets reach this person (empty for the unhurt). */
  hits: number[];
  /** When this person notices and bolts. */
  flee: number;
  /** Rescue partner index for wounded people. */
  helpers: number[];
  wounded: boolean;
}

export interface CrowdPlan {
  people: Person[];
  door: THREE.Vector3;
  update(t: number): void;
  posOf(p: Person, t: number): THREE.Vector3;
  leader(k: 0 | 1 | 2): Person;
  chest(p: Person, t: number): THREE.Vector3;
  head(p: Person, t: number): THREE.Vector3;
  visible: boolean;
}

const HIT_GAP = EV.shotGap;
const firstArrival = (burst: number): number => EV.fireStart[burst]! + FLIGHT;

export function planCrowd(c: Ctx): CrowdPlan {
  const crowd = c.cast.crowd;
  const rand = mulberry32(606);
  const door = STATION_POS.clone().add(c.w.space.station.door.position);
  const G = GROUP_POS;

  // ---- marks ---------------------------------------------------------------
  const marks: Array<{ row: number; final: V3 }> = [];
  const frontN = 7, midN = 11, backN = 11;
  for (let i = 0; i < frontN; i++) marks.push({ row: 0, final: [G.x + (i - 3) * 1.85, G.y, G.z] });
  for (let i = 0; i < midN; i++) marks.push({ row: 1, final: [G.x + (i - 5) * 1.75, G.y + 0.62, G.z + 1.3] });
  for (let i = 0; i < backN; i++) marks.push({ row: 2, final: [G.x + (i - 5) * 1.75 + 0.85, G.y + 1.25, G.z + 2.6] });

  const people: Person[] = [];
  const A = crowd.leaders[0], B = crowd.leaders[1], C = crowd.leaders[2];
  const others = crowd.people.filter((a) => a !== A && a !== B && a !== C && a !== crowd.photographer);
  // front row: leaders at centre, others around
  const frontSlots: Actor[] = [];
  let o = 0;
  for (let i = 0; i < frontN; i++) {
    if (i === 3) frontSlots.push(A);
    else if (i === 2) frontSlots.push(B);
    else if (i === 4) frontSlots.push(C);
    else frontSlots.push(others[o++]!);
  }
  const slotsActors: Actor[] = [...frontSlots];
  while (slotsActors.length < marks.length) slotsActors.push(others[o++ % others.length]!);

  for (let i = 0; i < marks.length; i++) {
    const a = slotsActors[i]!;
    const role: Role = a === A ? "leaderA" : a === B ? "leaderB" : a === C ? "leaderC" : i === 1 || i === 5 ? "witness" : "attendee";
    people.push({
      actor: a, id: i, role, row: marks[i]!.row, final: marks[i]!.final,
      exit: 227.6 + i * 0.13 + rand() * 0.05,
      arc: (rand() - 0.5) * 6,
      clear: role.startsWith("leader") ? 238.4 + (role === "leaderA" ? 0 : role === "leaderB" ? 1.1 : 2.2) : 236.2 + rand() * 9,
      hits: [], flee: 290.2 + rand() * 0.9 + (marks[i]!.row * 0.1), helpers: [], wounded: false,
    });
  }
  const byRole = (r: Role): Person => people.find((p) => p.role === r)!;
  const pA = byRole("leaderA"), pB = byRole("leaderB"), pC = byRole("leaderC");
  const w1 = people[1]!, w5 = people[5]!;
  // Which of the thirty bullets strikes whom. Three per magazine (numbers 2, 5, 8) are the
  // deliberate strays: they land on the neighbour, which is how five people are struck.
  const stray = (j: number): boolean => j === 2 || j === 5 || j === 8;
  const arrival = (k: number, j: number): number => EV.fireStart[k]! + j * HIT_GAP + FLIGHT;
  for (let j = 0; j < 10; j++) pA.hits.push(arrival(0, j));
  for (let j = 0; j < 10; j++) (stray(j) ? w1 : pB).hits.push(arrival(1, j));
  for (let j = 0; j < 10; j++) (stray(j) ? w5 : pC).hits.push(arrival(2, j));
  for (const p of [pA, pB, pC, w1, w5]) p.wounded = true;
  // helpers: pick attendees from the second row nearest each wounded person
  const rescuers = (p: Person, n: number): Person[] =>
    people.filter((q) => !q.wounded && q.row >= 1).sort((a, b) => Math.hypot(a.final[0] - p.final[0], a.final[2] - p.final[2]) - Math.hypot(b.final[0] - p.final[0], b.final[2] - p.final[2])).slice(0, n);
  const taken = new Set<Person>();
  for (const [p, n] of [[pA, 2], [pB, 2], [pC, 2], [w1, 1], [w5, 1]] as Array<[Person, number]>) {
    const cand = rescuers(p, n + 6).filter((q) => !taken.has(q)).slice(0, n);
    cand.forEach((q) => taken.add(q));
    p.helpers = cand.map((q) => q.id);
  }

  const photographerPos = new THREE.Vector3(G.x + 6.2, G.y - 2.2, G.z - 10.5);
  const phot = { exit: 227.3, clear: 237.0 };

  // ---- tracks ----------------------------------------------------------------
  const tmp = new THREE.Vector3();
  const settle = (p: Person, t: number): THREE.Vector3 => {
    const u = clamp((t - p.exit) / EXIT_DUR);
    const k = 1 - Math.pow(1 - u, 2.4);
    const arc = Math.sin(u * Math.PI) * p.arc;
    const wob = u >= 1 ? 1 : 0;
    return tmp.set(
      lerp(door.x, p.final[0], k) + arc + wobble(t * 0.4, p.id) * 0.1 * wob,
      lerp(door.y, p.final[1], k) + arc * 0.25 + wobble(t * 0.33, p.id + 30) * 0.08 * wob,
      lerp(door.z - 2.5, p.final[2], k) + wobble(t * 0.3, p.id + 60) * 0.06 * wob,
    ).clone();
  };
  const fleeStart = (p: Person): number => p.flee;
  const inDoor = (t: number, t0: number, from: THREE.Vector3, dur: number): THREE.Vector3 => {
    const u = clamp((t - t0) / dur);
    return from.clone().lerp(door, easeIn(u));
  };
  const posOf = (p: Person, t: number): THREE.Vector3 => {
    const base = settle(p, Math.min(t, 289.0));
    if (!p.wounded) {
      const helperFor = people.find((q) => q.helpers.includes(p.id));
      if (helperFor && t > p.flee) {
        // a rescuer: swing to the casualty, then tow them to the airlock
        const hIdx = helperFor.helpers.indexOf(p.id);
        const side = hIdx === 0 ? -1 : 1;
        const meet = helperFor.hits.length ? helperFor.hits[helperFor.hits.length - 1]! + 1.3 : p.flee + 2;
        const cas = casualtyPos(helperFor, Math.max(meet, t));
        const target = cas.clone().add(new THREE.Vector3(side * 0.95, 0.05, 0));
        const grab = smooth(seg(t, p.flee + 0.5, meet + 0.8));
        if (t < meet + 0.9) return base.clone().lerp(target, grab);
        const t0 = meet + 0.9;
        const towStart = casualtyPos(helperFor, t0).add(new THREE.Vector3(side * 0.95, 0.05, 0));
        return inDoor(t, t0, towStart, 5.2).add(new THREE.Vector3(0, 0, 0));
      }
      if (t > p.flee) {
        const from = settle(p, p.flee);
        return inDoor(t, p.flee + 0.5, from, 5.0);
      }
      return base;
    }
    return casualtyPos(p, t);
  };
  function casualtyPos(p: Person, t: number): THREE.Vector3 {
    const base = settle(p, Math.min(t, 289.0));
    const h0 = p.hits[0]!;
    const drift = Math.max(0, t - h0);
    const pushed = base.clone().add(new THREE.Vector3(0.08 * drift, 0.05 * drift, 0.22 * Math.min(drift, 6)));
    const meet = p.hits[p.hits.length - 1]! + 1.3;
    const tow = meet + 0.9;
    if (t < tow) return pushed;
    const start = base.clone().add(new THREE.Vector3(0.08 * (tow - h0), 0.05 * (tow - h0), 0.22 * Math.min(tow - h0, 6)));
    return inDoor(t, tow, start, 5.2);
  }

  const yawOf = (p: Person, t: number): number => {
    if (!p.wounded) {
      const helperFor = people.find((q) => q.helpers.includes(p.id));
      const fleeAt = helperFor ? helperFor.hits[helperFor.hits.length - 1]! + 2.2 : p.flee + 0.5;
      return lerp(Math.PI, 0.0, smooth(seg(t, Math.min(p.flee, fleeAt) - 0.2, fleeAt + 0.5)));
    }
    const tow = p.hits[p.hits.length - 1]! + 2.2;
    return lerp(Math.PI, 0.1 + p.id * 0.05, smooth(seg(t, tow, tow + 1.0)));
  };

  const facePose = (p: Person, t: number): void => {
    const a = p.actor;
    const first = Math.min(...people.filter((q) => q.hits.length).map((q) => q.hits[0]!));
    const shock = t > first + 0.6 + (p.id % 5) * 0.15;
    const woundedNow = p.hits.length > 0 && t >= p.hits[0]!;
    const laughing = wobble(t * 0.7, p.id) > 0.35 && t < 288.4 && t > 240;
    if (woundedNow) a.face("wide", "scream");
    else if (shock) a.face("wide", "scream");
    else if (laughing) a.face("happy", "laugh");
    else a.face("calm", t > 236 ? "smile" : "flat");
  };

  const outfitFor = (p: Person, t: number): string => {
    if (p.wounded && p.role.startsWith("leader") && t >= p.hits[Math.min(3, p.hits.length - 1)]!) return "cracked";
    return t < p.clear ? "gold" : "clear";
  };

  const pack = (p: Person, t: number): Pose => {
    const exiting = t >= p.exit && t < p.exit + EXIT_DUR;
    const u = clamp((t - p.exit) / EXIT_DUR);
    const posing = zeroG(t, p.id, 0.5);
    if (exiting) {
      const fly: Pose = { hips: [1.28, 0, 0], armR: [0.5, 0, -0.1], armL: [0.5, 0, 0.1], legR: [0.05, 0, 0], legL: [0.05, 0, 0], neck: [-0.7, 0, 0] };
      return lerpPose(fly, posing, smooth(seg(u, 0.6, 0.97)));
    }
    return posing;
  };

  const update = (t: number): void => {
    for (const p of people) {
      const a = p.actor;
      const visibleFrom = t >= p.exit - 0.05;
      const pos = posOf(p, t);
      const gone = t > 290 && pos.distanceTo(door) < 2.5 && t > p.flee + 2;
      a.show(visibleFrom && !gone);
      if (!(visibleFrom && !gone)) continue;
      a.dress(outfitFor(p, t));
      facePose(p, t);
      const firstHit = p.hits.length ? p.hits[0]! : Infinity;
      let pose: Pose;
      if (p.wounded && t >= firstHit) {
        const limp = float(t * 0.7 + p.id);
        pose = limp;
      } else if (t >= p.flee && !p.wounded) {
        pose = { hips: [1.15, 0, 0], armR: [0.6, 0, -0.15], armL: [0.6, 0, 0.15], legR: [0.1, 0, 0.05], legL: [0.1, 0, -0.05], neck: [-0.55, 0, 0] };
      } else {
        pose = pack(p, t);
      }
      a.pose(pose);
      a.drift(pos, [0, yawOf(p, t), wobble(t * 0.35, p.id + 9) * 0.05]);
    }
    // the photographer stays put, camera raised
    const ph = crowd.photographer;
    const visible = t >= phot.exit - 0.05 && t < 291;
    ph.show(visible);
    if (visible) {
      ph.dress(t < phot.clear ? "gold" : "clear");
      ph.face("calm", t > 236 ? "smile" : "flat");
      const u = clamp((t - phot.exit) / 6.4);
      const pos = new THREE.Vector3(
        lerp(door.x, photographerPos.x, easeOut(u)),
        lerp(door.y, photographerPos.y, easeOut(u)),
        lerp(door.z - 2.5, photographerPos.z, easeOut(u)),
      ).add(new THREE.Vector3(wobble(t * 0.3, 1) * 0.12, wobble(t * 0.27, 2) * 0.1, 0));
      const wave = smooth(seg(t, 233.8, 235.0)) * (1 - smooth(seg(t, 237.2, 238.0)));
      const base = zeroG(t, 77, 0.5);
      ph.pose(addPose(base, { armR: [-1.2 - wave * 0.9, 0, -0.35 * wave], armL: [-1.2, 0, 0.3] }));
      ph.drift(pos, [0, -0.55 * smooth(seg(t, 229, 233)), wobble(t * 0.2, 5) * 0.04]);
    }
  };

  const plan: CrowdPlan = {
    people, door, update, posOf,
    leader: (k) => (k === 0 ? pA : k === 1 ? pB : pC),
    chest: (p, t) => posOf(p, t).clone().add(new THREE.Vector3(0, 0.22, 0)),
    head: (p, t) => posOf(p, t).clone().add(new THREE.Vector3(0, 0.78, 0)),
    visible: true,
  };
  void fleeStart; void hash;
  return plan;
}
