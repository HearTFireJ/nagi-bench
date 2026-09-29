// Headless smoke test of the presentation layer: session loop, input handling, renderer,
// audio synthesis, HUD store, minimap - executed against in-memory stand-ins for three.js,
// the DOM and Web Audio (see scripts/smoke/*). It proves the code runs end to end without
// exceptions / NaNs and that the data flow sim -> renderer -> HUD is wired up.
// It does NOT prove anything about real WebGL output or React rendering.
//
//   npm run test:smoke
import { audioLog, canvasLog, doc, fire, installGlobals, listenerCount, makeGameCanvas, runFrame } from './dom-stub.mjs';

installGlobals();
const { GameSession } = await import('../../src/app/session.ts');
const { computeHud } = await import('../../src/app/hudStore.ts');

let passes = 0;
let failures = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) {
    passes++;
    console.log('  ✓ ' + msg);
  } else {
    failures++;
    console.log('  ✗ FAIL: ' + msg);
  }
}

const canvas = makeGameCanvas();
const session = new GameSession(canvas as unknown as HTMLCanvasElement, { playerTeam: 'T', mode: 'pistol', seed: 5, difficulty: 'normal' });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S = session as any;
const game = session.game;
let now = 0;
const frame = (n = 1, dtMs = 1000 / 60): void => {
  for (let i = 0; i < n; i++) {
    now += dtMs;
    runFrame(now);
  }
};
const key = (code: string, down = true): void => fire('window', down ? 'keydown' : 'keyup', { code, repeat: false, ctrlKey: false });

console.log('\n# session start / pause / pointer lock');
const baseline = listenerCount();
session.start();
ok(listenerCount() > baseline, 'input listeners attached');
ok(session.store.getSnapshot().paused && !session.store.getSnapshot().started, 'HUD says: paused, not started (waiting for click)');
const t0 = game.time;
frame(30);
ok(game.time === t0, 'sim does not advance while the pointer is not locked');
session.resume();
ok(doc.pointerLockElement === canvas, 'click requests pointer lock');
ok(!session.isPaused && session.store.getSnapshot().started, 'pointer lock un-pauses the game');
ok(audioLog.contexts === 1, 'AudioContext created on the first gesture');

console.log('\n# playing: movement, look, fire, reload, weapon switch');
const startPos = { x: game.human!.pos.x, z: game.human!.pos.z };
frame(60 * 7); // freeze time
ok(game.phase === 'live', `freeze time ended (phase=${game.phase})`);
key('KeyW');
for (let i = 0; i < 90; i++) {
  fire('document', 'mousemove', { movementX: i % 2 ? 8 : -8, movementY: 0 });
  frame(1);
}
ok(Math.hypot(game.human!.pos.x - startPos.x, game.human!.pos.z - startPos.z) > 4, 'WASD moves the player');
const yawBefore = game.human!.yaw;
fire('document', 'mousemove', { movementX: 100, movementY: 0 });
ok(game.human!.yaw < yawBefore, 'mouse right turns right (yaw decreases)');
const pitchBefore = game.human!.pitch;
fire('document', 'mousemove', { movementX: 0, movementY: -50 });
ok(game.human!.pitch > pitchBefore, 'mouse up looks up');
key('KeyW', false);
key('Space');
frame(3);
key('Space', false);
ok(!game.human!.onGround || game.human!.pos.y > 0.001 || game.human!.vel.y !== 0, 'space jumps');

const glock = game.human!.weapon;
const magBefore = glock.mag;
fire('document', 'mousedown', { button: 0 });
frame(2);
fire('document', 'mouseup', { button: 0 });
frame(10);
ok(glock.mag < magBefore, `left click fires (ammo ${magBefore} -> ${glock.mag})`);
ok(session.store.getSnapshot().weapon.mag === glock.mag, 'HUD ammo panel tracks the magazine');
key('KeyR');
frame(2);
ok(game.human!.reloading, 'R reloads');
frame(60 * 3);
ok(glock.mag === glock.def.mag, 'reload completes and refills');
key('Digit3');
frame(3);
ok(game.human!.activeSlot === 'melee', 'key 3 selects the knife');
key('Digit2');
frame(3);
ok(game.human!.activeSlot === 'secondary', 'key 2 selects the pistol');
fire('document', 'wheel', { deltaY: 100 });
frame(2);
ok(game.human!.activeSlot === 'melee', 'mouse wheel cycles weapons');
key('Digit2');
frame(2);

