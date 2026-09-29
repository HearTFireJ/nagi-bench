import { defineConfig, type Plugin } from "vite";

/**
 * Keep the standard Vite output (dist/index.html + dist/assets/*), but emit a
 * classic deferred script so the page also plays when dist/index.html is opened
 * straight from disk (module scripts and `crossorigin` are blocked on file://).
 */
function classicScriptTag(): Plugin {
  return {
    name: "classic-script-tag",
    enforce: "post",
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin/g, "<script defer")
        .replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"');
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [classicScriptTag()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 8000,
    modulePreload: false,
    rollupOptions: {
      output: { format: "iife" },
    },
  },
});
