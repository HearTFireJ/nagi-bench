import * as THREE from "three";
import { float, type Pose } from "@agentbench/voxel-kit";
import type { Ctx } from "../direction/ctx";
import { zeroG } from "../direction/poses";
import { addPose } from "../util/kf";
import { clamp, easeIn, hash, lerp, seg, smooth, wobble, type V3 } from "../util/math";
import { EV, SHOT_TIMES } from "../timeline";
import { GROUP_POS, STATION_POS } from "../world/space";
import { EXIT_DUR, planCrowd, type CrowdPlan, type Person } from "./crowd";

/** Everything that happens in vacuum outside the station, in one place. */
export const MUZZLE: V3 = [-0.2, 0.55, 0.98];

export interface Orbitals {
  crowd: CrowdPlan;
  bullets: THREE.InstancedMesh;
  /** Reset and animate every orbital object for this absolute time. */
  update(t: number, opts?: { offset?: V3; sky?: Parameters<Ctx["w"]["space"]["setSky"]>[1] }): void;
  /** Where each bullet is at time t (for aiming/close-ups). */
  bulletPos(i: number, t: number): THREE.Vector3;
  zhangFloat(t: number, opts?: { face?: "calm" | "narrow" | "shut"; outfit?: string; pose?: Pose; centre?: V3; euler?: V3 }): void;
  workerPos(i: number, t: number): THREE.Vector3;
}

