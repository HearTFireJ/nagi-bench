// 全片音效 cue（SoundCue[]）——声音总监的工作表。
//
// 设计原则
//  · 采样是主体（脚步、门、撞击、开关、机械、枪），程序化只做强化：呼吸、心跳、无线电、混响、耳鸣、嗡鸣。
//  · 空气里有声音，真空里没有：太空段没有任何“外部枪声/推进器声”——只有
//      ① 头盔里的呼吸与心跳（主观声音），② 骨传导：手臂与头骨里的闷响，③ 无线电里传来的人声与静噪。
//  · 地下室的枪声送进混凝土空间的脉冲响应（强反射），随后是耳鸣；房间底噪在枪响的一刻被“抽空”。
//  · 脚步、命中、机床、弹药处理的时间全部取自画面用的同一份数据（路点、schedule、roundTimes）。
//  · 配乐克制：只有一个低沉的持续音和一个反复出现的“钟”（父亲）——出现在开场、照片、结尾。
import type { SoundCue } from "@agentbench/cinematic-player";
import { voiceCues } from "../voice/voiceCues";
import { T, TOTAL } from "../film/timing";
import { SAMPLES } from "./samples";
import { footfalls, absFromTau, type Footfall } from "./events";
import { hash1 } from "../util/math";
import { ALLEY_ZHANG, ZHANG_ROOM, COLLECTOR_SAFE } from "../world/courtyard/world";
import { MK, WS_ZHANG, BM_ZHANG, roundTimes } from "../world/making/world";
import { CABIN_PATH } from "../world/base/base";
import { TURN_PUFFS, ZH_T } from "../world/space/spaceworld";
import { SHOTS, MAG_CHANGES, HIT_PLAN, hitTime, LAST_SHOT_T } from "../world/space/schedule";

const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const cues: SoundCue[] = [];
let counter = 0;

interface Opt {
  gain?: number;
  group?: string;
  sustain?: boolean;
  payload?: Record<string, number>;
}

/** 添加一个 cue。dur 缺省 = 采样原始时长（保证整段播完） */
function add(sound: string, t: number, dur: number | undefined, o: Opt = {}): void {
  const info = SAMPLES[sound];
  const d = dur ?? (info ? info.dur + 0.03 : 0.5);
  const start = r3(Math.max(0, t));
  const end = r3(Math.min(TOTAL, t + d));
  if (end - start < 0.02) return;
  cues.push({
    id: `snd-${String(++counter).padStart(3, "0")}-${sound}`,
    kind: "sound",
    sound,
    group: o.group ?? "sfx",
    gain: o.gain ?? 1,
    sustain: o.sustain,
    payload: o.payload,
    start,
    end,
  });
}

/** 脚步：变体轮换 + 强度/随机微调 */
function steps(list: Footfall[], set: string[], gain: number, group = "foley"): void {
  list.forEach((f, i) => add(set[i % set.length], f.t, undefined, { group, gain: gain * (0.55 + 0.45 * f.amt) * (0.88 + 0.24 * hash1(i * 7 + 3)) }));
}

const CONC = ["fs-conc-0", "fs-conc-1", "fs-conc-2", "fs-conc-3"];
const WOOD = ["fs-wood-0", "fs-wood-1", "fs-wood-2", "fs-wood-3"];
const PLATE = ["fs-plate-0", "fs-plate-1"];

const OPEN0 = 0;
const C0 = T.courtyard;
const M0 = T.making;
const X0 = T.transit;
const S0 = T.space;
const E0 = T.end;

// ===========================================================================
// 序：日落前（0–26 s）——真空。只有头盔里的声音
// ===========================================================================
function opening(): void {
  add("suithum", OPEN0, 26.8, { group: "suit", sustain: true, gain: 0.55, payload: { attack: 1.2, release: 1.0 } });
  add("breath", OPEN0 + 1.0, 24.5, { group: "suit", sustain: true, gain: 0.85, payload: { rate: 11, depth: 0.55, attack: 2.0, release: 1.5 } });
  add("drone", OPEN0 + 2.0, 25.6, { group: "score", sustain: true, gain: 0.7, payload: { f0: 49, attack: 6, release: 2.5 } });
  // “父亲的在天之灵”——第一次响起的钟（全片的记号）
  add("bell-verb", OPEN0 + 11.7, 5.2, { group: "score", gain: 0.5 });
  // 姿态控制小喷：经背包传进头盔的一声闷“嗤”
  for (const [tau] of TURN_PUFFS) if (tau < 0) add("thruster-puff", absFromTau(tau), 0.55, { group: "suit", gain: 0.5 });
}

