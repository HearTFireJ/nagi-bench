# 陨石雨 · Meteor Rain — a voxel short film

A 356‑second procedural Three.js film adapted from the “章北海 / 陨石收藏者 / 黄河空间站” chapter of *三体*。
Everything on screen and in the speakers is generated in code: geometry, textures, particles, score and
mixing; the only recorded audio is the supplied offline CC0 sample library (54 files, inlined at build time).

```
bun run build      # Vite build → dist/index.html + dist/assets/*.js
bun run typecheck  # strict TypeScript
```

Open `dist/index.html` (works from `file://` or any static server) and press ▶ (or Space; ←/→ seek ±5 s).

## Adaptation (what was kept, cut, and moved)

The source is an essay‑like chapter. The film keeps one line of suspense — *what are the stones for?* — and
withholds the answer until the final third:

| time | beat |
| --- | --- |
| 0:00–0:19 | Flash‑forward image: a lone suited figure in the void at sunset, thinking of his father. Title card. |
| 0:25–1:58 | A hutong at dusk → the meteorite collector's house, a small museum of stones. Shot / reverse‑shot, insert‑driven dialogue; the price is paid without haggling. |
| 1:58–2:28 | After hours at the institute: cores drilled, slices cut, **thirty‑six** pieces, every chip and the cutter taken away. |
| 2:28–3:18 | Cellar: the heads twisted off, glued back as stone, a four‑round test into a bag of suit fabric wrapped round beef. Real gunshot layers, hard‑walled reverb, tinnitus. |
| 3:18–5:08 | Geostationary orbit. Yellow River Station, the cabin where he leaves his locator, the wait for sunset, the airlock turning green, the group photograph, the glove coming off, the drill, the thirty silent flashes, ten seconds of nothing, “陨石雨！”. |
| 5:23–5:56 | Aftermath: the hatch closes, a lone figure climbs toward one green light. End card. |

Cuts: the international market talk, the elevator and shipyard lore beyond one establishing pass, most of the
collector's mineral lecture, the second‑hand explanation of orbital ballistics (shown, not told).
Restructured: the opening flash‑forward, and the cross‑cut during the ten‑second bullet flight
(bullets → the empty cabin with its blinking alibi LED → the unsuspecting group).

## Sound

* **Interiors** use recorded footsteps, doors, glass, wood, metal, tools and UI clicks; ambience is procedural.
* **The cellar gunshot** layers recorded explosion / metal / sub samples through a generated hard‑room impulse
  response plus three slap‑back delays, so it is violent and reflective.
* **Vacuum**: nothing outside the suit is ever heard. Gunfire, thrusters, latches and the glove ring reach the
  audience only as suit‑conducted thumps (low‑passed samples), breathing, heartbeat, radio hiss and score.
  The ten‑second flight drops to a bare tone and the heartbeat.
* All speech is subtitles only (`src/voice.ts`, one `VoiceCue[]` with `id, kind, speaker, text, delivery, start, end`);
  no voice is synthesised.

## Layout

* `src/film/*` — shots (`act1` house, `act2` workshop + cellar, `act3` space), lights, particles, overlay timeline.
* `src/sets/*` — voxel sets (all geometry built with `BoxBatch` or the voxel kit; no smooth primitives in the world).
* `src/characters.ts`, `src/cast.ts` — Voxel Kit figures; faces / insignia / visors are texels on 64×64 sheets,
  clothing is a separate sheet (the visor state is a clothing swap).
* `src/sound.ts`, `src/soundcues.ts` — sample registry, procedural factories, and the `SoundCue[]` timeline.
* `tools/*` — dev‑only: a software rasteriser used to check compositions without a GPU, a timeline simulator with
  a mocked Web Audio graph, and a frame auditor.
