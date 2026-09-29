// 声音引擎：在 WebAudioCueBus 之上加三样东西——
//  1. 采样注册（defineSample）：本片用到的 CC0 录音，全部内联；
//  2. “带效果的采样”与程序化声音（呼吸、心跳、无线电、混响…）——用 audio.define 注册的工厂；
//     采样永远是可辨识声音的主体，程序化只做强化、滤波与主观声音（耳鸣、心跳、真空里的“骨传导”）。
//  3. 混响脉冲（地下室的强反射、追忆用的钟声）：在 unlock() 里由代码生成，不依赖任何外部文件。
// 全部人声都不由本模块产生：语音只以字幕 + VoiceCue 清单呈现。
import { WebAudioCueBus, type CinematicPlayer, type SoundCue, type SoundFactory, type SoundFactoryContext } from "@agentbench/cinematic-player";
import { SAMPLES } from "./samples";
import { mulberry32 } from "../util/math";

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
function dataUrlToArrayBuffer(value: string): ArrayBuffer {
  const comma = value.indexOf(",");
  const binary = atob(value.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** cue.payload 里的参数（缺省值合并） */
function par<T extends object>(cue: SoundCue, defaults: T): T {
  return { ...defaults, ...((cue.payload as Partial<T> | undefined) ?? {}) };
}

class Rig {
  private readonly nodes: AudioScheduledSourceNode[] = [];
  add<T extends AudioScheduledSourceNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }
  stop(): void {
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* 已经停止 */
      }
    }
  }
  handle(): { stop: () => void } {
    return { stop: () => this.stop() };
  }
}

/** 包络：attack/release 相对 cue 时长；offset = 从 cue 起点已经过去的时间（sustain 恢复时不为 0） */
function shape(ac: AudioContext, g: GainNode, dur: number, offset: number, attack: number, release: number, peak = 1): void {
  const t = ac.currentTime;
  const remain = Math.max(0.03, dur - offset);
  const a = Math.min(attack, remain * 0.5);
  const r = Math.min(release, remain * 0.7);
  g.gain.cancelScheduledValues(t);
  if (a > 0 && offset < a) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + (a - offset));
  } else {
    g.gain.setValueAtTime(peak, t);
  }
  if (r > 0) {
    g.gain.setValueAtTime(peak, t + Math.max(a, remain - r));
    g.gain.linearRampToValueAtTime(0.0001, t + remain);
  }
}

// ---------------------------------------------------------------------------
// FxKit：噪声缓冲、混响脉冲、预解码的采样
// ---------------------------------------------------------------------------
type IRKind = "room" | "hall";

export class FxKit {
  ac!: AudioContext;
  ready = false;
  readonly buffers = new Map<string, AudioBuffer>();
  white!: AudioBuffer;
  pink!: AudioBuffer;
  readonly ir = new Map<IRKind, AudioBuffer>();

  async prepare(ac: AudioContext, names: readonly string[]): Promise<void> {
    if (this.ready && this.ac === ac) return;
    this.ac = ac;
    this.white = this.noise(ac, "white", 4, 11);
    this.pink = this.noise(ac, "pink", 4, 23);
    // 地下室（混凝土、低矮、硬）：早期反射密集，尾长约 2.3 秒，偏亮
    this.ir.set("room", this.makeIR(ac, {
      seconds: 2.6, preDelay: 0.004, damp0: 0.93, damp1: 0.35, seed: 5,
      early: [[0.007, 0.9], [0.013, 0.75], [0.021, 0.7], [0.029, 0.55], [0.041, 0.5], [0.053, 0.42], [0.071, 0.35], [0.093, 0.3], [0.121, 0.22]],
    }));
    // 追忆的钟声：一个大而暗的空间
    this.ir.set("hall", this.makeIR(ac, {
      seconds: 4.2, preDelay: 0.03, damp0: 0.6, damp1: 0.12, seed: 9,
      early: [[0.045, 0.5], [0.09, 0.4], [0.16, 0.3]],
    }));
    await Promise.all(
      names.map(async (n) => {
        if (this.buffers.has(n)) return;
        const info = SAMPLES[n];
        if (!info) throw new Error(`unknown sample ${n}`);
        this.buffers.set(n, await ac.decodeAudioData(dataUrlToArrayBuffer(info.url)));
      }),
    );
    this.ready = true;
  }

