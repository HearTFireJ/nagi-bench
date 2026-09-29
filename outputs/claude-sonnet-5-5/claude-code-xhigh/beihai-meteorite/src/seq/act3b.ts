import * as THREE from "three";
import type { Shot } from "@agentbench/cinematic-player";
import { aim } from "@agentbench/voxel-kit";
import { defineShot, hold, type CamSpec, type Ctx, type ShotDef } from "../direction/ctx";
import type { LightPreset } from "../direction/rig";
import { spaceLight } from "../direction/lighting";
import { stand, zeroG } from "../direction/poses";
import { addPose } from "../util/kf";
import { clamp, hash, lerp, seg, smooth, wobble, type V3 } from "../util/math";
import { EV, SHOT_TIMES, T } from "../timeline";
import { MUZZLE, type Orbitals } from "./orbitals";
import type { Person } from "./crowd";

export function handPos(c: Ctx, hand: "handR" | "handL"): THREE.Vector3 {
  c.cast.zhang.root.updateMatrixWorld(true);
  return c.cast.zhang.fig.anchors[hand].getWorldPosition(new THREE.Vector3());
}

/** Recoil envelope: sum of decaying kicks from every shot so far. */
export function recoil(t: number): number {
  let r = 0;
  for (const s of SHOT_TIMES) if (t >= s && t < s + 0.6) r += Math.exp(-(t - s) * 17);
  return Math.min(1.6, r);
}
export function flash(t: number): number {
  for (const s of SHOT_TIMES) if (t >= s && t < s + 0.055) return 1;
  return 0;
}