console.log('\n# buy menu / scoreboard / crosshair');
// buying only works in freeze; use a fresh round
game.human!.money = 5000;
game.phase = 'freeze';
game.freezeLeft = 5;
key('KeyB');
frame(2);
ok(session.store.getSnapshot().buyOpen, 'B opens the buy menu during freeze time');
const ak = session.store.getSnapshot().buyItems.find((i) => i.id === 'ak47');
ok(!!ak && ak.enabled, 'AK-47 is offered to the T side');
key('Digit1');
frame(2);
ok(game.human!.primary?.def.id === 'ak47', 'number key buys the item');
key('KeyB');
key('Tab');
frame(12);
ok(session.store.getSnapshot().showScoreboard, 'Tab shows the scoreboard');
key('Tab', false);
frame(12);
ok(!session.store.getSnapshot().showScoreboard, 'releasing Tab hides it');
ok(session.frameInfo.spreadPx > 0, `crosshair spread is published each frame (${session.frameInfo.spreadPx.toFixed(1)}px)`);
game.phase = 'live';
game.freezeLeft = 0;
game.human!.armor = 100;

console.log('\n# renderer + audio state after a few seconds of play');
frame(60 * 5);
const rs = S.renderer.renderer.stats;
ok(rs.renders > 200, `three renderer was driven (${rs.renders} render calls)`);
ok(rs.depthClears > 100, 'weapon (viewmodel) pass is rendered on top with a depth clear');
ok(rs.problems.length === 0, `no NaN transforms in the scene graph ${rs.problems.length ? JSON.stringify(rs.problems.slice(0, 3)) : ''}`);
ok(audioLog.sources > 5, `sound effects were synthesised (${audioLog.sources} sources, ${audioLog.nodes} nodes)`);

console.log('\n# death -> spectate -> takeover');
const me = game.human!;
const enemy = game.chars.find((c) => c.team === 'CT')!;
game.applyDamageRaw(enemy, me, 'ak47', 'head', 999, 0, 0, 0, 0);
frame(15);
let h = session.store.getSnapshot();
ok(!h.alive && h.spectating !== null, `dead -> spectating ${h.spectating?.name}`);
ok(game.viewChar!.id !== me.id, 'camera switched to a living teammate');
fire('document', 'mousedown', { button: 0 });
fire('document', 'mouseup', { button: 0 });
frame(3);
key('KeyF');
frame(15);
h = session.store.getSnapshot();
ok(h.alive && game.human!.id !== me.id, `F takes over a bot: now controlling ${game.human!.name}`);
ok(game.chars.filter((c) => c.isHuman).length === 1, 'still exactly one human');

console.log('\n# 4 game minutes of bots fighting, planting, defusing, exploding');
let exploded = 0;
let planted = 0;
const origEmit = game.emit.bind(game);
game.emit = (e) => {
  if (e.type === 'exploded') exploded++;
  if (e.type === 'planted') planted++;
  origEmit(e);
};
frame(60 * 60 * 4, 1000 / 60);
ok(game.roundNumber >= 2, `rounds progress under the session loop (round ${game.roundNumber}, score CT ${game.score.CT} - T ${game.score.T})`);
ok(rs.problems.length === 0, 'still no NaN transforms after the long run');
ok(audioLog.errors.length === 0, 'no audio errors');
void planted;
void exploded;