  private noise(ac: AudioContext, kind: "white" | "pink", seconds: number, seed: number): AudioBuffer {
    const n = Math.floor(ac.sampleRate * seconds);
    const b = ac.createBuffer(1, n, ac.sampleRate);
    const d = b.getChannelData(0);
    const rnd = mulberry32(seed);
    if (kind === "white") {
      for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
    } else {
      // Paul Kellet 的粉红噪声近似
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = rnd() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    // 首尾 40ms 交叉淡化，循环接缝不出声
    const f = Math.floor(ac.sampleRate * 0.04);
    for (let i = 0; i < f; i++) {
      const k = i / f;
      d[i] = d[i] * k + d[n - f + i] * (1 - k);
    }
    return b;
  }

  private makeIR(
    ac: AudioContext,
    o: { seconds: number; preDelay: number; damp0: number; damp1: number; seed: number; early: Array<[number, number]> },
  ): AudioBuffer {
    const sr = ac.sampleRate;
    const len = Math.floor(sr * o.seconds);
    const b = ac.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      const rnd = mulberry32(o.seed * 101 + ch * 977);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        if (t < o.preDelay) continue;
        const u = (t - o.preDelay) / (o.seconds - o.preDelay);
        const env = Math.exp(-6.9 * u); // -60dB 在 seconds 处
        const coef = o.damp0 + (o.damp1 - o.damp0) * Math.min(1, u * 1.3); // 越往后越暗
        lp += ((rnd() * 2 - 1) - lp) * coef;
        d[i] = lp * env;
      }
      for (const [et, ea] of o.early) {
        const idx = Math.floor((et + ch * 0.0009) * sr);
        if (idx < len) d[idx] += ea * (ch === 0 ? 1 : -0.9) * 1.6;
      }
    }
    return b;
  }

  /** 循环噪声源（起点随机，避免多层叠加时同相） */
  noiseSrc(rig: Rig, kind: "white" | "pink"): AudioBufferSourceNode {
    const s = rig.add(this.ac.createBufferSource());
    s.buffer = kind === "white" ? this.white : this.pink;
    s.loop = true;
    return s;
  }
}

// ---------------------------------------------------------------------------
// “带效果的采样”规格
// ---------------------------------------------------------------------------
interface SampleFx {
  buf: string;
  rate?: number;
  /** 低通 / 高通 / 带通 [中心, Q] */
  lp?: number;
  hp?: number;
  bp?: [number, number];
  attack?: number;
  release?: number;
  loop?: boolean;
  reverb?: IRKind;
  wet?: number;
  dry?: number;
}

/** 所有需要预解码的采样（供 fxSample 使用） */
export const FX_BUFFERS = [
  "crunch-0", "lfe-1", "metal-h-0", "tin-2", "metal-l-4", "click-3", "sw-13", "metal-m-1", "metal-m-3", "sw-7", "metal-l-1",
  "eng-low-2", "eng-small-0", "sf-metal-2", "bell-1", "bell-4", "eng-3", "comp-0",
];

function fxSample(kit: FxKit, spec: SampleFx): SoundFactory {
  return ({ audioContext: ac, output, cue, offset }: SoundFactoryContext) => {
    const buf = kit.buffers.get(spec.buf);
    if (!buf) return undefined;
    const rig = new Rig();
    const src = rig.add(ac.createBufferSource());
    src.buffer = buf;
    src.playbackRate.value = spec.rate ?? 1;
    src.loop = spec.loop ?? false;
    if (src.loop) {
      src.loopStart = 0;
      src.loopEnd = buf.duration;
    }
    let node: AudioNode = src;
    const chain = (f: BiquadFilterNode): void => {
      node.connect(f);
      node = f;
    };
    if (spec.hp) {
      const f = ac.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = spec.hp;
      chain(f);
    }
    if (spec.lp) {
      const f = ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = spec.lp;
      f.Q.value = 0.6;
      chain(f);
    }
    if (spec.bp) {
      const f = ac.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = spec.bp[0];
      f.Q.value = spec.bp[1];
      chain(f);
    }
    const env = ac.createGain();
    node.connect(env);
    shape(ac, env, cue.end - cue.start, offset, spec.attack ?? 0, spec.release ?? 0);
    const dry = ac.createGain();
    dry.gain.value = spec.dry ?? 1;
    env.connect(dry);
    dry.connect(output);
    if (spec.reverb) {
      const conv = ac.createConvolver();
      conv.buffer = kit.ir.get(spec.reverb) ?? null;
      const wet = ac.createGain();
      wet.gain.value = spec.wet ?? 0.6;
      env.connect(conv);
      conv.connect(wet);
      wet.connect(output);
    }
    const startAt = src.loop && buf.duration > 0 ? offset % buf.duration : Math.min(offset, Math.max(0, buf.duration - 0.001));
    src.start(0, startAt);
    return rig.handle();
  };
}

// ---------------------------------------------------------------------------
// 混音分组（setGroupGain）
// ---------------------------------------------------------------------------
export const GROUP_GAIN: Record<string, number> = {
  sfx: 1.0,
  foley: 0.9,
  gun: 1.0,
  amb: 0.85,
  suit: 0.95,
  radio: 0.8,
  score: 0.8,
};

