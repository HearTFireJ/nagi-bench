// 声音总监的“提示单”：把全部音效 cue 按用途汇总，方便检查空档、重叠与分组。
// 用法： bun run --preload ./scripts/ogg-plugin.ts scripts/cue-sheet.ts [--beds] [--from 0 --to 352]
import { soundCues } from "../src/sound/cues";
import { voiceCues } from "../src/voice/voiceCues";

const a = process.argv.slice(2);
const beds = a.includes("--beds");
const from = a.includes("--from") ? Number(a[a.indexOf("--from") + 1]) : 0;
const to = a.includes("--to") ? Number(a[a.indexOf("--to") + 1]) : 1e9;

console.log(`音效 cue ${soundCues.length} 条，语音 cue ${voiceCues.length} 条`);
const byGroup = new Map<string, number>();
const bySound = new Map<string, number>();
for (const c of soundCues) {
  byGroup.set(c.group ?? "sfx", (byGroup.get(c.group ?? "sfx") ?? 0) + 1);
  bySound.set(c.sound, (bySound.get(c.sound) ?? 0) + 1);
}
console.log("分组：", [...byGroup.entries()].map(([k, v]) => `${k}:${v}`).join("  "));
console.log("最常用：", [...bySound.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, v]) => `${k}×${v}`).join("  "));

if (beds) {
  console.log("\n— 持续型（sustain）声床 —");
  for (const c of soundCues.filter((x) => x.sustain).sort((x, y) => x.start - y.start)) {
    if (c.end < from || c.start > to) continue;
    console.log(`${c.start.toFixed(1).padStart(6)} → ${c.end.toFixed(1).padStart(6)}  ${(c.group ?? "sfx").padEnd(6)} ${c.sound.padEnd(14)} gain ${String(c.gain ?? 1).padEnd(4)} ${c.payload ? JSON.stringify(c.payload) : ""}`);
  }
}

// 每 4 秒一格：同时活跃的 cue 数量与主要声音（快速看出静默段 / 拥挤段）
console.log("\n— 每 4 秒的声音密度（一次性事件数 | 活跃声床）—");
for (let t = Math.max(0, from); t < Math.min(352, to); t += 4) {
  const ev = soundCues.filter((c) => !c.sustain && c.start >= t && c.start < t + 4);
  const bd = soundCues.filter((c) => c.sustain && c.start < t + 4 && c.end > t);
  const v = voiceCues.filter((c) => c.start < t + 4 && c.end > t);
  const names = [...new Set(bd.map((c) => c.sound))].join(",");
  console.log(`${String(t).padStart(4)}s  事件 ${String(ev.length).padStart(2)}  ${"█".repeat(Math.min(30, ev.length))}`.padEnd(48) + ` 声床: ${names || "—（静）"}${v.length ? "   ▸语音: " + v.map((x) => x.speaker).join("/") : ""}`);
}
