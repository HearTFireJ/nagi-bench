import * as THREE from "three";
import type { V3 } from "./blocks";
import type { Figure } from "@agentbench/voxel-kit";
import type { Bodies } from "./characters";

export type Loc = "space" | "alley" | "house" | "shop" | "basement" | "cabin";

export interface LightCfg {
  bg: number;
  fog?: [number, number, number];
  hemi?: [number, number, number];
  key?: { pos: V3; target: V3; color: number; i: number; size?: number; far?: number; shadow?: boolean };
  spot?: { pos: V3; target: V3; color: number; i: number; angle?: number; penumbra?: number; distance?: number };
  points?: Array<{ pos: V3; color: number; i: number; distance?: number }>;
  exposure?: number;
}

/** A fixed pool of lights, re-aimed per location so shader programs never change mid-film. */
export class Rig {
  hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0);
  key = new THREE.DirectionalLight(0xffffff, 0);
  spot = new THREE.SpotLight(0xffffff, 0, 0, 0.6, 0.5, 2);
  pts = [0, 1, 2, 3].map(() => new THREE.PointLight(0xffffff, 0, 0, 2));
  private bgColor = new THREE.Color();
  private fog = new THREE.Fog(0x000000, 1, 100);

  constructor(private scene: THREE.Scene, private renderer?: { toneMappingExposure: number }) {
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.bias = -0.0005;
    this.spot.shadow.normalBias = 0.02;
    scene.add(this.hemi, this.key, this.key.target, this.spot, this.spot.target, ...this.pts);
  }

  configure(c: LightCfg): void {
    this.bgColor.setHex(c.bg);
    this.scene.background = this.bgColor;
    if (c.fog) {
      this.fog.color.setHex(c.fog[0]);
      this.fog.near = c.fog[1];
      this.fog.far = c.fog[2];
      this.scene.fog = this.fog;
    } else this.scene.fog = null;
    if (this.renderer) this.renderer.toneMappingExposure = c.exposure ?? 1;
    if (c.hemi) {
      this.hemi.color.setHex(c.hemi[0]);
      this.hemi.groundColor.setHex(c.hemi[1]);
      this.hemi.intensity = c.hemi[2];
    } else this.hemi.intensity = 0;
    if (c.key) {
      this.key.color.setHex(c.key.color);
      this.key.intensity = c.key.i;
      this.key.position.set(...c.key.pos);
      this.key.target.position.set(...c.key.target);
      this.key.castShadow = c.key.shadow ?? true;
      const s = c.key.size ?? 12;
      const cam = this.key.shadow.camera;
      if (cam.right !== s) {
        cam.left = -s;
        cam.right = s;
        cam.top = s;
        cam.bottom = -s;
        cam.near = 0.5;
        cam.far = c.key.far ?? 80;
        cam.updateProjectionMatrix();
      }
      this.key.updateMatrixWorld();
      this.key.target.updateMatrixWorld();
    } else {
      this.key.intensity = 0;
      this.key.castShadow = false;
    }
    if (c.spot) {
      this.spot.castShadow = true;
      this.spot.color.setHex(c.spot.color);
      this.spot.intensity = c.spot.i;
      this.spot.position.set(...c.spot.pos);
      this.spot.target.position.set(...c.spot.target);
      this.spot.angle = c.spot.angle ?? 0.6;
      this.spot.penumbra = c.spot.penumbra ?? 0.5;
      this.spot.distance = c.spot.distance ?? 0;
      this.spot.updateMatrixWorld();
      this.spot.target.updateMatrixWorld();
    } else {
      this.spot.intensity = 0;
      this.spot.castShadow = false;
    }
    this.pts.forEach((p, i) => {
      const cfg = c.points?.[i];
      if (cfg) {
        p.color.setHex(cfg.color);
        p.intensity = cfg.i;
        p.position.set(...cfg.pos);
        p.distance = cfg.distance ?? 0;
      } else p.intensity = 0;
    });
  }
}

export interface Actor {
  fig: Figure;
  bodies: Bodies;
  name: string;
  mood: import("./characters").Mood;
}

export interface SceneSet {
  group: THREE.Group;
}
