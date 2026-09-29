// 演员：对 Voxel Kit Figure 的薄封装——只负责“换脸/换衣/摆姿态/定位”，不改骨架与比例。
import * as THREE from "three";
import { createFigure, applyPose, type Figure, type Pose, type Skin } from "@agentbench/voxel-kit";
import { bodySkin, type Expr, type Look } from "./faces";

export class Actor {
  readonly figure: Figure;
  readonly root: THREE.Group;
  private expr: Expr | null = null;
  private readonly bodies = new Map<Expr, Skin>();
  private clothesKey = "";

  constructor(
    readonly name: string,
    readonly look: Look,
    opts: { heightM?: number; arm?: "classic" | "slim"; clothes?: Skin | null; castShadow?: boolean; expr?: Expr } = {},
  ) {
    this.arm = opts.arm ?? "classic";
    const first = this.body(opts.expr ?? "neutral");
    this.expr = opts.expr ?? "neutral";
    this.figure = createFigure({
      body: first.texture,
      clothes: opts.clothes ? opts.clothes.texture : null,
      heightM: opts.heightM ?? 1.8,
      arm: this.arm,
      castShadow: opts.castShadow ?? true,
    });
    this.root = this.figure.root;
    this.root.name = `actor:${name}`;
  }
  private readonly arm: "classic" | "slim";

  private body(e: Expr): Skin {
    let s = this.bodies.get(e);
    if (!s) {
      s = bodySkin(this.look, e, this.arm);
      this.bodies.set(e, s);
    }
    return s;
  }

  setExpr(e: Expr): void {
    if (this.expr === e) return;
    this.expr = e;
    this.figure.setBody(this.body(e).texture);
  }

  setClothes(skin: Skin | null, key = ""): void {
    const k = skin ? key || String(skin.texture.id) : "none";
    if (k === this.clothesKey) return;
    this.clothesKey = k;
    this.figure.setClothes(skin ? skin.texture : null);
  }

  place(x: number, y: number, z: number, heading = 0): this {
    this.root.position.set(x, y, z);
    this.root.rotation.set(0, heading, 0);
    return this;
  }

  pose(p: Pose): this {
    applyPose(this.figure, p);
    return this;
  }

  show(v: boolean): this {
    this.root.visible = v;
    return this;
  }

  /** 让所有网格接受/投射阴影 */
  shadows(cast: boolean, receive = cast): this {
    for (const m of Object.values(this.figure.parts)) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
    for (const m of Object.values(this.figure.clothing)) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
    return this;
  }

  dispose(): void {
    this.figure.dispose();
  }
}

/** 规律眨眼：在基础表情为睁眼类时，按确定性的时间点切到 blink */
export function blinkAt(t: number, seed = 0, period = 3.6): boolean {
  const k = Math.floor((t + seed * 1.37) / period);
  const phase = (t + seed * 1.37) - k * period;
  const start = 0.6 + ((k * 7919 + seed * 31) % 100) / 100 * (period - 1.4);
  return phase > start && phase < start + 0.13;
}
