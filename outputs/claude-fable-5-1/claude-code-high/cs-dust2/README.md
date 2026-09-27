# Dust2 5v5 — browser FPS prototype

A first-person bomb-defusal prototype (Counter-Strike style) built with **React 18 + TypeScript + three.js**, everything
procedurally generated: the Dust2 layout, humanoid characters, weapons and all sound (Web Audio synthesis). No models,
textures or audio files are loaded. No game engine — rendering loop, physics, navigation, AI and round logic are
implemented in `src/game`.

```bash
npm install
npm run dev        # open http://localhost:5173
npm run typecheck  # tsc --noEmit
npm run build
```

## Playing

Pick a side on the start screen. Round 1 is a pistol round (default pistol only, no armor). Survivors keep their gear;
everyone earns money and can buy in freeze time with **B**.

| Key | Action |
| --- | --- |
| WASD / Space / Shift | move / jump / walk quietly |
| Mouse / LMB / RMB | look / fire / AWP scope |
| 1 / 2 / 3 / Q / wheel | primary / pistol / knife / last weapon |
| R | reload |
| E (hold) | plant C4 (T at A/B), defuse (CT), pick up dropped C4 |
| B | buy menu (freeze time + first seconds in spawn) |
| Tab | scoreboard |
| F / ← → / click | while dead: take over the spectated bot / switch spectated teammate |
| Esc | release the mouse (click to resume) |

Round rules: T win by eliminating CTs or by C4 explosion (40 s timer); CT win by eliminating Ts before a plant, by
defusing, or when the 1:55 round timer runs out. First to 13 rounds wins the match.

## Architecture

```
src/
  main.tsx, App.tsx           React root; mounts the engine, renders the HUD overlay
  ui/                         HUD, crosshair, minimap, killfeed, scope mask, buy menu, scoreboard, menus
  game/Game.ts                engine: three.js scene, fixed-step loop (60 Hz), entities, rounds, C4, HUD bridge
  game/state/GameStore.ts     external store (useSyncExternalStore) — engine -> React snapshots
  game/map/MapData.ts         Dust2 authored as rectangle paint ops on a 64x64 grid (2 m cells)
  game/map/MapGrid.ts         parses the grid: heights, ramps, crates, doors, colliders (AABBs), plant zones
  game/map/NavGrid.ts         A* + string pulling for bots
  game/physics/World.ts       character movement/collision (step-up, jump, ramps), ray casts, hitboxes
  game/entities/              Character (player or bot), C4
  game/ai/BotBrain.ts         AI state machine: perception (FOV + line of sight), combat, hunt, routes,
                              hold spots, plant / defuse, rotations, stuck recovery
  game/weapons/               weapon data (AK-47, M4A4, AWP, Glock, USP-S, Deagle, knife), runtime state, damage
  game/render/                procedural map meshes & textures, humanoid model, weapon models, first-person
                              view model (separate render pass), tracers / impacts / explosion
  game/audio/AudioEngine.ts   Web Audio synthesis for every sound effect, with distance + stereo panning
scripts/                      headless Node checks (map connectivity, pathfinding, physics, AI simulation)
```

The rendering loop (`requestAnimationFrame`) advances the simulation in fixed 1/60 s steps; rendering interpolation is
not needed because the camera reads the freshly stepped state. React never touches the scene: the engine publishes an
immutable `HudState` snapshot at ~10–20 Hz (immediately on important events), and the minimap reads positions directly
through `game.getMinimapData()` on its own canvas loop.

Hit detection is a ray against per-part hitboxes (head / chest / stomach / arms / legs) in the target's local frame;
head shots do double damage, stomach 1.25x, legs 0.75x, kevlar reduces damage by the weapon's armor penetration.

## Headless checks

```bash
node --experimental-transform-types --import ./scripts/ts-hook.mjs scripts/test-map.mts
node --experimental-transform-types --import ./scripts/ts-hook.mjs scripts/test-ai.mts
```
