// Headless engine smoke test: runs the real Game class (rounds, input, bots, weapons, C4,
// HUD publishing) with three.js and the DOM replaced by permissive stubs.
import { dom } from './dom-stub.mjs';
import { Game } from '../src/game/Game';

let fail = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) fail++;
  console.log((ok ? 'OK   ' : 'FAIL ') + name);
};

const game = new Game(dom.container as unknown as HTMLElement);
dom.tick(16);
check('menu phase before start', game.store.getSnapshot().phase === 'menu');

game.start('T');
dom.tick(16);
let hud = game.store.getSnapshot();
check('freeze phase after start', hud.phase === 'freeze');
check('pointer locked after start', hud.pointerLocked);
check('10 players on the scoreboard', hud.players.length === 10);
check('player is on team T with a Glock', hud.me.team === 'T' && hud.me.weaponId === 'glock');
check('pistol round: no primary', !hud.me.weapons.some((w) => w.slot === 'primary'));
check('one T carries the C4', hud.players.filter((p) => p.hasC4).length === 1 && hud.players.find((p) => p.hasC4)!.team === 'T');

// Buy menu during freeze time
dom.press('KeyB');
dom.tick(16);
hud = game.store.getSnapshot();
check('buy menu opens with B', hud.buyMenuOpen);
game.buy('deagle');
dom.tick(16);
hud = game.store.getSnapshot();
check('bought a Desert Eagle for $700', hud.me.weaponId === 'deagle' && hud.me.money === 100);
dom.press('KeyB');
dom.tick(16);
check('buy menu closes', !game.store.getSnapshot().buyMenuOpen);

// Wait for the round to go live
const runSeconds = (s: number) => {
  for (let i = 0; i < s * 60; i++) dom.tick(1000 / 60);
};
runSeconds(6.5);
hud = game.store.getSnapshot();
check('round is live after freeze time', hud.phase === 'live');

// Player moves forward and shoots
const startPos = game.characters.find((c) => c.isPlayer)!.pos;
const before = { ...startPos };
dom.key('KeyW');
runSeconds(1);
dom.key('KeyW', false);
const player = game.characters.find((c) => c.isPlayer)!;
const moved = Math.hypot(player.pos.x - before.x, player.pos.z - before.z);
console.log('player moved', moved.toFixed(2), 'm');
check('player moved forward ~5 m/s', moved > 3 && moved < 7);
dom.move(200, 0);
dom.tick(16);
dom.mouse(0);
dom.tick(16);
dom.mouse(0, false);
runSeconds(0.2);
hud = game.store.getSnapshot();
check('firing consumed a round (deagle 7 -> 6)', hud.me.ammo === 6);
dom.press('KeyR');
runSeconds(0.1);
check('reload started', game.store.getSnapshot().me.reloading);
runSeconds(2.5);
check('reload completed (7 in mag, 34 reserve)', game.store.getSnapshot().me.ammo === 7 && game.store.getSnapshot().me.reserve === 34);
dom.press('Digit3');
runSeconds(0.1);
check('switched to knife', game.store.getSnapshot().me.isMelee);
dom.press('Digit2');
runSeconds(0.1);
check('switched back to pistol', game.store.getSnapshot().me.weaponId === 'deagle');

// Let the round play out with bots
let sawPlanted = false;
let sawKills = false;
let maxRound = 1;
for (let s = 0; s < 400; s++) {
  runSeconds(1);
  hud = game.store.getSnapshot();
  if (hud.bomb.state === 'planted') sawPlanted = true;
  if (hud.killfeed.length > 0) sawKills = true;
  maxRound = Math.max(maxRound, hud.roundNumber);
  if (hud.roundNumber >= 3 && hud.phase === 'freeze') break;
}
hud = game.store.getSnapshot();
console.log('round', hud.roundNumber, 'score CT', hud.scoreCT, 'T', hud.scoreT, 'planted seen:', sawPlanted, 'kills seen:', sawKills);
check('rounds progressed (>= 2)', maxRound >= 2);
check('kills happened', sawKills);
check('score advanced', hud.scoreCT + hud.scoreT >= 1);
check('round 2+ is not a pistol round', !hud.pistolRound);
check('round winners earned money', hud.players.some((p) => p.money > 800));

// Spectate / takeover flow: kill the player and check spectating + takeover
const me = game.characters.find((c) => c.isPlayer)!;
runSeconds(7); // into live
if (me.alive) {
  me.health = 1;
  // simulate a headshot from an enemy through the public damage path: use the C4 explosion helper is private, so
  // instead let a bot kill us: cheap approach — directly call die via a fake shot: we mark health and let the next
  // damage kill. We can't guarantee damage, so just force death through the same API bots use.
  (game as unknown as { kill: (v: unknown, a: unknown, w: string, n: string, hs: boolean) => void }).kill(me, null, 'c4', 'C4', false);
}
runSeconds(2);
hud = game.store.getSnapshot();
console.log('after death: alive=', hud.me.alive, 'spectating=', hud.spectating, 'target=', hud.spectateName, 'phase=', hud.phase);
check('spectating a teammate after death', hud.spectating || hud.phase === 'ended' || hud.phase === 'freeze');
if (hud.spectating && hud.canTakeover) {
  dom.press('KeyF');
  runSeconds(0.2);
  hud = game.store.getSnapshot();
  check('takeover: now controlling a living character named You', hud.me.alive && hud.me.name === 'You' && !hud.spectating);
  const controlled = game.characters.filter((c) => c.controller === 'player');
  check('exactly one player-controlled character', controlled.length === 1);
}

// Minimap data sanity
const mm = game.getMinimapData();
check('minimap has viewer + 4 allies', !!mm.viewer && mm.allies.length === 4);

game.dispose();
console.log(fail === 0 ? '\nENGINE SMOKE TEST PASSED' : `\n${fail} CHECKS FAILED`);
process.exit(fail ? 1 : 0);
