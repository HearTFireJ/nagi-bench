// Node module-resolution hook: `import 'three'` -> the in-memory stub (smoke tests only).
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') {
    return { url: new URL('./three-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
