import * as THREE from "three";
import type { Shot } from "@agentbench/cinematic-player";
import { applyPose, walk, type Pose } from "@agentbench/voxel-kit";
import { P, blend } from "./characters";
import { teacup } from "./props";
import { type Film, zhangArrival, zhangDeparture, SPACE_SHOTS } from "./film";
import { GROUP_CENTER, HATCH, STATION_CENTER, sunState } from "./sets/space";
import { look, dolly, shake, seg, smooth, ease, lerp, pulse, env, V } from "./util";
import { BASEMENT_SHOTS } from "./sound";

export const FILM_DURATION = 332;

type F = Shot<Film>;
type Frame = Parameters<NonNullable<F["update"]>>[0];

/** Every shot starts from a neutral grade and empty overlays, then states its own. */
function base(film: Film): void {
  const g = film.grade;
  g.fade = 0; g.flash = 0; g.warm = 0; g.vignette = 0.55; g.grain = 0.05;
  film.overlay.title("", "", 0);
  film.overlay.caption("", 0);
  film.overlay.scope(false);
  film.overlay.card([], 0);
}

const fadeIn = (film: Film, t: number, a: number, b: number) => { film.grade.fade = Math.max(film.grade.fade, 1 - smooth(seg(t, a, b))); };
const fadeOut = (film: Film, t: number, a: number, b: number) => { film.grade.fade = Math.max(film.grade.fade, smooth(seg(t, a, b))); };

/** Camera placed along Zhang's line of sight, standing in for the magnified scope image. */
function scopeView(cam: THREE.PerspectiveCamera, target: THREE.Vector3, dist: number, fov: number, t: number, tremor: number, settle = 1): void {
  const dir = target.clone().normalize();
  const pos = target.clone().addScaledVector(dir, -dist);
  const side = new THREE.Vector3().crossVectors(dir, V(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(side, dir).normalize();
  const tx = (Math.sin(t * 1.7) * 0.6 + Math.sin(t * 3.1 + 1) * 0.4) * tremor * settle;
  const ty = (Math.cos(t * 1.3 + 0.5) * 0.6 + Math.sin(t * 2.7) * 0.4) * tremor * settle;
  const aim = target.clone().addScaledVector(side, tx).addScaledVector(up, ty);
  look(cam, pos, aim, fov);
}

/* ---------------------------------------------------------- Zhang in orbit */

function zhangSpacePose(t: number): Pose {
  const d = P.drift(t, 1);
  if (t < 226.6) return d;
  const gloveReach: Pose = { ...d, armR: [-1.35, 0, -0.25], armL: [-1.45, 0.35, 0.55], neck: [0.55, -0.15, 0] };
  const handToSun: Pose = { ...d, armR: [-1.15, 0, 1.0], armL: [-0.5, 0, -0.4], neck: [0.1, -0.7, 0] };
  const pocket: Pose = { ...d, armR: [0.35, 0, 0.3], armL: [-0.45, 0, -0.4], neck: [0.45, -0.35, 0] };
  const grab: Pose = { ...d, armR: [-1.25, 0, 0.1], armL: [-1.6, 0.1, -0.15], neck: [0.35, 0, 0] };
  const lowAim = P.aim(0.55, 0);
  const aim = P.aim(0.12, 0);
  if (t < 228.2) return blend(d, gloveReach, smooth((t - 226.6) / 0.6));
  if (t < 231) return blend(gloveReach, handToSun, smooth((t - 228.2) / 0.8));
  if (t < 233) return blend(handToSun, pocket, smooth((t - 231) / 0.7));
  if (t < 236.2) return blend(pocket, grab, smooth((t - 233) / 0.8));
  if (t < 238.5) return blend(grab, lowAim, smooth((t - 236.2) / 1.2));
  if (t < 240.8) return blend(lowAim, aim, smooth((t - 238.5) / 2.3));
  if (t < 266.5) {
    // Recoil: a short kick on each silent shot; the magazine hand drops twice.
    let kick = 0;
    for (const s of SPACE_SHOTS) kick = Math.max(kick, pulse(t, s, 0.16));
    const swap = Math.max(env(t, 259.0, 260.15, 0.25, 0.3), env(t, 262.5, 263.65, 0.25, 0.3));
    const p = P.aim(0.12 - kick * 0.14, 0);
    p.armL = [lerp(p.armL![0], 0.3, swap), 0, lerp(p.armL![2], -0.35, swap)];
    p.neck = [0.07 + kick * 0.05, 0, 0];
    return p;
  }
  if (t < 284.6) return blend(aim, P.aim(0.28, 0), smooth((t - 266.5) / 6));
  if (t < 290.4) return blend(P.aim(0.28, 0), d, smooth((t - 284.6) / 3.2));
  return blend(d, P.fly(t), smooth((t - 290.4) / 2.5));
}

/** Apply Zhang's orbital state: position, orientation, pose, props. */
function placeZhangSpace(film: Film, t: number): void {
  const z = film.cast.zhangSpace;
  const pr = film.props;
  z.root.visible = true;
  if (t < 184) z.root.position.copy(zhangArrival(t));
  else if (t < 290.4) z.root.position.set(0, 0, 0);
  else z.root.position.copy(zhangDeparture(t));
  if (t < 183) {
    // Flying in: body along the travel direction, feet toward Base One.
    const k = smooth((t - 180) / 3);
    const flyRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.1, Math.atan2(-0.66, -0.74), 0));
    const restRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
    z.root.quaternion.copy(flyRot).slerp(restRot, k);
    applyPose(z.figure, blend(P.fly(t), P.drift(t), k));
  } else if (t < 290.4) {
    z.root.rotation.set(0, Math.PI, 0);
    applyPose(z.figure, zhangSpacePose(t));
  } else {
    const k = smooth((t - 290.4) / 2.5);
    const restRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
    const flyRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.1, Math.atan2(0.66, 0.74), 0));
    z.root.quaternion.copy(restRot).slerp(flyRot, k);
    applyPose(z.figure, zhangSpacePose(t));
  }
  // Clothes: the right glove comes off at 228.
  const wantBare = t >= 228.0 && t < 289.5;
  const headMat = z.figure.clothing.head.material as THREE.MeshStandardMaterial;
  const want = wantBare ? film.suits.zhangBare : film.suits.zhangGloved;
  if (headMat.map !== want) z.setClothes(want);
  // Props.
  pr.pistolSpace.visible = t >= 231.8 && t < 289.2;
  pr.scopeAttached.visible = t >= 236.2 && t < 289.2;
  pr.scopeFloating.visible = t >= 184 && t < 236.2;
  if (pr.scopeFloating.visible) {
    const drift = V(0.42 + Math.sin(t * 0.3) * 0.05, 1.28 + Math.sin(t * 0.23) * 0.05, -0.55 + Math.cos(t * 0.27) * 0.04);
    const k = smooth((t - 234.2) / 1.9);
    pr.scopeFloating.position.lerpVectors(drift, V(0.05, 1.45, -0.62), k);
    pr.scopeFloating.rotation.set(0.2 + t * 0.15 * (1 - k), Math.PI + Math.sin(t * 0.2) * 0.3 * (1 - k), 0.1 * (1 - k));
  }
  pr.glove.visible = t >= 228.0 && t < 242;
  if (pr.glove.visible) {
    const dt = t - 228;
    pr.glove.position.set(0.58 + dt * 0.22, 1.32 + dt * 0.08, -0.35 - dt * 0.14);
    pr.glove.rotation.set(dt * 0.9, dt * 0.6, 0);
  }
  pr.magsSpace[0]!.visible = t >= 232.4 && t < 259.4;
  pr.magsSpace[1]!.visible = t >= 232.4 && t < 262.9;
  // Muzzle flash, only light and glow: vacuum carries no sound.
  let f = 0;
  for (const s of SPACE_SHOTS) f = Math.max(f, pulse(t, s, 0.075));
  pr.flashSpace.set(f, 40);
  z.root.updateMatrixWorld(true);
  pr.farFlash.visible = f > 0.01 && t > 260 && t < 263.7;
  if (pr.farFlash.visible) {
    pr.flashSpace.group.getWorldPosition(pr.farFlash.position);
    (pr.farFlash.material as THREE.MeshBasicMaterial).color.setScalar(0.6 + f * 3);
  }
}