export function makeOrbitals(c: Ctx): Orbitals {
  const space = c.w.space;
  const fx = c.fx.space;
  const zhang = c.cast.zhang;
  const crowd = planCrowd(c);
  const door = crowd.door;

  // ── bullets: thirty pale specks, each on a dead-straight line ──────────────────
  const bulletGeo = new THREE.BoxGeometry(1, 1, 1);
  const bullets = new THREE.InstancedMesh(bulletGeo, new THREE.MeshBasicMaterial({ color: 0xfff0d0, toneMapped: false }), SHOT_TIMES.length);
  bullets.frustumCulled = false;
  space.local.add(bullets);

  const targetOf = (i: number): { p: Person; t: number } => {
    const burst = Math.floor(i / 10), j = i % 10;
    const stray = j === 2 || j === 5 || j === 8;
    const leaders = [crowd.leader(0), crowd.leader(1), crowd.leader(2)];
    let p = leaders[burst]!;
    if (stray && burst === 1) p = crowd.people[1]!;
    if (stray && burst === 2) p = crowd.people[5]!;
    return { p, t: SHOT_TIMES[i]! + EV.flight };
  };
  const bulletPos = (i: number, t: number): THREE.Vector3 => {
    const { p, t: tArr } = targetOf(i);
    const end = crowd.chest(p, tArr - 0.001);
    const start = new THREE.Vector3(...MUZZLE);
    const k = clamp((t - SHOT_TIMES[i]!) / EV.flight, 0, 1.15);
    return start.lerp(end, k);
  };

  // ── thrusters and wounds (all closed-form emitters) ─────────────────────────────
  const white = [0xffffff, 0xeaf2ff, 0xd4e4f7, 0xf6fbff];
  for (const p of crowd.people) {
    const org = (sign: number, y = 0.05) => (b: number): V3 => {
      const q = crowd.posOf(p, b);
      return [q.x, q.y + y, q.z + sign * 0.55];
    };
    // leaving the airlock: main burn at the back, retro burn at the chest
    fx.add({ t0: p.exit, t1: p.exit + 3.6, rate: 22, life: 1.7, origin: org(+1), dir: [0, 0, 1], speed: [2.5, 6], spread: 0.16, size: [0.16, 0.55], colors: white, seed: p.id * 7 + 1, drag: 0.5, fade: 0.5 });
    fx.add({ t0: p.exit + EXIT_DUR * 0.62, t1: p.exit + EXIT_DUR * 0.95, rate: 16, life: 1.4, origin: org(-1), dir: [0, 0, -1], speed: [2, 5], spread: 0.22, size: [0.14, 0.45], colors: white, seed: p.id * 7 + 2, drag: 0.6, fade: 0.5 });
    if (!p.wounded) {
      fx.add({ t0: p.flee + 0.5, t1: p.flee + 5.2, rate: 8, life: 1.7, origin: org(-1), dir: [0, 0, -1], speed: [3, 7], spread: 0.14, size: [0.1, 0.36], colors: white, seed: p.id * 7 + 3, drag: 0.4, fade: 0.5 });
    }
  }
  for (const p of crowd.people.filter((q) => q.wounded)) {
    const h0 = p.hits[0]!, hN = p.hits[p.hits.length - 1]!;
    const isLeader = p.role.startsWith("leader");
    const chest = (dz: number, dy = 0.22) => (b: number): V3 => {
      const q = crowd.posOf(p, b);
      return [q.x, q.y + dy, q.z + dz];
    };
    // entry: a small feather of gas toward the shooter, once per hit
    fx.add({ t0: h0, t1: hN + 0.4, rate: 14, life: 0.8, origin: chest(-0.22), dir: [0, 0.1, -1], speed: [0.8, 2.6], spread: 0.55, size: [0.06, 0.2], colors: white, seed: p.id * 11 + 1, drag: 0.6, fade: 0.5 });
    // exit and punctured backpack: a great white plume behind
    fx.add({ t0: h0 + 0.25, t1: h0 + 3.2 + (hN - h0), rate: 9, life: 1.2, origin: chest(0.32, 0.18), dir: [0.1, 0.15, 1], speed: [1.5, 5.0], spread: 0.4, size: [0.08, 0.28], colors: white, seed: p.id * 11 + 2, drag: 0.5, fade: 0.55 });
    if (isLeader) {
      const hh = p.hits[Math.min(3, p.hits.length - 1)]!;
      // the visor: blood thrown against the glass, then out through the holes, freezing as it goes
      fx.add({ t0: hh, t1: hh + 2.4, rate: 26, life: 3.2, origin: (b) => { const q = crowd.posOf(p, b); return [q.x, q.y + 0.78, q.z - 0.2]; }, dir: [0.1, 0.25, -1], speed: [0.7, 2.6], spread: 1.0, size: [0.075, 0.035], colors: [0xb3141b, 0xd92a2f, 0xf1f4f8, 0xe6ecf5, 0xc7d3e6], seed: p.id * 11 + 3, drag: 0.3, fade: 0.3, spin: 3 });
    }
  }

  // ── traffic: orange workers crossing the void ────────────────────────────────────
  const workerRoute: Array<{ a: V3; b: V3; t0: number; t1: number }> = [
    { a: [34, 3, -30], b: [-46, 9, 40], t0: 200.5, t1: 212.5 },
    { a: [-38, -2, -26], b: [22, 7, 60], t0: 202.5, t1: 214.5 },
    { a: [18, 9, -6], b: [-10, 1, 120], t0: 204.0, t1: 214.5 },
    { a: [-24, 4, 130], b: [30, -3, -20], t0: 203.5, t1: 213.5 },
  ];
  const workerPos = (i: number, t: number): THREE.Vector3 => {
    const r = workerRoute[i]!;
    const k = smooth(seg(t, r.t0, r.t1));
    return new THREE.Vector3(...r.a).lerp(new THREE.Vector3(...r.b), k);
  };
  workerRoute.forEach((r, i) => {
    fx.add({
      t0: r.t0 + 0.3, t1: r.t1 - 0.5, rate: 18, life: 1.6,
      origin: (b) => { const q = workerPos(i, b); const d = new THREE.Vector3(...r.b).sub(new THREE.Vector3(...r.a)).normalize(); return [q.x - d.x * 0.6, q.y - d.y * 0.6, q.z - d.z * 0.6]; },
      dir: (() => { const d = new THREE.Vector3(...r.b).sub(new THREE.Vector3(...r.a)).normalize(); return [-d.x, -d.y, -d.z] as V3; })(),
      speed: [1, 3], spread: 0.18, size: [0.1, 0.4], colors: white, seed: 500 + i, drag: 0.7, fade: 0.5,
    });
  });

  const update: Orbitals["update"] = (t, opts = {}) => {
    const off = opts.offset ?? [0, 0, 0];
    space.local.position.set(off[0], off[1], off[2]);
    space.setSky(t, opts.sky);
    space.animateDebris(t);

    // the airlock: red, then green, then it slides open onto a lit corridor
    const st = space.station;
    const open = smooth(seg(t, EV.doorSlide[0], EV.doorSlide[1]));
    const closing = smooth(seg(t, 301.0, 303.5));
    const o = open * (1 - closing);
    st.doorLeft.position.x = -2 - o * 4.4;
    st.doorRight.position.x = 2 + o * 4.4;
    st.doorGlow.visible = o > 0.02;
    st.doorGlow.scale.x = Math.max(0.05, o);
    st.lampMat.color.set(t >= EV.lampGreen && t < 301 ? 0x37ff7a : 0xff2a1a);

    // bullets
    const m = new THREE.Matrix4();
    const cam = c.camera.position;
    for (let i = 0; i < SHOT_TIMES.length; i++) {
      const alive = t >= SHOT_TIMES[i]! && t < SHOT_TIMES[i]! + EV.flight + 0.001;
      if (!alive) {
        m.makeScale(0, 0, 0);
      } else {
        const p = bulletPos(i, t);
        const d = p.distanceTo(cam.clone().sub(space.local.position));
        m.compose(p, new THREE.Quaternion(), new THREE.Vector3().setScalar(0.03 + d * 0.0022));
      }
      bullets.setMatrixAt(i, m);
    }
    bullets.instanceMatrix.needsUpdate = true;

    // workers
    c.cast.workers.forEach((w, i) => {
      const r = workerRoute[i]!;
      const vis = t >= r.t0 - 0.1 && t <= r.t1 + 0.1;
      w.show(vis);
      if (!vis) return;
      const p = workerPos(i, t);
      const d = new THREE.Vector3(...r.b).sub(new THREE.Vector3(...r.a));
      const yaw = Math.atan2(d.x, d.z);
      const pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
      w.face("calm", "flat");
      w.pose({ hips: [1.25, 0, 0], armR: [0.4, 0, -0.1], armL: [0.4, 0, 0.1], legR: [0.05, 0, 0], legL: [0.05, 0, 0], neck: [-0.6, 0, 0] });
      w.root.rotation.set(0, 0, 0);
      w.drift([p.x + off[0], p.y + off[1], p.z + off[2]], [pitch, yaw, 0]);
    });

    crowd.update(t);
    // crowd actors were positioned in space coordinates; shift with the local offset
    if (off[0] || off[1] || off[2]) for (const p of crowd.people) p.actor.root.position.add(new THREE.Vector3(...off));
  };

  const zhangFloat: Orbitals["zhangFloat"] = (t, opts = {}) => {
    zhang.show(true).dress(opts.outfit ?? "suit").face(opts.face ?? "calm", "flat");
    zhang.pose(opts.pose ?? zeroG(t, 3, 0.7));
    const centre = opts.centre ?? [0, 0, 0];
    const e = opts.euler ?? [wobble(t * 0.13, 1) * 0.05, 0.03 + wobble(t * 0.11, 2) * 0.08, wobble(t * 0.09, 3) * 0.035];
    zhang.drift(centre, e);
  };

  void float; void addPose; void easeIn; void hash; void lerp; void STATION_POS; void GROUP_POS; void door;
  return { crowd, bullets, update, bulletPos, zhangFloat, workerPos };
}
