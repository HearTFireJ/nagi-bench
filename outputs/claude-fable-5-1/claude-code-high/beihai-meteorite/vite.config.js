// Plain JS config loaded natively so Vite never needs to write into the
// read-only node_modules directory supplied by the platform toolchain.
export default {
  base: "./",
  cacheDir: ".vite-cache",
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
  },
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173 },
};
