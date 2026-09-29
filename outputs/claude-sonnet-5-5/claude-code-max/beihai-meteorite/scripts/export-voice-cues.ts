// 导出语音清单（供后期按 id 逐条配音）：voice-cues.json。清单唯一来源是 src/voice/voiceCues.ts。
import fs from "node:fs";
import { voiceCues } from "../src/voice/voiceCues";

fs.writeFileSync("voice-cues.json", JSON.stringify(voiceCues, null, 2) + "\n", "utf-8");
console.log(`voice-cues.json: ${voiceCues.length} cues`);
