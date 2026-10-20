import { defineConfig, mergeConfig } from "vite";
import solid from "vite-plugin-solid";
import base from "./vite.config.js";

// Server build (generate: "ssr") served under the "node" export condition, so the
// package imports cleanly in Node (SSR frameworks, test runners) instead of throwing
// on client-only DOM APIs at module load. Rendering on the server is supported
// without hydration; SolidStart compiles the raw `solid` source itself instead.
export default mergeConfig(
  { ...base, plugins: [] },
  defineConfig({
    plugins: [solid({ ssr: true, solid: { generate: "ssr", hydratable: false } })],
    build: { outDir: "dist/server", emptyOutDir: true, ssr: true },
  })
);
