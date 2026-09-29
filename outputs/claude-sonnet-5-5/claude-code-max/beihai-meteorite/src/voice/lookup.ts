// 语音清单的只读查询：让口型（张嘴/闭嘴）与字幕使用同一份时间数据。
import { voiceCues } from "./voiceCues";

/**
 * 说话者在时刻 t 是否正在“对口型”说话（仅 dialogue/radio/chatter；内心独白与旁白闭嘴）。
 * 返回 0 或 1；在说话区间内以约 5.5Hz 开合，避免呆板。
 */
export function mouthOpen(speaker: string, t: number, kinds: string[] = ["dialogue", "radio", "chatter", "broadcast"]): boolean {
  for (const c of voiceCues) {
    if (c.speaker !== speaker) continue;
    if (!kinds.includes(c.kind)) continue;
    if (t >= c.start + 0.08 && t < c.end - 0.05) {
      const ph = t * 5.7 + c.start * 3.1;
      return Math.sin(ph * 6.283) > -0.25 && Math.sin(ph * 2.1) > -0.6;
    }
  }
  return false;
}

/** 是否处在某说话者的任意一条（含内心独白）语音区间内 */
export function isVoicing(speaker: string, t: number): boolean {
  return voiceCues.some((c) => c.speaker === speaker && t >= c.start && t < c.end);
}
