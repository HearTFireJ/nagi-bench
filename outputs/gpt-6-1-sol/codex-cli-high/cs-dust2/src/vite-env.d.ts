/// <reference types="vite/client" />
import type { GameEngine } from "./game/engine";
declare global {
  interface Window {
    __DUST2__?: GameEngine;
  }
}
