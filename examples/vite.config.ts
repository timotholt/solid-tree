import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  server: { port: 5180 },
  // The package ships raw .tsx under its "solid" export condition; let Vite's
  // dep optimizer leave it alone so vite-plugin-solid compiles it in-tree.
  optimizeDeps: { exclude: ["@timotholt/solid-tree"] },
});
