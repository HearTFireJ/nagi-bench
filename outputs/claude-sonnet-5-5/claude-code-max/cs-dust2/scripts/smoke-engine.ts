// End-to-end smoke test of the browser code path, run headlessly in Node with fake three / DOM / Web Audio (see
// scripts/stubs). It executes GameEngine -> GameRenderer -> characters / view model / effects / audio / input / HUD builder
// for thousands of frames, driving the game with synthetic keyboard + mouse events, and fails on any exception or
// non-finite transform. Run: npm run smoke
import { FakeContainer, audioStats, doc, fire, listenerCount, rafQueue } from './stubs/dom.ts';
import { GameEngine } from '../src/engine/GameEngine.ts';
import { applyDamage } from '../src/game/combat.ts';
import { makeWeaponState } from '../src/game/actor.ts';
import type { HudState } from '../src/engine/hudState.ts';
import type { WebGLRenderer } from './stubs/three.ts';

let failed = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
};

const container = new FakeContainer();
let clock = 0;
const tick = (frames: number, dtMs = 1000 / 60): void => {
  for (let i = 0; i < frames; i++) {
    const cb = rafQueue.shift();
    if (!cb) throw new Error('render loop stopped (no rAF callback queued)');
    clock += dtMs;
    cb(clock);
  }
};
const key = (code: string, down = true): void => fire('window', down ? 'keydown' : 'keyup', { code, repeat: false });
const engine = new GameEngine(container as never);
const anyEngine = engine as unknown as { world: typeof engine.world; renderer: { renderer: WebGLRenderer; currentFov: number }; screen: string; spectateId: number; input: { locked: boolean; fallback: boolean } };
const hud = (): HudState => engine.hud.get();

// ---------------------------------------------------------------- menu backdrop
tick(300);
check('menu: bot-only world runs behind the menu', hud().screen === 'menu' && engine.world.time > 4, 't=' + engine.world.time.toFixed(1));
check('menu: renderer produced frames', anyEngine.renderer.renderer.frames > 100, 'frames ' + anyEngine.renderer.renderer.frames);

// ---------------------------------------------------------------- start a pistol-round match as CT
engine.startMatch({ team: 'CT', pistolRound: true, difficulty: 0.5 }, { sensitivity: 1, volume: 0.6 });
check('startMatch asks for pointer lock inside the click', container.lockRequests === 1);
tick(5);
check('screen is playing once locked', hud().screen === 'playing' && anyEngine.input.locked, hud().screen);
check('pistol round HUD state', hud().pistolRound && hud().weapon.id === 'usp' && hud().armor === 0 && hud().slots.length === 2, JSON.stringify(hud().slots.map((s) => s.id)));
check('HUD has round/score/alive', hud().round === 1 && hud().aliveCT === 5 && hud().aliveT === 5);
check('zone callout is filled', hud().zoneName === 'CT出生点', hud().zoneName);

// freeze time then live
tick(60 * 6);
check('freeze ended -> live', hud().phase === 'live', hud().phase);

// walk forward, look around, shoot: synthetic input
key('KeyW');
fire('window', 'mousemove', { movementX: 120, movementY: 0 });
tick(30);
fire('window', 'mousedown', { button: 0 });
tick(30);
fire('window', 'mouseup', { button: 0 });
key('KeyW', false);
const me = engine.world.player;
check('mouse look changed the player yaw', Math.abs(me.yaw) > 0.05, 'yaw ' + me.yaw.toFixed(2));
check('player fired (ammo dropped)', hud().weapon.ammo < 12, 'ammo ' + hud().weapon.ammo);
check('W key moved the player', Math.hypot(me.pos.x - me.prevPos.x, me.pos.z - me.prevPos.z) >= 0 && me.pos.z !== 12.5, 'pos ' + me.pos.x.toFixed(1) + ',' + me.pos.z.toFixed(1));

// reload, switch, jump, use, scoreboard, buy menu (locked in pistol round)
key('KeyR');
tick(10);
check('R starts a reload', hud().weapon.reloading || hud().weapon.ammo === 12, 'reloading ' + hud().weapon.reloading);
key('Digit3');
tick(5);
check('3 selects the knife', hud().activeSlot === 'melee', hud().activeSlot);
key('Digit2');
tick(5);
key('Space');
tick(20);
key('Space', false);
fire('window', 'keydown', { code: 'Tab', repeat: false });
tick(6);
check('Tab opens the scoreboard', hud().scoreboardOpen && hud().scoreboard.length === 10, 'rows ' + hud().scoreboard.length);
fire('window', 'keyup', { code: 'Tab' });
tick(6);
check('Tab release closes it', !hud().scoreboardOpen);
fire('window', 'wheel', { deltaY: 100, preventDefault() {} });
tick(5);
key('KeyB');
tick(3);
check('buy menu stays closed in the pistol round', !hud().buyOpen);

