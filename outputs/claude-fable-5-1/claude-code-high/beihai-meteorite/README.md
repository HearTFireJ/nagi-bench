# 陨石雨 · Meteor Rain

A five-and-a-half-minute procedural voxel film built with Three.js, adapted from the
Zhang Beihai "meteorite bullets" passage supplied with the task. Everything on screen
is generated in code: block figures from `@agentbench/voxel-kit`, voxel props and
planets, lights, particles and the post grade. No external assets, textures or CDNs.

Total timeline: **332 s** (limit 360 s), including title and end card.

## Run

```sh
bun run build      # -> dist/index.html + dist/assets/
bun run preview    # serve the built output locally
bun run dev        # Vite dev server
bun run typecheck  # tsc --noEmit
```

Dependencies are the platform's pinned offline modules (`three@0.180.0`, `vite@8.2.0`,
`@agentbench/cinematic-player`, `@agentbench/voxel-kit`) exposed through the read-only
`node_modules` link. Do not run an install.

Headless checks (Bun, no browser needed):

```sh
bun run scripts/timeline-check.ts   # builds the scene graph, seeks through every shot, validates cues
bun run scripts/framing-check.ts    # projects each shot's subject into the camera
```

## Structure of the film

| Time | Act | What happens |
| --- | --- | --- |
| 0–23 | Prologue | A lone white figure drifts above Earth in silence; two lines of inner monologue; title. |
| 23–101 | I · The collector | The hutong study. Tea, the "everything is a meteorite" exchange, three iron meteorites, the refusal to bargain: "算是我对要送的人的尊重". |
| 101–150 | II · Manufacture | Lathe at night, thirty-six segments; the basement, caseless rounds re-headed with stone, four deafening test shots into a suit-cloth bundle, crushed fragments in the palm. |
| 150–308 | III · Orbit | The wheel station and cable; the beacon left in the cabin; the wait; sunset at the limb; the photo group; the glove, the pistol, the scope; thirty silent flashes; the ten seconds; "陨石雨！"; the flight home. |
| 308–332 | Coda | The collector alone with a stone under his lamp. End card. |

The two narratives are joined by a single motif: the tea cup that is "also a meteorite"
becomes the bullets that the victims themselves name a meteor shower.

## Source layout

- `src/main.ts` — renderer, player, stage, audio bus, controls, overlay wiring.
- `src/shots.ts` — the 38 shots with absolute `start`/`end`; every update is a pure function of time.
- `src/film.ts` — scene/cast assembly, the deterministic choreography of the thirty attendees and the pre-authored particle bursts.
- `src/voice.ts` — **the speech manifest** (`voiceCues`), 51 entries with the seven fields `id, kind, speaker, text, delivery, start, end`. Subtitles are rendered from it by the player controls as `【说话者】文本`.
- `src/sound.ts` — sample registration (36 CC0 OGGs inlined from `src/assets/audio/`), procedural Web Audio layers (room tones, basement reverb tail, suit breathing, radio squelch, drones, suit-conducted recoil) and the `soundCues` list.
- `src/characters.ts` — body and clothing sheets (faces, coats, cardigan, pressure suits with gold / clear / cracked visors) and authored poses.
- `src/props.ts` — voxel props: pistol, scope, magazines, cartridges, meteorites, cups, lens, pliers, beacon, camera, beef, debris.
- `src/sets/` — study, workshop, basement, cabin, orbit (Earth, atmosphere shader, station, cable, shipyard, debris, sun rig).
- `src/fx.ts` — deterministic particle fields, star field, muzzle flash.
- `src/post.ts` — bloom + grade pass (vignette, grain, flash, fade) wrapped as the renderer facade for `ThreeStage`.
- `src/overlay.ts` — title, location captions, scope mask, first-frame play button.

## Sound in vacuum

Interior gunshots use a recorded crack plus a synthesized concrete reverb tail and a
sub thump. In orbit the pistol makes no external sound: each shot is a body-conducted
knock plus the suit's own breathing and fan; the impacts are silent except for a
subjective high tone; the victims' shouts arrive only as radio subtitles over squelch.
