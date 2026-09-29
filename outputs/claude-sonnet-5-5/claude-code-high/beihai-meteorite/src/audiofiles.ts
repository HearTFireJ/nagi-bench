/** Every selected CC0 sample, inlined as a base64 data URL at build time (Vite ?inline). */
export const audioFiles = import.meta.glob("./assets/audio/*.ogg", { query: "?inline", import: "default", eager: true }) as Record<string, string>;
