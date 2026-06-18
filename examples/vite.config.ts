import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  server: { port: 5180 },
  // The package ships raw .tsx under its "solid" export condition; let Vite's
  // dep optimizer leave it alone so vite-plugin-solid compiles it in-tree.
  optimizeDeps: { exclude: ["@timotholt/solid-tree"] },
  // REQUIRED: collapse to a single solid-js instance. Without this a prod build
  // can pull a second copy (via the package's compiled dist importing solid-js),
  // and ref/use() directives from the 2nd instance silently no-op.
  resolve: { dedupe: ["solid-js", "@tanstack/solid-virtual"] },
});
