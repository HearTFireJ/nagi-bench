import * as THREE from "three";

/** 屏内叠层状态（全部在 WebGL 画布内合成，保证任何截图/取帧方式都能看到） */
export interface OverlayState {
  /** 黑场 0..1 */
  fade: number;
  /** 白闪 0..1 */
  flash: number;
  flashColor: number;
  /** 暗角强度 0..1 */
  vignette: number;
  /** 胶片颗粒 0..1 */
  grain: number;
  /** 瞄准镜 0..1（1 = 圆形视野 + 十字线） */
  scope: number;
  /** 瞄准镜圆的直径占画面高度的比例 */
  scopeSize: number;
  /** 是否绘制十字线（显微镜视野只要圆形遮罩） */
  reticle: number;
  /** 瞄准镜内的 HUD 文本 */
  hud: string;
  /** 调色叠色 */
  tint: number;
  tintOpacity: number;
  /** 十字线轻微晃动 */
  reticleX: number;
  reticleY: number;
}

export function defaultOverlay(): OverlayState {
  return {
    fade: 0, flash: 0, flashColor: 0xffffff, vignette: 0.5, grain: 0.5,
    scope: 0, scopeSize: 0.94, reticle: 1, hud: "", tint: 0x000000, tintOpacity: 0, reticleX: 0, reticleY: 0,
  };
}

/** 一个“世界”：一个前景场景 + 可选的天穹场景（无视差，只随相机朝向旋转） */
export interface World {
  id: string;
  scene: THREE.Scene;
  bg?: THREE.Scene;
  clearColor: number;
  /** 进入该世界时（shot.enter）调用，可选 */
  enter?(): void;
  /** 每次渲染前调用（例如让“补光灯”跟随相机） */
  beforeRender?(camera: THREE.Camera): void;
}

export interface FilmContext {
  camera: THREE.PerspectiveCamera;
  bgCamera: THREE.PerspectiveCamera;
  world: World | null;
  exposure: number;
  overlay: OverlayState;
  /** 画幅宽高比（固定 2.35:1，由外层容器保证） */
  aspect: number;
}

/** WebGLRenderer 与预览用 SoftRenderer 共同满足的最小接口 */
export interface FilmRenderer {
  toneMappingExposure: number;
  setClearColor(color: THREE.ColorRepresentation, alpha?: number): void;
  clear(): void;
  clearDepth(): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
}
