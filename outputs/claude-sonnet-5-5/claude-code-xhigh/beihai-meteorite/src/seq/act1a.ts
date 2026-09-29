import type { Shot } from "@agentbench/cinematic-player";
import { idle, walk } from "@agentbench/voxel-kit";
import { defineShot, hold, type Ctx } from "../direction/ctx";
import { seated, stand } from "../direction/poses";
import { gesture, seatLift, speak } from "../direction/stagecraft";
import { addPose } from "../util/kf";
import { clamp, easeOut, lerp, pulse, seg, smooth, wobble } from "../util/math";
import { EV, T } from "../timeline";
import { hutongLight, roomLight, TEA } from "./common";
import { GATE_Z } from "../world/hutong";

const PX_CUP = 1 / 0.05625;

/** Radio dial glows harder while the broadcast speaks. */
function radioGlow(c: Ctx, t: number): void {
  const talking = (t > 28.8 && t < 33.8) || (t > 36.6 && t < 41.6) || (t > 321 && t < 327.8);
  const k = talking ? 0.75 + 0.25 * Math.sin(t * 9) : 0.42;
  c.w.room.radio.dialMat.color.setRGB(1.0 * k, 0.55 * k, 0.16 * k);
}

function collectorAtBench(c: Ctx, t: number, mode: "absorbed" | "look" = "absorbed", lean = 1): void {
  const col = c.cast.collector;
  const r = c.w.room;
  col.show(true).dress("cardigan");
  speak(col, t, mode === "absorbed" ? "shut" : "calm", "smile");
  const base = addPose(seated(t, 1), {
    hips: [0.3 * lean, 0, 0], neck: [0.38 * lean, 0, 0], armR: [-0.78, 0, 0.14], armL: [-0.95, 0, -0.16],
  });
  base.lift = seatLift(col, 0.48);
  col.pose(gesture(base, col, t, 0.5));
  col.stand(-1.6, 0, -0.26, Math.PI);
  r.stool.position.set(-1.75, 0, -0.5);
  hold(c.props.o.magHand, col, "handR", [0, 0, 0.5], [0.0, 0, Math.PI / 2], 1);
}

