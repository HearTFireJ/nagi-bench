// Print the duration (seconds) of OGG Vorbis files: last page granule position / sample rate.
import { readFileSync } from "node:fs";

function duration(path) {
  const buf = readFileSync(path);
  // sample rate: in the Vorbis identification header ("\x01vorbis" + version(4) + channels(1) + rate(4))
  const idx = buf.indexOf(Buffer.from([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]));
  const rate = buf.readUInt32LE(idx + 7 + 4 + 1);
  let last = -1;
  for (let i = buf.length - 14; i >= 0; i--) {
    if (buf[i] === 0x4f && buf[i + 1] === 0x67 && buf[i + 2] === 0x67 && buf[i + 3] === 0x53) {
      last = Number(buf.readBigUInt64LE(i + 6));
      break;
    }
  }
  return last / rate;
}

for (const p of process.argv.slice(2)) console.log(p.split("/").slice(-1)[0], duration(p).toFixed(3));
