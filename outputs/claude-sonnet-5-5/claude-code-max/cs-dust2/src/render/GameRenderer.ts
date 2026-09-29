// three.js rendering of a World: level meshes, characters, props, effects, the player camera (with scope zoom, view
// punch and shake) and the first-person view model pass. It reads simulation state and never writes to it.
import * as THREE from 'three';
import { clamp, damp, lerp, yawTo } from '../core/math';
import { activeWeaponId } from '../game/actor';
import { SIM_DT } from '../game/config';
import type { Actor } from '../game/types';
import type { GameEvent } from '../game/events';
import type { Level } from '../game/level';
import { getWeapon } from '../game/weapons';
import type { World } from '../game/world';
import { CharacterView } from './characterModel';
import { Effects } from './effects';
import { WorldProps } from './props';
import { addSceneLights } from './shared';
import { StaticWorld } from './staticWorld';
import { ViewModel } from './viewmodel';

export const BASE_FOV = 75;

export interface ViewSpec {
  /** Actor whose eyes we look through. */
  actorId: number;
  /** 'orbit' = slow fly-over of the whole map (menu backdrop). */
  mode: 'first' | 'orbit';
}

const EYE = 1.62;

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 400);
  private readonly container: HTMLElement;
  private readonly staticWorld: StaticWorld;
  private readonly effects = new Effects();
  private readonly props = new WorldProps();
  private readonly viewModel = new ViewModel();
  private readonly characters = new Map<number, CharacterView>();
  private readonly resizeObserver: ResizeObserver;
  private world: World | null = null;
  private unsubscribe: (() => void) | null = null;
  private fov = BASE_FOV;
  private shake = 0;
  private orbitAngle = 0;
  private deathYaw = 0;
  private lastViewId = -1;
  private readonly shotCounters = new Map<number, number>();
  private readonly tmpMuzzle = new THREE.Vector3();
  private now = 0;
  private disposed = false;

  constructor(container: HTMLElement, level: Level) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.autoClear = false;
    const el = this.renderer.domElement;
    el.style.display = 'block';
    el.style.width = '100%';
    el.style.height = '100%';
    container.appendChild(el);

    this.scene.background = new THREE.Color(0xa9c8e6);
    this.scene.fog = new THREE.Fog(0xcdd8de, 90, 320);
    addSceneLights(this.scene);
    this.camera.rotation.order = 'YXZ';

    // Ground below the level so nothing but geometry is ever seen through gaps.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: 0x8b7a58 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(54, -3.05, 52);
    this.scene.add(ground);

    this.staticWorld = new StaticWorld(level);
    this.scene.add(this.staticWorld.group);
    this.scene.add(this.props.group);
    this.scene.add(this.effects.group);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewModel.setAspect(w / h);
  }

  /** Current vertical FOV (degrees): input code uses it to scale mouse sensitivity while scoped. */
  get currentFov(): number {
    return this.fov;
  }

  /** Bind to a (new) simulation. Rebuilds character views and event subscriptions. */
  setWorld(world: World | null): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const c of this.characters.values()) {
      this.scene.remove(c.root);
      c.dispose();
    }
    this.characters.clear();
    this.shotCounters.clear();
    this.world = world;
    this.effects.clearDecals();
    if (!world) return;
    for (const a of world.actors) {
      const view = new CharacterView(a.team);
      this.characters.set(a.id, view);
      this.scene.add(view.root);
    }
    this.unsubscribe = world.events.on((e) => this.onEvent(e));
  }

  private onEvent(e: GameEvent): void {
    const w = this.world;
    if (!w) return;
    switch (e.type) {
      case 'shot': {
        const view = this.characters.get(e.actorId);
        if (view) view.flash(w.time);
        if (e.actorId === this.lastViewId) this.viewModel.triggerFlash(w.time);
        if (e.weapon !== 'knife') {
          const n = (this.shotCounters.get(e.actorId) ?? 0) + 1;
          this.shotCounters.set(e.actorId, n);
          // Every second bullet of an automatic weapon gets a tracer (like CS), every shot of the AWP.
          if (e.weapon === 'awp' || n % 2 === 0) {
            // Other players' tracers start at the real muzzle of their (third-person) weapon model; the viewer's own
            // start at the simulation's eye-relative muzzle, which lines up with the first-person view model.
            const m = e.actorId !== this.lastViewId && view ? view.muzzlePosition(this.tmpMuzzle) : null;
            this.effects.tracer(m ? { x: m.x, y: m.y, z: m.z } : e.muzzle, e.end);
          }
        }
        if (e.hit === 'world') this.effects.impact(e.end, e.normal, false);
        break;
      }
      case 'hit': {
        const attacker = w.actors[e.attackerId];
        const victim = w.actors[e.victimId];
        const dx = victim.pos.x - attacker.pos.x;
        const dz = victim.pos.z - attacker.pos.z;
        const l = Math.hypot(dx, dz) || 1;
        this.effects.bloodSplat(e.point, { x: dx / l, y: 0.2, z: dz / l }, e.zone === 'head');
        if (e.victimId === this.lastViewId) this.shake = Math.min(1, this.shake + 0.06 + e.damage * 0.004);
        break;
      }
      case 'bombExploded': {
        this.effects.explosion(e.pos);
        const v = w.actors[this.lastViewId];
        const d = v ? Math.hypot(v.pos.x - e.pos.x, v.pos.z - e.pos.z) : 100;
        this.shake = Math.max(this.shake, clamp(1.2 - d / 40, 0.1, 1.2));
        break;
      }
      case 'bombBeep':
        this.props.beep(w.time);
        break;
      case 'roundStart':
        this.effects.clearDecals();
        break;
      default:
        break;
    }
  }

  /**
   * Update all visuals from the simulation. `alpha` is the fraction of the next fixed step already elapsed (used to
   * interpolate positions); `dt` is the real frame time.
   */
  update(view: ViewSpec, alpha: number, dt: number): void {
    const w = this.world;
    if (!w || this.disposed) return;
    this.now = w.time;
    this.lastViewId = view.actorId;
    const viewActor = w.actors[view.actorId];

    // ---- characters ----
    for (const a of w.actors) {
      const cv = this.characters.get(a.id);
      if (!cv) continue;
      const px = lerp(a.prevPos.x, a.pos.x, alpha);
      const py = lerp(a.prevPos.y, a.pos.y, alpha);
      const pz = lerp(a.prevPos.z, a.pos.z, alpha);
      const hide = view.mode === 'first' && a.id === view.actorId && a.alive;
      cv.update(a, px, py, pz, w.time, dt, hide);
    }

    this.staticWorld.update();
    this.props.update(w, w.time);
    this.effects.update(dt);

    // ---- camera ----
    if (view.mode === 'orbit' || !viewActor) this.updateOrbitCamera(dt);
    else this.updateFirstPersonCamera(viewActor, alpha, dt);
    this.shake = Math.max(0, this.shake - dt * 1.6);

    // ---- view model ----
    const scoped = !!viewActor && viewActor.scopeLevel > 0 && getWeapon(activeWeaponId(viewActor)).scope !== undefined;
    const showVm = view.mode === 'first' && !!viewActor && viewActor.alive && !scoped;
    // Sub-step render time keeps recoil / reload animations smooth on high refresh-rate displays.
    this.viewModel.update(viewActor ?? null, w.time + alpha * SIM_DT, dt, showVm);
  }

  private updateOrbitCamera(dt: number): void {
    this.orbitAngle += dt * 0.06;
    const cx = 54;
    const cz = 52;
    const r = 78;
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(cx + Math.cos(this.orbitAngle) * r, 58, cz + Math.sin(this.orbitAngle) * r);
    this.camera.lookAt(cx, 0, cz);
    this.fov = 62;
  }

  private updateFirstPersonCamera(a: Actor, alpha: number, dt: number): void {
    const w = this.world as World;
    const px = lerp(a.prevPos.x, a.pos.x, alpha);
    const py = lerp(a.prevPos.y, a.pos.y, alpha);
    const pz = lerp(a.prevPos.z, a.pos.z, alpha);

    let yaw = a.yaw + a.punchYaw;
    let pitch = a.pitch + a.punchPitch;
    let roll = 0;
    let eye = EYE;

    if (!a.alive) {
      // Death cam: sink to the floor, turn toward whoever hurt us last, roll over a little.
      const t = clamp((w.time - a.diedAt) / 0.5, 0, 1);
      eye = lerp(EYE, 0.35, t);
      roll = 0.5 * t;
      const killer = w.actors[a.lastHurtFrom];
      if (killer) {
        const target = yawTo(a.pos.x, a.pos.z, killer.pos.x, killer.pos.z);
        let d = target - this.deathYaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.deathYaw += d * Math.min(1, dt * 3);
        yaw = this.deathYaw;
      }
      pitch = lerp(pitch, -0.15, t);
    } else {
      this.deathYaw = yaw;
    }

    // Scope zoom (smoothly).
    const def = getWeapon(activeWeaponId(a));
    let targetFov = BASE_FOV;
    if (def.scope && a.scopeLevel > 0 && a.alive) targetFov = def.scope.fov[a.scopeLevel - 1];
    this.fov = damp(this.fov, targetFov, 22, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // Landing / strafe camera feel and shake.
    const s = this.shake;
    const sx = s > 0 ? (Math.random() - 0.5) * 0.06 * s : 0;
    const sy = s > 0 ? (Math.random() - 0.5) * 0.06 * s : 0;
    this.camera.position.set(px + sx, py + eye + sy, pz);
    this.camera.rotation.set(pitch + (s > 0 ? (Math.random() - 0.5) * 0.03 * s : 0), yaw, roll);
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.viewModel.scene, this.viewModel.camera);
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.unsubscribe?.();
    for (const c of this.characters.values()) c.dispose();
    this.characters.clear();
    this.staticWorld.dispose();
    this.effects.dispose();
    this.props.dispose();
    this.viewModel.dispose();
    this.renderer.dispose();
    const el = this.renderer.domElement;
    if (el.parentElement) el.parentElement.removeChild(el);
  }
}
