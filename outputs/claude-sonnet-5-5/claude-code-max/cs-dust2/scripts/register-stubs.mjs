// Like register-ts.mjs, but also maps `three` / `react` to the fakes in scripts/stubs (smoke tests only).
import { register } from 'node:module';

register('./ts-hooks.mjs', import.meta.url, { data: { stubs: true } });
