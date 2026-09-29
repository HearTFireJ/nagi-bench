// 二分定位“与访问历史有关的画面差异”：对时刻 t，比较“先访问 prevA 再到 t”与“先访问 prevB 再到 t”。
// 逐级隐藏场景子树，找到隐藏后差异消失的那一枝。
// 用法： bun run scripts/debug-determinism.ts <t> <prevA> <prevB>          二分：隐藏哪一枝子树会让差异消失
//        bun run scripts/debug-determinism.ts <t> <prevA> 0 --scan       扫描：先访问哪些时刻会在 t 留下“状态遗留”
import "./fakedom";
import * as THREE from "three";
import { SoftRenderer } from "./softrender";
import { buildFilm } from "../src/film/build";

const [t, prevA, prevB] = process.argv.slice(2).map(Number);
const scan = process.argv.includes("--scan");
const W = 128;
const H = Math.round(W / 2.35);
const r = new SoftRenderer({ width: W, height: H });
const film = buildFilm();

function render(prev: number, hide: THREE.Object3D[]): Uint8Array {
  film.player.seek(prev);
  film.renderFrame(r);
  film.player.seek(t);
  const was = hide.map((o) => o.visible);
  hide.forEach((o) => (o.visible = false));
  film.renderFrame(r);
  const out = new Uint8Array(r.toRGB8());
  hide.forEach((o, i) => (o.visible = was[i]));
  return out;
}
const diff = (a: Uint8Array, b: Uint8Array): number => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};
const measure = (hide: THREE.Object3D[]): number => diff(render(prevA, hide), render(prevB, hide));

if (scan) {
  // 扫描：哪些“更早访问过的时刻”会让 t 的画面与 prevA 路径不一致
  const base = render(prevA, []);
  for (let x = 0; x < 350; x += 7.3) {
    const d = diff(base, render(x, []));
    if (d) console.log(`先访问 ${x.toFixed(1)} 再到 ${t}：与经由 ${prevA} 的画面差异分量 ${d}`);
  }
  process.exit(0);
}
film.player.seek(t);
const root = film.ctx.world!.scene;
console.log(`世界 ${film.ctx.world!.id}；基线差异分量 ${measure([])}`);

function descend(node: THREE.Object3D, depth: number): void {
  for (const c of node.children) {
    if (!c.visible) continue;
    const d = measure([c]);
    const base = measure([]);
    if (d < base) {
      console.log(`${"  ".repeat(depth)}隐藏 ${c.type} "${c.name}" (${c.children.length} 子) → 差异 ${base} → ${d}`);
      if (c.children.length) descend(c, depth + 1);
    }
  }
}
descend(root, 0);
const bg = film.ctx.world!.bg;
if (bg) {
  console.log("— 天穹场景 —");
  descend(bg, 0);
}