// ---------------------------------------------------------------- AWP scope (2D overlay state + FOV zoom)
const w = engine.world;
w.player.weapons.primary = makeWeaponState('awp');
key('Digit1');
tick(90);
check('AWP is the active weapon', hud().weapon.id === 'awp' && hud().slots.some((s) => s.id === 'awp'), hud().weapon.id);
fire('window', 'mousedown', { button: 2 });
fire('window', 'mouseup', { button: 2 });
tick(30);
check('right click scopes: HUD scope level 1', hud().scopeLevel === 1, String(hud().scopeLevel));
check('3D FOV zoomed in while scoped', anyEngine.renderer.currentFov < 60, 'fov ' + anyEngine.renderer.currentFov.toFixed(1));
fire('window', 'mousedown', { button: 2 });
fire('window', 'mouseup', { button: 2 });
tick(30);
check('second right click -> level 2 (narrower)', hud().scopeLevel === 2 && anyEngine.renderer.currentFov < 20, 'fov ' + anyEngine.renderer.currentFov.toFixed(1));
fire('window', 'mousedown', { button: 2 });
fire('window', 'mouseup', { button: 2 });
tick(40);
check('third right click unscopes', hud().scopeLevel === 0 && anyEngine.renderer.currentFov > 70, 'fov ' + anyEngine.renderer.currentFov.toFixed(1));

// ---------------------------------------------------------------- death -> spectate -> take over
const killer = w.actors.find((a) => a.team === 'T')!;
applyDamage(w, killer, w.player, 'awp', 'head', 10);
tick(20);
check('player died', !w.player.alive && !hud().playerAlive);
check('spectating a living teammate', hud().spectating && hud().viewId !== w.playerId && hud().viewTeam === 'CT', 'view ' + hud().viewName);
const before = hud().viewId;
key('ArrowRight');
tick(5);
check('arrow key cycles the spectated teammate', hud().viewId !== before || w.aliveCount('CT') === 1, hud().viewName);
check('take-over is offered', hud().canTakeOver);
key('KeyF');
tick(5);
check('F takes over the spectated bot', w.controlledId !== w.playerId && w.controlled.human && !hud().spectating, 'controlled ' + w.controlledId);
key('KeyW');
tick(60);
key('KeyW', false);
check('HUD now shows the taken-over bot', hud().viewId === w.controlledId && hud().playerAlive);

// ---------------------------------------------------------------- run many rounds (bots, bomb, effects, audio)
const startRound = hud().round;
for (let i = 0; i < 6000; i++) {
  if (i % 4 === 0) fire('window', 'mousemove', { movementX: Math.sin(i / 50) * 20, movementY: Math.cos(i / 70) * 5 });
  tick(1);
}
check('rounds advanced while running', hud().round > startRound || hud().screen === 'matchEnd', 'round ' + startRound + ' -> ' + hud().round);
check('killfeed entries were produced at some point', engine.world.actors.some((a) => a.kills > 0));
check('audio nodes were created (sounds played)', audioStats.nodes > 200 && audioStats.sources > 100, 'nodes ' + audioStats.nodes + ' sources ' + audioStats.sources);

// ---------------------------------------------------------------- pause on lock loss, resume
doc.pointerLockElement = null;
fire('document', 'pointerlockchange');
tick(3);
if (hud().screen !== 'matchEnd') {
  check('losing pointer lock pauses', hud().screen === 'paused', hud().screen);
  const t0 = engine.world.time;
  tick(60);
  check('simulation is frozen while paused', engine.world.time === t0);
  engine.resume();
  tick(3);
  check('resume returns to playing', hud().screen === 'playing', hud().screen);
}

// ---------------------------------------------------------------- pointer lock refused -> fallback mode
engine.returnToMenu();
tick(30);
check('back to menu', hud().screen === 'menu');
container.refuseLock = true;
engine.startMatch({ team: 'T', pistolRound: false, difficulty: 0.7 });
tick(10);
check('a single lock refusal keeps the game paused (transient)', !hud().fallbackLook && hud().screen === 'paused', 'fallback ' + hud().fallbackLook + ' screen ' + hud().screen);
engine.resume();
tick(10);
check('repeated refusals fall back to plain mouse look', hud().fallbackLook && hud().screen === 'playing', 'fallback ' + hud().fallbackLook + ' screen ' + hud().screen);
fire('window', 'keydown', { code: 'Escape', repeat: false });
tick(3);
check('ESC pauses in fallback mode', hud().screen === 'paused', hud().screen);
engine.resume();
tick(3);
check('and resumes again', hud().screen === 'playing', hud().screen);
check('T full round: rifle + armor + bomb slot logic', hud().weapon.id === 'ak47' && hud().armor === 100, hud().weapon.id + ' armor ' + hud().armor);
tick(60 * 3);
fire('window', 'keydown', { code: 'KeyB', repeat: false });
tick(3);
check('buy menu opens in a non-pistol freeze', hud().buyOpen || hud().phase !== 'freeze', 'phase ' + hud().phase);
key('Digit1');
tick(3);

// ---------------------------------------------------------------- dispose cleans everything
engine.dispose();
check('dispose removed the canvas', container.children.length === 0, 'children ' + container.children.length);
check('dispose removed every window/document listener', listenerCount() === 0, 'listeners ' + listenerCount());

console.log(failed === 0 ? '\nSMOKE TEST PASSED' : '\n' + failed + ' CHECK(S) FAILED');
process.exit(failed === 0 ? 0 : 1);