export function act3b(c: Ctx, orb: Orbitals): Shot<Ctx>[] {
  const { zhang } = c.cast;
  const pistol = c.props.pistol;
  const o = c.props.o;
  const cabin = c.w.cabin;
  const crowd = orb.crowd;
  const shots: Shot<Ctx>[] = [];
  const A = crowd.leader(0), B = crowd.leader(1), C = crowd.leader(2);

  // A warm cheat-light that sits beside the camera when we look at faces in shadow.
  const faceLight = (t: number, p: Person | undefined, base: LightPreset, k = 1): LightPreset => {
    if (!p) return base;
    const h = crowd.head(p, t);
    base.points = [{ color: 0xffb98a, intensity: 16 * k, pos: [h.x + 1.2, h.y + 0.5, h.z - 2.6], distance: 8 }, null, null];
    return base;
  };
  const scopeCam = (look: (lt: number) => V3, fov: number | Array<[number, number]>): CamSpec => ({
    pos: [[0, 0.02, 0.92, 0.5]],
    look,
    fov, ease: "smooth", shake: 0.0006, shakeRate: 1.4,
  });

  // ── d7a: the wheel's whole company drifts to its mark, and the sun goes red ───────
  shots.push(defineShot({
    id: "d7a-assemble", start: T.d7a[0], end: T.d7a[1], sets: ["space"],
    light: (t) => spaceLight(t, { target: [-9, 0, 56], box: 36, exposure: 1.1 }),
    run: (t) => { orb.update(t); orb.zhangFloat(t); },
    cam: {
      pos: [[0, 1.7, 0.75, -4.1], [6.2, 0.9, 0.7, -3.1]],
      look: [[0, -9, 2.0, 60], [6.2, -9, 1.4, 56]],
      fov: [[0, 24], [6.2, 18]], ease: "smooth", shake: 0.003,
    },
  }));

  // ── d7b..d: in the crosshairs, three old men laugh ────────────────────────────────
  const faceShot = (id: string, span: readonly [number, number], who: Person, face: [string, string], fovKeys: Array<[number, number]>): Shot<Ctx> =>
    defineShot({
      id, start: span[0], end: span[1], sets: ["space"], optic: "rifle",
      light: (t) => faceLight(t, who, spaceLight(t, { target: [-9, 0, 56], box: 10, fill: 1.1 })),
      run: (t) => {
        orb.update(t);
        orb.zhangFloat(t, { face: "narrow" });
        who.actor.face(face[0] as never, face[1] as never);
      },
      cam: scopeCam((lt) => { const h = crowd.head(who, span[0] + lt); return [h.x, h.y - 0.05, h.z]; }, fovKeys),
    });
  shots.push(faceShot("d7b-leaderA", T.d7b, A, ["happy", "laugh"], [[0, 1.25], [2.2, 1.05]]));
  shots.push(faceShot("d7c-leaderB", T.d7c, B, ["happy", "smile"], [[0, 1.25], [2.8, 1.05]]));
  shots.push(defineShot({
    id: "d7d-leaderC", start: T.d7d[0], end: T.d7d[1], sets: ["space"], optic: "rifle",
    light: (t) => faceLight(t, C, spaceLight(t, { target: [-9, 0, 56], box: 14, fill: 1.1 })),
    run: (t) => { orb.update(t); orb.zhangFloat(t, { face: "narrow" }); C.actor.face("happy", t > 245.3 ? "laugh" : "smile"); },
    cam: scopeCam((lt) => {
      const h = crowd.head(C, T.d7d[0] + lt);
      const back = smooth(seg(lt, 2.4, 3.8));
      const g = crowd.chest(A, T.d7d[0] + lt);
      return [lerp(h.x, g.x, back), lerp(h.y, g.y + 0.3, back), lerp(h.z, g.z, back)];
    }, [[0, 1.15], [2.4, 1.15], [3.8, 3.0]]),
  }));

  // ── d8: the man behind the glass ────────────────────────────────────────────────
  shots.push(defineShot({
    id: "d8-face", start: T.d8[0], end: T.d8[1], sets: ["space"],
    light: (t) => spaceLight(t, { box: 6, fill: 1.15 }),
    run: (t) => {
      orb.update(t);
      orb.zhangFloat(t, { face: "narrow", euler: [0.02, 0.1, 0.0] });
    },
    cam: {
      pos: [[0, 0.7, 1.0, 2.6], [4.4, 0.45, 0.98, 2.1]],
      look: [[0, 0, 0.95, 0], [4.4, 0, 0.95, 0]],
      fov: [[0, 24], [4.4, 18]], ease: "smooth", shake: 0.0015,
    },
  }));
  shots.push(defineShot({
    id: "d8b-three", start: T.d8b[0], end: T.d8b[1], sets: ["space"], optic: "rifle",
    light: (t) => faceLight(t, A, spaceLight(t, { target: [-9, 0, 56], box: 14, fill: 1.2 }), 0.9),
    run: (t) => {
      orb.update(t);
      orb.zhangFloat(t, { face: "narrow" });
      A.actor.face("calm", "smile"); B.actor.face("happy", "smile"); C.actor.face("calm", "smile");
    },
    cam: scopeCam((lt) => { const g = crowd.chest(A, T.d8b[0] + lt); return [g.x, g.y + 0.35, g.z]; }, [[0, 2.2], [4.6, 1.8]]),
  }));
  shots.push(defineShot({
    id: "d8c-glove-hand", start: T.d8c[0], end: T.d8c[1], sets: ["space"],
    light: (t) => spaceLight(t, { box: 6, fill: 1.1 }),
    run: (t, lt) => {
      orb.update(t);
      const cross = smooth(seg(lt, 0.8, 1.9));
      const pose = addPose(zeroG(t, 3, 0.35), { armR: [-1.05 * cross, 0, 0.3 * cross], armL: [-1.25 * cross, 0, -0.55 * cross], neck: [0.15 * cross, 0, 0] });
      orb.zhangFloat(t, { face: "narrow", pose });
    },
    cam: {
      pos: [[0, -1.9, 0.9, -3.0], [4, -1.4, 0.75, -2.3]],
      look: [[0, 0, 0.85, 0], [4, 0, 0.85, 0]],
      fov: 30, ease: "smooth", shake: 0.003,
    },
  }));

  // ── d9: the glove ring turns; the glove floats away; bare fingers meet the cold ────
  const rightHandPose = (t: number, k: number) => addPose(zeroG(t, 3, 0.25), { armR: [-1.15, 0, 0.35], armL: [-1.25 * (1 - k), 0, -0.55 * (1 - k)], neck: [0.15, 0, 0] });
  shots.push(defineShot({
    id: "d9-glove", start: T.d9[0], end: T.d9[1], sets: ["space"],
    light: (t) => spaceLight(t, { box: 6, fill: 1.1 }),
    run: (t, lt) => {
      orb.update(t);
      const off = t >= EV.gloveOff;
      const frost = smooth(seg(t, 263.0, 264.2));
      orb.zhangFloat(t, { face: "narrow", outfit: !off ? "suit" : frost > 0.5 ? "suitFrost" : "suitBare", pose: rightHandPose(t, smooth(seg(lt, 0.6, 1.1))), euler: [0.02, 0.35 + 0.1 * smooth(seg(lt, 1.2, 3)), 0.02] });
      // the glove: a ring twist, then it drifts off, tumbling
      const dt = Math.max(0, t - EV.gloveOff);
      const h = handPos(c, "handR");
      const g = o.glove;
      g.visible = off;
      if (off) {
        g.scale.setScalar(0.0563);
        g.position.set(h.x + 0.4 * dt, h.y + 0.14 * dt, h.z + 0.55 * dt);
        g.rotation.set(dt * 1.7, dt * 1.1, dt * 0.6);
        if (g.parent !== c.scene) c.scene.add(g);
      }
    },
    cam: (lt) => {
      const h = handPos(c, "handR");
      return {
        pos: [[0, h.x + 1.0, h.y + 0.05, h.z + 1.2], [3.2, h.x + 0.85, h.y + 0.05, h.z + 1.05]],
        look: [[0, h.x - 0.1, h.y + 0.15, h.z], [3.2, h.x - 0.1, h.y + 0.15, h.z]],
        fov: 34, ease: "smooth", shake: 0.0015,
      };
    },
  }));

  // ── d9r1..3: three months of drilling, flashed in one breath (the cabin, months ago) ──
  const drill = (id: string, span: readonly [number, number], step: 0 | 1 | 2): Shot<Ctx> =>
    defineShot({
      id, start: span[0], end: span[1], sets: ["cabin", "sky"],
      light: () => ({
        bg: 0x030507, exposure: 1.0, fog: { color: 0x0a0e12, density: 0.012 },
        hemi: [0x9fb2c8, 0x2a3038, 0.7],
        spot: { color: 0xdfeaff, intensity: 34, pos: [0, 2.1, 0.3], target: [0, 1.0, 0], angle: 1.0, penumbra: 0.8, distance: 8 },
        points: [{ color: 0x8fbaff, intensity: 6, pos: [0.45, 1.3, -1.3], distance: 5 }, null, null],
      }),
      run: (t, lt) => {
        c.w.space.setSky(t, { centre: new THREE.Vector3(150, -450, -1000) });
        zhang.show(true).dress("suitBare").face("narrow", "flat");
        const k = lt / (span[1] - span[0]);
        const pose = addPose(zeroG(t, 3, 0.2), {
          armR: [-1.25 - step * 0.05, 0, 0.3], armL: [-1.1 - 0.2 * k, 0, -0.3], neck: [0.2, 0, 0], hips: [0.1, 0, 0],
        });
        zhang.pose(pose);
        zhang.drift([0, 0.95, 0], [0.05, 0.0, 0]);
        hold(pistol.root, zhang, "handR", [0, 0, 0], [0, 0, 0], 1);
        pistol.scope.visible = step >= 1 && k > (step === 1 ? 0.5 : 0);
        pistol.mag.visible = step !== 2 || k < 0.5;
        pistol.flash.visible = false;
        if (step === 2) hold(o.magB, zhang, "handL", [0, 0, 0.6], [0, 0, 0], 1);
        void cabin;
      },
      cam: (lt) => {
        const h = handPos(c, "handR");
        const s = step === 0 ? [-1.0, 0.25, 0.9] : step === 1 ? [1.0, 0.3, 0.85] : [-0.9, -0.05, 0.95];
        return { pos: [[0, h.x + s[0]!, h.y + s[1]!, h.z + s[2]!]], look: [[0, h.x + 0.15, h.y + 0.1, h.z + 0.1]], fov: 36, ease: "smooth", shake: 0.004, shakeRate: 5 };
      },
    });
  shots.push(drill("d9r1-draw", T.d9r1, 0));
  shots.push(drill("d9r2-mount", T.d9r2, 1));
  shots.push(drill("d9r3-mag", T.d9r3, 2));

  // ── d9c: now for real — the pistol from the pocket, the scope clicks on by magnet ──
  shots.push(defineShot({
    id: "d9c-arm", start: T.d9c[0], end: T.d9c[1], sets: ["space"],
    light: (t) => spaceLight(t, { box: 6, fill: 1.2 }),
    run: (t, lt) => {
      orb.update(t);
      const drawn = smooth(seg(t, 267.3, 268.0));
      const pose = addPose(zeroG(t, 3, 0.2), { armR: [-1.15, 0, 0.3], armL: [-1.15, 0, -0.35], neck: [0.15, 0, 0] });
      orb.zhangFloat(t, { face: "narrow", outfit: "suitFrost", pose, euler: [0.02, 0.3, 0.02] });
      if (drawn < 0.05) hold(pistol.root, zhang, "hipL", [0, 0.5, 0.6], [0, 0, 0], 0.9);
      else hold(pistol.root, zhang, "handR", [0, 0, 0], [0, 0, 0], 1);
      pistol.scope.visible = t > 269.1;
      pistol.mag.visible = true;
      pistol.flash.visible = false;
      if (t > 269.6) hold(o.magB, zhang, "handL", [0, 0, 0.6], [0, 0, 0], 1);
      void lt;
    },
    cam: () => {
      const h = handPos(c, "handR");
      return {
        pos: [[0, h.x + 0.8, h.y - 0.2, h.z + 0.85], [4.2, h.x + 0.62, h.y - 0.12, h.z + 0.72]],
        look: [[0, h.x, h.y + 0.02, h.z + 0.15], [4.2, h.x, h.y + 0.02, h.z + 0.15]],
        fov: 30, ease: "smooth", shake: 0.0015,
      };
    },
  }));

  // ── d10: aim ─────────────────────────────────────────────────────────────────────
  const aimPose = (t: number, k = 0) => {
    const r = recoil(t);
    return addPose(aim(-0.32, 0), { armR: [-r * 0.2, 0, -0.18 * (1 - k)], armL: [-r * 0.12, 0, 0.1], neck: [0.32 - r * 0.05, 0.0, 0], hips: [0.05, 0, 0] });
  };
  const gunUp = (t: number): void => {
    hold(pistol.root, zhang, "handR", [0, 0, 0], [0, 0, 0], 1.4);
    pistol.scope.visible = true;
    pistol.mag.visible = true;
    pistol.flash.visible = flash(t) > 0;
    pistol.flash.scale.setScalar(0.8 + hash(Math.floor(t * 100)) * 0.7);
  };
  shots.push(defineShot({
    id: "d10-aim", start: T.d10[0], end: T.d10[1], sets: ["space"],
    light: (t) => {
      const l = spaceLight(t, { box: 6, fill: 1.2 });
      l.points = [{ color: 0xffa868, intensity: 7, pos: [-1.6, 0.9, 1.9], distance: 6 }, null, null];
      return l;
    },
    run: (t) => {
      orb.update(t);
      orb.zhangFloat(t, { face: "narrow", outfit: "suitFrost", pose: aimPose(t), euler: [0.02, 0.0, 0.0] });
      gunUp(t);
    },
    cam: {
      pos: [[0, -1.9, 0.85, 2.1], [3.6, -1.5, 0.95, 1.75]],
      look: [[0, 0.0, 0.95, 0.35], [3.6, 0.0, 0.95, 0.35]],
      fov: [[0, 34], [3.6, 27]], ease: "smooth", shake: 0.002,
    },
  }));
  shots.push(defineShot({
    id: "d10b-crosshair", start: T.d10b[0], end: T.d10b[1], sets: ["space"], optic: "rifle",
    light: (t) => faceLight(t, A, spaceLight(t, { target: [-9, 0, 56], box: 14, fill: 1.2 }), 0.8),
    run: (t) => {
      orb.update(t);
      orb.zhangFloat(t, { face: "narrow", outfit: "suitFrost", pose: aimPose(t), euler: [0.02, 0.0, 0.0] });
      gunUp(t);
      A.actor.face("happy", "smile");
    },
    cam: scopeCam((lt) => {
      const g = crowd.chest(A, T.d10b[0] + lt);
      const k = smooth(seg(lt, 0.0, 2.6));
      const cx = lerp(g.x + 2.4, g.x, k) + wobble(lt * 0.9, 3) * 0.05 * (1 - k * 0.6);
      const cy = lerp(g.y + 1.3, g.y + 0.05, k) + wobble(lt * 0.8, 4) * 0.04 * (1 - k * 0.6);
      return [cx, cy, g.z];
    }, [[0, 3.2], [3.4, 1.5]]),
  }));

  // ── d11: thirty shots, three magazines. Silent, but the body feels every one ─────────
  const fireShot = (id: string, span: readonly [number, number], cam: ShotDef["cam"], extra?: (t: number, lt: number) => void, scope = false): Shot<Ctx> =>
    defineShot({
      id, start: span[0], end: span[1], sets: ["space"], optic: scope ? "rifle" : undefined,
      light: (t) => {
        const l = faceLight(t, A, spaceLight(t, { target: scope ? [-9, 0, 56] : [0, 0, 0], box: scope ? 14 : 6, fill: 1.2 }), 0.8);
        if (!scope) l.points = [{ color: 0xffdca0, intensity: flash(t) > 0 ? 16 : 5, pos: flash(t) > 0 ? [-0.2, 0.7, 1.5] : [-1.6, 0.9, 1.9], distance: 6 }, null, null];
        return l;
      },
      run: (t, lt) => {
        orb.update(t);
        orb.zhangFloat(t, { face: "narrow", outfit: "suitFrost", pose: aimPose(t), euler: [0.02 - recoil(t) * 0.01, 0.0, 0.0] });
        gunUp(t);
        // ejected magazines tumble away
        const mags: Array<[THREE.Object3D, number]> = [[o.magA, 280.35], [o.magC, 283.05]];
        for (const [m, te] of mags) {
          const dt = t - te;
          m.visible = dt > 0 && dt < 5;
          if (m.visible) {
            m.scale.setScalar(0.0563);
            m.position.set(-0.15 + 0.45 * dt, 0.35 + 0.5 * dt, 0.85 + 0.15 * dt);
            m.rotation.set(dt * 2.1, dt * 1.3, dt * 0.7);
            if (m.parent !== c.scene) c.scene.add(m);
          }
        }
        if (t > 280.35 && t < 280.9) pistol.mag.visible = t > 280.75;
        if (t > 283.05 && t < 283.6) pistol.mag.visible = t > 283.45;
        extra?.(t, lt);
      },
      cam,
    });
  shots.push(fireShot("d11a-fire-1", T.d11a, {
    pos: [[0, -1.8, 0.75, 1.8], [2.6, -1.5, 0.85, 1.55]],
    look: [[0, 0.0, 0.92, 0.4], [2.6, 0.0, 0.92, 0.4]],
    fov: 32, ease: "smooth", shake: 0.004, shakeRate: 8,
  }));
  shots.push(fireShot("d11b-mag-1", T.d11b, () => {
    const h = handPos(c, "handR");
    return { pos: [[0, h.x - 0.85, h.y - 0.05, h.z + 0.7]], look: [[0, h.x, h.y - 0.05, h.z + 0.1]], fov: 32, shake: 0.004 };
  }));
  shots.push(fireShot("d11c-fire-2", T.d11c, scopeCam((lt) => {
    const g = crowd.chest(A, T.d11c[0] + lt);
    const kick = recoil(T.d11c[0] + lt);
    return [g.x + wobble(lt * 3, 5) * 0.02, g.y + 0.35 + kick * 0.12, g.z];
  }, [[0, 2.2], [1.9, 1.9]]), undefined, true));
  shots.push(fireShot("d11d-mag-2", T.d11d, () => {
    const h = handPos(c, "handR");
    return { pos: [[0, h.x - 0.85, h.y - 0.05, h.z + 0.7]], look: [[0, h.x, h.y - 0.05, h.z + 0.1]], fov: 32, shake: 0.004 };
  }));
  shots.push(fireShot("d11e-fire-3", T.d11e, {
    pos: [[0, -1.8, 0.85, -2.6], [1.6, -1.4, 0.8, -2.0]],
    look: [[0, 0, 0.85, 3.0], [1.6, 0, 0.85, 3.5]],
    fov: 30, ease: "smooth", shake: 0.004, shakeRate: 8,
  }));

  // ── d12: ten seconds ────────────────────────────────────────────────────────────────
  shots.push(defineShot({
    id: "d12a-breath", start: T.d12a[0], end: T.d12a[1], sets: ["space"],
    light: (t) => spaceLight(t, { box: 6, fill: 1.3 }),
    run: (t) => {
      orb.update(t);
      orb.zhangFloat(t, { face: "narrow", outfit: "suitFrost", pose: aimPose(t), euler: [0.02, 0.0, 0.0] });
      gunUp(t);
    },
    cam: {
      pos: [[0, 0.5, 1.02, 2.2], [1.6, 0.35, 1.0, 1.85]],
      look: [[0, 0, 0.98, 0.2], [1.6, 0, 0.98, 0.2]],
      fov: [[0, 20], [1.6, 15]], ease: "smooth", shake: 0.0012,
    },
  }));
  shots.push(defineShot({
    id: "d12b-flight", start: T.d12b[0], end: T.d12b[1], sets: ["space"],
    light: (t) => spaceLight(t, { target: [-9, 0, 100], box: 24, fill: 1.2 }),
    run: (t) => {
      orb.update(t);
      orb.zhangFloat(t, { face: "narrow", outfit: "suitFrost", pose: aimPose(t), euler: [0.02, 0.0, 0.0] });
      gunUp(t);
    },
    cam: {
      pos: [[0, 0.85, 0.75, -2.7], [1.2, 0.55, 0.7, -2.4]],
      look: [[0, -8.5, 1.0, 56], [1.2, -8.5, 1.0, 56]],
      fov: 14, ease: "smooth", shake: 0.002,
    },
  }));

  void clamp; void stand; void MUZZLE;
  return shots;
}
