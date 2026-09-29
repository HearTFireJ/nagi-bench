import * as THREE from 'three';
import type { Game } from '../core/game/game.ts';
import type { GameEvent } from '../core/game/events.ts';
import { DEG, clamp, lerp } from '../core/math.ts';
import { eyeHeight } from '../core/physics/movement.ts';
import { CharacterModel } from './characterModel.ts';
import { BombModel, Effects } from './effects.ts';
import { disposeGeoCache } from './geo.ts';
import { MapMesh } from './mapMesh.ts';
import { skyTexture } from './textures.ts';
import { ViewModel } from './viewModel.ts';

export const BASE_FOV = 72;

export interface ViewInfo {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  fov: number;
}

/**
 * Owns the three.js objects and mirrors the (renderer-agnostic) simulation into them each
 * frame: level, characters, camera, first-person weapon, effects. Never mutates the game.
 */
export class GameRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 520);
  private map: MapMesh;
  private sky: THREE.Mesh;
  private skyTex: THREE.Texture;
  private models = new Map<number, CharacterModel>();
  private view = new ViewModel();
  private effects = new Effects();
  private bomb = new BombModel();
  private game: Game;
  private fov = BASE_FOV;
  private smoothY = 0;
  private hasSmooth = false;
  private bobPhase = 0;
  private tmp = new THREE.Vector3();
  readonly viewInfo: ViewInfo = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: BASE_FOV };

  constructor(canvas: HTMLCanvasElement, game: Game) {
    this.game = game;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.autoClear = false;
    this.camera.rotation.order = 'YXZ';

    this.scene.fog = new THREE.Fog(0xd8cdb0, 90, 330);
    this.scene.background = new THREE.Color(0xd8cdb0);

    this.skyTex = skyTexture();
    const skyMat = new THREE.MeshBasicMaterial({ map: this.skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), skyMat);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    this.map = new MapMesh(game.world);
    this.scene.add(this.map.group);
    this.scene.add(this.effects.group);
    this.scene.add(this.bomb.group);

    for (const ch of game.chars) {
      const m = new CharacterModel(ch.team);
      this.models.set(ch.id, m);
      this.scene.add(m.holder);
    }
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.view.resize(this.camera.aspect);
  }

  /** Turn simulation events into visuals. */
  handleEvents(events: GameEvent[]): void {
    const g = this.game;
    const vc = g.viewChar;
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          const model = this.models.get(e.shooter);
          model?.kick(g.time);
          const mine = vc !== null && e.shooter === vc.id && vc.alive;
          if (mine) {
            this.view.onShot(g.time);
            // origin: slightly right / below the camera, where the viewmodel muzzle is
            const cam = this.camera;
            this.tmp.set(0.14, -0.1, -0.7).applyQuaternion(cam.quaternion).add(cam.position);
            this.effects.tracer(this.tmp.x, this.tmp.y, this.tmp.z, e.ex, e.ey, e.ez);
          } else if (model) {
            model.getMuzzleWorld(this.tmp);
            this.effects.tracer(this.tmp.x, this.tmp.y, this.tmp.z, e.ex, e.ey, e.ez);
            this.effects.muzzleFlash(this.tmp.x, this.tmp.y, this.tmp.z);
          }
          if (e.hit === 'world') this.effects.impact(e.ex, e.ey, e.ez, e.nx, e.ny, e.nz);
          break;
        }
        case 'hit': {
          const a = e.attacker >= 0 ? g.chars[e.attacker] : null;
          let dx = 0;
          let dy = 0;
          let dz = 1;
          if (a) {
            dx = e.x - a.pos.x;
            dy = e.y - a.eyeY;
            dz = e.z - a.pos.z;
            const l = Math.hypot(dx, dy, dz) || 1;
            dx /= l;
            dy /= l;
            dz /= l;
          }
          this.effects.blood(e.x, e.y, e.z, dx, dy, dz);
          break;
        }
        case 'melee': {
          this.models.get(e.id)?.kick(g.time);
          if (vc && e.id === vc.id) this.view.onMelee(e.kind, g.time);
          break;
        }
        case 'exploded':
          this.effects.explosion(e.x, e.y, e.z);
          break;
        case 'bombBeep':
          this.bomb.beep();
          break;
        case 'roundStart':
          this.effects.clearAll();
          this.hasSmooth = false;
          break;
        default:
          break;
      }
    }
  }

  /** Draw one frame. `alpha` = interpolation position inside the current sim tick. */
  render(dt: number, alpha: number): void {
    const g = this.game;
    const vc = g.viewChar;

    this.map.update();
    for (const ch of g.chars) {
      const m = this.models.get(ch.id);
      if (m) m.update(ch, alpha, dt, g.time, vc !== null && ch.id === vc.id && vc.alive);
    }
    this.bomb.update(g.bomb, dt);

    if (vc) this.updateCamera(vc, dt, alpha);

    this.sky.position.copy(this.camera.position);
    this.effects.update(dt, this.camera);

    // main pass
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // weapon pass on top (own camera, depth cleared so it never pokes through walls)
    const showView = !!vc && vc.alive && vc.scope === 0;
    if (vc) this.view.update(dt, vc, g.time);
    this.view.setVisible(showView);
    if (showView) {
      this.renderer.clearDepth();
      this.renderer.render(this.view.scene, this.view.camera);
    }
  }

  private updateCamera(vc: NonNullable<Game['human']>, dt: number, alpha: number): void {
    const x = lerp(vc.prevPos.x, vc.pos.x, alpha);
    const y = lerp(vc.prevPos.y, vc.pos.y, alpha);
    const z = lerp(vc.prevPos.z, vc.pos.z, alpha);
    const target = y + eyeHeight(vc);
    if (!this.hasSmooth || Math.abs(target - this.smoothY) > 1.8) {
      this.smoothY = target;
      this.hasSmooth = true;
    } else {
      // soften stair-step / landing jolts without lagging the aim
      this.smoothY += (target - this.smoothY) * Math.min(1, dt * 22);
    }
    let cy = this.smoothY;

    // tiny head bob while moving on the ground
    const sp = clamp(vc.speed2D / 5.5, 0, 1);
    if (vc.onGround) this.bobPhase += dt * (5 + sp * 6);
    cy += Math.sin(this.bobPhase * 2) * 0.012 * sp;

    let cx = x;
    let cz = z;
    if (this.effects.shake > 0) {
      const s = this.effects.shake * 0.12;
      cx += (Math.random() - 0.5) * s;
      cy += (Math.random() - 0.5) * s;
      cz += (Math.random() - 0.5) * s;
    }
    this.camera.position.set(cx, cy, cz);

    const yaw = vc.yaw + vc.punchYaw * DEG;
    const pitch = vc.pitch + vc.punchPitch * DEG;
    this.camera.rotation.set(pitch, yaw, 0);

    const scope = vc.weapon.def.scope;
    const targetFov = scope && vc.scope > 0 ? scope.fovs[Math.min(scope.fovs.length, vc.scope) - 1] : BASE_FOV;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 16);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    const v = this.viewInfo;
    v.x = cx;
    v.y = cy;
    v.z = cz;
    v.yaw = yaw;
    v.pitch = pitch;
    v.fov = this.fov;
  }

  get whiteout(): number {
    return this.effects.whiteout;
  }

  dispose(): void {
    this.map.dispose();
    this.effects.dispose();
    this.bomb.dispose();
    this.view.dispose();
    for (const m of this.models.values()) m.dispose();
    this.skyTex.dispose();
    disposeGeoCache();
    this.renderer.dispose();
  }
}
