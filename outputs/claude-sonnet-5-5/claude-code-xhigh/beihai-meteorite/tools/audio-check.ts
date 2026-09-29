// Runs every sound factory against a strict mock of the Web Audio API that throws in the same
// places real browsers do (non-finite values, exponential ramps to <= 0, negative times,
// double start, stop-before-start).  The only way to exercise audio code without a browser.
import { installDomStub } from "./dom-stub";
installDomStub();

const stats = { nodes: 0, sources: 0, maxLive: 0, live: 0 };
const fail = (m: string): never => {
  throw new Error(m);
};
const finite = (v: number, what: string): void => {
  if (!Number.isFinite(v)) fail(`non-finite ${what}: ${v}`);
};

class Param {
  private v: number;
  constructor(private readonly name: string, value = 0) { this.v = value; }
  get value(): number { return this.v; }
  set value(x: number) { finite(x, `${this.name}.value`); this.v = x; }
  setValueAtTime(x: number, t: number): this { finite(x, this.name); finite(t, `${this.name} time`); if (t < 0) fail(`negative time ${t} on ${this.name}`); return this; }
  linearRampToValueAtTime(x: number, t: number): this { finite(x, this.name); finite(t, `${this.name} time`); if (t < 0) fail(`negative time on ${this.name}`); return this; }
  exponentialRampToValueAtTime(x: number, t: number): this {
    finite(x, this.name); finite(t, `${this.name} time`);
    if (x <= 0) fail(`exponentialRamp to ${x} on ${this.name}`);
    if (t < 0) fail(`negative time on ${this.name}`);
    return this;
  }
  setTargetAtTime(x: number, t: number, k: number): this { finite(x, this.name); finite(t, this.name); finite(k, this.name); return this; }
}

class Node {
  constructor() { stats.nodes++; }
  connect<T>(dest: T): T { if (!dest) fail("connect to nothing"); return dest; }
  disconnect(): void {}
}
class Gain extends Node { gain = new Param("gain", 1); }
class Biquad extends Node {
  type = "lowpass";
  frequency = new Param("frequency", 350);
  Q = new Param("Q", 1);
  detune = new Param("detune", 0);
  gain = new Param("gain", 0);
}
class Convolver extends Node { buffer: unknown = null; }
class Buf {
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    if (length <= 0) fail("empty buffer");
  }
  get duration(): number { return this.length / this.sampleRate; }
  private readonly data: Float32Array[] = [];
  getChannelData(ch: number): Float32Array {
    return (this.data[ch] ??= new Float32Array(this.length));
  }
}
class Source extends Node {
  started = false;
  stopped = false;
  buffer: Buf | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate = new Param("playbackRate", 1);
  detune = new Param("detune", 0);
  frequency = new Param("frequency", 440);
  type = "sine";
  constructor() { super(); stats.sources++; }
  start(when = 0, offset = 0): void {
    if (this.started) fail("start() called twice");
    finite(when, "start when"); finite(offset, "start offset");
    if (when < 0) fail(`negative start time ${when}`);
    if (offset < 0) fail(`negative offset ${offset}`);
    this.started = true;
    stats.live++;
    stats.maxLive = Math.max(stats.maxLive, stats.live);
  }
  stop(when = 0): void {
    if (!this.started) fail("stop() before start()");
    finite(when, "stop when");
    if (when < 0) fail("negative stop time");
    if (!this.stopped) stats.live--;
    this.stopped = true;
  }
}

class MockAudioContext {
  currentTime = 4.0;
  sampleRate = 44100;
  state = "running";
  destination = new Node();
  createGain(): Gain { return new Gain(); }
  createOscillator(): Source { return new Source(); }
  createBufferSource(): Source { return new Source(); }
  createBiquadFilter(): Biquad { return new Biquad(); }
  createConvolver(): Convolver { return new Convolver(); }
  createBuffer(ch: number, len: number, sr: number): Buf { return new Buf(ch, len, sr); }
  async decodeAudioData(data: ArrayBuffer): Promise<Buf> {
    if (!(data instanceof ArrayBuffer) || data.byteLength < 100) fail("bad audio data");
    return new Buf(1, 44100, 44100);
  }
  async resume(): Promise<void> { this.state = "running"; }
  async close(): Promise<void> {}
}
(globalThis as unknown as { window: Record<string, unknown> }).window.AudioContext = MockAudioContext;

const { createFilm } = await import("../src/film");
const { createSoundDesign, FACTORY_NAMES } = await import("../src/audio/engine");
const { soundCues } = await import("../src/audio/soundCues");
const { DURATION } = await import("../src/timeline");

const film = createFilm();
const player = film.player;
const bus = createSoundDesign(player);
await bus.unlock();
console.log("unlocked; factories:", FACTORY_NAMES.length, "cues:", soundCues.length);

// Playing state, so seeks restart sustained beds exactly as the browser would.
player.play();
let exceptions = 0;
const originalError = console.error;
const seenSounds = new Set<string>();
player.addTypedEventListener("cueenter", (e) => {
  const cue = e.detail.cue as { sound?: string };
  if (cue.sound) seenSounds.add(cue.sound);
});
// EventTarget swallows listener exceptions into the global error handler; capture them.
(globalThis as unknown as { reportError?: (e: unknown) => void }).reportError = (e) => {
  exceptions++;
  originalError("  ✗ listener threw:", (e as Error).message);
};
const dispatch = player.dispatchEvent.bind(player);
player.dispatchEvent = (ev: Event): boolean => {
  const listeners = (player as unknown as { _l?: unknown })._l;
  void listeners;
  return dispatch(ev);
};

// Bun rethrows listener errors from dispatchEvent as uncaught; run inside try to surface them.
let t = 0;
const step = 0.05;
try {
  while (t < DURATION) {
    t = Math.min(DURATION, t + step);
    player.seek(t);
  }
  // scrub backwards and into the middle of sustained beds
  for (const probe of [200, 60, 290, 30, 160, 322, 145, 250]) player.seek(probe);
  player.pause();
} catch (error) {
  exceptions++;
  originalError("  ✗ exception while driving audio:", (error as Error).stack ?? error);
}

const distinct = new Set(soundCues.map((c) => c.sound));
console.log(`heard ${seenSounds.size}/${distinct.size} distinct sounds; peak simultaneously-live sources ${stats.maxLive}; total nodes ${stats.nodes}`);
console.log(exceptions ? `✗ ${exceptions} audio exception(s)` : "✓ every sound factory ran without a Web Audio error");
if (exceptions) process.exit(1);
