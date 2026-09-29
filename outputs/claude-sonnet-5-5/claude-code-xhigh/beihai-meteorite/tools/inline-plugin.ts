// Bun preload used only by the offline verification tools (tools/*.ts):
// resolves Vite-style `import x from "./a.ogg?inline"` into a base64 data URL,
// exactly what Vite produces for the real build.
import { plugin } from "bun";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

plugin({
  name: "inline-ogg",
  setup(build) {
    build.onResolve({ filter: /\.ogg\?inline$/ }, (args) => ({
      path: resolve(dirname(args.importer), args.path.replace(/\?inline$/, "")),
      namespace: "ogg-inline",
    }));
    build.onLoad({ filter: /.*/, namespace: "ogg-inline" }, (args) => {
      const base64 = readFileSync(args.path).toString("base64");
      return {
        contents: `export default ${JSON.stringify(`data:audio/ogg;base64,${base64}`)};`,
        loader: "js",
      };
    });
  },
});
