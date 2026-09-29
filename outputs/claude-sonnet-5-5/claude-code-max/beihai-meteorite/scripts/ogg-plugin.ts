// Bun 预加载插件（仅供无头自检脚本）：让 `import x from "./a.ogg?inline"` 在 Bun 里也得到 base64 data URL，
// 与 Vite 的 ?inline 行为一致。用法： bun --preload ./scripts/ogg-plugin.ts run scripts/e2e-sim.ts
import { plugin } from "bun";
import fs from "node:fs";
import path from "node:path";

plugin({
  name: "ogg-inline",
  setup(build) {
    build.onResolve({ filter: /\.ogg\?inline$/ }, (args) => ({
      path: path.resolve(path.dirname(args.importer), args.path.replace(/\?inline$/, "")),
      namespace: "ogg-inline",
    }));
    build.onLoad({ filter: /.*/, namespace: "ogg-inline" }, (args) => {
      const b64 = fs.readFileSync(args.path).toString("base64");
      return { contents: `export default "data:audio/ogg;base64,${b64}";`, loader: "js" };
    });
  },
});
