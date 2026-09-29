// 读取 OGG(Vorbis/Opus) 头部，输出时长/声道/采样率/体积，用于挑选音效
import fs from "node:fs";
import path from "node:path";

const root = "/opt/agentbench/sfx";
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ["sci-fi", "impact", "ui"];

function meta(file) {
  const b = fs.readFileSync(file);
  // 第一页：找 "\x01vorbis" 或 "OpusHead"
  let rate = 0, ch = 0, codec = "?";
  const vi = b.indexOf(Buffer.from("\x01vorbis", "latin1"));
  if (vi >= 0) {
    codec = "vorbis";
    ch = b[vi + 11];
    rate = b.readUInt32LE(vi + 12);
  } else {
    const oi = b.indexOf(Buffer.from("OpusHead", "latin1"));
    if (oi >= 0) {
      codec = "opus";
      ch = b[oi + 9];
      rate = 48000;
    }
  }
  // 最后一页的 granule position
  let last = b.lastIndexOf(Buffer.from("OggS", "latin1"));
  let gran = 0n;
  if (last >= 0) gran = b.readBigUInt64LE(last + 6);
  const dur = rate ? Number(gran) / rate : 0;
  return { size: b.length, dur, ch, rate, codec };
}

for (const d of dirs) {
  const dir = path.join(root, d);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ogg")).sort();
  for (const f of files) {
    const m = meta(path.join(dir, f));
    console.log(`${d}/${f}`.padEnd(46), `${(m.size / 1024).toFixed(1).padStart(6)}KB`, `${m.dur.toFixed(2).padStart(6)}s`, `${m.ch}ch`, m.rate, m.codec);
  }
}
