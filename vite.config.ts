import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { resolve } from "node:path";

// Library build. Produces the compiled `import` entry (dist/index.js) for
// non-Solid-aware bundlers / SSR fallback. Solid-aware consumers resolve the
// "solid" export condition instead and compile the raw src themselves, so we
// keep solid-js external and never bundle it (single Solid instance rule).
export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: ["solid-js", "solid-js/web", "solid-js/store"],
    },
    target: "esnext",
    minify: false,
  },
});