/* ------------------------------------------------------------- the shots */

export function makeShots(film: Film): F[] {
  const cam = film.camera;
  const { study, workshop, basement, cabin, space } = film.sets;
  const { zhang, collector } = film.cast;

  // A cup for Zhang's hand, in figure pixels.
  const cupHand = teacup();
  cupHand.scale.setScalar(32 / 1.86);
  cupHand.position.set(-0.7, -0.6, 1.2);
  cupHand.visible = false;
  zhang.figure.anchors.handR.add(cupHand);

  const zhangStudyPos = V(1.0, 0, -0.5);
  const collectorPos = V(1.4, 0, -2.05);

  /** Zhang and the collector during the study conversation, for any time in the act. */
  const studyActors = (t: number) => {
    // Collector.
    collector.root.visible = true;
    collector.root.position.copy(collectorPos);
    collector.root.rotation.set(0, 0, 0);
    let cpose: Pose;
    if (t < 33) cpose = P.bench(t);
    else if (t < 35) cpose = blend(P.bench(t), P.stand(t), smooth((t - 33) / 1.6));
    else cpose = P.stand(t);
    // Offering tea (39–40.5), laughing and pointing (69–73), taking the stones (83–88.5), scratching his head (94–97).
    const offer = env(t, 38.8, 41.0, 0.6, 0.8);
    const laugh = env(t, 69.0, 73.0, 0.4, 0.8);
    const place = env(t, 83.0, 89.0, 0.5, 0.6);
    const awkward = env(t, 93.6, 97.2, 0.6, 0.6);
    const cup = t >= 38.8 && t < 40.6;
    cpose = {
      ...cpose,
      armR: [lerp(cpose.armR?.[0] ?? 0, -1.35, Math.max(offer, place * (0.8 + 0.2 * Math.sin(t * 6)))), 0, lerp(0.05, -0.15, place)],
      armL: [lerp(cpose.armL?.[0] ?? 0, -1.7, laugh), 0, lerp(-0.05, -0.15, laugh)],
      neck: [lerp(cpose.neck?.[0] ?? 0, -0.25, laugh) + 0.35 * awkward + 0.3 * place, 0, 0],
    };
    if (awkward > 0) cpose.armR = [-2.6 * awkward, 0.4 * awkward, 0.3 * awkward];
    applyPose(collector.figure, cpose);
    void cup;

    // Zhang.
    zhang.root.visible = true;
    if (t < 33.6) { zhang.root.visible = false; return; }
    if (t < 38.4) {
      const path = [V(-3.3, 0, 2.55), V(-0.6, 0, 0.6), V(0.5, 0, -0.15), zhangStudyPos];
      const k = seg(t, 33.6, 38.4) * (path.length - 1);
      const i = Math.min(path.length - 2, Math.floor(k));
      const f = k - i;
      const pos = path[i]!.clone().lerp(path[i + 1]!, f);
      const dir = path[i + 1]!.clone().sub(path[i]!);
      zhang.root.position.copy(pos);
      zhang.root.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
      applyPose(zhang.figure, walk(t, 1.55));
      cupHand.visible = false;
      return;
    }
    zhang.root.position.copy(zhangStudyPos);
    const turn = smooth((t - 38.4) / 0.7);
    zhang.root.rotation.set(0, lerp(Math.atan2(0.5, -0.35), Math.PI, turn), 0);
    const holding = t >= 40.4 && t < 69.2;
    const raise = env(t, 63.6, 69.0, 1.6, 0.9);
    const phoneOut = env(t, 90.0, 93.4, 0.6, 0.6);
    let zp: Pose = holding ? P.cup(t, 0.35 + 0.65 * raise) : P.stand(t, 0.6);
    if (phoneOut > 0) zp = { ...zp, armR: [-1.45 * phoneOut, 0.3 * phoneOut, 0.1], neck: [0.35 * phoneOut, 0, 0] };
    // A listening nod, a firm chin on the last line.
    zp.neck = [(zp.neck?.[0] ?? 0) + (t > 97 ? -0.06 : 0.04 * Math.sin(t * 0.9)), (zp.neck?.[1] ?? 0), 0];
    applyPose(zhang.figure, zp);
    cupHand.visible = holding;
    film.props.phone.visible = phoneOut > 0.2;
    study.cups[0]!.visible = !holding;
  };

  const studyLighting = (t: number) => {
    film.grade.warm = 0.55;
    film.grade.vignette = 0.62;
    void t;
  };

  const shots: F[] = [];
  const S = (id: string, start: number, end: number, def: Omit<F, "id" | "start" | "end">) => shots.push({ id, start, end, ...def });

  /* ============================================================ PROLOGUE */

  S("P1-drift-wide", 0, 14.2, {
    enter: ({ context }) => { context.show("space"); },
    update: ({ context, time, progress }) => {
      base(context);
      placeZhangSpace(context, 190 + time * 0.2);           // the same drift as the waiting, sampled at a quiet moment
      context.cast.zhangSpace.root.position.set(0, 0, 0);
      context.cast.zhangSpace.root.rotation.set(0, Math.PI, 0);
      context.props.scopeFloating.visible = false;
      const k = ease(progress);
      dolly(cam, k, V(16, 2.5, 20), V(0, 0.8, 0), V(6.5, 1.2, 8.5), V(0, 1.0, 0), 34, 30, 0.02);
      // No fade from black: the poster frame is the first thing the viewer sees.
      context.grade.vignette = 0.7;
    },
  });

  S("P2-visor-title", 14.2, 23, {
    update: ({ context, time, progress }) => {
      base(context);
      placeZhangSpace(context, 190 + time * 0.2);
      context.cast.zhangSpace.root.position.set(0, 0, 0);
      context.cast.zhangSpace.root.rotation.set(0, Math.PI, 0);
      context.props.scopeFloating.visible = false;
      dolly(cam, ease(progress), V(0.8, 1.8, 1.7), V(0, 1.68, 0), V(0.45, 1.72, 1.05), V(0, 1.68, 0), 30, 26);
      const tOp = env(time, 16.0, 22.4, 1.4, 1.2);
      context.overlay.title("陨石雨", "METEOR RAIN · 一部体素电影", tOp);
      fadeOut(context, time, 21.8, 23);
      context.grade.vignette = 0.75;
    },
  });

  /* ============================================================ ACT ONE */

  S("C1-cabinets", 23, 31.2, {
    enter: ({ context }) => { context.show("study"); },
    update: ({ context, time, progress }) => {
      base(context); studyLighting(time);
      studyActors(time);
      dolly(cam, progress, V(-2.3, 1.55, 1.7), V(-4.3, 1.25, 0.8), V(-2.3, 1.45, -1.3), V(-4.3, 1.1, -1.9), 36, 36);
      fadeIn(context, time, 23, 24.6);
      context.overlay.caption("北京 · 胡同深处的四合院", env(time, 24.2, 29.5, 0.8, 0.8));
    },
  });

  S("C2-entrance", 31.2, 39.2, {
    update: ({ context, time }) => {
      base(context); studyLighting(time);
      studyActors(time);
      // Door swings open as Zhang arrives.
      study.door.rotation.y = -smooth(seg(time, 31.6, 33.2)) * 1.3 + smooth(seg(time, 36.5, 38.2)) * 1.3;
      look(cam, V(-1.7, 1.5, 2.3), V(0.9, 1.05, -1.5), 40);
    },
    leave: () => { study.door.rotation.y = 0; },
  });

  S("C3-two-shot", 39.2, 59.8, {
    update: ({ context, time, progress }) => {
      base(context); studyLighting(time);
      studyActors(time);
      dolly(cam, ease(progress), V(3.7, 1.35, -0.2), V(1.25, 1.2, -1.3), V(3.3, 1.3, -0.4), V(1.2, 1.25, -1.3), 34, 32);
    },
  });

  S("C4-teacup", 59.8, 69.3, {
    update: ({ context, time, progress }) => {
      base(context); studyLighting(time);
      studyActors(time);
      dolly(cam, ease(progress), V(2.15, 1.55, -2.35), V(1.0, 1.35, -0.5), V(1.95, 1.5, -2.1), V(1.0, 1.4, -0.5), 30, 27);
    },
  });

  S("C5-laugh", 69.3, 75.8, {
    update: ({ context, time, progress }) => {
      base(context); studyLighting(time);
      studyActors(time);
      dolly(cam, ease(progress), V(0.25, 1.55, 0.3), V(1.4, 1.3, -2.0), V(0.35, 1.5, 0.1), V(1.4, 1.32, -2.0), 30, 29);
    },
  });

  S("C6-three-stones", 75.8, 89.9, {
    update: ({ context, time, progress }) => {
      base(context); studyLighting(time);
      studyActors(time);
      study.stones.forEach((s, i) => {
        const drop = 86.4 + i * 0.8;
        s.visible = time >= drop;
        s.position.y = 0.9 + 0.25 * (1 - smooth(seg(time, drop, drop + 0.22)));
      });
      dolly(cam, ease(progress), V(1.5, 1.6, -0.15), V(1.35, 0.85, -1.3), V(1.45, 1.45, -0.35), V(1.35, 0.85, -1.35), 32, 30);
    },
    leave: () => { for (const s of study.stones) s.visible = true; },
  });

  S("C7a-the-price", 89.9, 97.0, {
    update: ({ context, time, progress }) => {
      base(context); studyLighting(time);
      studyActors(time);
      dolly(cam, ease(progress), V(3.4, 1.5, 0.5), V(1.15, 1.2, -1.25), V(3.2, 1.45, 0.3), V(1.15, 1.22, -1.25), 36, 35);
    },
  });

  S("C7b-respect", 97.0, 101.4, {
    update: ({ context, time, progress }) => {
      base(context); studyLighting(time);
      studyActors(time);
      dolly(cam, ease(progress), V(0.35, 1.6, -1.35), V(1.0, 1.62, -0.5), V(0.45, 1.62, -1.2), V(1.0, 1.63, -0.5), 28, 25);
      fadeOut(context, time, 100.6, 101.4);
    },
  });

  /* ============================================================ ACT TWO */

  const workshopZhang = (t: number) => {
    zhang.root.visible = true;
    film.props.phone.visible = false;
    cupHand.visible = false;
    if (t < 112.6) {
      zhang.root.position.set(1.9, 0, 1.55);
      zhang.root.rotation.set(0, Math.PI, 0);
      const p = P.stand(t, 0.4);
      p.armR = [-1.15 + Math.sin(t * 0.7) * 0.05, 0.2, 0.05];
      p.neck = [0.2, -0.55, 0];
      applyPose(zhang.figure, p);
    } else {
      zhang.root.position.set(0.95, 0, 1.25);
      zhang.root.rotation.set(0, Math.PI, 0);
      const p = P.stand(t, 0.3);
      const busy = t < 115.2 ? 1 : env(t, 115.2, 117.6, 0.3, 0.5);
      p.armR = [-1.5 - Math.sin(t * 7) * 0.12 * busy, 0.15, 0.05];
      p.armL = [-1.2 * busy, 0, -0.1];
      p.neck = [0.6, 0, 0];
      p.hips = [0.25, 0, 0];
      applyPose(zhang.figure, p);
    }
  };

  S("W1-lathe", 101.4, 112.6, {
    enter: ({ context }) => { context.show("workshop"); },
    update: ({ context, time, progress }) => {
      base(context);
      context.grade.warm = -0.35; context.grade.vignette = 0.6; context.grade.grain = 0.07;
      workshopZhang(time);
      workshop.cutter.visible = true;
      workshop.cutter.position.z = 0.35 - smooth(seg(time, 102.0, 102.6)) * 0.13;
      for (const s of workshop.segments) s.visible = false;
      dolly(cam, ease(progress), V(4.8, 2.7, 5.8), V(0.2, 1.3, 0.2), V(1.9, 1.85, 2.4), V(-0.4, 1.5, 0.1), 42, 34);
      fadeIn(context, time, 101.4, 102.4);
      context.overlay.caption("太空军研究所 · 模型车间 · 夜", env(time, 102.0, 107.0, 0.8, 0.8));
    },
  });

  S("W2-thirty-six", 112.6, 118.6, {
    update: ({ context, time, progress }) => {
      base(context);
      context.grade.warm = -0.3; context.grade.vignette = 0.62; context.grade.grain = 0.07;
      workshopZhang(time);
      workshop.segments.forEach((s, i) => { s.visible = time >= 112.6 + i * 0.07; });
      workshop.cutter.visible = time < 117.3;
      dolly(cam, ease(progress), V(0.95, 2.1, 1.0), V(0.95, 1.02, 0.35), V(0.9, 1.75, 0.85), V(0.95, 1.02, 0.35), 32, 26);
      fadeOut(context, time, 117.9, 118.6);
    },
  });

  const basementZhang = (t: number) => {
    zhang.root.visible = true;
    cupHand.visible = false;
    film.props.phone.visible = false;
    if (t < 130.2) {
      zhang.root.position.set(0.1, 0, 0.95);
      zhang.root.rotation.set(0, Math.PI, 0);
      const p = P.sit(t);
      const k = ((t - 119.5) % 0.28) / 0.28;
      const work = t >= 119.5 && t < 129.6 ? Math.sin(k * Math.PI) : 0;
      p.armR = [-1.55 - work * 0.35, 0.1, 0.05];
      p.armL = [-1.35, -0.1, -0.05];
      p.neck = [0.6, 0, 0];
      p.hips = [0.15, 0, 0];
      applyPose(zhang.figure, p);
      film.props.pistolGround.visible = false;
    } else if (t < 141.2) {
      zhang.root.position.set(-1.0, 0, 1.2);
      const to = basement.bundlePoint.clone().sub(V(-1.0, 1.35, 1.2));
      zhang.root.rotation.set(0, Math.atan2(to.x, to.z), 0);
      const load = t < 132.9 ? 1 : 0;
      const raise = smooth(seg(t, 132.7, 133.1));
      let kick = 0;
      for (const s of BASEMENT_SHOTS) kick = Math.max(kick, pulse(t, s, 0.2));
      const pitch = Math.atan2(-to.y, Math.hypot(to.x, to.z));
      const lower = smooth(seg(t, 138.0, 140.5));
      let p: Pose;
      if (load) {
        p = { ...P.stand(t, 0.3), armR: [-1.45, 0.25, 0.15], armL: [-1.5 + Math.sin(t * 5) * 0.12, -0.35, -0.25], neck: [0.55, 0, 0] };
      } else {
        p = P.aim(pitch - kick * 0.22, 0);
        p.neck = [0.1 + kick * 0.06, 0, 0];
      }
      p = blend(p, P.aim(pitch, 0), raise * (1 - lower));
      if (lower > 0) p = blend(p, { ...P.stand(t, 0.3), armR: [-0.4, 0, 0.1], armL: [-0.1, 0, -0.1], neck: [0.15, 0, 0] }, lower);
      applyPose(zhang.figure, p);
      film.props.pistolGround.visible = t >= 130.2;
    } else {
      zhang.root.position.set(0.1, 0, 1.0);
      zhang.root.rotation.set(0, Math.PI, 0);
      const p = P.stand(t, 0.3);
      p.armR = [-1.4 - Math.sin(t * 2.5) * 0.08, 0.1, 0.05];
      p.armL = [-1.3, 0, -0.1];
      p.neck = [0.65, 0, 0];
      p.hips = [0.3, 0, 0];
      applyPose(zhang.figure, p);
      film.props.pistolGround.visible = false;
    }
  };

  S("B1-thirty-six-rounds", 118.6, 130.2, {
    enter: ({ context }) => { context.show("basement"); },
    update: ({ context, time, progress }) => {
      base(context);
      context.grade.warm = 0.35; context.grade.vignette = 0.72; context.grade.grain = 0.09;
      basementZhang(time);
      basement.rounds.forEach((r, i) => {
        const done = time >= 119.5 + i * 0.28;
        basement.heads[i]!.visible = done;
        basement.segments[i]!.visible = done;
        // A converted round loses its brass head: swap the head voxels by hiding the original and showing the segment on top.
        r.scale.y = done ? 0.04 : 0.06;
      });
      basement.tool.position.set(-0.42 + (Math.min(35, Math.max(0, Math.floor((time - 119.5) / 0.28))) % 9) * 0.06 + 0.08, 0.79, -0.22 + Math.floor(Math.min(35, Math.max(0, (time - 119.5) / 0.28)) / 9) * 0.075 + 0.05);
      basement.tool.visible = time < 129.6;
      basement.beef.visible = false;
      basement.fragments.visible = false;
      for (const h of basement.holes) h.visible = false;
      dolly(cam, ease(progress), V(0.95, 1.62, 1.45), V(0.0, 0.8, 0.1), V(0.8, 1.5, 1.25), V(-0.05, 0.8, 0.1), 34, 30);
      fadeIn(context, time, 118.6, 119.6);
      context.overlay.caption("地下室", env(time, 119.2, 123.0, 0.6, 0.8));
    },
    leave: () => { for (const r of basement.rounds) r.scale.y = 0.06; basement.tool.visible = true; },
  });

  S("B2-test-fire", 130.2, 141.2, {
    update: ({ context, time }) => {
      base(context);
      context.grade.warm = 0.3; context.grade.vignette = 0.7; context.grade.grain = 0.09;
      basementZhang(time);
      basement.heads.forEach((h) => { h.visible = true; });
      basement.segments.forEach((s, i) => { s.visible = i >= 4 || time < 130.6 + (i % 4) * 0.35; });
      basement.rounds.forEach((r, i) => { r.visible = i >= 4 || time < 130.6 + (i % 4) * 0.35; r.scale.y = 0.04; });
      let f = 0, k = 0;
      BASEMENT_SHOTS.forEach((s, i) => {
        f = Math.max(f, pulse(time, s, 0.09));
        k = Math.max(k, pulse(time, s, 0.35));
        basement.holes[i]!.visible = time >= s + 0.02;
      });
      context.props.flashGround.set(f, 90);
      context.grade.flash = f * 0.35;
      // The bulb dims for a moment with every report, as if the air itself moved.
      basement.bulb.intensity = 22 - k * 6;
      look(cam, V(-2.05, 1.55, 2.05), V(0.55, 0.65, -0.65), 46);
      shake(cam, time, k * 0.012);
    },
    leave: () => { for (const r of basement.rounds) { r.visible = true; r.scale.y = 0.06; } for (const s of basement.segments) s.visible = false; context_flash_off(film); },
  });

  S("B3-fragments", 141.2, 150, {
    update: ({ context, time, progress }) => {
      base(context);
      context.grade.warm = 0.3; context.grade.vignette = 0.72; context.grade.grain = 0.09;
      basementZhang(time);
      basement.beef.visible = time >= 141.8;
      basement.fragments.visible = time >= 145.2;
      basement.fragments.position.set(-0.05, 0.765, 0.6);
      basement.fragments.scale.setScalar(1 + smooth(seg(time, 145.2, 145.6)) * 0.001);
      for (const h of basement.holes) h.visible = true;
      dolly(cam, ease(progress), V(0.55, 1.3, 1.05), V(0.0, 0.82, 0.25), V(0.35, 1.05, 0.95), V(-0.05, 0.78, 0.45), 30, 24);
      fadeOut(context, time, 149.0, 150);
    },
  });

  /* ========================================================== ACT THREE */

  S("S1-station", 150, 164.4, {
    enter: ({ context }) => { context.show("space"); },
    update: ({ context, time, progress }) => {
      base(context);
      context.grade.vignette = 0.6;
      placeZhangSpace(context, 190);           // parked out of frame at the origin; the camera is 5 km away
      context.cast.zhangSpace.root.visible = false;
      const k = ease(progress);
      const a = STATION_CENTER.clone().add(V(950, -120, 520));
      const b = STATION_CENTER.clone().add(V(420, -520, 760));
      const la = STATION_CENTER.clone().add(V(0, -60, 0));
      const lb = STATION_CENTER.clone().add(V(0, 20, 0));
      dolly(cam, k, a, la, b, lb, 40, 36, -0.04);
      fadeIn(context, time, 150, 151.4);
      context.overlay.caption("地球同步轨道 · 黄河空间站", env(time, 150.8, 156.5, 0.8, 0.8));
    },
  });

  S("S2-cabin", 164.4, 172.2, {
    enter: ({ context }) => { context.show("cabin"); },
    update: ({ context, time, progress }) => {
      base(context);
      context.grade.warm = -0.2; context.grade.vignette = 0.6;
      const z = context.cast.zhangSpace;
      z.root.visible = true;
      const headMat = z.figure.clothing.head.material as THREE.MeshStandardMaterial;
      if (headMat.map !== context.suits.zhangGloved) z.setClothes(context.suits.zhangGloved);
      context.props.pistolSpace.visible = false;
      context.props.magsSpace.forEach((m) => { m.visible = false; });
      // Standing at the shelf, setting the unit down, turning and leaving.
      if (time < 168.2) {
        z.root.position.set(0.55, 0, -0.45);
        z.root.rotation.set(0, Math.PI, 0);
        const reach = env(time, 165.4, 167.6, 0.7, 0.6);
        const p = P.stand(time, 0.4);
        p.armR = [-1.25 * reach - 0.1, 0, 0.05];
        p.neck = [0.35 * reach + 0.1, 0, 0];
        applyPose(z.figure, p);
      } else {
        const k = seg(time, 168.2, 170.2);
        z.root.position.lerpVectors(V(0.55, 0, -0.45), V(-0.45, 0, 0.72), smooth(k));
        z.root.rotation.set(0, lerp(Math.PI, Math.atan2(-1.0, 1.17), smooth(seg(time, 168.0, 168.9))), 0);
        applyPose(z.figure, k < 1 ? walk(time, 1.2) : P.stand(time, 0.3));
        z.root.visible = time < 170.4;
      }
      // The unit is in his hand until 166.9, then on the shelf.
      const held = time < 166.9;
      cabin.unit.visible = true;
      if (held) {
        const hand = new THREE.Vector3();
        z.root.updateMatrixWorld(true);
        z.figure.anchors.handR.getWorldPosition(hand);
        cabin.unit.position.copy(hand).add(V(0, -0.05, -0.08));
      } else cabin.unit.position.copy(cabin.shelfPoint);
      // The door slides open as he walks to it and shuts behind him.
      const open = smooth(seg(time, 168.3, 169.1)) * (1 - smooth(seg(time, 170.2, 171.2)));
      cabin.door.position.x = -0.45 + 0.95 * open;
      // One take from the corner: on the unit as he sets it down, then a pan that follows him to the door.
      const head = new THREE.Vector3();
      z.root.updateMatrixWorld(true);
      z.figure.parts.head.getWorldPosition(head);
      const pan = smooth(seg(time, 168.2, 169.8));
      const doorPoint = V(-0.45, 1.05, 1.1);
      const target = cabin.shelfPoint.clone().lerp(time < 170.4 ? head : doorPoint, pan);
      if (time >= 170.4) target.lerp(doorPoint, smooth(seg(time, 170.4, 171.0)));
      const camPos = V(1.05, 1.5, 0.75).lerp(V(0.95, 1.45, 0.55), ease(progress));
      look(cam, camPos, target, lerp(34, 40, pan));
      fadeIn(context, time, 164.4, 165.2);
      fadeOut(context, time, 171.4, 172.2);
      context.overlay.caption("一号基地 · 章北海舱室", env(time, 164.9, 169.4, 0.6, 0.8));
    },
    leave: () => { cabin.door.position.x = -0.45; },
  });

  S("S3-arrival", 172.2, 184.4, {
    enter: ({ context }) => { context.show("space"); },
    update: ({ context, time }) => {
      base(context);
      placeZhangSpace(context, time);
      const zp = context.cast.zhangSpace.root.position;
      const camPos = V(-7.5, 1.4, -4.5);
      look(cam, camPos, zp.clone().add(V(0, 0.9, 0)), lerp(30, 38, smooth(seg(time, 176, 183))));
      fadeIn(context, time, 172.2, 173.4);
    },
  });

  S("S4a-waiting-wide", 184.4, 193.6, {
    update: ({ context, time, progress }) => {
      base(context);
      context.grade.vignette = 0.62;
      placeZhangSpace(context, time);
      dolly(cam, ease(progress), V(34, 7, 44), V(0, 0.9, 0), V(9, 2.0, 12), V(0, 1.0, 0), 28, 30, 0.03);
    },
  });

  S("S4b-waiting-close", 193.6, 201.4, {
    update: ({ context, time, progress }) => {
      base(context);
      context.grade.vignette = 0.7;
      placeZhangSpace(context, time);
      dolly(cam, ease(progress), V(-0.9, 1.85, -1.7), V(0, 1.68, 0), V(-0.55, 1.75, -1.15), V(0, 1.68, 0), 30, 26);
    },
  });

  S("S5a-scope-hatch", 201.4, 205.8, {
    update: ({ context, time }) => {
      base(context);
      placeZhangSpace(context, time);
      space.hatchDoor.position.x = HATCH.x - STATION_CENTER.x;
      (space.hatchLamp.material as THREE.MeshBasicMaterial).color.setHex(0xff2a2a);
      scopeView(cam, HATCH.clone().add(V(0, 2, 0)), 95, 11, time, 1.4);
      context.overlay.scope(true, [Math.sin(time * 0.8) * 4, Math.cos(time * 0.6) * 3]);
      context.grade.vignette = 0.2; context.grade.grain = 0.12;
    },
  });

  S("S5b-sun-touches", 205.8, 207.9, {
    update: ({ context, time }) => {
      base(context);
      placeZhangSpace(context, time);
      const s = sunState(time);
      look(cam, V(0.6, 1.9, 0.4), s.dir.clone().multiplyScalar(1000), 22);
      context.grade.vignette = 0.5;
    },
  });

  S("S5c-scope-open", 207.9, 212.6, {
    update: ({ context, time }) => {
      base(context);
      placeZhangSpace(context, time);
      (space.hatchLamp.material as THREE.MeshBasicMaterial).color.setHex(time >= 208.4 ? 0x2eff5a : 0xff2a2a);
      space.hatchDoor.position.x = HATCH.x - STATION_CENTER.x + smooth(seg(time, 209.0, 210.6)) * 8.5;
      scopeView(cam, HATCH.clone().add(V(0, 2, 0)), 95, 11, time, 1.4);
      context.overlay.scope(true, [Math.sin(time * 0.8) * 4, Math.cos(time * 0.6) * 3]);
      context.grade.vignette = 0.2; context.grade.grain = 0.12;
    },
    leave: () => { space.hatchDoor.position.x = HATCH.x - STATION_CENTER.x + 8.5; (space.hatchLamp.material as THREE.MeshBasicMaterial).color.setHex(0x2eff5a); },
  });

  S("S6a-streaming-out", 212.6, 217.8, {
    update: ({ context, time, progress }) => {
      base(context);
      placeZhangSpace(context, time);
      space.hatchDoor.position.x = HATCH.x - STATION_CENTER.x + 8.5;
      // From just outside the group's future position: white figures pour out of the rim toward us.
      const a = GROUP_CENTER.clone().add(V(14, 5, 18));
      const b = GROUP_CENTER.clone().add(V(10, 3.5, 14));
      const la = GROUP_CENTER.clone().lerp(HATCH, 0.6);
      const lb = GROUP_CENTER.clone().lerp(HATCH, 0.35);
      dolly(cam, ease(progress), a, la, b, lb, 44, 40, -0.05);
      context.grade.vignette = 0.55;
    },
  });

  S("S6b-faces", 217.8, 226.8, {
    update: ({ context, time, progress }) => {
      base(context);
      placeZhangSpace(context, time);
      const a = GROUP_CENTER.clone().add(V(5.5, 1.6, 13));
      const b = GROUP_CENTER.clone().add(V(-1.5, 0.4, 7.5));
      dolly(cam, ease(progress), a, GROUP_CENTER.clone().add(V(0.5, 0.9, 0)), b, GROUP_CENTER.clone().add(V(-0.4, 0.9, 0)), 60, 56);
      context.grade.vignette = 0.6;
    },
  });

  S("S7-preparation", 226.8, 240.8, {
    update: ({ context, time, progress }) => {
      base(context);
      placeZhangSpace(context, time);
      const k = ease(progress);
      dolly(cam, k, V(2.4, 1.1, -1.9), V(0.1, 1.25, -0.2), V(1.55, 1.35, -1.25), V(0.1, 1.35, -0.25), 36, 32);
      context.grade.vignette = 0.62;
    },
  });

  S("S8a-scope-faces", 240.8, 249.2, {
    update: ({ context, time }) => {
      base(context);
      placeZhangSpace(context, time);
      const settle = 1 - 0.75 * smooth(seg(time, 243, 248));
      scopeView(cam, GROUP_CENTER.clone().add(V(0.3, 1.1, 0)), 42, 13, time, 0.5, settle);
      context.overlay.scope(true, [Math.sin(time * 0.8) * 3 * settle, Math.cos(time * 0.6) * 2 * settle]);
      context.grade.vignette = 0.2; context.grade.grain = 0.12;
    },
  });

  S("S8b-visor", 249.2, 256.7, {
    update: ({ context, time, progress }) => {
      base(context);
      placeZhangSpace(context, time);
      dolly(cam, ease(progress), V(1.05, 1.8, -1.35), V(0, 1.7, -0.1), V(0.7, 1.78, -0.95), V(0, 1.7, -0.1), 26, 22);
      context.grade.vignette = 0.75;
    },
  });

  S("S9-first-magazine", 256.7, 260.3, {
    update: ({ context, time }) => {
      base(context);
      placeZhangSpace(context, time);
      look(cam, V(3.1, 1.45, -0.7), V(0.25, 1.55, -0.3), 32);
      let f = 0; for (const s of SPACE_SHOTS) f = Math.max(f, pulse(time, s, 0.08));
      context.grade.flash = f * 0.06;
      context.grade.vignette = 0.6;
    },
  });

  S("S10-firefly", 260.3, 263.7, {
    update: ({ context, time }) => {
      base(context);
      placeZhangSpace(context, time);
      // Behind and above the group, the rows in the lower frame; a firefly blinks in the black above them.
      const from = GROUP_CENTER.clone().add(V(1.5, 4.0, -9));
      look(cam, from, GROUP_CENTER.clone().add(V(0, -0.5, 30)), 55);
      context.grade.vignette = 0.62;
    },
  });

  S("S11-third-magazine", 263.7, 267.5, {
    update: ({ context, time }) => {
      base(context);
      placeZhangSpace(context, time);
      look(cam, V(-1.0, 1.95, 1.55), V(0.05, 1.5, -7), 40);
      context.grade.vignette = 0.6;
    },
  });

  S("S12a-impacts", 267.5, 274.8, {
    update: ({ context, time, progress }) => {
      base(context);
      placeZhangSpace(context, time);
      const a = GROUP_CENTER.clone().add(V(2.4, 0.5, 11.5));
      const b = GROUP_CENTER.clone().add(V(1.2, 0.7, 9.5));
      dolly(cam, ease(progress), a, GROUP_CENTER.clone().add(V(0.2, 0.4, 0)), b, GROUP_CENTER.clone().add(V(0.3, 0.6, 0)), 50, 46);
      const hit = smooth(seg(time, 270.5, 271.2));
      context.grade.vignette = 0.55 + hit * 0.15;
      context.grade.grain = 0.05 + hit * 0.04;
    },
  });

  S("S12b-flight", 274.8, 279.6, {
    update: ({ context, time, progress }) => {
      base(context);
      placeZhangSpace(context, time);
      const mid = GROUP_CENTER.clone().lerp(HATCH, 0.5);
      const a = GROUP_CENTER.clone().add(V(-16, 9, 15));
      const b = GROUP_CENTER.clone().add(V(-11, 7, 9));
      dolly(cam, ease(progress), a, mid, b, mid, 56, 52, 0.06);
      context.grade.vignette = 0.62;
    },
  });

  S("S13a-scope-retreat", 279.6, 284.8, {
    update: ({ context, time }) => {
      base(context);
      placeZhangSpace(context, time);
      scopeView(cam, HATCH.clone().add(V(0, 2, 8)), 320, 5.2, time, 2.2);
      context.overlay.scope(true, [Math.sin(time * 0.8) * 4, Math.cos(time * 0.6) * 3]);
      context.grade.vignette = 0.2; context.grade.grain = 0.12;
    },
  });

  S("S13b-lowering", 284.8, 290.6, {
    update: ({ context, time, progress }) => {
      base(context);
      placeZhangSpace(context, time);
      dolly(cam, ease(progress), V(1.2, 1.85, -1.25), V(0, 1.7, -0.1), V(1.4, 1.6, -1.0), V(0, 1.55, -0.1), 26, 30);
      context.grade.vignette = 0.75;
    },
  });

  S("S14-leaving", 290.6, 308.8, {
    update: ({ context, time, progress }) => {
      base(context);
      placeZhangSpace(context, time);
      // The camera stays behind; he shrinks toward the point of light that is Base One.
      const zp = context.cast.zhangSpace.root.position;
      look(cam, V(-3.2, 1.6, -3.4), zp.clone().add(V(0, 0.8, 0)), lerp(40, 34, ease(progress)));
      context.grade.vignette = 0.66;
      fadeOut(context, time, 307.6, 308.8);
    },
  });

  /* ============================================================== CODA */

  S("X1-coda-study", 308.8, 318.4, {
    enter: ({ context }) => { context.show("study"); },
    update: ({ context, time, progress }) => {
      base(context); studyLighting(time);
      zhang.root.visible = false;
      film.props.phone.visible = false;
      cupHand.visible = false;
      for (const s of study.stones) s.visible = false;
      study.cups[0]!.visible = true;
      collector.root.visible = true;
      collector.root.position.copy(collectorPos);
      collector.root.rotation.set(0, 0, 0);
      const p = P.bench(time);
      p.neck = [0.4 + Math.sin(time * 0.9) * 0.03, Math.sin(time * 0.4) * 0.05, 0];
      applyPose(collector.figure, p);
      context.props.codaStone.visible = true;
      context.props.codaStone.position.set(1.32, 0.905, -1.42);
      context.props.codaStone.rotation.y = time * 0.25;
      dolly(cam, ease(progress), V(2.3, 1.45, 0.7), V(1.4, 1.15, -1.8), V(1.9, 1.3, -0.1), V(1.4, 1.2, -1.85), 34, 28);
      fadeIn(context, time, 308.8, 310.0);
      fadeOut(context, time, 317.4, 318.4);
    },
    leave: ({ context }) => { context.props.codaStone.visible = false; },
  });

  S("X2-end-card", 318.4, FILM_DURATION, {
    enter: ({ context }) => { context.show("none"); },
    update: ({ context, time }) => {
      base(context);
      context.grade.fade = 1;
      const op = env(time, 318.9, 331.2, 1.6, 1.6);
      context.overlay.card(["陨石雨", "改编自刘慈欣《三体Ⅱ·黑暗森林》选段", "体素造型 · 程序化生成 · Three.js", "所有对白与旁白以字幕呈现，待后期配音"], op);
    },
  });

  return shots;
}

function context_flash_off(film: Film): void {
  film.props.flashGround.set(0, 0);
  film.sets.basement.bulb.intensity = 22;
}
