import type { SampleSoundOptions } from "@agentbench/cinematic-player";
import computerNoise001 from "../assets/audio/computerNoise_001.ogg?inline";
import computerNoise003 from "../assets/audio/computerNoise_003.ogg?inline";
import doorOpen001 from "../assets/audio/doorOpen_001.ogg?inline";
import doorClose001 from "../assets/audio/doorClose_001.ogg?inline";
import doorOpen002 from "../assets/audio/doorOpen_002.ogg?inline";
import doorClose002 from "../assets/audio/doorClose_002.ogg?inline";
import engineCircular002 from "../assets/audio/engineCircular_002.ogg?inline";
import forceField001 from "../assets/audio/forceField_001.ogg?inline";
import impactMetal002 from "../assets/audio/impactMetal_002.ogg?inline";
import impactMetal004 from "../assets/audio/impactMetal_004.ogg?inline";
import laserSmall002 from "../assets/audio/laserSmall_002.ogg?inline";
import lowFreqExplosion000 from "../assets/audio/lowFrequency_explosion_000.ogg?inline";
import lowFreqExplosion001 from "../assets/audio/lowFrequency_explosion_001.ogg?inline";
import spaceEngineLow001 from "../assets/audio/spaceEngineLow_001.ogg?inline";
import spaceEngineSmall002 from "../assets/audio/spaceEngineSmall_002.ogg?inline";
import thrusterFire001 from "../assets/audio/thrusterFire_001.ogg?inline";
import explosionCrunch001 from "../assets/audio/explosionCrunch_001.ogg?inline";
import explosionCrunch003 from "../assets/audio/explosionCrunch_003.ogg?inline";
import stepConcrete0 from "../assets/audio/footstep_concrete_000.ogg?inline";
import stepConcrete1 from "../assets/audio/footstep_concrete_001.ogg?inline";
import stepConcrete2 from "../assets/audio/footstep_concrete_002.ogg?inline";
import stepConcrete3 from "../assets/audio/footstep_concrete_003.ogg?inline";
import stepWood0 from "../assets/audio/footstep_wood_000.ogg?inline";
import stepWood1 from "../assets/audio/footstep_wood_001.ogg?inline";
import stepWood2 from "../assets/audio/footstep_wood_002.ogg?inline";
import stepWood3 from "../assets/audio/footstep_wood_003.ogg?inline";
import stepSnow0 from "../assets/audio/footstep_snow_000.ogg?inline";
import stepSnow1 from "../assets/audio/footstep_snow_001.ogg?inline";
import stepSnow2 from "../assets/audio/footstep_snow_002.ogg?inline";
import stepSnow3 from "../assets/audio/footstep_snow_003.ogg?inline";
import stepCarpet1 from "../assets/audio/footstep_carpet_001.ogg?inline";
import woodLight1 from "../assets/audio/impactWood_light_001.ogg?inline";
import woodMedium1 from "../assets/audio/impactWood_medium_001.ogg?inline";
import woodMedium3 from "../assets/audio/impactWood_medium_003.ogg?inline";
import glassLight1 from "../assets/audio/impactGlass_light_001.ogg?inline";
import glassLight3 from "../assets/audio/impactGlass_light_003.ogg?inline";
import metalLight1 from "../assets/audio/impactMetal_light_001.ogg?inline";
import metalLight3 from "../assets/audio/impactMetal_light_003.ogg?inline";
import metalMedium1 from "../assets/audio/impactMetal_medium_001.ogg?inline";
import metalHeavy2 from "../assets/audio/impactMetal_heavy_002.ogg?inline";
import metalHeavy4 from "../assets/audio/impactMetal_heavy_004.ogg?inline";
import softMedium1 from "../assets/audio/impactSoft_medium_001.ogg?inline";
import softHeavy1 from "../assets/audio/impactSoft_heavy_001.ogg?inline";
import plateLight2 from "../assets/audio/impactPlate_light_002.ogg?inline";
import plateMedium1 from "../assets/audio/impactPlate_medium_001.ogg?inline";
import mining1 from "../assets/audio/impactMining_001.ogg?inline";
import punchHeavy0 from "../assets/audio/impactPunch_heavy_000.ogg?inline";
import plank2 from "../assets/audio/impactPlank_medium_002.ogg?inline";
import click2 from "../assets/audio/click2.ogg?inline";
import click4 from "../assets/audio/click4.ogg?inline";
import switch3 from "../assets/audio/switch3.ogg?inline";
import switch12 from "../assets/audio/switch12.ogg?inline";
import switch20 from "../assets/audio/switch20.ogg?inline";
import switch25 from "../assets/audio/switch25.ogg?inline";
import mouseclick1 from "../assets/audio/mouseclick1.ogg?inline";
import mouserelease1 from "../assets/audio/mouserelease1.ogg?inline";
import rollover2 from "../assets/audio/rollover2.ogg?inline";

