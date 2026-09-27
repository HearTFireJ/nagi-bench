import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Resolve extension-less relative imports to .ts files so headless tests can run
// with `node --experimental-transform-types`. When STUB_THREE is set (via the
// `--import ./scripts/ts-hook-stub.mjs` variant) the 'three' package is replaced by
// a permissive stub so engine logic can be smoke-tested without WebGL.

let stubThree = false;
export function initialize(data) {
  stubThree = !!(data && data.stubThree);
}

export async function resolve(specifier, context, nextResolve) {
  if (stubThree && specifier === 'three') {
    return { url: 'stub:three', shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier)) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const base = path.resolve(path.dirname(parentPath), specifier);
    for (const ext of ['.ts', '.tsx', '.mts', '/index.ts']) {
      if (existsSync(base + ext)) {
        return nextResolve(pathToFileURL(base + ext).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}

function collectThreeNames(dir, names) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) collectThreeNames(p, names);
    else if (/\.tsx?$/.test(p)) {
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/THREE\.([A-Za-z0-9_]+)/g)) names.add(m[1]);
    }
  }
}

export async function load(url, context, nextLoad) {
  if (url === 'stub:three') {
    const names = new Set();
    collectThreeNames(path.resolve('src'), names);
    const lines = [
      `import { makeAny } from ${JSON.stringify(pathToFileURL(path.resolve('scripts/any-stub.mjs')).href)};`,
      ...[...names]
        .filter((n) => n !== 'WebGLRenderer')
        .map((n) => `export const ${n} = makeAny('${n}');`),
      // The renderer must expose the stub canvas so input events reach the engine.
      `export function WebGLRenderer() { const r = makeAny('WebGLRenderer'); if (globalThis.__canvasElement) r.domElement = globalThis.__canvasElement; return r; }`,
    ];
    return { format: 'module', source: lines.join('\n'), shortCircuit: true };
  }
  return nextLoad(url, context);
}
