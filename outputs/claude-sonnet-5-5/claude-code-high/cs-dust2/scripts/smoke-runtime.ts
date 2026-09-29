// Smoke test of the browser-side glue (runtime loop, renderer, viewmodel, effects, audio, HUD
// snapshots) in plain Node using stub `three` / `react` / DOM objects.
//   node --import ./scripts/mocks/register.mjs scripts/smoke-runtime.ts
// It does not validate real WebGL output; it makes sure our own code paths run without throwing
// and that the published HUD state is sane while a human plays a few rounds.

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;

function proxy(): any {
  const fn = function () {};
  const store = new Map<PropertyKey, unknown>();
  return new Proxy(fn, {
    get(_t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === 'then') return undefined;
      if (typeof p === 'symbol') return undefined;
      if (!store.has(p)) store.set(p, proxy());
      return store.get(p);
    },
    set(_t, p, v) {
      store.set(p, v);
      return true;
    },
    apply: () => proxy(),
    construct: () => proxy(),
  });
}

const listeners: Record<string, ((e: any) => void)[]> = {};
const fakeCanvas: any = {
  style: {},
  clientHeight: 720,
  clientWidth: 1280,
  width: 1280,
  height: 720,
  getContext: () => proxy(),
  addEventListener: (t: string, f: any) => (listeners['canvas:' + t] ??= []).push(f),
  removeEventListener: () => undefined,
  requestPointerLock: () => undefined,
};
g.window = g;
g.innerWidth = 1280;
g.innerHeight = 720;
g.devicePixelRatio = 1;
g.addEventListener = (t: string, f: any) => (listeners[t] ??= []).push(f);
g.removeEventListener = () => undefined;
g.document = {
  createElement: () => ({ ...fakeCanvas, getContext: () => proxy(), style: {} }),
  addEventListener: (t: string, f: any) => (listeners['doc:' + t] ??= []).push(f),
  removeEventListener: () => undefined,
  pointerLockElement: null,
  exitPointerLock: () => undefined,
};
let rafCb: ((t: number) => void) | null = null;
g.requestAnimationFrame = (cb: (t: number) => void) => {
  rafCb = cb;
  return 1;
};
g.cancelAnimationFrame = () => undefined;
g.AudioContext = function () {
  return proxy();
};

const { runtime } = await import('../src/runtime/runtime.ts');
const { hudStore } = await import('../src/runtime/store.ts');

const fire = (type: string, ev: any): void => {
  for (const f of listeners[type] ?? []) f(ev);
};

runtime.init(fakeCanvas);
runtime.startMatch({ team: 'CT', mode: 'pistol', winRounds: 8 });

let now = 1000;
const step = (n: number): void => {
  for (let i = 0; i < n; i++) {
    now += 16.67;
    (runtime as any).frame(now);
  }
};

const check = (cond: boolean, msg: string): void => {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  }
};

// 1. freeze phase, open buy menu, buy armor
step(30);
let h = hudStore.get();
check(h.phase === 'freeze', 'starts in freeze, got ' + h.phase);
check(h.weaponId === 'usp', 'CT starts with USP, got ' + h.weaponId);
check(h.hp === 100, 'hp 100');
check(h.money === 800, 'pistol round money 800, got ' + h.money);
fire('keydown', { code: 'KeyB', repeat: false, preventDefault() {} });
step(3);
check(hudStore.get().buyOpen, 'buy menu opens in freeze');
fire('keydown', { code: 'Digit4', repeat: false, preventDefault() {} }); // kevlar
step(3);
h = hudStore.get();
check(h.armor === 100, 'kevlar bought, armor=' + h.armor);
check(h.money === 150, 'money after kevlar = 150, got ' + h.money);
fire('keydown', { code: 'KeyB', repeat: false, preventDefault() {} });

// 2. go live, walk, shoot, look around
step(60 * 10);
h = hudStore.get();
check(h.phase === 'live', 'live after freeze, got ' + h.phase);
fire('keydown', { code: 'KeyW', repeat: false, preventDefault() {} });
fire('canvas:mousedown', { button: 0 });
for (let i = 0; i < 60 * 20; i++) {
  fire('mousemove', { movementX: 3, movementY: (i % 40 < 20 ? 1 : -1), });
  step(1);
}
fire('mouseup', { button: 0 });
h = hudStore.get();
check(Number.isFinite(h.spreadPx), 'spreadPx finite');
check(h.ammo >= 0 && h.ammo <= 12, 'ammo in range: ' + h.ammo);
console.log('after 20s of play:', JSON.stringify({ hp: h.hp, ammo: h.ammo, reserve: h.reserve, zone: h.zone, kills: h.killfeed.length, alive: h.alive }));

// 3. reload / slot switches / scope-less weapons
fire('keydown', { code: 'KeyR', repeat: false, preventDefault() {} });
step(5);
fire('keydown', { code: 'Digit3', repeat: false, preventDefault() {} });
step(70);
check(hudStore.get().weaponId === 'knife', 'knife selected');
fire('keydown', { code: 'Digit2', repeat: false, preventDefault() {} });
step(70);

// 4. run several rounds with the human standing still; the match must progress and never crash
const sim = runtime.sim!;
const rounds0 = sim.round;
step(60 * 60 * 3);
h = hudStore.get();
console.log('after 3 more minutes: round', sim.round, 'score', JSON.stringify(sim.score), 'human alive', sim.human?.alive, 'phase', h.phase);
check(sim.round >= rounds0, 'rounds progress');

// 5. spectate + takeover once dead
const human = sim.human!;
if (human.alive) sim.killActor(human, sim.actors[5], 'glock', false);
step(20);
h = hudStore.get();
check(h.dead, 'hud says dead');
check(h.spectating || sim.aliveCount('CT') === 0, 'spectating a teammate');
if (sim.phase === 'live') {
  fire('keydown', { code: 'KeyF', repeat: false, preventDefault() {} });
  step(20);
  check(sim.humanId !== sim.homeId || sim.aliveCount('CT') === 0, 'takeover switched controlled actor');
}

// 6. scoreboard
fire('keydown', { code: 'Tab', repeat: false, preventDefault() {} });
step(10);
check(hudStore.get().scoreboard.length === 10, 'scoreboard has 10 rows');
fire('keyup', { code: 'Tab', preventDefault() {} });

// 7. no NaN anywhere in the world
for (const a of sim.actors) {
  check(Number.isFinite(a.pos.x + a.pos.y + a.pos.z + a.yaw + a.pitch), 'finite transform for ' + a.name);
}
void rafCb;
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE OK');