/**
 * Real recorded samples (Kenney CC0 library). `dur` is the true length so a cue's
 * interval always covers the whole sound. Everything else in the mix is
 * procedural reinforcement (see engine.ts).
 */
export interface SampleDef {
  url: string;
  dur: number;
  opts?: SampleSoundOptions;
}

export const SAMPLES: Record<string, SampleDef> = {
  "computer-a": { url: computerNoise001, dur: 5 },
  "computer-b": { url: computerNoise003, dur: 5 },
  "door-open-a": { url: doorOpen001, dur: 0.53 },
  "door-close-a": { url: doorClose001, dur: 0.53 },
  "door-open-b": { url: doorOpen002, dur: 0.53 },
  "door-close-b": { url: doorClose002, dur: 0.53 },
  "machine-hum": { url: engineCircular002, dur: 5, opts: { loop: true, playbackRate: 0.9 } },
  "field-hum": { url: forceField001, dur: 0.95 },
  "metal-a": { url: impactMetal002, dur: 0.47 },
  "metal-b": { url: impactMetal004, dur: 0.39 },
  "chirp": { url: laserSmall002, dur: 0.34 },
  "boom-a": { url: lowFreqExplosion000, dur: 2 },
  "boom-b": { url: lowFreqExplosion001, dur: 1 },
  "engine-low": { url: spaceEngineLow001, dur: 5, opts: { loop: true } },
  "engine-small": { url: spaceEngineSmall002, dur: 5 },
  "thruster": { url: thrusterFire001, dur: 5 },
  "crunch-a": { url: explosionCrunch001, dur: 1.36 },
  "crunch-b": { url: explosionCrunch003, dur: 1.55 },
  "step-concrete-0": { url: stepConcrete0, dur: 0.11 },
  "step-concrete-1": { url: stepConcrete1, dur: 0.11 },
  "step-concrete-2": { url: stepConcrete2, dur: 0.12 },
  "step-concrete-3": { url: stepConcrete3, dur: 0.12 },
  "step-wood-0": { url: stepWood0, dur: 0.25 },
  "step-wood-1": { url: stepWood1, dur: 0.26 },
  "step-wood-2": { url: stepWood2, dur: 0.26 },
  "step-wood-3": { url: stepWood3, dur: 0.26 },
  "step-snow-0": { url: stepSnow0, dur: 0.38 },
  "step-snow-1": { url: stepSnow1, dur: 0.38 },
  "step-snow-2": { url: stepSnow2, dur: 0.38 },
  "step-snow-3": { url: stepSnow3, dur: 0.38 },
  "step-carpet": { url: stepCarpet1, dur: 0.15 },
  "wood-light": { url: woodLight1, dur: 0.27 },
  "wood-knock-a": { url: woodMedium1, dur: 0.34 },
  "wood-knock-b": { url: woodMedium3, dur: 0.34 },
  "glass-a": { url: glassLight1, dur: 0.22 },
  "glass-b": { url: glassLight3, dur: 0.22 },
  "tool-a": { url: metalLight1, dur: 0.26 },
  "tool-b": { url: metalLight3, dur: 0.49 },
  "tool-click": { url: metalMedium1, dur: 0.15 },
  "safe-a": { url: metalHeavy2, dur: 0.12 },
  "safe-b": { url: metalHeavy4, dur: 0.14 },
  "soft-a": { url: softMedium1, dur: 0.19 },
  "soft-heavy": { url: softHeavy1, dur: 0.58 },
  "plate-light": { url: plateLight2, dur: 0.49 },
  "plate-medium": { url: plateMedium1, dur: 0.62 },
  "stone-tap": { url: mining1, dur: 0.87 },
  "thump-heavy": { url: punchHeavy0, dur: 0.65 },
  "plank": { url: plank2, dur: 0.78 },
  "step-metal": { url: impactMetal004, dur: 0.56, opts: { playbackRate: 0.7 } },
  "door-heavy": { url: doorOpen002, dur: 0.89, opts: { playbackRate: 0.6 } },
  "click-a": { url: click2, dur: 0.06 },
  "click-b": { url: click4, dur: 0.04 },
  "switch-a": { url: switch3, dur: 0.37 },
  "switch-b": { url: switch12, dur: 0.06 },
  "switch-c": { url: switch20, dur: 0.36 },
  "switch-d": { url: switch25, dur: 0.39 },
  "mouse-down": { url: mouseclick1, dur: 0.06 },
  "mouse-up": { url: mouserelease1, dur: 0.07 },
  "blip": { url: rollover2, dur: 0.06 },
};