export function act1a(c: Ctx): Shot<Ctx>[] {
  const { zhang, collector: col } = c.cast;
  const w = c.w;
  const room = w.room;
  const door = (open: number): void => {
    room.doorLeaf.rotation.y = -Math.PI / 2 - open * 1.85;
  };
  const shots: Shot<Ctx>[] = [];

  // ── a1: the lane, one man walking away toward a red gate ───────────────────
  shots.push(defineShot({
    id: "a1-lane", start: T.a1[0], end: T.a1[1], sets: ["hutong"], light: hutongLight,
    run: (t, lt) => {
      const z = 3.6 + lt * 1.35;
      zhang.show(true).dress("jacket").face("calm", "flat");
      zhang.stand(0.35, 0, z, 0).pose(walk(t, 0.9));
    },
    cam: {
      pos: [[0, 0.15, 1.5, -3.8], [4, 0.5, 1.4, -0.9]],
      look: [[0, 0.4, 1.3, 14], [4, 0.6, 1.3, 14]],
      fov: [[0, 38], [4, 33]], ease: "smooth", shake: 0.006,
    },
  }));

  // ── a2: the gate, two knocks ───────────────────────────────────────────────
  shots.push(defineShot({
    id: "a2-knock", start: T.a2[0], end: T.a2[1], sets: ["hutong"], light: hutongLight,
    run: (t, lt) => {
      zhang.show(true).dress("jacket").face("calm", "flat");
      const raise = smooth(seg(t, T.a2[0] + 0.1, T.a2[0] + 0.55));
      const hit = (t0: number): number => (t >= t0 && t < t0 + 0.28 ? Math.sin(((t - t0) / 0.28) * Math.PI) : 0);
      const knock = hit(EV.knock1) + hit(EV.knock2);
      zhang.pose(addPose(stand(t, 2), { armR: [-1.42 * raise - knock * 0.16, 0, -0.06], neck: [0, 0, 0] }));
      zhang.stand(3.02, 0, GATE_Z - 0.08, Math.PI / 2);
      void lt;
    },
    cam: {
      pos: [[0, 0.6, 1.9, GATE_Z - 5.6], [2.6, 1.0, 1.8, GATE_Z - 5.2]],
      look: [[0, 3.4, 1.35, GATE_Z - 0.2], [2.6, 3.4, 1.35, GATE_Z - 0.2]],
      fov: 46, ease: "smooth", shake: 0.004,
    },
  }));

  // ── a3: inside — a small museum, a man bent over a slice, a radio murmuring ────
  shots.push(defineShot({
    id: "a3-room", start: T.a3[0], end: T.a3[1], sets: ["room"],
    light: (_t, _lt, cx) => roomLight(cx, { cab: [-0.3, 1.7, -2.5] }),
    run: (t) => {
      door(0);
      radioGlow(c, t);
      collectorAtBench(c, t);
      room.slice.position.set(-1.4, room.benchTop + 0.02, -1.0);
    },
    cam: {
      pos: [[0, 2.35, 1.62, 3.2], [5.6, 0.9, 1.45, 1.5]],
      look: [[0, -1.6, 1.05, -1.1], [5.6, -1.75, 1.0, -1.0]],
      fov: [[0, 50], [5.6, 40]], ease: "smoother", shake: 0.004,
    },
  }));

  // ── a4: he calls out without looking up ───────────────────────────────────────
  shots.push(defineShot({
    id: "a4-call", start: T.a4[0], end: T.a4[1], sets: ["room"],
    light: (_t, _lt, cx) => roomLight(cx, { lamp: 1.1 }),
    run: (t) => {
      door(0);
      radioGlow(c, t);
      collectorAtBench(c, t, "absorbed", 0.45);
      room.slice.position.set(-1.4, room.benchTop + 0.02, -1.0);
    },
    cam: {
      pos: [[0, 0.5, 1.36, -0.55], [2.2, 0.15, 1.33, -0.5]],
      look: [[0, -1.6, 1.12, -0.5], [2.2, -1.62, 1.12, -0.5]],
      fov: 30, ease: "smooth", shake: 0.003,
    },
  }));

  // ── a5: the door opens; a dark figure on the threshold while the radio names the meeting ──
  shots.push(defineShot({
    id: "a5-door", start: T.a5[0], end: T.a5[1], sets: ["room"],
    light: (_t, _lt, cx) => roomLight(cx, { warm: 1.2, win: [3.0, 1.8, 1.5], winI: 1.2, lamp: 0.6 }),
    run: (t) => {
      radioGlow(c, t);
      door(smooth(seg(t, EV.doorOpen - 0.2, EV.doorOpen + 0.9)));
      const u = seg(t, EV.doorOpen + 0.3, EV.doorOpen + 2.1);
      const z = lerp(5.0, 3.1, easeOut(u));
      zhang.show(true).dress("jacket");
      const gaze = smooth(seg(t, 39.2, 40.4));
      zhang.face(gaze > 0.5 ? "narrow" : "calm", "flat");
      const base = u < 1 ? walk(t, 0.8) : stand(t, 2);
      zhang.pose(addPose(base, { neck: [0, gaze * 0.55, 0] }));
      zhang.stand(2.3, 0, z, Math.PI);
    },
    cam: {
      pos: [[0, 0.7, 0.85, 0.7], [5.6, 1.05, 1.0, 1.5]],
      look: [[0, 2.3, 1.35, 3.6], [5.6, 2.3, 1.48, 3.4]],
      fov: [[0, 42], [5.6, 34]], ease: "smooth", shake: 0.003,
    },
  }));

  // ── a6: he turns, beaming ────────────────────────────────────────────────────────
  shots.push(defineShot({
    id: "a6-welcome", start: T.a6[0], end: T.a6[1], sets: ["room"],
    light: (_t, _lt, cx) => roomLight(cx, { warm: 2.2, warmPos: [0.9, 2.1, 2.8], lamp: 0.5, cab: [-0.8, 1.8, 0.0], cabI: 0.8 }),
    run: (t) => {
      door(1);
      radioGlow(c, t);
      col.show(true).dress("cardigan");
      speak(col, t, "happy", "smile");
      const open = pulse(t, T.a6[0] + 0.5, T.a6[1] - 0.2, 0.3);
      col.pose(addPose(stand(t, 1), { armR: [-0.5 * open, 0, -0.8 * open], armL: [-0.5 * open, 0, 0.8 * open], neck: [0, 0, 0] }));
      col.stand(0.2, 0, 1.2, Math.PI / 2);
      room.stool.position.set(-3.15, 0, -0.4);
      zhang.show(true).dress("jacket").face("calm", "flat");
      zhang.pose(stand(t, 3));
      zhang.stand(1.45, 0, 1.2, -Math.PI / 2);
    },
    cam: {
      pos: [[0, 0.95, 1.5, 3.9], [2.8, 0.85, 1.48, 3.6]],
      look: [[0, 0.83, 1.32, 1.2], [2.8, 0.83, 1.32, 1.2]],
      fov: 30, ease: "smooth", shake: 0.003,
    },
  }));

  // ── a7: what he sees in a man like that ───────────────────────────────────────────
  shots.push(defineShot({
    id: "a7-zhang", start: T.a7[0], end: T.a7[1], sets: ["room"],
    light: (_t, _lt, cx) => roomLight(cx, { win: [3.4, 1.7, 1.6], cab: [-0.9, 1.9, 2.6], cabI: 1.0, winI: 1.3, lamp: 0.3, warm: 1.0, warmPos: [0.2, 2.2, 2.8] }),
    run: (t) => {
      door(1);
      radioGlow(c, t);
      zhang.show(true).dress("jacket");
      const soft = smooth(seg(t, T.a7[0] + 1.4, T.a7[1] - 0.3));
      zhang.face("calm", soft > 0.6 ? "smile" : "flat");
      zhang.pose(addPose(stand(t, 3), { neck: [0.02, -0.06 * soft, 0] }));
      zhang.stand(1.55, 0, 1.75, -Math.PI / 2 - 0.2);
    },
    cam: {
      pos: [[0, 0.1, 1.55, 2.5], [2.6, 0.35, 1.53, 2.35]],
      look: [[0, 1.55, 1.52, 1.75], [2.6, 1.55, 1.52, 1.75]],
      fov: [[0, 24], [2.6, 20]], ease: "smooth", shake: 0.002,
    },
  }));
  shots.push(defineShot({
    id: "a7b-pov", start: T.a7b[0], end: T.a7b[1], sets: ["room"],
    light: (_t, _lt, cx) => roomLight(cx, { cabI: 1.4, cab: [-1.4, 1.7, -2.4] }),
    run: (t) => {
      door(1);
      radioGlow(c, t);
      col.show(true).dress("cardigan");
      col.face("shut", "smile");
      const lean = 0.5 + 0.03 * Math.sin(t * 1.2);
      col.pose(addPose(stand(t, 1), { hips: [lean, 0, 0], neck: [0.25, 0, 0], armR: [-0.9, 0, 0.16], armL: [-0.7, 0, -0.2] }));
      col.stand(-1.6, 0, -0.32, Math.PI);
      room.stool.position.set(-3.15, 0, -0.4);
      hold(c.props.o.magHand, col, "handR", [0, 0, 0.5], [0.0, 0, Math.PI / 2], 1);
      room.slice.position.set(-1.4, room.benchTop + 0.02, -1.0);
    },
    cam: {
      pos: [[0, 0.5, 1.5, 1.6], [2.8, 0.15, 1.5, 1.3]],
      look: [[0, -1.7, 1.15, -0.8], [2.8, -1.7, 1.15, -0.8]],
      fov: 38, ease: "smooth", shake: 0.005,
    },
  }));

  // ── a8..a9: tea, and two old soldiers recognise each other ─────────────────────────
  const teaScene = (t: number, lt: number, who: "col" | "zhang" | "both"): void => {
    door(1);
    radioGlow(c, t);
    const seatCol = seatLift(col, 0.42), seatZ = seatLift(zhang, 0.42);
    col.show(true).dress("cardigan");
    zhang.show(true).dress("jacket");
    speak(col, t, "calm", "smile");
    speak(zhang, t, "calm", "flat");
    const cb = addPose(seated(t, 1), { armR: [-1.05, 0, 0.08], armL: [-0.95, 0, -0.06], hips: [0.0, 0, 0] });
    cb.lift = seatCol;
    // pouring in the first seconds
    const pour = pulse(t, 50.4, 52.8, 0.4);
    const cbp = addPose(cb, { armR: [-0.25 * pour, 0, 0.0], neck: [0, 0, 0] });
    cbp.lift = seatCol;
    col.pose(gesture(cbp, col, t, 0.8));
    col.stand(TEA.A[0] - 0.1, 0, TEA.A[2], Math.PI / 2);
    const zb = addPose(seated(t, 3), { armR: [-0.9, 0, 0.1], armL: [-1.0, 0, -0.1] });
    zb.lift = seatZ;
    zhang.pose(gesture(zb, zhang, t, 0.5));
    zhang.stand(TEA.B[0] + 0.1, 0, TEA.B[2], -Math.PI / 2);
    // teapot tilts over the cup while pouring
    room.pot.rotation.z = -0.55 * pour;
    room.pot.position.set(1.75 - 0.15 * pour, 0.63 + 0.06 * pour, -0.5);
    void who; void lt;
  };
  shots.push(defineShot({
    id: "a8-tea", start: T.a8[0], end: T.a8[1], sets: ["room"],
    light: (_t, _lt, cx) => roomLight(cx, { win: [3.2, 1.6, -0.5], winI: 1.2, cab: [1.4, 1.7, -2.6], cabI: 0.8, warm: 2.4, warmPos: [1.7, 2.2, 1.6], lamp: 0.4 }),
    run: (t, lt) => teaScene(t, lt, "both"),
    cam: {
      pos: [[0, 1.7, 1.28, 1.95], [7.8, 1.72, 1.24, 1.55]],
      look: [[0, 1.7, 0.98, -0.5], [7.8, 1.7, 0.98, -0.5]],
      fov: [[0, 36], [7.8, 30]], ease: "smooth", shake: 0.003,
    },
  }));
  shots.push(defineShot({
    id: "a9-soldier", start: T.a9[0], end: T.a9[1], sets: ["room"],
    light: (_t, _lt, cx) => roomLight(cx, { win: [3.2, 1.6, -0.5], winI: 1.0, cab: [0.2, 1.7, -2.6], cabI: 0.8, warm: 2.4, warmPos: [1.7, 2.0, 1.4], lamp: 0.4 }),
    run: (t, lt) => teaScene(t, lt, "col"),
    cam: {
      pos: [[0, 2.25, 1.28, -0.05], [4, 2.05, 1.26, 0.1]],
      look: [[0, 0.75, 1.16, -0.5], [4, 0.75, 1.16, -0.5]],
      fov: [[0, 27], [4, 24]], ease: "smooth", shake: 0.003,
    },
  }));

  void clamp; void wobble; void idle;
  return shots;
}
