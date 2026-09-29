import { defineConfig } from "vite";

// Classic (non-module) script tags let dist/index.html also work when opened straight from disk.
const classicScripts = () => ({
  name: "classic-script-tags",
  transformIndexHtml: {
    order: "post",
    handler: (html) =>
      html
        .replace(/<script type="module" crossorigin/g, "<script defer")
        .replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"'),
  },
});

export default defineConfig({
  base: "./",
  plugins: [classicScripts()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 6000,
    assetsInlineLimit: 0,
    rollupOptions: { output: { format: "iife" } },
  },
});
