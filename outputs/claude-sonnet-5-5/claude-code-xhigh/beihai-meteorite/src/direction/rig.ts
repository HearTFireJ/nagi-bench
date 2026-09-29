import * as THREE from "three";
import type { V3 } from "../util/math";

/**
 * One fixed light kit (1 hemisphere, 1 shadow-casting sun, 1 shadow-casting spot,
 * 3 points) that every shot re-aims and re-colours. The light *count* never changes,
 * so cutting between sets never recompiles a shader.
 */
export interface LightPreset {
  bg: number;
  exposure?: number;
  fog?: { color: number; density: number };
  hemi?: [sky: number, ground: number, intensity: number];
  sun?: { color: number; intensity: number; from: V3; to: V3; box?: number };
  spot?: { color: number; intensity: number; pos: V3; target: V3; angle?: number; penumbra?: number; distance?: number; decay?: number };
  points?: Array<{ color: number; intensity: number; pos: V3; distance?: number; decay?: number } | null>;
}

export class Rig {
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0);
  readonly sun = new THREE.DirectionalLight(0xffffff, 0);
  readonly spot = new THREE.SpotLight(0xffffff, 0, 0, Math.PI / 4, 0.5, 2);
  readonly points = [0, 1, 2].map(() => new THREE.PointLight(0xffffff, 0, 0, 2));
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene, private readonly renderer?: { toneMappingExposure: number }) {
    this.scene = scene;
    scene.fog = new THREE.FogExp2(0x000000, 0);
    scene.background = new THREE.Color(0x000000);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.bias = -0.0006;
    this.spot.shadow.normalBias = 0.02;
    this.spot.shadow.camera.near = 0.3;
    this.spot.shadow.camera.far = 30;
    scene.add(this.hemi, this.sun, this.sun.target, this.spot, this.spot.target, ...this.points);
  }

  apply(p: LightPreset): void {
    (this.scene.background as THREE.Color).set(p.bg);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.set(p.fog?.color ?? p.bg);
    fog.density = p.fog?.density ?? 0;
    if (this.renderer) this.renderer.toneMappingExposure = p.exposure ?? 1;

    if (p.hemi) {
      this.hemi.color.set(p.hemi[0]);
      this.hemi.groundColor.set(p.hemi[1]);
      this.hemi.intensity = p.hemi[2];
    } else this.hemi.intensity = 0;

    if (p.sun) {
      this.sun.color.set(p.sun.color);
      this.sun.intensity = p.sun.intensity;
      this.sun.target.position.set(...p.sun.to);
      this.sun.position.set(...p.sun.from);
      const box = p.sun.box ?? 12;
      const cam = this.sun.shadow.camera;
      if (cam.right !== box) {
        cam.left = -box; cam.right = box; cam.top = box; cam.bottom = -box;
        cam.updateProjectionMatrix();
      }
    } else this.sun.intensity = 0;

    if (p.spot) {
      const s = p.spot;
      this.spot.color.set(s.color);
      this.spot.intensity = s.intensity;
      this.spot.position.set(...s.pos);
      this.spot.target.position.set(...s.target);
      this.spot.angle = s.angle ?? Math.PI / 4;
      this.spot.penumbra = s.penumbra ?? 0.5;
      this.spot.distance = s.distance ?? 0;
      this.spot.decay = s.decay ?? 2;
    } else this.spot.intensity = 0;

    this.points.forEach((light, i) => {
      const d = p.points?.[i];
      if (!d) { light.intensity = 0; return; }
      light.color.set(d.color);
      light.intensity = d.intensity;
      light.position.set(...d.pos);
      light.distance = d.distance ?? 0;
      light.decay = d.decay ?? 2;
    });
  }
}
