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
      // Multi-entry: base (.) + /virtual + /database + /supabase + /testing + /headless subpaths.
      entry: {
        index: resolve(__dirname, "src/index.tsx"),
        virtual: resolve(__dirname, "src/virtual.tsx"),
        database: resolve(__dirname, "src/database.tsx"),
        supabase: resolve(__dirname, "src/supabase.tsx"),
        testing: resolve(__dirname, "src/testing.ts"),
        headless: resolve(__dirname, "src/headless.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      // Keep all peers external — never bundle Solid or the optional adapters.
      external: [
        "solid-js",
        "solid-js/web",
        "solid-js/store",
        "@tanstack/solid-virtual",
        "@tanstack/solid-query",
        "@supabase/supabase-js",
        "@electric-sql/pglite",
      ],
      output: { entryFileNames: "[name].js" },
    },
    target: "esnext",
    minify: false,
  },
});
