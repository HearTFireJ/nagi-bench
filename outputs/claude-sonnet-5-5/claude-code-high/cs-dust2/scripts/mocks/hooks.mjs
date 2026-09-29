// Node loader hook: resolves `three` and `react` to permissive stub modules so the render /
// runtime glue can be smoke-tested in plain Node (no browser, no npm install).
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: new URL('./three.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier === 'react') return { url: new URL('./react.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