// ===========================================================================
// 第一幕：胡同与四合院（26–116 s）——空气、木头、瓷、金属
// ===========================================================================
function courtyard(): void {
  // 声音先于画面进入（J-cut）：胡同的傍晚提前 1 秒淡入，盖住太空的静
  add("tone-alley", C0 - 1.0, 14.0, { group: "amb", sustain: true, gain: 0.9, payload: { attack: 1.6, release: 2.0 } });
  add("cricket", C0 + 0.5, 12.5, { group: "amb", sustain: true, gain: 0.7, payload: { level: 0.25, attack: 2, release: 2 } });
  add("tone-room", C0 + 9.5, 80.8, { group: "amb", sustain: true, gain: 0.85, payload: { attack: 2.2, release: 1.6 } });

  // 邻家窗里的旧收音机（vc 广播）：一声“叮”，然后是带噪的窄带声音
  add("radio-ding", C0 + 2.05, 1.5, { group: "radio", gain: 0.4 });
  add("radio-static", C0 + 2.2, 3.9, { group: "radio", sustain: true, gain: 0.6, payload: { lo: 380, hi: 2300, level: 0.5, attack: 0.25, release: 0.5, wob: 1.6 } });

  // 胡同：走向大门、敲门、门开
  steps(footfalls(ALLEY_ZHANG, C0, 0.72), CONC, 0.5);
  add("knock-0", C0 + 7.75, undefined, { gain: 0.85 });
  add("knock-1", C0 + 8.55, undefined, { gain: 0.9 });
  add("metal-l-2", C0 + 9.15, undefined, { gain: 0.3 });
  add("creak", C0 + 9.4, 1.5, { gain: 0.9, payload: { level: 0.3, f0: 82, f1: 124 } });
  add("wood-m-1", C0 + 10.7, undefined, { gain: 0.3 });

  // 正房：脚步（木地板）
  steps(footfalls(ZHANG_ROOM, C0, 0.66), WOOD, 0.5);
  steps(footfalls(COLLECTOR_SAFE, C0, 0.66), WOOD, 0.38);

  // 倒茶：壶盖轻响 → 水声 → 壶落桌 → 递杯，杯与杯托一碰
  add("glass-l-1", C0 + 28.3, undefined, { gain: 0.3 });
  add("pour", C0 + 28.6, 2.7, { gain: 0.75, payload: { level: 0.5, attack: 0.15, release: 0.4 } });
  add("wood-l-2", C0 + 31.25, undefined, { gain: 0.35 });
  add("glass-l-3", C0 + 32.2, undefined, { gain: 0.3 });

  // 保险柜：拨盘的三下“嗒”，柜门一声闷响，门轴一丝金属摩擦；关门
  for (const dt of [52.3, 52.6, 52.9]) add("click-3", C0 + dt, undefined, { gain: 0.35 });
  add("sf-metal-2", C0 + 53.15, undefined, { gain: 0.6 });
  add("creak", C0 + 53.3, 0.9, { gain: 0.6, payload: { level: 0.2, f0: 120, f1: 190 } });
  add("plate-m-2", C0 + 55.0, undefined, { gain: 0.5 });
  add("click-1", C0 + 55.35, undefined, { gain: 0.3 });

  // 火星陨石放上显微镜台；调焦旋钮
  add("gen-l-2", C0 + 56.3, undefined, { gain: 0.3 });
  for (const dt of [58.2, 58.8, 59.6]) add("click-5", C0 + dt, undefined, { gain: 0.22 });
  add("roll-2", C0 + 60.4, undefined, { gain: 0.12 });

  // 取铁陨石：柜门；三块铁陨石先后落在台面（金属 + 木台）；再落下那块石板
  add("wood-l-2", C0 + 66.6, undefined, { gain: 0.4 });
  const drops: Array<[number, string]> = [[68.7, "metal-h-0"], [69.2, "metal-h-1"], [69.7, "metal-h-3"]];
  for (const [dt, s] of drops) {
    add(s, C0 + dt, undefined, { gain: 0.9 });
    add("wood-m-1", C0 + dt + 0.005, undefined, { gain: 0.5 });
  }
  add("plate-h-1", C0 + 70.2, undefined, { gain: 0.8 });
  add("wood-m-1", C0 + 70.205, undefined, { gain: 0.55 });

  // 手机付款：按键、确认音
  for (const dt of [78.4, 78.8, 79.2]) add("click-3", C0 + dt, undefined, { gain: 0.3 });
  add("click-5", C0 + 79.6, undefined, { gain: 0.3 });
  add("beep", C0 + 81.5, 0.35, { gain: 0.7, payload: { f: 1500, f2: 2000, len: 0.09, level: 0.2 } });

  // 布包装好石头
  add("soft-m-1", C0 + 86.5, undefined, { gain: 0.6 });
  add("soft-m-3", C0 + 86.9, undefined, { gain: 0.4 });
}

