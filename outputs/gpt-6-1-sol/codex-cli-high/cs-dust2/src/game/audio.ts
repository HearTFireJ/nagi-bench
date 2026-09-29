import type { WeaponId } from "./types";
/** Entire sound bank is synthesized. Nothing is fetched from disk or the network. */
export class AudioBank {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  volume = 0.65;
  init() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * 0.45;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }
  setVolume(value: number) {
    this.volume = value;
    if (this.master) this.master.gain.value = value * 0.45;
  }
  tone(
    freq: number,
    duration: number,
    gain = 0.2,
    type: OscillatorType = "sine",
    delay = 0,
    end = freq,
    pan = 0,
  ) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator(),
      env = this.ctx.createGain(),
      stereo = this.ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, end), t + duration);
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);
    stereo.pan.value = Math.max(-1, Math.min(1, pan));
    osc.connect(env);
    env.connect(stereo);
    stereo.connect(this.master);
    osc.start(t);
    osc.stop(t + duration);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
      stereo.disconnect();
    };
  }
  noise(duration: number, gain: number, cutoff: number, delay = 0, pan = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const buffer = this.ctx.createBuffer(
        1,
        Math.ceil(this.ctx.sampleRate * duration),
        this.ctx.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const source = this.ctx.createBufferSource(),
      filter = this.ctx.createBiquadFilter(),
      env = this.ctx.createGain(),
      stereo = this.ctx.createStereoPanner();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    env.gain.value = gain;
    stereo.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(filter);
    filter.connect(env);
    env.connect(stereo);
    stereo.connect(this.master);
    source.start(t);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      env.disconnect();
      stereo.disconnect();
    };
  }
  shot(id: WeaponId, volume = 1, pan = 0) {
    const spec = {
      ak: [115, 0.2, 4200],
      m4: [155, 0.15, 3200],
      awp: [65, 0.42, 5800],
      glock: [240, 0.1, 2600],
      usp: [190, 0.08, 1500],
      deagle: [105, 0.22, 4300],
      knife: [600, 0.13, 900],
    }[id];
    this.noise(spec[1], 0.65 * volume, spec[2], 0, pan);
    this.tone(spec[0], spec[1], 0.6 * volume, "triangle", 0, 30, pan);
    if (id === "awp")
      this.tone(380, 0.08, 0.12 * volume, "square", 0.55, 180, pan);
  }
  reload() {
    this.noise(0.09, 0.3, 2300);
    this.tone(850, 0.07, 0.1, "square", 0.28, 250);
    this.noise(0.13, 0.4, 2800, 0.9);
    this.tone(300, 0.08, 0.15, "triangle", 1.2, 100);
  }
  step(volume = 0.22, pan = 0) {
    this.noise(0.075, volume, 850, 0, pan);
    this.tone(85, 0.08, volume * 0.5, "sine", 0, 45, pan);
  }
  scope() {
    this.noise(0.08, 0.18, 2000);
    this.tone(620, 0.08, 0.1, "triangle", 0, 310);
  }
  hit() {
    this.tone(1200, 0.065, 0.16, "triangle", 0, 700);
  }
  kill() {
    this.tone(750, 0.12, 0.18, "sine");
    this.tone(1125, 0.18, 0.15, "sine", 0.08);
  }
  plant() {
    for (let i = 0; i < 4; i++)
      this.tone(1100 + i * 180, 0.08, 0.13, "square", i * 0.12);
  }
  beep(urgent = false) {
    this.tone(urgent ? 1550 : 1100, 0.08, 0.14, "sine");
  }
  defuse() {
    this.tone(1400, 0.3, 0.15, "sine", 0, 300);
    this.tone(700, 0.4, 0.18, "triangle", 0.2, 100);
  }
  explosion() {
    this.noise(2.2, 1.1, 1700);
    this.tone(65, 1.8, 1, "sine", 0, 16);
  }
  dispose() {
    if (this.ctx) void this.ctx.close();
  }
}
