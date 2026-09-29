import type { Shot } from "@agentbench/cinematic-player";
import { defineShot, hold, type Ctx } from "../direction/ctx";
import type { LightPreset } from "../direction/rig";
import { seated, stand } from "../direction/poses";
import { gesture, seatLift, speak } from "../direction/stagecraft";
import { addPose } from "../util/kf";
import { lerp, pulse, seg, smooth } from "../util/math";
import { T } from "../timeline";
import { roomLight } from "./common";

/** 尾声 — the same room, hours later; a radio that reports the news; an empty place on a velvet shelf. */
export function epilogue(c: Ctx): Shot<Ctx>[] {
  const col = c.cast.collector;
  const room = c.w.room;
  const o = c.props.o;
  const shots: Shot<Ctx>[] = [];

  const night = (t: number, extra: Partial<Parameters<typeof roomLight>[1]> = {}): LightPreset => {
    const l = roomLight(c, { lamp: 1.0, warm: 0.12, cabI: 0.95, winI: 0.12, fill: 0.55, exposure: 1.1, ...extra });
    l.bg = 0x040302;
    return l;
  };
  const staging = (t: number): void => {
    room.doorLeaf.rotation.y = -Math.PI / 2;
    room.windowPaper.color.setRGB(0.05, 0.07, 0.14);
    const talking = t > 321 && t < 327.8;
    const k = talking ? 0.75 + 0.25 * Math.sin(t * 9) : 0.4;
    room.radio.dialMat.color.setRGB(1.0 * k, 0.55 * k, 0.16 * k);
    room.bigStones.forEach((s) => { s.visible = false; });
    room.stool.position.set(-1.75, 0, -0.5);
    room.slice.position.set(-1.4, room.benchTop + 0.02, -1.0);
  };
  const atBench = (t: number, turn = 0, face: "shut" | "calm" = "shut"): void => {
    col.show(true).dress("cardigan");
    speak(col, t, face, turn > 0.5 ? "frown" : "flat");
    const base = addPose(seated(t, 1), { hips: [0.3 * (1 - turn * 0.9), 0, 0], neck: [0.38 * (1 - turn), 0.9 * turn, 0], armR: [-0.78 * (1 - turn) - 0.3 * turn, 0, 0.14], armL: [-0.95 * (1 - turn) - 0.4 * turn, 0, -0.16] });
    base.lift = seatLift(col, 0.48);
    col.pose(gesture(base, col, t, 0.3));
    col.stand(-1.6, 0, -0.26, Math.PI);
    if (turn < 0.6) hold(o.magHand, col, "handR", [0, 0, 0.5], [0, 0, Math.PI / 2], 1);
  };

  shots.push(defineShot({
    id: "e1-night-room", start: T.e1[0], end: T.e1[1], sets: ["room"],
    light: (t) => night(t, { cab: [-0.3, 1.7, -2.5] }),
    run: (t, lt) => {
      staging(t);
      const turn = smooth(seg(t, 329.6, 330.0));
      atBench(t, turn * 0, "shut");
      void lt;
    },
    cam: {
      pos: [[0, 2.3, 1.55, 3.0], [11, 0.85, 1.42, 1.0]],
      look: [[0, -1.5, 1.05, -1.1], [11, -1.7, 1.0, -0.95]],
      fov: [[0, 46], [11, 34]], ease: "smoother", shake: 0.003,
    },
  }));

  shots.push(defineShot({
    id: "e2-empty-place", start: T.e2[0], end: T.e2[1], sets: ["room"],
    light: (t) => night(t, { cab: [1.5, 1.7, -2.6], cabI: 1.25, lamp: 0.55 }),
    run: (t, lt) => {
      staging(t);
      const turn = smooth(seg(t, 331.4, 332.6));
      atBench(t, turn, turn > 0.3 ? "calm" : "shut");
      speak(col, t, turn > 0.3 ? "calm" : "shut", turn > 0.5 ? "frown" : "flat");
      void lt;
    },
    cam: {
      pos: [[0, 1.72, 1.14, -2.25], [4.4, 1.72, 1.14, -2.5], [7.0, 0.9, 1.42, 0.55]],
      look: [[0, 1.68, 1.05, -3.12], [4.4, 1.68, 1.05, -3.12], [7.0, -1.5, 1.0, -0.6]],
      fov: [[0, 24], [4.4, 24], [7.0, 40]], ease: "smooth", shake: 0.0012,
    },
  }));

  void lerp; void pulse; void stand;
  return shots;
}