// ===========================================================================
// 第二幕：制作（116–178 s）——车间的机器与地下室的枪
// ===========================================================================
function making(): void {
  // ---- 车间 ----
  add("tone-workshop", M0 - 0.2, 21.4, { group: "amb", sustain: true, gain: 0.85, payload: { attack: 1.2, release: 0.8 } });
  // 日光灯按行依次亮起（镇流器嗡鸣叠加），收工时依次熄灭（row 0 最靠里，最先熄）
  const rowsOn = MK.rows; // 索引 = 行号
  const rowsOff = [19.6, 20.0, 20.4, 20.8];
  rowsOn.forEach((on, row) => {
    add("sw-18", M0 + on, undefined, { gain: 0.45 });
    for (const dt of [0.08, 0.2, 0.3]) add("click-1", M0 + on + dt, undefined, { gain: 0.1 });
    add("fluor", M0 + on, rowsOff[row] - on + 0.15, { group: "amb", sustain: true, gain: 0.7, payload: { level: 0.3, attack: 0.05, release: 0.25 } });
    add("sw-7", M0 + rowsOff[row], undefined, { gain: 0.4 });
  });
  steps(footfalls(WS_ZHANG, M0, (v) => v / 1.48, { to: 21.0 }), CONC, 0.5);
  // 机床门（滑动）；陨石入虎钳；旋紧；关门；启动
  add("door-open-0", M0 + 5.5, undefined, { gain: 0.55 });
  add("metal-h-1", M0 + 6.3, undefined, { gain: 0.7 });
  add("click-5", M0 + 6.8, undefined, { gain: 0.3 });
  add("click-5", M0 + 7.05, undefined, { gain: 0.3 });
  add("door-close-1", M0 + 7.35, undefined, { gain: 0.6 });
  add("metal-m-3", M0 + 7.95, undefined, { gain: 0.35 });
  add("sw-24", M0 + MK.startBtn - 0.05, undefined, { gain: 0.6 });
  add("beep", M0 + MK.startBtn, 0.2, { gain: 0.5, payload: { f: 1250, len: 0.1, level: 0.16 } });
  // 电机（整个加工期）与切削（两次）：采样为主，切削处叠加冷却液
  add("cnc-motor", M0 + MK.startBtn, 15.9 - MK.startBtn, { group: "sfx", sustain: true, gain: 0.55 });
  for (const [a, b] of [MK.cut, [MK.comb[0] + 0.1, MK.comb[1] - 0.1]] as Array<[number, number]>) {
    add("cnc-grind", M0 + a, b - a, { sustain: true, gain: 0.7 });
    add("pour", M0 + a - 0.1, b - a + 0.3, { gain: 0.22, payload: { level: 0.4, attack: 0.1, release: 0.25 } });
  }
  // 杆落盘、小段落盘、面板提示音
  for (const dt of [12.3, 12.75, 13.2, 13.6]) add("metal-l-1", M0 + dt, undefined, { gain: 0.35 });
  for (let i = 0; i < 6; i++) add(i % 2 ? "tin-2" : "tin-0", M0 + 13.8 + i * 0.27, undefined, { gain: 0.3 });
  for (const dt of [13.9, 14.5, 15.2]) add("click-5", M0 + dt, undefined, { gain: 0.3 });
  add("sw-33", M0 + 15.4, undefined, { gain: 0.5 });
  // 扫碎屑入信封；拆刀具
  add("brush", M0 + 17.2, 1.3, { gain: 0.5, payload: { level: 0.45 } });
  add("soft-m-3", M0 + 18.4, undefined, { gain: 0.5 });
  add("metal-l-4", M0 + 18.6, undefined, { gain: 0.4 });
  for (const dt of [18.9, 19.15, 19.4]) add("click-3", M0 + dt, undefined, { gain: 0.3 });
  add("metal-m-1", M0 + 19.6, undefined, { gain: 0.5 });

  // ---- 地下室 ----
  const b0 = M0 + MK.wsEnd;
  add("tone-basement", b0 - 0.2, MK.shots[0] - 0.4 - (MK.wsEnd - 0.2), { group: "amb", sustain: true, gain: 0.9, payload: { attack: 1.2, release: 0.05 } });
  add("tone-basement", M0 + 49.5, 13.1, { group: "amb", sustain: true, gain: 0.9, payload: { attack: 1.6, release: 0.6 } });
  add("creak", M0 + MK.doorOpen[0], 1.3, { gain: 0.9, payload: { level: 0.32, f0: 78, f1: 118 } });
  add("wood-m-1", M0 + MK.doorOpen[0] + 0.1, undefined, { gain: 0.3 });
  steps(footfalls(BM_ZHANG, M0, (v) => v / 1.48, { from: 22.0 }), CONC, 0.55);
  // 拉灯绳、灯泡闪两下再亮、持续的低哼
  add("sw-13", M0 + MK.bulbOn - 0.05, undefined, { gain: 0.6 });
  add("fluor", M0 + MK.bulbOn, 0.55, { group: "amb", gain: 0.6, payload: { level: 0.3, attack: 0.02, release: 0.15 } });
  add("bulbhum", M0 + MK.bulbOn + 0.5, MK.bulbOff - MK.bulbOn - 0.5, { group: "amb", sustain: true, gain: 0.5, payload: { level: 0.4, attack: 0.3, release: 0.4 } });
  // 钳子夹住弹头：用力 → “啵”
  add("metal-l-2", M0 + 27.25, undefined, { gain: 0.35 });
  add("tin-0", M0 + 27.4, undefined, { gain: 0.5 });
  add("metal-l-2", M0 + 28.35, undefined, { gain: 0.35 });
  add("tin-2", M0 + 28.5, undefined, { gain: 0.5 });
  // 挤胶、镊子夹小段
  for (const dt of [29.15, 29.85, 30.55]) add("slime-0", M0 + dt, undefined, { gain: 0.35 });
  for (const dt of [30.2, 30.9, 31.3]) add("click-1", M0 + dt, undefined, { gain: 0.3 });
  // 延时段：三十多发子弹被逐一拔头、粘接——密集而机械的“啵、嗒”
  for (let i = 2; i < 36; i++) {
    const { off, on } = roundTimes(i);
    add(i % 2 ? "tin-2" : "tin-0", M0 + off, undefined, { gain: 0.2 });
    if (i % 2 === 0) add(i % 4 === 0 ? "click-1" : "click-3", M0 + on, undefined, { gain: 0.16 });
  }
  // 装弹夹：四发压入；弹夹推入；上膛
  for (const dt of [36.1, 36.45, 36.8, 37.15]) add("metal-l-1", M0 + dt, undefined, { gain: 0.4 });
  add("metal-m-3", M0 + 37.75, undefined, { gain: 0.6 });
  add("metal-h-3", M0 + 38.3, undefined, { gain: 0.6 });
  add("sw-33", M0 + 38.32, undefined, { gain: 0.3 });
  // 试射：四声枪响。枪声送进混凝土空间的脉冲响应（强反射、长尾）；靶上一记闷响；弹壳落地
  MK.shots.forEach((s, i) => {
    add("gun-shot", M0 + s, 2.8, { group: "gun", gain: 1.0 });
    add("soft-h-1", M0 + s + 0.02, undefined, { gain: 0.8 });
    add("soft-m-1", M0 + s + 0.05, undefined, { gain: 0.45 });
    add("casing", M0 + s + 0.3 + 0.03 * i, 0.4, { group: "foley", gain: 0.4 });
  });
  // 被震聋：耳鸣（第一声枪响起，缓慢消退）
  add("ring", M0 + MK.shots[0] + 0.05, 8.0, { group: "suit", gain: 0.5, payload: { level: 0.24, attack: 0.3, release: 5.0 } });
  // 拆开层层布：撕开、外层落地
  for (const [i, dt] of [48.9, 49.8, 50.7].entries()) {
    add("rip", M0 + dt, 0.7, { gain: 0.55 });
    add("soft-m-1", M0 + dt + 0.55 + i * 0.03, undefined, { gain: 0.3 });
  }
  // 切开牛肉、取出碎石
  add("metal-l-4", M0 + 52.2, undefined, { gain: 0.3 });
  add("slime-0", M0 + 52.7, undefined, { gain: 0.25 });
  add("soft-h-3", M0 + 52.9, undefined, { gain: 0.45 });
  add("mining-1", M0 + 54.0, undefined, { gain: 0.4 });
  for (const dt of [54.4, 54.7, 55.1, 55.55]) add("glass-l-1", M0 + dt, undefined, { gain: 0.12 });
  add("mining-3", M0 + 55.8, undefined, { gain: 0.3 });
  // 装箱、合盖、上扣；关灯；关门
  add("wood-m-1", M0 + 57.6, undefined, { gain: 0.5 });
  add("plank-2", M0 + 58.4, undefined, { gain: 0.35 });
  add("plank-2", M0 + 59.9, undefined, { gain: 0.55 });
  add("sw-18", M0 + 60.1, undefined, { gain: 0.5 });
  add("sw-13", M0 + MK.bulbOff, undefined, { gain: 0.55 });
  add("plank-2", M0 + 61.7, undefined, { gain: 0.6 });
}

