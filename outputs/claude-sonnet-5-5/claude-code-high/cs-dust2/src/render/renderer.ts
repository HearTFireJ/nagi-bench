// GameRenderer: owns the three.js scene. It only *reads* GameSim state (positions, yaw, hp ...)
// and consumes SimEvents for one-shot effects. Two passes: world, then the first-person weapon
// with a cleared depth buffer.

import * as THREE from 'three';
import type { Actor } from '../sim/actor.ts';
import { CFG } from '../sim/config.ts';
import type { GameSim } from '../sim/game.ts';
import { DEG } from '../sim/math.ts';
import type { SimEvent } from '../sim/types.ts';
import { CharacterModel } from './characterModel.ts';
import { Effects } from './effects.ts';
import { DoorMeshes, buildStaticMap } from './mapMesh.ts';
import { ViewModel } from './viewmodel.ts';

export const BASE_FOV = 74;

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 400);
  private viewModel = new ViewModel();
  private effects = new Effects();
  private doors = new DoorMeshes();
  private models = new Map<number, CharacterModel>();
  private mapGroup: THREE.Group | null = null;
  private fov = BASE_FOV;
  private width = 1;
  private height = 1;
  private tmpV = new THREE.Vector3();
  private tmpW = new THREE.Vector3();
  private mouseDX = 0;
  private mouseDY = 0;
  private camRoll = 0;
  private sim: GameSim | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x9cc3e6);

    const sky = new THREE.Color(0xa9cbe8);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 70, 210);
    this.scene.add(new THREE.HemisphereLight(0xe6f0ff, 0x9a8760, 2.3));
    // three >= r155 uses physically based light units (no implicit x PI), hence the larger values
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
    sun.position.set(-40, 90, 30);
    this.scene.add(sun);
    this.scene.add(this.camera);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.effects.group);
    this.scene.add(this.doors.group);
  }

  attach(sim: GameSim): void {
    this.sim = sim;
    if (!this.mapGroup) {
      this.mapGroup = buildStaticMap(sim.world);
      this.scene.add(this.mapGroup);
    }
    for (const m of this.models.values()) this.scene.remove(m.root);
    this.models.clear();
    for (const a of sim.actors) {
      const m = new CharacterModel(a.team, a.id);
      this.models.set(a.id, m);
      this.scene.add(m.root);
    }
    this.effects.clearDynamic();
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.viewModel.resize(this.camera.aspect);
  }

  get currentFov(): number {
    return this.fov;
  }

  addMouseDelta(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  // ---- events --------------------------------------------------------------------------------------------
  handleEvent(e: SimEvent, view: Actor | null): void {
    const sim = this.sim;
    if (!sim) return;
    switch (e.type) {
      case 'shot': {
        const isView = view !== null && e.actorId === view.id;
        if (isView) this.viewModel.fired(sim.t);
        if (e.weaponId === 'knife') break;
        const from = this.tmpV;
        if (isView && view) {
          const yaw = view.yaw + view.punchYaw * DEG;
          const pitch = view.pitch + view.punchPitch * DEG;
          const fx = -Math.sin(yaw) * Math.cos(pitch);
          const fy = Math.sin(pitch);
          const fz = -Math.cos(yaw) * Math.cos(pitch);
          const rx = Math.cos(yaw);
          const rz = -Math.sin(yaw);
          from.set(e.origin.x + fx * 0.7 + rx * 0.16, e.origin.y + fy * 0.7 - 0.13, e.origin.z + fz * 0.7 + rz * 0.16);
        } else {
          const m = this.models.get(e.actorId);
          if (m) m.muzzleWorld(from);
          else from.set(e.origin.x, e.origin.y, e.origin.z);
        }
        this.effects.tracer({ x: from.x, y: from.y, z: from.z }, e.end);
        if (e.hit === 'world' && e.normal) this.effects.impact(e.end, e.normal);
        else if (e.hit === 'actor') {
          const dx = e.end.x - e.origin.x;
          const dz = e.end.z - e.origin.z;
          const l = Math.hypot(dx, dz) || 1;
          this.effects.blood(e.end, { x: dx / l, y: 0, z: dz / l }, e.group === 'head');
        }
        break;
      }
      case 'bombExploded':
        this.effects.explode(e.pos);
        break;
      case 'freezeStart':
        this.effects.clearDynamic();
        break;
      default:
        break;
    }
  }

  // ---- frame --------------------------------------------------------------------------------------------------
  render(sim: GameSim, alpha: number, dt: number, view: Actor | null): void {
    // characters
    for (const a of sim.actors) {
      const m = this.models.get(a.id);
      if (!m) continue;
      const hidden = view !== null && a.id === view.id && a.alive;
      m.update(a, sim.t, alpha, hidden);
    }
    this.doors.update(sim);

    const b = sim.bomb;
    if (b.state === 'dropped') this.effects.setBomb(true, b.pos, false, sim.t);
    else if (b.state === 'planted') this.effects.setBomb(true, b.pos, true, sim.t);
    else this.effects.setBomb(false, b.pos, false, sim.t);
    this.effects.update(dt);

    // camera
    let showVM = false;
    if (view) {
      const k = view.alive ? alpha : 1;
      const px = view.prev.x + (view.pos.x - view.prev.x) * k;
      const py = view.prev.y + (view.pos.y - view.prev.y) * k;
      const pz = view.prev.z + (view.pos.z - view.prev.z) * k;
      const bob = view.alive ? Math.sin(view.walkPhase * 1.0) * 0.012 * Math.min(1, view.speed / 5) : 0;
      let eye = CFG.EYE + bob;
      let roll = 0;
      if (!view.alive) {
        const f = Math.min(1, (sim.t - view.diedAt) / 0.5);
        eye = CFG.EYE - (CFG.EYE - 0.35) * f;
        roll = 0.6 * f;
      }
      this.camRoll += (roll - this.camRoll) * Math.min(1, dt * 12);
      this.camera.position.set(px, py + eye, pz);
      this.camera.rotation.set(view.pitch + view.punchPitch * DEG, view.yaw + view.punchYaw * DEG, this.camRoll, 'YXZ');

      const def = view.weapon.def;
      const target = view.alive && def.scope && view.scopeLevel > 0 ? def.scope.fov[view.scopeLevel - 1] : BASE_FOV;
      this.fov += (target - this.fov) * Math.min(1, dt * 16);
      if (Math.abs(this.fov - this.camera.fov) > 0.01) {
        this.camera.fov = this.fov;
        this.camera.updateProjectionMatrix();
      }
      this.viewModel.update(dt, sim.t, view, this.mouseDX, this.mouseDY);
      showVM = view.alive && view.scopeLevel === 0;
    }
    this.mouseDX = 0;
    this.mouseDY = 0;

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (showVM) {
      this.renderer.clearDepth();
      this.renderer.render(this.viewModel.scene, this.viewModel.camera);
    }
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