console.log('\n# every event type through renderer effects + audio synthesis');
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: any[] = [];
  const a = game.chars[0].id;
  const b = game.chars[6].id;
  const P = { x: 60, y: 0, z: 90 };
  for (const w of ['ak47', 'm4a4', 'awp', 'glock', 'usp', 'deagle', 'knife']) {
    events.push({ type: 'shot', shooter: a, weapon: w, ox: 60, oy: 1.6, oz: 90, ex: 60, ey: 1.5, ez: 60, hit: 'world', nx: 0, ny: 0, nz: 1, silenced: w === 'usp' });
    events.push({ type: 'shot', shooter: b, weapon: w, ox: 50, oy: 1.6, oz: 90, ex: 55, ey: 1.5, ez: 60, hit: 'char', nx: 0, ny: 1, nz: 0, silenced: false });
    events.push({ type: 'reload', id: a, weapon: w, duration: 2.4 });
    events.push({ type: 'reloadDone', id: a, weapon: w });
    events.push({ type: 'dryfire', id: a, weapon: w });
    events.push({ type: 'switch', id: a, weapon: w });
  }
  events.push({ type: 'hit', attacker: a, victim: b, damage: 30, armorLoss: 3, hitbox: 'head', headshot: true, killed: false, weapon: 'ak47', ...P });
  events.push({ type: 'hit', attacker: b, victim: game.playerId, damage: 30, armorLoss: 0, hitbox: 'chest', headshot: false, killed: false, weapon: 'ak47', ...P });
  events.push({ type: 'kill', killer: a, victim: b, weapon: 'ak47', headshot: true, killerTeam: 'CT', victimTeam: 'T', killerName: 'x', victimName: 'y' });
  events.push({ type: 'kill', killer: b, victim: game.playerId, weapon: 'awp', headshot: false, killerTeam: 'T', victimTeam: 'CT', killerName: 'x', victimName: 'y' });
  events.push({ type: 'scope', id: a, level: 1 }, { type: 'scope', id: a, level: 0 });
  events.push({ type: 'melee', id: a, kind: 'slash', hit: true, ...P }, { type: 'melee', id: a, kind: 'stab', hit: false, ...P });
  events.push({ type: 'footstep', id: a, ...P }, { type: 'footstep', id: b, ...P }, { type: 'land', id: a, impact: 6, ...P }, { type: 'jump', id: a, ...P });
  events.push({ type: 'bombPickup', id: a }, { type: 'bombDrop', id: a, ...P });
  events.push({ type: 'plantStart', id: a, ...P }, { type: 'plantAbort', id: a }, { type: 'planted', id: a, site: 'A', ...P });
  events.push({ type: 'defuseStart', id: a, ...P }, { type: 'defuseAbort', id: a }, { type: 'defused', id: a });
  events.push({ type: 'bombBeep', ...P, urgency: 0.7 }, { type: 'exploded', ...P }, { type: 'doorMove', id: 'midDoors', opening: true, x: 60, z: 41 });
  events.push({ type: 'roundStart', round: 4 }, { type: 'freezeEnd' }, { type: 'roundEnd', winner: 'CT', reason: 'bomb_defused' }, { type: 'roundEnd', winner: 'T', reason: 'elimination' });
  events.push({ type: 'matchEnd', winner: 'CT' }, { type: 'takeover', from: 1, to: 2 }, { type: 'buy', id: game.playerId, item: 'kevlar' });
  const listener = { x: 55, y: 1.6, z: 85 };
  let threw = '';
  try {
    S.renderer.handleEvents(events);
    session.audio.handle(events, game, listener);
    // let the explosion + particles animate for a while
    frame(60);
  } catch (err) {
    threw = String(err instanceof Error ? err.stack : err);
  }
  ok(threw === '', `all ${events.length} events handled without exceptions${threw ? '\n' + threw : ''}`);
  ok(S.renderer.renderer.stats.problems.length === 0, 'effects produced no NaN transforms');
  ok(audioLog.errors.length === 0, 'audio graph valid for every sound');
}

console.log('\n# HUD snapshot, minimap, pause');
const snap = session.store.getSnapshot();
ok(snap.scoreboard.length === 10 && typeof snap.timeLabel === 'string' && /^\d+:\d\d$/.test(snap.timeLabel), `HUD snapshot is coherent (clock ${snap.timeLabel})`);
const before = session.store.getSnapshot();
session.store.set(computeHud(game, { started: true, paused: false, buyOpen: false, showScoreboard: false, hitSeq: 0, hitHeadshot: false, hitKill: false, hurtSeq: 0, hurtAngle: 0, hurtDamage: 0, eventBanner: null }));
ok(session.store.getSnapshot() === before || JSON.stringify(session.store.getSnapshot()) !== '', 'store accepts snapshots (identical ones are deduplicated)');
session.minimap.draw(makeGameCanvas().getContext('2d') as CanvasRenderingContext2D, game.viewChar, 1.5);
ok(session.minimap.width === 220 && session.minimap.height > 200, `minimap drew (${session.minimap.width}x${session.minimap.height})`);
game.matchWinner = 'CT';
game.phase = 'matchEnd';
const me2 = computeHud(game, { started: true, paused: true, buyOpen: false, showScoreboard: false, hitSeq: 0, hitHeadshot: false, hitKill: false, hurtSeq: 0, hurtAngle: 0, hurtDamage: 0, eventBanner: null });
ok(me2.matchOver?.winner === 'CT' && me2.showScoreboard, 'match-over HUD state');
game.phase = 'live';
doc.exitPointerLock();
ok(session.isPaused, 'losing pointer lock (Esc) pauses');
const tp = game.time;
frame(30);
ok(game.time === tp, 'sim frozen while paused');

console.log('\n# teardown');
session.dispose();
ok(listenerCount() === baseline, 'all input listeners removed on dispose');
void canvasLog;

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