// ===========================================================================
// 过渡：一号基地（178–194 s）——舱里有空气，舱外没有
// ===========================================================================
function transit(): void {
  add("tone-cabin", X0 - 0.4, 6.9, { group: "amb", sustain: true, gain: 0.9, payload: { attack: 0.8, release: 0.4 } });
  add("equip-loop", X0 - 0.4, 6.9, { group: "amb", sustain: true, gain: 0.3 });
  // 定位单元的指示灯：每个亮起的边沿一记极轻的“嘀”
  for (let k = 0; k <= 5; k++) add("roll-2", X0 + (k * 2 * Math.PI) / 5, undefined, { gain: 0.12 });
  steps(footfalls(CABIN_PATH, X0, 0.6), PLATE, 0.32);
  add("click-3", X0 + 2.3, undefined, { gain: 0.4 });
  add("gen-l-2", X0 + 2.4, undefined, { gain: 0.35 });
  // 父亲的照片：钟声第二次响起
  add("bell-verb", X0 + 3.55, 4.6, { group: "score", gain: 0.42 });
  // 内舱门打开 → 气闸里泄压：嘶声越来越细，直到一片真空的静
  add("door-open-2", X0 + 5.5, undefined, { gain: 0.7 });
  add("hissfade", X0 + 5.6, 4.2, { gain: 0.6, payload: { level: 0.5 } });
  // 头盔里的声音从这里开始（一直陪他到片尾前）
  add("suithum", X0 + 6.4, S0 + 139.6 - (X0 + 6.4), { group: "suit", sustain: true, gain: 0.5, payload: { attack: 1.0, release: 0.8 } });
  // 外闸门升起：只有舱壁传来的一声闷响
  add("airlock-thud", X0 + 6.9, 0.7, { group: "suit", gain: 0.5 });
  add("thruster-puff", X0 + 6.6 + 1.0, 0.55, { group: "suit", gain: 0.5 });
  // 主推进器点火：低频的轰鸣经背包传来
  add("thruster-rumble", X0 + 6.6 + 3.2, 4.3, { group: "suit", gain: 0.6 });
  // 船坞的骨架：一个低音缓缓涌起，承接主戏
  add("drone", X0 + 9.6, 6.4, { group: "score", gain: 0.6, payload: { f0: 55, attack: 2.4, release: 2.4 } });
}

