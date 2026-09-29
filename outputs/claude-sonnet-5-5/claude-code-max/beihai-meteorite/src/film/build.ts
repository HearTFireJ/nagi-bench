// 影片装配：世界、镜头、语音清单、音效 cue、播放器。浏览器入口与预览脚本共用同一套装配。
import * as THREE from "three";
import { CinematicPlayer, validateVoiceCues, type Shot, type TimelineCue } from "@agentbench/cinematic-player";
import { defaultOverlay, type FilmContext, type FilmRenderer } from "./types";
import { Overlay } from "./overlay";
import { renderFilm } from "./render";
import { TOTAL, T } from "./timing";
import { voiceCues } from "../voice/voiceCues";
import { soundCues } from "../sound/cues";
import { SpaceWorld } from "../world/space/spaceworld";
import { buildOpening } from "./sequences/opening";
import { buildCourtyard } from "./sequences/courtyard";
import { CourtyardWorlds } from "../world/courtyard/world";
import { buildMaking } from "./sequences/making";
import { buildSpaceAct } from "./sequences/space";
import { MakingWorlds } from "../world/making/world";
import { BaseWorlds } from "../world/base/base";
import { buildTransit } from "./sequences/transit";
import { buildEnd } from "./sequences/end";

export const ASPECT = 2.35;

export interface Film {
  player: CinematicPlayer<FilmContext>;
  ctx: FilmContext;
  overlay: Overlay;
  space: SpaceWorld | null;
  renderFrame(r: FilmRenderer): void;
  worlds: THREE.Scene[];
}

export interface BuildOptions {
  /** 预览脚本可以只装配部分序列以加快启动 */
  only?: string[];
}

export function buildFilm(opts: BuildOptions = {}): Film {
  const want = (id: string) => !opts.only || opts.only.includes(id);

  const camera = new THREE.PerspectiveCamera(30, ASPECT, 0.05, 150000);
  const bgCamera = new THREE.PerspectiveCamera(30, ASPECT, 1, 5000);
  const ctx: FilmContext = {
    camera, bgCamera, world: null, exposure: 1, overlay: defaultOverlay(), aspect: ASPECT,
  };
  const overlay = new Overlay();

  const needSpace = want("open") || want("space") || want("transit") || want("end");
  const space = needSpace ? new SpaceWorld() : null;
  const courtyard = want("courtyard") ? new CourtyardWorlds() : null;
  const making = want("making") ? new MakingWorlds() : null;
  const base = space && (want("transit") || want("space")) ? new BaseWorlds(space.bg) : null;

  const shots: Shot<FilmContext>[] = [];
  if (space && want("open")) shots.push(...buildOpening(ctx, space, T.open));
  if (courtyard && want("courtyard")) shots.push(...buildCourtyard(ctx, courtyard, T.courtyard));
  if (making && want("making")) shots.push(...buildMaking(ctx, making, T.making));
  if (space && base && want("transit")) shots.push(...buildTransit(ctx, base, space, T.transit));
  if (space && want("space")) shots.push(...buildSpaceAct(ctx, space, T.space, base));
  if (space && want("end")) shots.push(...buildEnd(ctx, space, T.end));

  const cues: TimelineCue[] = [...validateVoiceCues(voiceCues, TOTAL), ...soundCues];

  const player = new CinematicPlayer<FilmContext>({ duration: TOTAL, context: ctx, shots, cues });

  return {
    player,
    ctx,
    overlay,
    space,
    worlds: [...(space ? [space.scene, space.bg] : []), ...(courtyard ? [courtyard.alley.scene, courtyard.room.scene, courtyard.micro.scene] : []), ...(making ? [making.workshop.scene, making.basement.scene] : []), ...(base ? [base.cabin.scene, base.outside.scene] : [])],
    renderFrame(r) {
      renderFilm(r, ctx, overlay, Math.floor(player.currentTime * 24));
    },
  };
}
