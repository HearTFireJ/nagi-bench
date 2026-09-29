// 确定性自检：同一个时刻，无论是“升序访问”、“降序访问”还是“随机跳转后再访问”，渲染出来的画面必须逐像素一致。
// （这是“任意 seek 与正常播放一致”的直接证据：世界状态只是时间的纯函数。）
import "./fakedom";
import { SoftRenderer } from "./softrender";
import { buildFilm } from "../src/film/build";

const argv = process.argv.slice(2);
const opt = (k: string, d: number): number => (argv.includes(k) ? Number(argv[argv.indexOf(k) + 1]) : d);
const W = opt("--w", 192);
const H = Math.round(W / 2.35);
const r = new SoftRenderer({ width: W, height: H });
const film = buildFilm();

const times: number[] = [];
const STEP = opt("--step", 11.3);
for (let t = opt("--from", 3); t < opt("--to", 350); t += STEP) times.push(Math.round(t * 100) / 100);

function grab(t: number): Uint8Array {
  film.player.seek(t);
  film.renderFrame(r);
  return new Uint8Array(r.toRGB8());
}
const same = (a: Uint8Array, b: Uint8Array): number => {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
};

// 预热：把每个世界都渲染一遍（首次渲染时的惰性初始化不属于“状态依赖”，真实应用里预热阶段也会先完成）
for (const t of times) grab(t);
const asc = new Map<number, Uint8Array>();
for (const t of times) asc.set(t, grab(t));
const desc = new Map<number, Uint8Array>();
for (const t of [...times].reverse()) desc.set(t, grab(t));
// 打乱访问顺序（确定性的洗牌），且每次访问前先跳到一个“干扰”时刻
const shuffled = [...times].sort((a, b) => ((a * 7919) % 101) - ((b * 7919) % 101));
const rnd = new Map<number, Uint8Array>();
for (const t of shuffled) {
  grab((t * 1.7) % 340);
  rnd.set(t, grab(t));
}

let bad = 0;
for (const t of times) {
  const d1 = same(asc.get(t)!, desc.get(t)!);
  const d2 = same(asc.get(t)!, rnd.get(t)!);
  if (d1 || d2) {
    bad++;
    console.log(`  !! t=${t}: 升序/降序差异像素分量 ${d1}，升序/乱序 ${d2}`);
  }
}
console.log(`检查 ${times.length} 个时刻，不一致 ${bad}`);
process.exit(bad === 0 ? 0 : 1);
