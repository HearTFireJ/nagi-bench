// Registers a tiny resolver so Node (>= 22.6 with type stripping) can run the TypeScript sources of the simulation
// layer directly, keeping the extension-less relative imports that Vite / tsc use.
import { register } from 'node:module';

register('./ts-hooks.mjs', import.meta.url);
