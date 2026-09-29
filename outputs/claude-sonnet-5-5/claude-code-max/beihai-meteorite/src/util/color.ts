// 颜色工具：体素几何用 0xRRGGBB 整数着色，这里提供混合/明暗/抖动。
import { hash3 } from "./math";

export const R = (c: number): number => (c >> 16) & 255;
export const G = (c: number): number => (c >> 8) & 255;
export const B = (c: number): number => c & 255;
export const rgb = (r: number, g: number, b: number): number =>
  ((Math.max(0, Math.min(255, Math.round(r))) << 16) |
    (Math.max(0, Math.min(255, Math.round(g))) << 8) |
    Math.max(0, Math.min(255, Math.round(b)))) >>>
  0;

export function mix(a: number, b: number, t: number): number {
  return rgb(R(a) + (R(b) - R(a)) * t, G(a) + (G(b) - G(a)) * t, B(a) + (B(b) - B(a)) * t);
}
/** 乘性明暗：k>1 更亮 */
export function shade(c: number, k: number): number {
  return rgb(R(c) * k, G(c) * k, B(c) * k);
}
/** 每个体素的确定性明暗抖动，形成手绘“像素纹理”感 */
export function jitter(c: number, amount: number, x: number, y: number, z: number, seed = 0): number {
  const h = hash3(x + seed * 131, y + seed * 17, z + seed * 71) * 2 - 1;
  return shade(c, 1 + h * amount);
}
export function css(c: number): string {
  return "#" + c.toString(16).padStart(6, "0");
}
export function hexToCss(c: number): string {
  return css(c);
}
