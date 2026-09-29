import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let useStubs = false;
const stubDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'stubs');

/** Receives `{ stubs: boolean }` from register-*.mjs. */
export async function initialize(data) {
  useStubs = !!(data && data.stubs);
}

/**
 * Resolve extension-less relative imports to .ts / .tsx / index.ts files. With stubs enabled (smoke tests only),
 * `three` and `react` resolve to the minimal fakes in scripts/stubs so the render / engine code can run in Node.
 */
export async function resolve(specifier, context, nextResolve) {
  if (useStubs && (specifier === 'three' || specifier === 'react')) {
    return nextResolve(pathToFileURL(path.join(stubDir, specifier + '.ts')).href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && path.extname(specifier) === '' && context.parentURL) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    for (const candidate of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
      if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  return nextResolve(specifier, context);
}