// ---------------------------------------------------------------------------
// 门控：播放器在“跳转/单步”时会对被跨过的 cue 发出 cue 事件——这时不应该起声
// ---------------------------------------------------------------------------
export interface CueGate {
  reason: string | null;
}

/** 必须在创建 FilmAudio 之前调用（保证本监听器先于总线的监听器执行） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createCueGate(player: CinematicPlayer<any>): CueGate {
  const gate: CueGate = { reason: null };
  player.addTypedEventListener("cue", (e) => {
    gate.reason = e.detail.frame.reason;
  });
  player.addTypedEventListener("frame", () => {
    gate.reason = null;
  });
  return gate;
}

// ---------------------------------------------------------------------------
// FilmAudio
// ---------------------------------------------------------------------------
export class FilmAudio<Context = unknown> extends WebAudioCueBus<Context> {
  readonly kit = new FxKit();

  constructor(player: CinematicPlayer<Context>, private readonly gate: CueGate) {
    super(player);
    for (const [name, info] of Object.entries(SAMPLES)) {
      // 普通采样：由总线直接播放（一次性；循环用途在 cue 里通过 FX 工厂另外注册）
      this.defineSample(name, info.url);
    }
    registerFactories(this, this.kit);
  }

  /** 工厂在“跳转/单步”触发的 cue 事件里不起声 */
  override define(name: string, factory: SoundFactory): this {
    return super.define(name, (c) => (this.gate.reason === "seek" || this.gate.reason === "step" ? undefined : factory(c)));
  }

  /**
   * 解锁音频（只能从用户手势里调用）。任何一步失败都不应该让“播放”按钮失效：
   * 例如浏览器不支持 Ogg Vorbis 解码时，记一条警告，影片仍然照常（少了录音层地）播放。
   */
  override async unlock(): Promise<AudioContext | undefined> {
    let ac: AudioContext | undefined;
    try {
      ac = await super.unlock();
    } catch (e) {
      console.warn("[audio] 采样解码失败，将只播放程序化声音：", e);
      ac = (this as unknown as { audioContext?: AudioContext }).audioContext;
    }
    if (ac) {
      try {
        await this.kit.prepare(ac, FX_BUFFERS);
      } catch (e) {
        console.warn("[audio] 效果采样解码失败：", e);
      }
      for (const [g, v] of Object.entries(GROUP_GAIN)) this.setGroupGain(g, v);
      this.installLimiter(ac);
    }
    return ac;
  }

  private limiter?: DynamicsCompressorNode;

  /**
   * 总线上的限幅器：基础总线把所有分组汇到一个主增益节点再直连输出，没有任何保护。
   * 这里（尽力而为、带特性检测地）在主增益与输出之间串入一个动态压缩器，防止多层音效叠加时削波。
   */
  private installLimiter(ac: AudioContext): void {
    if (this.limiter) return;
    const master = (this as unknown as { master?: GainNode }).master;
    if (!master || typeof master.disconnect !== "function") return;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -7;
    comp.knee.value = 10;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    master.disconnect();
    master.connect(comp);
    comp.connect(ac.destination);
    this.limiter = comp;
  }
}