// ===========================================================================
// 第三幕：太空主戏（194–346 s）——真空
// ===========================================================================
function space(): void {
  const A = (tau: number) => S0 + tau;
  // ---- 头盔里的呼吸：随情境改变（屏息瞄准 → 惊恐喘息 → 缓下来） ----
  const breathSegs: Array<[number, number, number, number]> = [
    // [起 τ, 止 τ, 每分钟呼吸数, 幅度]
    [-9.4, 60, 11, 0.5],
    [58.8, 97.5, 13, 0.55],
    [96.3, 108.8, 5, 0.16],
    [107.6, 125.2, 24, 0.85],
    [124.0, 139.4, 9, 0.5],
  ];
  for (const [a, b, rate, depth] of breathSegs) {
    add("breath", A(a), b - a, { group: "suit", sustain: true, gain: 0.85, payload: { rate, depth, attack: 1.2, release: 1.2 } });
  }
  // 一次长长的呼气：“但我做了我能做的”之后
  add("sigh", A(132.9), 2.8, { group: "suit", gain: 0.9, payload: { level: 0.5, attack: 0.7, release: 1.6 } });
  // 心跳：瞄准前逐渐加快，飞行的十秒里只剩它；命中之后慢慢平复
  add("heartbeat", A(78), 34, { group: "suit", sustain: true, gain: 0.9, payload: { bpm: 64, bpmEnd: 100, attack: 4, release: 2, level: 0.34 } });
  add("heartbeat", A(112), 16, { group: "suit", sustain: true, gain: 0.6, payload: { bpm: 100, bpmEnd: 70, attack: 1.5, release: 3, level: 0.3 } });
  // 配乐：日落时分一个低音；瞄准时收紧；开火/命中的十几秒里彻底没有配乐；命中后一个柔和的低音
  add("drone", A(-0.5), 23.0, { group: "score", sustain: true, gain: 0.6, payload: { f0: 49, attack: 3, release: 3 } });
  add("drone", A(76), 31.6, { group: "score", sustain: true, gain: 0.7, payload: { f0: 41, attack: 8, release: 0.6 } });
  add("drone", A(124), 15.4, { group: "score", sustain: true, gain: 0.55, payload: { f0: 55, attack: 3, release: 2 } });

  // ---- 姿态控制小喷（骨传导的闷“嗤”）----
  for (const [tau] of TURN_PUFFS) if (tau >= 0) add("thruster-puff", A(tau), 0.55, { group: "suit", gain: 0.5 });

  // ---- 骨传导：手部动作 ----
  add("suit-click", A(ZH_T.releaseScope), undefined, { group: "suit", gain: 0.5 });
  add("suit-latch", A(ZH_T.gloveOff), undefined, { group: "suit", gain: 0.55 });
  add("suit-metal", A(ZH_T.pistolOut), undefined, { group: "suit", gain: 0.5 });
  add("suit-clack", A(ZH_T.scopeMount), undefined, { group: "suit", gain: 0.6 });
  add("suit-tap", A(ZH_T.scopeMount + 0.3), undefined, { group: "suit", gain: 0.4 });
  add("suit-slide", A(ZH_T.aimUp), undefined, { group: "suit", gain: 0.5 });
  for (const [a] of MAG_CHANGES) {
    add("suit-metal", A(a + 0.02), undefined, { group: "suit", gain: 0.5 });
    add("suit-clack", A(a + 0.22), undefined, { group: "suit", gain: 0.55 });
    add("suit-slide", A(a + 0.36), undefined, { group: "suit", gain: 0.45 });
  }
  // ---- 三十发：真空里没有枪声——只有手臂与头骨里的一记闷震和更细的机械“嗒” ----
  for (const sh of SHOTS) {
    add("suit-thump", A(sh.t), 0.2, { group: "suit", gain: 0.95 });
    add("suit-tick", A(sh.t + 0.004), 0.12, { group: "suit", gain: 0.3 });
  }
  // 打空：扳机扣下去，只有一声空响
  add("suit-click", A(LAST_SHOT_T + 0.35), undefined, { group: "suit", gain: 0.45 });
  add("suit-click", A(LAST_SHOT_T + 0.9), undefined, { group: "suit", gain: 0.35 });

  // ---- 无线电：所有“别人的声音”都只经由电台传来 ----
  for (const v of voiceCues) {
    if (v.kind !== "radio" && v.kind !== "chatter") continue;
    const panic = v.speaker === "合影者";
    add("squelch", v.start - 0.13, 0.16, { group: "radio", gain: 0.55, payload: { open: 1, level: 0.6 } });
    add("radio-static", v.start - 0.03, v.end - v.start + 0.06, {
      group: "radio", sustain: true, gain: 0.55,
      payload: { lo: panic ? 350 : 480, hi: panic ? 3400 : 2800, level: panic ? 0.55 : 0.36, attack: 0.05, release: 0.1, wob: panic ? 2.2 : 1 },
    });
    add("squelch", v.end + 0.03, 0.12, { group: "radio", gain: 0.5, payload: { open: 0, level: 0.5 } });
  }
  // 命中：每一个被击中者的电台突然“掉线”（静噪一闪）——画面无声，声音只存在于电台里
  for (const h of HIT_PLAN) add("radio-glitch", A(hitTime(h)) + 0.02, 0.22, { group: "radio", gain: 0.45, payload: { level: 0.5 } });
  // 混乱中仍开着的麦：喘息声
  add("breath", A(112.4), 11.6, { group: "radio", sustain: true, gain: 0.5, payload: { rate: 27, depth: 0.7, attack: 1.0, release: 1.5, level: 0.3 } });

  // ---- 离去：推进器的低频轰鸣，从他的背脊传来；随后切进空无一人的舱室，轰鸣的尾音留在那里 ----
  add("thruster-rumble", A(ZH_T.depart - 0.4), 3.4, { group: "suit", gain: 0.6 });

  // ---- 家：他的呼吸消失了。舱室的低鸣、桌上那盏灯规律的“嘀”，父亲的照片望着窗外 ----
  const h0 = S0 + 139.2;
  // 舱室的底噪一直持续到画面淡出之后（片尾之前几乎听不见的最后一点“有人住过”的声音）
  const homeEnd = E0 + 0.6;
  add("tone-cabin", h0 - 0.2, homeEnd - (h0 - 0.2), { group: "amb", sustain: true, gain: 0.85, payload: { attack: 1.6, release: 2.2 } });
  add("equip-loop", h0 - 0.2, homeEnd - (h0 - 0.2), { group: "amb", sustain: true, gain: 0.28 });
  add("bell-verb", h0 + 0.35, 6.4, { group: "score", gain: 0.55 });
  add("bell-soft", h0 + 4.4, 5.0, { group: "score", gain: 0.28 });
  for (let k = 1; h0 + (k * 2 * Math.PI) / 5 < E0 - 1.0; k++) add("roll-2", h0 + (k * 2 * Math.PI) / 5, undefined, { gain: 0.11 });
}

// ===========================================================================
// 片尾
// ===========================================================================
function ending(): void {
  add("drone", E0 - 0.4, 6.3, { group: "score", gain: 0.55, payload: { f0: 41, attack: 1.6, release: 2.6 } });
  add("bell-soft", E0 + 1.0, 4.6, { group: "score", gain: 0.3 });
}

opening();
courtyard();
making();
transit();
space();
ending();

/** 全片音效 cue（按时间排序） */
export const soundCues: SoundCue[] = cues.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
