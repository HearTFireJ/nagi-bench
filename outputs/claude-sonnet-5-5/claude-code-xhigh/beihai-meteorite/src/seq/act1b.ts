import * as THREE from "three";
import type { Shot } from "@agentbench/cinematic-player";
import { walk, type Pose } from "@agentbench/voxel-kit";
import { defineShot, drop, hold, type Ctx } from "../direction/ctx";
import { seated, stand } from "../direction/poses";
import { gesture, seatLift, speak } from "../direction/stagecraft";
import { addPose } from "../util/kf";
import { easeOut, lerp, pulse, seg, smooth } from "../util/math";
import { EV, T } from "../timeline";
import { roomLight, TEA } from "./common";

const PXM = 1 / 0.05625;

export function act1b(c: Ctx): Shot<Ctx>[] {
  const { zhang, collector: col } = c.cast;
  const w = c.w;
  const room = w.room;
  const snow = w.snow;
  const o = c.props.o;
  const shots: Shot<Ctx>[] = [];

  const doorOpen = (): void => {
    room.doorLeaf.rotation.y = -Math.PI / 2 - 1.85;
  };
  const radio = (t: number): void => {
    room.radio.dialMat.color.setRGB(0.42, 0.23, 0.07);
    void t;
  };

  const seatBoth = (t: number, colPose?: Partial<Record<string, [number, number, number]>>, zhPose?: Partial<Record<string, [number, number, number]>>): void => {
    doorOpen();
    radio(t);
    col.show(true).dress("cardigan");
    zhang.show(true).dress("jacket");
    const cb = addPose(seated(t, 1), { armR: [-1.0, 0, 0.08], armL: [-0.95, 0, -0.06], ...(colPose ?? {}) });
    cb.lift = seatLift(col, 0.42);
    col.pose(gesture(cb, col, t, 0.8));
    col.stand(TEA.A[0] - 0.1, 0, TEA.A[2], Math.PI / 2);
    const zb = addPose(seated(t, 3), { armR: [-0.9, 0, 0.1], armL: [-1.0, 0, -0.1], ...(zhPose ?? {}) });
    zb.lift = seatLift(zhang, 0.42);
    zhang.pose(gesture(zb, zhang, t, 0.5));
    zhang.stand(TEA.B[0] + 0.1, 0, TEA.B[2], -Math.PI / 2);
  };

  // ── a10: Antarctica — a tiny orange figure walks a line of footprints toward a black stone ──
  const gy = (x: number, z: number): number => snow.heightAt(x, z);
  const snowLight = () => ({ ...snow.previewLight, exposure: 0.85 });
  shots.push(defineShot({
    id: "a10-antarctica", start: T.a10[0], end: T.a10[1], sets: ["snow"],
    light: snowLight,
    run: (t, lt) => {
      col.show(true).dress("parka").face("calm", "flat");
      const k = lt / (T.a10[1] - T.a10[0]);
      const z = lerp(11.5, 2.6, easeOut(k) * 0.85 + k * 0.15);
      col.pose(walk(t, 0.7));
      col.stand(0, gy(0, z), z, Math.PI);
    },
    cam: {
      pos: [[0, 0.32, gy(0.32, -1.0) + 0.3, -1.0], [3.2, 0.3, gy(0.3, -0.85) + 0.34, -0.8]],
      look: [[0, 0.1, gy(0.1, 8) + 1.0, 8], [3.2, 0.1, gy(0.1, 8) + 1.0, 8]],
      fov: 32, ease: "smooth", shake: 0.004,
    },
  }));
  shots.push(defineShot({
    id: "a10b-found", start: T.a10b[0], end: T.a10b[1], sets: ["snow"],
    light: snowLight,
    run: (_t, lt) => {
      col.show(true).dress("parka");
      const lift = smooth(seg(lt, 0.2, 1.3));
      const kneelPose: Pose = {
        hips: [0.8, 0, 0], neck: [-0.5, 0, 0],
        armR: [-1.0 - lift * 1.0, 0, 0.05], armL: [-0.9, 0, -0.1],
        legR: [-1.35, 0, 0.05], legL: [-0.2, 0, -0.05], lift: -5.0,
      };
      col.pose(kneelPose);
      col.face(lift > 0.35 ? "happy" : "wide", lift > 0.35 ? "smile" : "flat");
      col.stand(0, gy(0, 1.0), 1.0, Math.PI);
      snow.stone.visible = lift < 0.05;
      if (lift >= 0.05) hold(o.heroRock, col, "handR", [0, 0, 0.9], [0, 0, 0], 1.7);
    },
    cam: {
      pos: [[0, -1.1, gy(-1.1, -0.8) + 0.5, -0.9], [1.8, -0.9, gy(-0.9, -0.8) + 0.6, -0.55]],
      look: [[0, 0, gy(0, 1) + 0.75, 1.0], [1.8, 0, gy(0, 1) + 1.0, 1.0]],
      fov: 30, ease: "smooth", shake: 0.004,
    },
  }));

  // ── a11: every one of them is another world ────────────────────────────────
  type V = [number, number, number];
  const tealight = (c2: Ctx, o2: { rim?: V; key?: V; keyI?: number } = {}) =>
    roomLight(c2, { win: o2.rim ?? [3.4, 1.7, -0.3], winI: 1.0, cab: [1.2, 1.9, -2.4], cabI: 0.6, warm: o2.keyI ?? 1.5, warmPos: o2.key ?? [1.0, 2.3, 1.9], lamp: 0.25 });
  shots.push(defineShot({
    id: "a11-world", start: T.a11[0], end: T.a11[1], sets: ["room"],
    light: (_t, _lt, cx) => tealight(cx, { key: [1.3, 2.3, 2.0] }),
    run: (t) => {
      seatBoth(t, { armR: [-1.15, 0, -0.55] });
      speak(col, t, "happy", "smile");
      hold(o.heroRock, col, "handR", [0, 0, 0.9], [0.2, 0, 0], 1.3);
    },
    cam: {
      pos: [[0, 2.7, 1.5, 1.2], [3, 2.5, 1.46, 0.9]],
      look: [[0, 0.8, 1.2, -0.5], [3, 0.8, 1.2, -0.5]],
      fov: 30, ease: "smooth", shake: 0.003,
    },
  }));

  // ── a12: Zhang, cup raised — the Earth is a meteorite, and so is the tea ───────
  shots.push(defineShot({
    id: "a12-teacup", start: T.a12[0], end: T.a12[1], sets: ["room"],
    light: (_t, _lt, cx) => tealight(cx, { key: [1.6, 2.2, 2.0], rim: [3.5, 1.7, -0.4] }),
    run: (t) => {
      const lift = pulse(t, T.a12[0] + 2.4, T.a12[1] - 0.4, 0.5);
      seatBoth(t, undefined, { armR: [-0.9 - 0.9 * lift, 0, 0.12 * lift] });
      const smile = smooth(seg(t, 74.2, 74.9));
      speak(zhang, t, "calm", smile > 0.5 ? "smile" : "flat");
      hold(room.cups[0]!, zhang, "handR", [0, -0.1, 1.0], [0, 0, 0], PXM * 0.9);
    },
    cam: {
      pos: [[0, 0.9, 1.5, 1.6], [5.8, 1.1, 1.46, 1.3]],
      look: [[0, 2.45, 1.28, -0.5], [5.8, 2.45, 1.32, -0.5]],
      fov: [[0, 32], [5.8, 27]], ease: "smooth", shake: 0.003,
    },
  }));

  // ── a13: the collector laughs and wags a finger ──────────────────────────────
  shots.push(defineShot({
    id: "a13-laugh", start: T.a13[0], end: T.a13[1], sets: ["room"],
    light: (_t, _lt, cx) => tealight(cx, { key: [1.6, 2.2, 2.2], rim: [3.4, 1.6, -0.5] }),
    run: (t) => {
      const laugh = pulse(t, T.a13[0] + 0.1, T.a13[0] + 1.6, 0.2);
      seatBoth(t, { armR: [-1.0 * (1 - laugh) - 0.5, 0, -0.55 * laugh - 0.25] });
      col.face(laugh > 0.4 ? "happy" : "calm", laugh > 0.4 ? "laugh" : "smile");
      if (!(t < T.a13[0] + 1.6)) speak(col, t, "calm", "smile");
    },
    cam: {
      pos: [[0, 2.7, 1.55, 1.4], [5.2, 2.5, 1.5, 1.1]],
      look: [[0, 0.8, 1.15, -0.5], [5.2, 0.8, 1.15, -0.5]],
      fov: [[0, 32], [5.2, 27]], ease: "smooth", shake: 0.003,
    },
  }));

  // ── a14: the house treasure — a sliver from Mars ─────────────────────────────
  shots.push(defineShot({
    id: "a14-safe", start: T.a14[0], end: T.a14[1], sets: ["room"],
    light: (_t, _lt, cx) => roomLight(cx, { win: [3.5, 1.7, -1.6], winI: 1.0, warm: 1.6, warmPos: [2.0, 2.4, -1.4], cab: [1.0, 1.8, -2.6], cabI: 0.7, lamp: 0.25 }),
    run: (t, lt) => {
      doorOpen();
      radio(t);
      const open = smooth(seg(lt, 0.3, 1.4));
      room.safe.door.rotation.y = Math.PI - open * 2.1;
      col.show(true).dress("cardigan");
      zhang.show(true).dress("jacket");
      speak(col, t, "calm", "smile");
      col.pose(gesture(addPose(stand(t, 1), { armR: [-0.6, 0, 0.1] }), col, t, 0.6));
      col.stand(3.0, 0, -2.55, Math.PI / 2);
      zhang.face("calm", "flat");
      zhang.pose(stand(t, 3));
      zhang.stand(3.05, 0, -1.75, Math.PI / 2);
    },
    cam: {
      pos: [[0, 1.4, 1.5, -3.1], [3.4, 1.9, 1.45, -3.0]],
      look: [[0, 3.3, 1.0, -2.3], [3.4, 3.4, 1.0, -2.3]],
      fov: 36, ease: "smooth", shake: 0.003,
    },
  }));
  shots.push(defineShot({
    id: "a15-eyepiece", start: T.a15[0], end: T.a15[1], sets: ["room"], optic: "eye",
    light: () => ({
      bg: 0x050302,
      exposure: 1.0,
      hemi: [0x554433, 0x221610, 0.5],
      spot: { color: 0xfff0d8, intensity: 5, pos: [room.micro.centre.x + 0.25, 0.9, room.micro.centre.z + 0.35], target: [room.micro.centre.x, 0.05, room.micro.centre.z], angle: 0.6, penumbra: 0.7 },
    }),
    run: () => { doorOpen(); },
    cam: {
      pos: [[0, 39.88, 0.3, 40.2], [2.8, 40.12, 0.27, 39.98]],
      look: [[0, 40.02, 0.05, 40.0], [2.8, 40.06, 0.05, 39.96]],
      fov: 26, ease: "smooth",
    },
  }));

  // ── a16..a20: what he needs, and what he will not haggle over ──────────────────
  const benchScene = (t: number, opts: { colZ?: number; zhX?: number } = {}): void => {
    doorOpen();
    radio(t);
    col.show(true).dress("cardigan");
    zhang.show(true).dress("jacket");
    room.stool.position.set(-3.15, 0, -0.4);
    speak(col, t, "calm", "smile");
    speak(zhang, t, "calm", "flat");
    col.pose(gesture(stand(t, 1), col, t, 1));
    col.stand(-1.7, 0, opts.colZ ?? -2.0, 0);
    zhang.pose(gesture(stand(t, 3), zhang, t, 0.5));
    zhang.stand(opts.zhX ?? -0.5, 0, -1.2, -Math.PI / 2);
  };
  const benchLight = (cx: Ctx, key: V, rim: V, lamp = 0.6) =>
    roomLight(cx, { cab: rim, cabI: 0.9, warm: 1.5, warmPos: key, lamp, winI: 0.3 });
  shots.push(defineShot({
    id: "a16-needs", start: T.a16[0], end: T.a16[1], sets: ["room"],
    light: (_t, _lt, cx) => benchLight(cx, [-1.6, 2.3, 0.6], [-0.4, 1.9, -2.6]),
    run: (t) => benchScene(t),
    cam: {
      pos: [[0, -2.6, 1.52, 0.5], [4.4, -2.4, 1.5, 0.35]],
      look: [[0, -0.5, 1.5, -1.2], [4.4, -0.5, 1.5, -1.2]],
      fov: [[0, 32], [4.4, 28]], ease: "smooth", shake: 0.003,
    },
  }));
  shots.push(defineShot({
    id: "a17-three-stones", start: T.a17[0], end: T.a17[1], sets: ["room"],
    light: (_t, _lt, cx) => benchLight(cx, [-0.8, 2.4, 0.8], [-1.6, 1.8, -2.6], 1.4),
    run: (t) => {
      benchScene(t);
      room.bigStones.forEach((s, i) => {
        s.visible = t > T.a17[0] + 0.5 + i * 0.7;
      });
      const place = pulse(t, T.a17[0] + 0.3, T.a17[0] + 2.4, 0.3);
      col.pose(gesture(addPose(stand(t, 1), { armR: [-1.0 * place, 0, 0.15], hips: [0.12 * place, 0, 0] }), col, t, 0.7));
    },
    cam: {
      pos: [[0, -0.2, 2.1, 0.9], [4.4, -0.7, 1.9, 0.7]],
      look: [[0, -1.5, 0.95, -1.4], [4.4, -1.6, 0.95, -1.4]],
      fov: 42, ease: "smooth", shake: 0.003,
    },
  }));
  shots.push(defineShot({
    id: "a18-payment", start: T.a18[0], end: T.a18[1], sets: ["room"],
    light: (_t, _lt, cx) => benchLight(cx, [-1.7, 2.2, 0.4], [-0.4, 1.9, -2.6], 0.5),
    run: (t) => {
      benchScene(t);
      room.bigStones.forEach((s) => { s.visible = true; });
      const draw = smooth(seg(t, T.a18[0], T.a18[0] + 0.5));
      zhang.pose(addPose(stand(t, 3), { armR: [-1.15 * draw, 0, 0.3 * draw], neck: [0.12 * draw, 0, 0] }));
      const ph = c.props.phone;
      hold(ph.group, zhang, "handR", [0, 0, 1.0], [0.5, 0, 0], 1.0);
      const done = smooth(seg(t, EV.payment, EV.payment + 0.2));
      ph.screenMat.color.setRGB(lerp(0.4, 0.2, done), lerp(0.7, 1.0, done), lerp(1.0, 0.5, done));
    },
    cam: {
      pos: [[0, -2.1, 1.6, -0.1], [2.6, -2.0, 1.55, -0.2]],
      look: [[0, -0.55, 1.42, -1.2], [2.6, -0.55, 1.42, -1.2]],
      fov: 30, ease: "smooth", shake: 0.002,
    },
  }));
  shots.push(defineShot({
    id: "a19-embarrassed", start: T.a19[0], end: T.a19[1], sets: ["room"],
    light: (_t, _lt, cx) => benchLight(cx, [-0.4, 2.3, 0.2], [-2.6, 1.9, -2.9], 0.9),
    run: (t) => {
      benchScene(t);
      room.bigStones.forEach((s) => { s.visible = true; });
      const scratch = smooth(seg(t, T.a19[0] + 0.3, T.a19[0] + 0.9));
      col.pose(gesture(addPose(stand(t, 1), { armR: [-2.7 * scratch, 0, 0.3 * scratch], neck: [0, 0, 0.08 * scratch] }), col, t, 0.6));
    },
    cam: {
      pos: [[0, -0.2, 1.6, -0.2], [2.8, -0.4, 1.55, -0.3]],
      look: [[0, -1.7, 1.42, -2.0], [2.8, -1.7, 1.42, -2.0]],
      fov: 34, ease: "smooth", shake: 0.003,
    },
  }));
  shots.push(defineShot({
    id: "a20-respect", start: T.a20[0], end: T.a20[1], sets: ["room"],
    light: (_t, _lt, cx) => benchLight(cx, [-2.0, 2.3, 0.4], [-0.4, 2.0, -2.7], 0.3),
    run: (t) => {
      benchScene(t);
      room.bigStones.forEach((s) => { s.visible = true; });
      const hard = smooth(seg(t, T.a20[0] + 1.4, T.a20[0] + 1.9)) * (1 - smooth(seg(t, T.a20[1] - 0.8, T.a20[1] - 0.2)));
      speak(zhang, t, hard > 0.5 ? "narrow" : "calm", "flat");
    },
    cam: {
      pos: [[0, -2.7, 1.55, -0.1], [4.2, -2.0, 1.53, -0.7]],
      look: [[0, -0.5, 1.5, -1.2], [4.2, -0.5, 1.5, -1.2]],
      fov: [[0, 32], [4.2, 22]], ease: "smooth", shake: 0.0015,
    },
  }));

  const zhPath = (lt: number): [number, number, number, number] => {
    // [x, y, z, yaw]: waits at the bench, then turns and walks to the door
    const go = smooth(seg(lt, 2.9, 4.4));
    const x = lerp(-0.5, 2.3, go);
    const z = lerp(-1.2, 3.4, go);
    const yaw = lerp(-Math.PI / 2, 0.55, smooth(seg(lt, 2.7, 3.3)));
    return lt > 2.9 ? [x, 0, z, yaw] : [-0.5, 0, -1.2, -Math.PI / 2];
  };

  // ── a21: wrapped in green felt; a handshake, a nod; he leaves into the blue dusk ───
  shots.push(defineShot({
    id: "a21-parting", start: T.a21[0], end: T.a21[1], sets: ["room"],
    light: (_t, _lt, cx) => roomLight(cx, { cab: [-0.4, 1.8, -2.3], cabI: 1.0, warm: 1.6, warmPos: [-0.6, 2.4, 0.6], winI: 1.0, lamp: 0.8 }),
    run: (t, lt) => {
      doorOpen();
      room.radio.dialMat.color.setRGB(0.42, 0.23, 0.07);
      col.show(true).dress("cardigan");
      zhang.show(true).dress("jacket");
      room.stool.position.set(-3.15, 0, -0.4);
      const wrap = smooth(seg(lt, 0.0, 0.7));
      room.bigStones.forEach((s) => { s.visible = wrap < 0.5; });
      const handOver = smooth(seg(lt, 1.6, 2.2));
      const leave = seg(lt, 2.9, 4.4);
      col.face("calm", "smile");
      zhang.face("calm", lt > 2.3 && lt < 3.0 ? "smile" : "flat");
      col.pose(addPose(stand(t, 1), { armR: [-1.2 * (wrap > 0.5 ? 1 : 0.2), 0, 0.1], armL: [-1.1, 0, -0.1], neck: [0.1, 0, 0] }));
      col.stand(-1.7, 0, -2.0 + 0.55 * handOver, 0);
      // the bundle: on the felt, then in his hands, then in Zhang's
      const b = o.bundle;
      if (lt < 0.9) drop(b, c.scene, [-1.7, room.benchTop + 0.06, -1.15], [0, 0.3, 0], 0.0563 * 1.0);
      else if (lt < 2.0) hold(b, col, "handR", [0.4, 0, 0.9], [0, 0, 0], 1);
      else hold(b, zhang, "handR", [0.4, 0, 0.9], [0, 0, 0], 1);
      // Zhang: bow of the head, turn, walk out
      const zp = zhPath(lt);
      const moving = lt > 2.9;
      zhang.pose(moving ? addPose(walk(t, 0.8), { armR: [-0.8, 0, 0.2] }) : addPose(stand(t, 3), { neck: [0.2 * handOver, 0, 0], armR: [-1.1 * handOver, 0, 0.15] }));
      zhang.stand(zp[0], 0, zp[2], zp[3]);
    },
    cam: {
      pos: [[0, 0.2, 1.55, 0.7], [4.4, 0.7, 1.5, 1.0]],
      look: (l) => {
        const zp = zhPath(l);
        const k = smooth(seg(l, 2.5, 3.6));
        return [lerp(-1.1, zp[0], k), 1.2, lerp(-1.2, zp[2], k)];
      },
      fov: [[0, 42], [4.4, 36]], ease: "smooth", shake: 0.003,
    },
  }));

  void THREE;
  return shots;
}