// ---------------------------------------------------------------------------
// 工厂：程序化声音 + 带效果采样
// ---------------------------------------------------------------------------
function registerFactories(audio: FilmAudio<any>, kit: FxKit): void {
  const def = (name: string, f: SoundFactory) => audio.define(name, f);

  // ================= 带效果的采样 =================
  // —— 地下室试射：枪声在混凝土空间里被强烈反射。
  //    三层录音（尖锐的“裂”、沉闷的“轰”、金属的“铮”）先混合，再送进同一个卷积混响（一发枪声只占一个卷积器）
  def("gun-shot", ({ audioContext: ac, output, offset }) => {
    const rig = new Rig();
    const mix = ac.createGain();
    const layers: Array<{ key: string; rate: number; hp?: number; lp?: number; g: number }> = [
      { key: "crunch-0", rate: 1.45, hp: 180, g: 1.0 },
      { key: "lfe-1", rate: 1.0, lp: 900, g: 0.9 },
      { key: "metal-h-0", rate: 2.2, hp: 1200, g: 0.3 },
    ];
    for (const L of layers) {
      const buf = kit.buffers.get(L.key);
      if (!buf) continue;
      const src = rig.add(ac.createBufferSource());
      src.buffer = buf;
      src.playbackRate.value = L.rate;
      let node: AudioNode = src;
      if (L.hp) {
        const f = ac.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = L.hp;
        node.connect(f);
        node = f;
      }
      if (L.lp) {
        const f = ac.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = L.lp;
        node.connect(f);
        node = f;
      }
      const gg = ac.createGain();
      gg.gain.value = L.g;
      node.connect(gg).connect(mix);
      src.start(0, Math.min(offset, Math.max(0, buf.duration - 0.001)));
    }
    // 三层叠加会超过满幅：先留出余量，再过一个限幅器，然后分成直达声与混响声
    mix.gain.value = 0.55;
    const lim = ac.createDynamicsCompressor();
    lim.threshold.value = -9;
    lim.knee.value = 8;
    lim.ratio.value = 14;
    lim.attack.value = 0.002;
    lim.release.value = 0.18;
    mix.connect(lim);
    const dry = ac.createGain();
    dry.gain.value = 1.0;
    lim.connect(dry).connect(output);
    const conv = ac.createConvolver();
    conv.buffer = kit.ir.get("room") ?? null;
    const wet = ac.createGain();
    wet.gain.value = 1.15;
    lim.connect(conv);
    conv.connect(wet).connect(output);
    return rig.handle();
  });
  def("casing", fxSample(kit, { buf: "tin-2", rate: 1.3 }));

  // —— 真空里的“枪声”：只有手臂和头骨传来的闷响（低通的低频爆裂）与一声更细的机械“嗒”
  def("suit-thump", fxSample(kit, { buf: "lfe-1", rate: 1.7, lp: 230, attack: 0.002, release: 0.06 }));
  def("suit-tick", fxSample(kit, { buf: "metal-l-4", rate: 0.8, lp: 1400, attack: 0.001, release: 0.04 }));
  // —— 骨传导的手部动作（摘手套、装镜、换弹夹…）：整体压暗、像从身体里传来的
  def("suit-click", fxSample(kit, { buf: "click-3", rate: 0.7, lp: 1100 }));
  def("suit-latch", fxSample(kit, { buf: "sw-13", rate: 0.75, lp: 1300 }));
  def("suit-metal", fxSample(kit, { buf: "metal-m-1", rate: 0.8, lp: 1200 }));
  def("suit-clack", fxSample(kit, { buf: "metal-m-3", rate: 0.85, lp: 1000 }));
  def("suit-slide", fxSample(kit, { buf: "sw-7", rate: 0.8, lp: 1500 }));
  def("suit-tap", fxSample(kit, { buf: "metal-l-1", rate: 0.7, lp: 1200 }));
  // —— 推进器：经背包与脊柱传进头盔的低频轰鸣
  def("thruster-rumble", fxSample(kit, { buf: "eng-low-2", rate: 0.85, lp: 340, loop: true, attack: 0.5, release: 1.2 }));
  def("thruster-puff", fxSample(kit, { buf: "eng-small-0", rate: 1.1, lp: 520, attack: 0.03, release: 0.28 }));
  // —— 气闸外门升起：从舱壁传来的一声闷响
  def("airlock-thud", fxSample(kit, { buf: "sf-metal-2", rate: 0.6, lp: 420, release: 0.2 }));
  // —— 追忆的钟：一个低八度的钟声，送进大空间
  def("bell-verb", fxSample(kit, { buf: "bell-1", rate: 0.5, lp: 3800, reverb: "hall", wet: 1.1, dry: 0.7, release: 1.2 }));
  def("bell-soft", fxSample(kit, { buf: "bell-1", rate: 0.37, lp: 2500, reverb: "hall", wet: 1.2, dry: 0.5, release: 1.6 }));
  // —— 旧收音机里的一声“叮”
  def("radio-ding", fxSample(kit, { buf: "bell-4", rate: 1.1, bp: [1500, 0.9] }));
  // —— 车间：数控主轴的电机声与切削声
  def("cnc-motor", fxSample(kit, { buf: "eng-3", rate: 1.85, hp: 140, lp: 3800, loop: true, attack: 0.9, release: 1.0 }));
  def("cnc-grind", fxSample(kit, { buf: "eng-small-0", rate: 2.3, hp: 900, lp: 6500, loop: true, attack: 0.08, release: 0.18 }));
  // —— 舱室里设备的低鸣（循环）
  def("equip-loop", fxSample(kit, { buf: "comp-0", rate: 0.8, lp: 1600, loop: true, attack: 1.2, release: 1.0 }));

  // ================= 程序化 =================
  // —— 头盔里的呼吸：粉红噪声 + 缓慢的带通扫频（吸气高、呼气低）
  def("breath", ({ audioContext: ac, output, cue, offset }) => {
    const p = par(cue, { rate: 12, depth: 0.6, attack: 1.0, release: 1.0, level: 1.1 });
    const rig = new Rig();
    const src = kit.noiseSrc(rig, "pink");
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 780;
    bp.Q.value = 0.65;
    const amp = ac.createGain();
    amp.gain.value = 0.5 * p.depth;
    const lfo = rig.add(ac.createOscillator());
    lfo.frequency.value = p.rate / 60;
    const lfoAmp = ac.createGain();
    lfoAmp.gain.value = 0.5 * p.depth;
    lfo.connect(lfoAmp).connect(amp.gain);
    const lfoF = ac.createGain();
    lfoF.gain.value = 330;
    lfo.connect(lfoF).connect(bp.frequency);
    const env = ac.createGain();
    src.connect(bp).connect(amp).connect(env).connect(output);
    shape(ac, env, cue.end - cue.start, offset, p.attack, p.release, p.level);
    src.start(0, (offset * 0.37) % 3);
    lfo.start(0);
    return rig.handle();
  });
  // —— 一次长长的呼气（叹息）
  def("sigh", ({ audioContext: ac, output, cue, offset }) => {
    const p = par(cue, { level: 0.5, attack: 0.7, release: 1.6 });
    const rig = new Rig();
    const src = kit.noiseSrc(rig, "pink");
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(900, ac.currentTime);
    bp.frequency.linearRampToValueAtTime(420, ac.currentTime + Math.max(0.5, cue.end - cue.start - offset));
    bp.Q.value = 0.55;
    const env = ac.createGain();
    src.connect(bp).connect(env).connect(output);
    shape(ac, env, cue.end - cue.start, offset, p.attack, p.release, p.level);
    src.start(0, 0.4);
    return rig.handle();
  });
  // —— 头盔里的风扇/生命维持嗡鸣（持续）
  def("suithum", ({ audioContext: ac, output, cue, offset }) => {
    const p = par(cue, { attack: 1.5, release: 1.0, level: 0.5 });
    const rig = new Rig();
    const env = ac.createGain();
    for (const [f, g] of [[96, 0.05], [192.4, 0.025], [287, 0.008]] as Array<[number, number]>) {
      const o = rig.add(ac.createOscillator());
      o.frequency.value = f;
      const og = ac.createGain();
      og.gain.value = g;
      o.connect(og).connect(env);
      o.start(0);
    }
    const src = kit.noiseSrc(rig, "pink");
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const ng = ac.createGain();
    ng.gain.value = 0.11;
    src.connect(lp).connect(ng).connect(env);
    src.start(0, 1.3);
    env.connect(output);
    shape(ac, env, cue.end - cue.start, offset, p.attack, p.release, p.level);
    return rig.handle();
  });
  // —— 心跳：lub-dub，逐渐加快（payload: bpm → bpmEnd）。基频之上叠一个二倍频，小喇叭上也听得见
  def("heartbeat", ({ audioContext: ac, output, cue, offset }) => {
    const p = par(cue, { bpm: 62, bpmEnd: 62, level: 0.32, attack: 1.5, release: 1.0 });
    const rig = new Rig();
    const dur = cue.end - cue.start;
    const osc = rig.add(ac.createOscillator());
    osc.type = "sine";
    const osc2 = rig.add(ac.createOscillator());
    osc2.type = "triangle";
    const h2 = ac.createGain();
    h2.gain.value = 0.4;
    const g = ac.createGain();
    g.gain.value = 0;
    osc.connect(g);
    osc2.connect(h2).connect(g);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    const env = ac.createGain();
    g.connect(lp).connect(env).connect(output);
    shape(ac, env, dur, offset, p.attack, p.release, p.level);
    const t0 = ac.currentTime;
    let tt = -offset;
    while (tt < dur) {
      const u = Math.min(1, Math.max(0, tt / dur));
      const bpm = p.bpm + (p.bpmEnd - p.bpm) * u;
      const period = 60 / bpm;
      if (tt >= -0.05) {
        const at = t0 + Math.max(0, tt);
        osc.frequency.setValueAtTime(54, at);
        osc2.frequency.setValueAtTime(108, at);
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(1, at + 0.014);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
        osc.frequency.setValueAtTime(72, at + 0.27);
        osc2.frequency.setValueAtTime(144, at + 0.27);
        g.gain.setValueAtTime(0, at + 0.27);
        g.gain.linearRampToValueAtTime(0.65, at + 0.283);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.37);
      }
      tt += period;
    }
    osc.start(0);
    osc2.start(0);
    return rig.handle();
  });
  // —— 无线电静噪底（带通噪声 + 缓慢起伏）
  def("radio-static", ({ audioContext: ac, output, cue, offset }) => {
    const p = par(cue, { lo: 420, hi: 3000, level: 0.6, attack: 0.05, release: 0.12, wob: 1 });
    const rig = new Rig();
    const src = kit.noiseSrc(rig, "white");
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = p.lo;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = p.hi;
    const amp = ac.createGain();
    amp.gain.value = 0.7;
    const wob = rig.add(ac.createOscillator());
    wob.frequency.value = 5.3;
    const wobAmp = ac.createGain();
    wobAmp.gain.value = 0.25 * p.wob;
    wob.connect(wobAmp).connect(amp.gain);
    const env = ac.createGain();
    src.connect(hp).connect(lp).connect(amp).connect(env).connect(output);
    shape(ac, env, cue.end - cue.start, offset, p.attack, p.release, p.level);
    src.start(0, (offset * 1.7) % 3);
    wob.start(0);
    return rig.handle();
  });
  // —— 无线电开/关键（“嚓——”）
  def("squelch", ({ audioContext: ac, output, cue }) => {
    const p = par(cue, { open: 1, level: 0.6 });
    const rig = new Rig();
    const t = ac.currentTime;
    const src = kit.noiseSrc(rig, "white");
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(p.open ? 3200 : 2200, t);
    bp.frequency.exponentialRampToValueAtTime(p.open ? 1400 : 900, t + 0.09);
    bp.Q.value = 1.1;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(p.level, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.001, t + (p.open ? 0.1 : 0.07));
    src.connect(bp).connect(env).connect(output);
    src.start(0, 0.5);
    if (p.open) {
      const o = rig.add(ac.createOscillator());
      o.type = "square";
      o.frequency.value = 1500;
      const og = ac.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.linearRampToValueAtTime(0.05, t + 0.005);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(og).connect(output);
      o.start(0);
    }
    return rig.handle();
  });
  // —— 无线电“掉线”：命中瞬间某个人的电台被切断（噪声扫频 + 断续）
  def("radio-glitch", ({ audioContext: ac, output, cue }) => {
    const p = par(cue, { level: 0.5 });
    const rig = new Rig();
    const t = ac.currentTime;
    const src = kit.noiseSrc(rig, "white");
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(3500, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.16);
    bp.Q.value = 2.5;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(p.level, t + 0.006);
    env.gain.setValueAtTime(p.level, t + 0.05);
    env.gain.setValueAtTime(0.0001, t + 0.055);
    env.gain.setValueAtTime(p.level * 0.7, t + 0.075);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
    src.connect(bp).connect(env).connect(output);
    src.start(0, 1.1);
    return rig.handle();
  });
  // —— 耳鸣（“被震聋”的主观声音）
  def("ring", ({ audioContext: ac, output, cue, offset }) => {
    const p = par(cue, { level: 0.5, attack: 0.15, release: 3.0 });
    const rig = new Rig();
    const env = ac.createGain();
    for (const [f, g] of [[3820, 0.5], [4090, 0.35], [7310, 0.08]] as Array<[number, number]>) {
      const o = rig.add(ac.createOscillator());
      o.frequency.value = f;
      const og = ac.createGain();
      og.gain.value = g;
      o.connect(og).connect(env);
      o.start(0);
    }
    env.connect(output);
    shape(ac, env, cue.end - cue.start, offset, p.attack, p.release, p.level);
    return rig.handle();
  });
  // —— 配乐低音：五度叠置的持续音（只在情绪需要处出现）
  def("drone", ({ audioContext: ac, output, cue, offset }) => {
    const p = par(cue, { f0: 55, level: 0.5, attack: 4, release: 3 });
    const rig = new Rig();
    const env = ac.createGain();
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 760;
    const swell = ac.createGain();
    swell.gain.value = 0.8;
    const lfo = rig.add(ac.createOscillator());
    lfo.frequency.value = 0.07;
    const lfoA = ac.createGain();
    lfoA.gain.value = 0.2;
    lfo.connect(lfoA).connect(swell.gain);
    lfo.start(0);
    for (const [m, g, det] of [[1, 0.5, 0], [1.5, 0.22, 3], [2, 0.16, -4], [3.01, 0.05, 2], [6, 0.07, 5], [8.02, 0.045, -6]] as Array<[number, number, number]>) {
      const o = rig.add(ac.createOscillator());
      o.type = m === 1 ? "triangle" : "sine";
      o.frequency.value = p.f0 * m;
      o.detune.value = det;
      const og = ac.createGain();
      og.gain.value = g;
      o.connect(og).connect(lp);
      o.start(0);
    }
    lp.connect(swell).connect(env).connect(output);
    shape(ac, env, cue.end - cue.start, offset, p.attack, p.release, p.level);
    return rig.handle();
  });
  // —— 日光灯镇流器嗡鸣
  def("fluor", ({ audioContext: ac, output, cue, offset }) => {
    const p = par(cue, { level: 0.35, attack: 0.05, release: 0.3 });
    const rig = new Rig();
    const env = ac.createGain();
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    for (const [f, g, ty] of [[100, 0.5, "sawtooth"], [200.3, 0.25, "sawtooth"], [300.6, 0.12, "square"]] as Array<[number, number, OscillatorType]>) {
      const o = rig.add(ac.createOscillator());
      o.type = ty;
      o.frequency.value = f;
      const og = ac.createGain();
      og.gain.value = g * 0.05;
      o.connect(og).connect(lp);
      o.start(0);
    }
    lp.connect(env).connect(output);
    const src = kit.noiseSrc(rig, "white");
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 5500;
    const ng = ac.createGain();
    ng.gain.value = 0.004;
    src.connect(hp).connect(ng).connect(env);
    src.start(0, 0.7);
    shape(ac, env, cue.end - cue.start, offset, p.attack, p.release, p.level);
    return rig.handle();
  });
  // —— 灯泡的低哼
  def("bulbhum", ({ audioContext: ac, output, cue, offset }) => {
    const p = par(cue, { level: 0.4, attack: 0.3, release: 0.4 });
    const rig = new Rig();
    const env = ac.createGain();
    for (const [f, g] of [[120, 0.04], [240.5, 0.018]] as Array<[number, number]>) {
      const o = rig.add(ac.createOscillator());
      o.frequency.value = f;
      const og = ac.createGain();
      og.gain.value = g;
      o.connect(og).connect(env);
      o.start(0);
    }
    env.connect(output);
    shape(ac, env, cue.end - cue.start, offset, p.attack, p.release, p.level);
    return rig.handle();
  });
  // —— 室内底噪（分几种：胡同 / 正房 / 车间 / 地下室 / 舱室）
  const tone = (name: string, spec: { lp: number; level: number; hum?: number; air?: [number, number, number] }) =>
    def(name, ({ audioContext: ac, output, cue, offset }) => {
      const p = par(cue, { attack: 1.4, release: 1.4, level: 1 });
      const rig = new Rig();
      const env = ac.createGain();
      const src = kit.noiseSrc(rig, "pink");
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = spec.lp;
      const g = ac.createGain();
      g.gain.value = spec.level;
      src.connect(lp).connect(g).connect(env);
      src.start(0, ((offset * 0.31) % 3) + 0.2);
      if (spec.hum) {
        const o = rig.add(ac.createOscillator());
        o.frequency.value = spec.hum;
        const og = ac.createGain();
        og.gain.value = 0.012;
        o.connect(og).connect(env);
        o.start(0);
      }
      if (spec.air) {
        const s2 = kit.noiseSrc(rig, "white");
        const bp = ac.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = spec.air[0];
        bp.Q.value = spec.air[1];
        const ag = ac.createGain();
        ag.gain.value = spec.air[2];
        s2.connect(bp).connect(ag).connect(env);
        s2.start(0, 1.9);
      }
      env.connect(output);
      shape(ac, env, cue.end - cue.start, offset, p.attack, p.release, p.level);
      return rig.handle();
    });
  tone("tone-alley", { lp: 260, level: 0.5, air: [1100, 0.5, 0.012] });
  tone("tone-room", { lp: 180, level: 0.4, hum: 50 });
  tone("tone-workshop", { lp: 240, level: 0.45, hum: 50 });
  tone("tone-basement", { lp: 150, level: 0.5 });
  tone("tone-cabin", { lp: 620, level: 0.32, air: [2600, 0.7, 0.006] });
  // —— 夏夜的虫鸣（很轻）
  def("cricket", ({ audioContext: ac, output, cue, offset }) => {
    const p = par(cue, { level: 0.2, attack: 1.5, release: 1.5 });
    const rig = new Rig();
    const carrier = rig.add(ac.createOscillator());
    carrier.frequency.value = 4350;
    const trem = rig.add(ac.createOscillator());
    trem.type = "square";
    trem.frequency.value = 31;
    const shaper = ac.createWaveShaper();
    shaper.curve = new Float32Array([0, 1]);
    const gate = rig.add(ac.createOscillator());
    gate.type = "square";
    gate.frequency.value = 2.6;
    const gShaper = ac.createWaveShaper();
    gShaper.curve = new Float32Array([0, 1]);
    const amp = ac.createGain();
    amp.gain.value = 0;
    const gAmp = ac.createGain();
    gAmp.gain.value = 0;
    trem.connect(shaper).connect(amp.gain);
    gate.connect(gShaper).connect(gAmp.gain);
    const env = ac.createGain();
    carrier.connect(amp).connect(gAmp).connect(env).connect(output);
    shape(ac, env, cue.end - cue.start, offset, p.attack, p.release, p.level * 0.08);
    carrier.start(0);
    trem.start(0);
    gate.start(0);
    return rig.handle();
  });
  // —— 倒茶：细水流 + 杯里渐满的“咕嘟”
  def("pour", ({ audioContext: ac, output, cue, offset }) => {
    const p = par(cue, { level: 0.5, attack: 0.15, release: 0.35 });
    const rig = new Rig();
    const src = kit.noiseSrc(rig, "white");
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2000;
    bp.Q.value = 1.4;
    const amp = ac.createGain();
    amp.gain.value = 0.6;
    const flut = rig.add(ac.createOscillator());
    flut.frequency.value = 17;
    const fa = ac.createGain();
    fa.gain.value = 0.22;
    flut.connect(fa).connect(amp.gain);
    const env = ac.createGain();
    src.connect(bp).connect(amp).connect(env).connect(output);
    // 水位上升：中心频率逐渐抬高
    bp.frequency.setValueAtTime(1500, ac.currentTime);
    bp.frequency.linearRampToValueAtTime(2900, ac.currentTime + Math.max(0.5, cue.end - cue.start - offset));
    shape(ac, env, cue.end - cue.start, offset, p.attack, p.release, p.level);
    src.start(0, 0.9);
    flut.start(0);
    return rig.handle();
  });
  // —— 刷子扫过（碎屑）
  def("brush", ({ audioContext: ac, output, cue, offset }) => {
    const p = par(cue, { level: 0.4, attack: 0.08, release: 0.15 });
    const rig = new Rig();
    const src = kit.noiseSrc(rig, "white");
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3800;
    bp.Q.value = 0.8;
    const amp = ac.createGain();
    amp.gain.value = 0;
    const lfo = rig.add(ac.createOscillator());
    lfo.type = "sine";
    lfo.frequency.value = 3.4;
    const abs = ac.createWaveShaper();
    abs.curve = new Float32Array([1, 0, 1]);
    lfo.connect(abs).connect(amp.gain);
    const env = ac.createGain();
    src.connect(bp).connect(amp).connect(env).connect(output);
    shape(ac, env, cue.end - cue.start, offset, p.attack, p.release, p.level);
    src.start(0, 0.3);
    lfo.start(0);
    return rig.handle();
  });
  // —— 老木门的吱呀
  def("creak", ({ audioContext: ac, output, cue, offset }) => {
    const p = par(cue, { level: 0.35, f0: 86, f1: 132 });
    const rig = new Rig();
    const dur = Math.max(0.3, cue.end - cue.start - offset);
    const o = rig.add(ac.createOscillator());
    o.type = "sawtooth";
    o.frequency.setValueAtTime(p.f0, ac.currentTime);
    o.frequency.linearRampToValueAtTime(p.f1, ac.currentTime + dur);
    const vib = rig.add(ac.createOscillator());
    vib.frequency.value = 9;
    const va = ac.createGain();
    va.gain.value = 5;
    vib.connect(va).connect(o.frequency);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 520;
    bp.Q.value = 3.2;
    const env = ac.createGain();
    o.connect(bp).connect(env).connect(output);
    shape(ac, env, cue.end - cue.start, offset, 0.12, 0.35, p.level);
    o.start(0);
    vib.start(0);
    return rig.handle();
  });
  // —— 泄压的嘶声：越来越细、越来越轻，直到什么都没有（从气闸走进真空）
  def("hissfade", ({ audioContext: ac, output, cue, offset }) => {
    const p = par(cue, { level: 0.5 });
    const rig = new Rig();
    const t = ac.currentTime;
    const remain = Math.max(0.3, cue.end - cue.start - offset);
    const src = kit.noiseSrc(rig, "white");
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(1500, t);
    hp.frequency.exponentialRampToValueAtTime(7000, t + remain);
    const env = ac.createGain();
    env.gain.setValueAtTime(p.level, t);
    env.gain.exponentialRampToValueAtTime(0.0008, t + remain);
    src.connect(hp).connect(env).connect(output);
    src.start(0, 1.5);
    return rig.handle();
  });
  // —— 撕布（拆牛肉外包的布）
  def("rip", ({ audioContext: ac, output, cue }) => {
    const p = par(cue, { level: 0.5 });
    const rig = new Rig();
    const t = ac.currentTime;
    const src = kit.noiseSrc(rig, "white");
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1400;
    const amp = ac.createGain();
    amp.gain.value = 0.6;
    const trem = rig.add(ac.createOscillator());
    trem.frequency.value = 58;
    const ta = ac.createGain();
    ta.gain.value = 0.35;
    trem.connect(ta).connect(amp.gain);
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(p.level, t + 0.03);
    env.gain.setValueAtTime(p.level * 0.8, t + 0.25);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.62);
    src.connect(hp).connect(amp).connect(env).connect(output);
    src.start(0, 0.8);
    trem.start(0);
    return rig.handle();
  });
  // —— 电子提示音（手机、机床面板）
  def("beep", ({ audioContext: ac, output, cue }) => {
    const p = par(cue, { f: 1800, level: 0.25, len: 0.07, f2: 0 });
    const rig = new Rig();
    const t = ac.currentTime;
    const o = rig.add(ac.createOscillator());
    o.type = "sine";
    o.frequency.setValueAtTime(p.f, t);
    if (p.f2) o.frequency.setValueAtTime(p.f2, t + p.len);
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(p.level, t + 0.004);
    env.gain.setValueAtTime(p.level, t + p.len * (p.f2 ? 2 : 1) - 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + p.len * (p.f2 ? 2 : 1) + 0.03);
    o.connect(env).connect(output);
    o.start(0);
    o.stop(t + p.len * 2 + 0.1);
    return rig.handle();
  });
}
