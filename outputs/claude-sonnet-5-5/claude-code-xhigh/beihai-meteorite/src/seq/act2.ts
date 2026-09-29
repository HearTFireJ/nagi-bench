import * as THREE from "three";
import type { Shot } from "@agentbench/cinematic-player";
import { aim, walk } from "@agentbench/voxel-kit";
import { defineShot, hold, type Ctx } from "../direction/ctx";
import type { LightPreset } from "../direction/rig";
import { stand } from "../direction/poses";
import { orbit } from "../direction/stagecraft";
import { addPose } from "../util/kf";
import { clamp, easeOut, hash, lerp, pulse, seg, smooth, type V3 } from "../util/math";
import { CNC } from "../world/shop";
import { EV, T } from "../timeline";
import { VoxGrid } from "../util/vox";

/** 二 · 车间与地下室 — patient hands, a machine, a bulb, a bang. */
export function act2(c: Ctx): Shot<Ctx>[] {
  const { zhang } = c.cast;
  const shop = c.w.shop;
  const bs = c.w.basement;
  const o = c.props.o;
  const pistol = c.props.pistol;
  const shots: Shot<Ctx>[] = [];
  const M = new THREE.Matrix4();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  // ── instanced stock in the shop tray ────────────────────────────────────────
  shop.rods.geometry = new VoxGrid(1, 1, 12).box(0, 0, 0, 1, 1, 12, (x, y, z) => (z % 3 === 0 ? 0x7a6f64 : 0x6a625a)).geometry(0.028, "center");
  for (let i = 0; i < 12; i++) shop.rods.setMatrixAt(i, M.makeTranslation(-0.3 + i * 0.05, 0.03, 0));
  for (let i = 0; i < 36; i++) shop.segments.setMatrixAt(i, M.makeTranslation(0.02 + (i % 6) * 0.05, 0.03, -0.17 + Math.floor(i / 6) * 0.068));
  shop.rods.instanceMatrix.needsUpdate = true;
  shop.segments.instanceMatrix.needsUpdate = true;
  shop.rods.count = 0;
  shop.segments.count = 0;

  // ── shop lighting: cold tubes that flicker on and die again ───────────────────
  const power = (t: number): number => {
    if (t < 111.0) return 0;
    if (t < 112.5) {
      const k = Math.floor((t - 111.0) * 9);
      return [0, 1, 0, 0, 1, 0.25, 1, 0, 1, 1, 0.5, 1, 1, 1][Math.min(13, k)]!;
    }
    if (t < 135.9) return 1;
    if (t < 137.4) return hash(Math.floor((t - 135.9) * 10)) > 0.45 ? 0.5 : 0;
    return 0;
  };
  const shopLight = (t: number, extra = 0): LightPreset => {
    const p = power(t);
    for (const tube of shop.tubes) tube.mat.color.setScalar(0.04 + 0.96 * p);
    return {
      bg: 0x05070a,
      exposure: 1.05,
      fog: { color: 0x0d1412, density: 0.007 },
      hemi: [0x86a89a, 0x1a2420, 0.5 * p + 0.02],
      spot: { color: 0xeafff5, intensity: 75 * p, pos: [0.6, 3.6, -0.4], target: [0.6, 1.0, -1.5], angle: 0.9, penumbra: 0.7, distance: 12 },
      points: [
        { color: 0xbfe8dc, intensity: 8 * p, pos: [-2.2, 3.4, 0.2], distance: 10 },
        { color: 0xbfe8dc, intensity: 7 * p, pos: [3.2, 3.4, 1.6], distance: 10 },
        { color: 0xffa64a, intensity: 5 * extra, pos: [0.6, 1.5, -1.3], distance: 3.5 },
      ],
    };
  };
  const doorPos = (): void => {
    shop.door.rotation.y = 0;
  };
  const tower = (running: boolean, done = false): void => {
    shop.tower.green.color.set(running ? 0x37ff7a : done ? 0x14522c : 0x0d2a18);
    shop.tower.amber.color.set(done ? 0xffb02e : 0x3a2a0c);
    shop.tower.red.color.set(0x3a0d0d);
  };

  const cutting = (t: number): number => (t > 120.3 && t < EV.cutEnd ? 1 : 0);
  const nose = (t: number): number => {
    const down = smooth(seg(t, 119.5, 120.3));
    const up = smooth(seg(t, EV.cutEnd, EV.cutEnd + 0.7));
    const base = lerp(CNC.restNose, CNC.cutNose, down * (1 - up));
    return base - cutting(t) * (0.05 + 0.05 * Math.sin(t * 5.5));
  };
  const cncGroupFor = (t: number): void => {
    shop.spindle.position.y = nose(t);
    shop.chuck.rotation.y = t > 116 ? (t - 116) * 2.4 : 0;
    const tip = new THREE.Vector3(0.6, nose(t) - CNC.toolLen, -1.5);
    void tip;
    shop.mountedStone.visible = t > 115.9 && t < EV.cutEnd + 0.9;
    const eaten = smooth(seg(t, EV.cutStart, EV.cutEnd));
    shop.mountedStone.scale.setScalar(lerp(1, 0.55, eaten));
    (shop.spindle.children[1] as THREE.Mesh).visible = t < 133.9;
  };

  // Emitters: sparks, coolant (deterministic in time)
  c.fx.shop.add({
    t0: EV.cutStart, t1: EV.cutEnd, rate: 110, life: 0.55,
    origin: (b) => [0.6 + 0.04, nose(b) - CNC.toolLen + 0.03, -1.5], dir: [0.9, 0.35, 0.6],
    speed: [1.0, 2.8], spread: 0.9, size: [0.022, 0.006], colors: [0xffd27a, 0xff9a3a, 0xfff2c0, 0xff7a2a],
    seed: 5, gravity: [0, -5.5, 0], fade: 0.3,
  });
  c.fx.shop.add({
    t0: EV.cutStart, t1: EV.cutEnd, rate: 70, life: 0.4,
    origin: [0.95, 1.9, -1.15], dir: [-0.5, -0.9, -0.6], speed: [1.6, 2.4], spread: 0.18, size: [0.018, 0.012],
    colors: [0xd8f2ff, 0xffffff, 0xa9d8f5], seed: 9, gravity: [0, -3, 0], fade: 0.4,
  });
  c.fx.shop.add({
    t0: 130.5, t1: 133.0, rate: 40, life: 0.6,
    origin: [0.6, 1.02, -1.4], dir: [0.2, 0.4, 0.8], speed: [0.2, 0.6], spread: 1.2, size: [0.012, 0.004],
    colors: [0x8a8078, 0x6a625a, 0xa39a90], seed: 21, gravity: [0, -1.5, 0], fade: 0.5,
  });

  // ── b1: after hours; a man switches the lights on ─────────────────────────────
  shots.push(defineShot({
    id: "b1-shop-enter", start: T.b1[0], end: T.b1[1], sets: ["shop"],
    light: (t) => shopLight(t),
    run: (t, lt) => {
      doorPos();
      cncGroupFor(t);
      tower(false);
      const k = seg(lt, 0.4, 3.6);
      const x = lerp(3.4, 2.3, smooth(seg(lt, 1.6, 3.6)));
      const z = lerp(4.6, 0.4, easeOut(k));
      zhang.show(true).dress("jacket").face("calm", "flat");
      zhang.pose(k < 1 ? addPose(walk(t, 0.85), { armR: [0.05, 0, 0] }) : stand(t, 3));
      zhang.stand(x, 0, z, Math.PI + (x < 3.3 ? 0.25 : 0));
      hold(o.bundle, zhang, "handL", [0, 0, 0.9], [0, 0, 0], 1);
      shop.panel.set(0, "idle", t);
    },
    cam: {
      pos: [[0, -5.2, 2.7, 3.6], [4.2, -3.9, 2.2, 3.0]],
      look: [[0, 0.6, 1.2, -1.4], [4.2, 0.9, 1.2, -1.3]],
      fov: [[0, 44], [4.2, 40]], ease: "smooth", shake: 0.004,
    },
  }));

  // ── b2: the first stone goes into the chuck ─────────────────────────────────
  shots.push(defineShot({
    id: "b2-clamp", start: T.b2[0], end: T.b2[1], sets: ["shop"],
    light: (t) => shopLight(t),
    run: (t, lt) => {
      doorPos();
      cncGroupFor(t);
      const mount = smooth(seg(lt, 0.9, 1.9));
      tower(t > 118.4);
      zhang.show(true).dress("jacket").face("calm", "flat");
      const press = pulse(t, 117.8, 118.4, 0.15);
      const pose = addPose(stand(t, 3), {
        hips: [0.16 * (1 - press), 0, 0],
        armR: [-1.15 * (1 - press) - 1.05 * press, 0, 0.1 * (1 - press) - 0.35 * press],
        armL: [-1.15 * (1 - press), 0, -0.1],
        neck: [0.1, press * -0.4, 0],
      });
      zhang.pose(pose);
      zhang.stand(lerp(0.6, 1.1, press), 0, -0.5, Math.PI + press * 0.6);
      if (mount < 1) hold(o.stoneHand, zhang, "handR", [0.2, 0, 0.8], [0, 0, 0], 1);
      shop.panel.set(t > 118.0 ? 1 : 0, t > 118.0 ? "cut" : "idle", t);
    },
    cam: {
      pos: [[0, 2.5, 1.55, 0.7], [5.2, 1.8, 1.5, 0.35]],
      look: [[0, 0.6, 1.25, -1.2], [5.2, 0.8, 1.25, -1.2]],
      fov: [[0, 40], [5.2, 32]], ease: "smooth", shake: 0.003,
    },
  }));

  // ── b3: iron sings; the stone is drilled into pencil-thick rods ───────────────
  shots.push(defineShot({
    id: "b3-cut", start: T.b3[0], end: T.b3[1], sets: ["shop"],
    light: (t) => ({ ...shopLight(t, cutting(t) * (0.8 + 0.2 * Math.sin(t * 40))), exposure: 0.8 }),
    run: (t) => {
      doorPos();
      cncGroupFor(t);
      tower(true);
      shop.panel.set(Math.floor(seg(t, 120, 125) * 12), "cut", t);
    },
    cam: {
      pos: [[0, 1.5, 1.75, -0.2], [2.6, 1.0, 1.65, -0.15], [6.0, 0.3, 1.6, -0.2]],
      look: [[0, 0.6, 1.42, -1.5], [2.6, 0.6, 1.4, -1.5], [6.0, 0.6, 1.4, -1.5]],
      fov: 26, ease: "smooth", shake: 0.002, shakeRate: 6,
    },
  }));

  // ── b4: rods become thirty-six little cylinders; the counter climbs ─────────
  shots.push(defineShot({
    id: "b4-segments", start: T.b4[0], end: T.b4[1], sets: ["shop"],
    light: (t) => shopLight(t),
    run: (t, lt) => {
      doorPos();
      cncGroupFor(t);
      const n = Math.floor(smooth(seg(t, 126.4, 129.7)) * 36);
      shop.segments.count = n;
      shop.rods.count = Math.max(0, Math.min(12, Math.round((1 - smooth(seg(t, 126.6, 129.6))) * 12)));
      shop.rods.visible = shop.rods.count > 0 || t < 126.6;
      if (t < 126.4) shop.rods.count = 12;
      tower(t < 129.8, t >= 129.8);
      shop.panel.set(n, n >= 36 ? "done" : "saw", t);
      shop.sawBlade.visible = false;
      void lt;
    },
    cam: {
      pos: [[0, 1.3, 1.95, -0.05], [2.4, 1.35, 1.8, 0.0], [3.6, -0.15, 1.65, 0.45], [5.0, -0.5, 1.5, 0.55]],
      look: [[0, 2.35, 1.72, -1.6], [2.4, 2.3, 1.7, -1.55], [3.6, -0.75, 0.95, -0.6], [5.0, -0.75, 0.98, -0.6]],
      fov: [[0, 26], [3.4, 26], [3.7, 26], [5.0, 30]], ease: "smooth", shake: 0.002,
    },
  }));

  // ── b5: sweep up every crumb; unscrew and pocket the special cutter ───────────
  shots.push(defineShot({
    id: "b5-cleanup", start: T.b5[0], end: T.b5[1], sets: ["shop"],
    light: (t) => shopLight(t),
    run: (t, lt) => {
      doorPos();
      cncGroupFor(t);
      tower(false, true);
      shop.mountedStone.visible = false;
      shop.segments.count = 36;
      shop.rods.count = 0;
      shop.panel.set(36, "done", t);
      shop.sawBlade.visible = false;
      zhang.show(true).dress("jacket").face("calm", "flat");
      const sweep = lt < 2.7 ? Math.sin(lt * 7.0) * 0.32 : 0;
      const reach = smooth(seg(lt, 2.7, 3.4)) * (1 - smooth(seg(lt, 4.4, 4.9)));
      const pose = addPose(stand(t, 3), {
        hips: [0.22 * (1 - reach), 0, 0],
        armR: [-1.05 * (1 - reach) - 2.85 * reach + sweep * 0.3, 0, 0.1 - sweep * 0.5],
        armL: [-0.9 * (1 - reach), 0, -0.2],
        neck: [0.2 * (1 - reach), 0, 0],
      });
      zhang.pose(pose);
      zhang.stand(0.6, 0, -0.5, Math.PI);
      if (lt < 2.7) {
        hold(o.brush, zhang, "handR", [0, 0, 0.8], [0.3, 0, 0], 1);
        hold(o.bag, zhang, "handL", [0, 0, 0.8], [0, 0, 0], 1);
      } else if (lt < 3.9) {
        // the tool is still in the spindle
      } else if (lt < 4.9) hold(o.toolBit, zhang, "handR", [0, 0, 0.8], [0.4, 0, 0], 1);
      else hold(o.toolBit, zhang, "hipR", [0, 1.2, 0.2], [0, 0, 0], 0.7);
      shop.spindle.position.y = lt > 2.7 ? CNC.cutNose + 0.05 : CNC.restNose;
    },
    cam: {
      pos: [[0, 1.9, 1.5, 0.9], [2.7, 1.3, 1.5, 0.5], [5.2, 0.95, 1.85, -0.25]],
      look: [[0, 0.6, 1.0, -1.0], [2.7, 0.6, 1.2, -1.0], [5.2, 0.62, 1.75, -1.35]],
      fov: [[0, 36], [2.7, 32], [5.2, 26]], ease: "smooth", shake: 0.003,
    },
  }));

  // ── b6: lights out, one by one ──────────────────────────────────────────────
  shots.push(defineShot({
    id: "b6-lights-out", start: T.b6[0], end: T.b6[1], sets: ["shop"],
    light: (t) => shopLight(t),
    run: (t, lt) => {
      doorPos();
      cncGroupFor(t);
      shop.mountedStone.visible = false;
      shop.segments.count = 36;
      shop.rods.count = 0;
      tower(false, t < 137.2);
      shop.panel.set(36, "done", t);
      shop.sawBlade.visible = false;
      const k = seg(lt, 0.2, 2.6);
      const x = lerp(2.4, 3.4, smooth(seg(lt, 0.2, 1.6)));
      const z = lerp(0.4, 4.3, easeOut(k));
      zhang.show(power(t) > 0.2 || lt < 1.8).dress("jacket").face("calm", "flat");
      zhang.pose(k < 1 ? walk(t, 0.85) : stand(t, 3));
      zhang.stand(x, 0, z, lerp(-2.5, 0.0, smooth(seg(lt, 0.2, 1.5))));
      shop.spindle.position.y = CNC.restNose;
    },
    cam: {
      pos: [[0, 0.2, 1.5, 3.0], [3.0, 0.3, 1.5, 3.1]],
      look: [[0, 0.8, 1.2, -1.4], [3.0, 1.4, 1.2, -0.6]],
      fov: 40, ease: "smooth", shake: 0.003,
    },
  }));

  // ═════════ the basement ═════════════════════════════════════════════════════
  const doorLight = (t: number): number => (t < 141.4 ? 1 : 0.55);
  const bulbOn = (t: number): number => {
    if (t < 141.7) return 0;
    if (t < 142.6) return [0, 1, 0.15, 1, 0.3, 1][Math.min(5, Math.floor((t - 141.7) * 8))]!;
    if (t < 174.9) return 1;
    return t < 175.2 ? 0.3 : 0;
  };
  const swing = (t: number): number => {
    const dt = t - EV.testShots[0];
    if (dt < 0) return 0;
    return 0.32 * Math.exp(-dt * 0.55) * Math.sin(dt * 5.4);
  };
  const baseLight = (t: number): LightPreset => {
    const b = bulbOn(t);
    const sw = swing(t);
    const x = bs.bulbPos.x + sw, y = bs.bulbPos.y - 0.12, z = bs.bulbPos.z;
    bs.bulb.position.set(x, bs.bulbPos.y, z);
    bs.bulb.rotation.z = -sw * 0.6;
    return {
      bg: 0x030405,
      exposure: 1.1,
      fog: { color: 0x0b0d10, density: 0.045 },
      hemi: [0x5a6673, 0x1c1610, 0.14 + 0.3 * b],
      spot: { color: 0xffd9a0, intensity: 52 * b, pos: [x, y, z], target: [x * 0.4 - 0.4, 0, -0.5], angle: 1.15, penumbra: 0.95, distance: 9 },
      points: [
        { color: 0xffc98a, intensity: 4.5 * b, pos: [x - 0.2, 1.25, -1.2], distance: 5 },
        { color: 0xfff0cf, intensity: 8 * doorLight(t) * (b > 0 ? 0.35 : 1), pos: [0.0, 2.3, 4.7], distance: 6 },
        null,
      ],
    };
  };

  // round states: full → stripped → meteorite → (four spent) → case
  const roundPos: V3[] = [];
  for (let i = 0; i < 36; i++) {
    const col = i % 6, row = Math.floor(i / 6);
    roundPos.push([bs.tablePos.x + 0.35 + (col - 2.5) * 0.075 * 0.85, bs.tableTop + 0.06, bs.tablePos.z + 0.05 + (row - 2.5) * 0.075 * 0.85]);
  }
  const casePos = (i: number): V3 => [bs.tablePos.x + 0.35 + ((i % 8) - 3.5) * 0.045, bs.tableTop + 0.115, bs.tablePos.z + 0.05 + (Math.floor(i / 8) - 1.5) * 0.045];
  const roundsAt = (t: number): void => {
    let pulled = 0;
    for (let i = 0; i < 36; i++) {
      const pullT = 143.6 + i * 0.128;
      const glueT = 149.7 + i * 0.13;
      const spent = i >= 32 && t > 155.6 + (i - 32) * 0.3;
      const cased = i < 32 && t > 171.0 + i * 0.05;
      if (t >= pullT) pulled++;
      const stateFull = t < pullT;
      const stateStripped = t >= pullT && t < glueT;
      const stateMeteor = t >= glueT && !spent;
      const p: V3 = cased ? casePos(i) : roundPos[i]!;
      const pm = M.clone().makeTranslation(p[0], p[1], p[2]);
      if (cased) pm.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
      bs.rounds.setMatrixAt(i, stateFull ? pm : ZERO);
      bs.stripped.setMatrixAt(i, stateStripped ? pm : ZERO);
      bs.meteorRounds.setMatrixAt(i, stateMeteor ? pm : ZERO);
    }
    bs.rounds.instanceMatrix.needsUpdate = true;
    bs.stripped.instanceMatrix.needsUpdate = true;
    bs.meteorRounds.instanceMatrix.needsUpdate = true;
    bs.heads.count = pulled;
    bs.case32.visible = t > 170.8;
  };
  const stairY = (z: number): number => clamp((z - 2.7) / 2.9, 0, 1) * 2.55;

  // ── c1: down the stairs, into the light of a single bulb ─────────────────────
  shots.push(defineShot({
    id: "c1-descent", start: T.c1[0], end: T.c1[1], sets: ["basement"],
    light: (t) => baseLight(t),
    run: (t, lt) => {
      roundsAt(t);
      const k = seg(lt, 0.3, 3.5);
      const z = lerp(5.5, 2.4, k);
      zhang.show(true).dress("jacket").face("calm", "flat");
      const onStairs = z > 2.7;
      zhang.pose(k < 1 ? walk(t, 0.75) : addPose(stand(t, 3), { armR: [-2.6 * pulse(t, 141.3, 142.0, 0.2), 0, 0] }));
      zhang.stand(0.0, onStairs ? stairY(z) : 0, z, Math.PI);
      bs.beef.visible = false;
      bs.holes.forEach((h) => { h.visible = false; });
      bs.case32.visible = false;
      c.props.o.pliers.visible = false;
    },
    cam: {
      pos: [[0, 0.05, 0.35, 1.2], [4.6, 0.0, 0.5, 1.5]],
      look: [[0, 0.0, 1.55, 4.9], [4.6, 0.0, 1.55, 4.0]],
      fov: 42, ease: "smooth", shake: 0.003,
    },
  }));

  // ── c2: thirty-six bullets, thirty-six quiet pulls ─────────────────────────────
  const tableStand = (t: number, work: number, lean = 0.2): void => {
    zhang.show(true).dress("jacket").face("calm", "flat");
    const wob = Math.sin(t * 9) * 0.05 * work;
    zhang.pose(addPose(stand(t, 3), { hips: [lean, 0, 0], neck: [0.2, 0, 0], armR: [-1.25 + wob, 0, 0.05], armL: [-1.2 - wob, 0, -0.05] }));
    zhang.stand(bs.tablePos.x + 0.35, 0, bs.tablePos.z + 0.75, Math.PI);
  };
  shots.push(defineShot({
    id: "c2-pull", start: T.c2[0], end: T.c2[1], sets: ["basement"],
    light: (t) => baseLight(t),
    run: (t) => {
      roundsAt(t);
      tableStand(t, 1);
      hold(o.pliers, zhang, "handR", [0, 0, 0.5], [0, 0, 0], 1);
      bs.holes.forEach((h) => { h.visible = false; });
    },
    cam: {
      pos: [[0, 0.65, 1.6, -1.6], [6, 0.35, 1.5, -1.45]],
      look: [[0, -0.25, 1.05, 0.0], [6, -0.25, 1.05, 0.0]],
      fov: [[0, 40], [6, 32]], ease: "smooth", shake: 0.003,
    },
  }));

  // ── c3: a repair glue meant for the skin of a spaceship ───────────────────────────
  shots.push(defineShot({
    id: "c3-glue", start: T.c3[0], end: T.c3[1], sets: ["basement"],
    light: (t) => baseLight(t),
    run: (t) => {
      roundsAt(t);
      tableStand(t, 1, 0.3);
      hold(o.glue, zhang, "handR", [0, 0, 0.5], [0, 0, 0], 1);
    },
    cam: {
      pos: [[0, 0.15, 1.5, -1.3], [6, -0.05, 1.42, -1.1]],
      look: [[0, -0.25, 1.0, 0.1], [6, -0.25, 1.0, 0.1]],
      fov: [[0, 32], [6, 25]], ease: "smooth", shake: 0.003,
    },
  }));

  // ── c4a: four bullets into a magazine, the magazine into the gun ───────────────────
  const loadPose = (t: number, lt: number) => {
    const seat = smooth(seg(lt, 1.2, 1.8));
    zhang.show(true).dress("jacket").face("calm", "flat");
    zhang.pose(addPose(stand(t, 3), { hips: [0.12, 0, 0], neck: [0.25, 0, 0], armR: [-1.35, 0, 0.35 * seat], armL: [-1.25, 0, -0.35 * seat] }));
    zhang.stand(bs.tablePos.x + 0.35, 0, bs.tablePos.z + 0.75, Math.PI);
    hold(pistol.root, zhang, "handR", [0, 0, 0], [0, 0, 0], 1);
    pistol.mag.visible = lt > 1.4;
    if (lt <= 1.4) hold(o.magA, zhang, "handL", [0, 0, 0.6], [0, 0, 0], 1);
    pistol.scope.visible = false;
    pistol.flash.visible = false;
  };
  shots.push(defineShot({
    id: "c4a-load", start: T.c4a[0], end: T.c4a[1], sets: ["basement"],
    light: (t) => baseLight(t),
    run: (t, lt) => {
      roundsAt(t);
      loadPose(t, lt);
    },
    cam: {
      pos: [[0, 0.7, 1.5, -1.35], [2.3, 0.55, 1.46, -1.25]],
      look: [[0, -0.25, 1.15, 0.1], [2.3, -0.25, 1.15, 0.1]],
      fov: 30, ease: "smooth", shake: 0.003,
    },
  }));

  // ── c4b: the bundle in the corner; four shots; the room fills with sound ───────────
  const target = new THREE.Vector3().copy(bs.bundlePos);
  const shooterPos: V3 = [0.7, 0, 0.5];
  const yawTo = Math.atan2(target.x - shooterPos[0], target.z - shooterPos[2]);
  const recoil = (t: number): number => {
    let r = 0;
    for (const s of EV.testShots) if (t >= s) r += Math.exp(-(t - s) * 16);
    return r;
  };
  const flashOn = (t: number): number => {
    for (const s of EV.testShots) if (t >= s && t < s + 0.06) return 1;
    return 0;
  };
  const fireScene = (t: number): void => {
    roundsAt(t);
    const r = recoil(t);
    zhang.show(true).dress("jacket");
    const eyes = t > EV.testShots[3] + 0.4 ? "shut" : "calm";
    zhang.face(eyes, "flat");
    const a = aim(0.08, 0);
    zhang.pose(addPose(a, { armR: [-r * 0.16, 0, 0], armL: [-r * 0.1, 0, 0], neck: [-r * 0.06, 0, 0] }));
    zhang.stand(shooterPos[0], 0, shooterPos[2], yawTo);
    hold(pistol.root, zhang, "handR", [0, 0, 0], [0, 0, 0], 1);
    pistol.scope.visible = false;
    pistol.flash.visible = flashOn(t) > 0;
    pistol.flash.scale.setScalar(0.8 + hash(Math.floor(t * 100)) * 0.6);
    EV.testShots.forEach((s, i) => { bs.holes[i]!.visible = t >= s; });
    bs.holes[4]!.visible = t >= EV.testShots[3];
    bs.beef.visible = false;
  };
  const shake = (t: number): number => 0.003 + 0.05 * recoil(t);
  shots.push(defineShot({
    id: "c4b-fire", start: T.c4b[0], end: T.c4b[1], sets: ["basement"],
    light: (t) => {
      const l = baseLight(t);
      const f = flashOn(t);
      if (f > 0 && l.points) l.points[2] = { color: 0xffe2a8, intensity: 24, pos: [0.4, 1.3, 0.2], distance: 6 };
      return l;
    },
    run: (t) => fireScene(t),
    cam: (lt, t) => ({
      pos: [[0, 2.1, 1.55, 2.1], [2.9, 1.7, 1.5, 1.6]],
      look: [[0, -1.7, 0.95, -1.5], [2.9, -1.7, 0.95, -1.5]],
      fov: [[0, 42], [2.9, 38]], ease: "smooth", shake: shake(t), shakeRate: 9,
    }),
  }));
  // dust knocked from the ceiling and a haze that lingers in the lamplight
  c.fx.basement.add({
    t0: EV.testShots[0], t1: EV.testShots[3] + 0.2, rate: 120, life: 0.9,
    origin: [-1.75, 2.55, -1.5], dir: [0, -1, 0], speed: [0.1, 0.5], spread: 0.6, size: [0.03, 0.015],
    colors: [0x8e8c84, 0xb0aca0], seed: 3, gravity: [0, -1.5, 0], jitter: 0.9, fade: 0.4,
  });
  c.fx.basement.add({
    t0: EV.testShots[0], t1: EV.testShots[3] + 0.5, rate: 70, life: 5.5,
    origin: [0.55, 1.2, 0.05], dir: [-0.6, 0.15, -0.6], speed: [0.5, 1.3], spread: 0.55, size: [0.05, 0.3],
    colors: [0xc9ccd0, 0xaeb2b8, 0x9a9ea4], seed: 8, drag: 1.4, gravity: [0, 0.06, 0], fade: 0.5, grow: 0.2,
  });

  // ── c5: the ringing after; smoke turning in the light ───────────────────────────────
  shots.push(defineShot({
    id: "c5-aftermath", start: T.c5[0], end: T.c5[1], sets: ["basement"],
    light: (t) => baseLight(t),
    run: (t, lt) => {
      roundsAt(t);
      const walkK = seg(lt, 1.3, 3.4);
      zhang.show(true).dress("jacket");
      const blink = lt < 1.0 ? "shut" : "calm";
      zhang.face(blink, "flat");
      const down = smooth(seg(lt, 0.2, 1.2));
      const px = lerp(shooterPos[0], -0.75, easeOut(walkK));
      const pz = lerp(shooterPos[2], -0.7, easeOut(walkK));
      zhang.pose(walkK > 0 && walkK < 1 ? addPose(walk(t, 0.8), { armR: [-0.6, 0, 0] }) : addPose(aim(0.6, 0), { armR: [lerp(0, 0.9, down), 0, 0], armL: [lerp(0, 1.4, down), 0, 0] }));
      zhang.stand(px, 0, pz, lerp(yawTo, Math.atan2(target.x - px, target.z - pz) + 0.2, smooth(walkK)));
      hold(pistol.root, zhang, "handR", [0, 0, 0], [0, 0, 0], 1);
      pistol.flash.visible = false;
      EV.testShots.forEach((_s, i) => { bs.holes[i]!.visible = true; });
      bs.holes[4]!.visible = true;
      bs.beef.visible = false;
    },
    cam: {
      pos: [[0, 2.2, 1.45, 1.5], [3.6, 1.6, 1.5, 0.9]],
      look: [[0, 0.5, 1.2, 0.3], [3.6, -0.75, 1.15, -0.7]],
      fov: [[0, 32], [3.6, 34]], ease: "smooth", shake: 0.004,
    },
  }));

  // ── c6a: five small holes; then the meat, cut open ──────────────────────────────
  const beefOnTable = new THREE.Vector3(bs.tablePos.x - 0.35, bs.tableTop + 0.225, bs.tablePos.z);
  const inspectStand = (t: number): void => {
    zhang.show(true).dress("jacket").face("calm", "flat");
    zhang.stand(bs.tablePos.x - 0.35, 0, bs.tablePos.z + 0.7, Math.PI);
    void t;
  };
  shots.push(defineShot({
    id: "c6a-inspect", start: T.c6a[0], end: T.c6a[1], sets: ["basement"],
    light: (t) => baseLight(t),
    run: (t, lt) => {
      roundsAt(t);
      inspectStand(t);
      const cut = pulse(t, T.c6a[0] + 1.0, T.c6a[1] - 0.2, 0.3);
      zhang.pose(addPose(stand(t, 3), { hips: [0.28, 0, 0], neck: [0.3, 0, 0], armR: [-1.3 + Math.sin(lt * 10) * 0.08 * cut, 0, 0.1], armL: [-1.1, 0, -0.15] }));
      bs.holes.forEach((h) => { h.visible = true; });
      bs.beef.visible = lt > 0.6;
      bs.beef.position.copy(beefOnTable);
      bs.bundle.visible = lt < 0.6;
      hold(o.knife, zhang, "handR", [0, 0, 0.6], [0, 0, 0], 1);
    },
    cam: {
      pos: [[0, -0.3, 1.55, -1.55], [2.8, -0.5, 1.5, -1.4]],
      look: [[0, -0.95, 1.05, 0.2], [2.8, -0.95, 1.05, 0.2]],
      fov: [[0, 34], [2.8, 30]], ease: "smooth", shake: 0.003,
    },
  }));

  // ── c6b: on his palm, a pinch of grey dust ────────────────────────────────────────
  shots.push(defineShot({
    id: "c6b-powder", start: T.c6b[0], end: T.c6b[1], sets: ["basement"],
    light: (t) => baseLight(t),
    run: (t, lt) => {
      roundsAt(t);
      inspectStand(t);
      const lift = smooth(seg(lt, 0.2, 1.0));
      zhang.pose(addPose(stand(t, 3), { hips: [0.1, 0, 0], neck: [0.25 * lift, 0, 0], armL: [-1.5 * lift, 0, -0.1], armR: [-1.4 * lift, 0, 0.35 * lift] }));
      zhang.face(lt > 1.8 ? "calm" : "narrow", lt > 2.4 ? "smile" : "flat");
      bs.holes.forEach((h) => { h.visible = true; });
      bs.beef.visible = true;
      bs.beef.position.copy(beefOnTable);
      bs.bundle.visible = false;
      hold(o.dustPile, zhang, "handL", [0, 0.2, 0.5], [0.3, 0, 0], 1);
    },
    cam: {
      pos: [[0, -0.55, 1.45, -1.1], [3.4, -0.7, 1.4, -0.95]],
      look: [[0, -0.95, 1.25, 0.3], [3.4, -0.95, 1.25, 0.3]],
      fov: [[0, 30], [3.4, 24]], ease: "smooth", shake: 0.002,
    },
  }));

  // ── c7: thirty-two left; into the foam; the bulb clicks off ─────────────────────────
  shots.push(defineShot({
    id: "c7-case", start: T.c7[0], end: T.c7[1], sets: ["basement"],
    light: (t) => baseLight(t),
    run: (t, lt) => {
      roundsAt(t);
      tableStand(t, 0.6, 0.3);
      bs.bundle.visible = true;
      bs.holes.forEach((h) => { h.visible = true; });
      bs.beef.visible = false;
      const close = smooth(seg(lt, 3.4, 4.2));
      zhang.pose(addPose(stand(t, 3), { hips: [0.22, 0, 0], neck: [0.3, 0, 0], armR: [-1.25 - close * 0.1, 0, 0.1], armL: [-1.2, 0, -0.1] }));
      zhang.face("calm", "flat");
      void lt;
    },
    cam: {
      pos: [[0, 0.75, 1.65, -1.75], [5.8, 0.5, 1.55, -1.5]],
      look: [[0, -0.25, 1.0, 0.15], [5.8, -0.25, 0.95, 0.05]],
      fov: [[0, 34], [5.8, 26]], ease: "smooth", shake: 0.002,
    },
  }));

  void THREE; void orbit;
  return shots;
}
