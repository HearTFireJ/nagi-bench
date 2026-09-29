import * as THREE from "three";
import type { FilmContext, FilmRenderer } from "./types";
import type { Overlay } from "./overlay";

const tmpQ = new THREE.Quaternion();

/**
 * 三段式渲染：
 *  1. 天穹通道（行星/太阳/星空）：相机只旋转不平移 → 无限远
 *  2. 前景通道：清深度后绘制，近远比因此可以很宽松
 *  3. 屏内叠层：黑场/白闪/暗角/颗粒/瞄准镜
 */
export function renderFilm(r: FilmRenderer, ctx: FilmContext, overlay: Overlay, frameSeed: number): void {
  const w = ctx.world;
  r.toneMappingExposure = ctx.exposure;
  r.setClearColor(w ? w.clearColor : 0x000000, 1);
  r.clear();
  if (w) {
    w.beforeRender?.(ctx.camera);
    if (w.bg) {
      const bc = ctx.bgCamera;
      bc.fov = ctx.camera.fov;
      bc.aspect = ctx.camera.aspect;
      bc.near = 1;
      bc.far = 200000;
      bc.updateProjectionMatrix();
      bc.position.set(0, 0, 0);
      ctx.camera.updateMatrixWorld(true);
      ctx.camera.getWorldQuaternion(tmpQ);
      bc.quaternion.copy(tmpQ);
      bc.updateMatrixWorld(true);
      r.render(w.bg, bc);
      r.clearDepth();
    }
    r.render(w.scene, ctx.camera);
  }
  r.toneMappingExposure = 1;
  overlay.update(ctx.overlay, ctx.camera.aspect, frameSeed);
  overlay.render(r);
}
