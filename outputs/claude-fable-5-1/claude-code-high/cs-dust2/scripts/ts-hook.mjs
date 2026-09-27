// Node loader hook so that extension-less relative imports resolve to .ts files
// when running headless logic tests with `node --experimental-strip-types`.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register(pathToFileURL('./scripts/ts-resolver.mjs'));
