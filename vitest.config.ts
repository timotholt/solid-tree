import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import { playwright } from "@vitest/browser-playwright";

// Three projects (see docs/PLAN-rebuild.md §5.1):
//   unit    — pure logic, Node
//   dom     — controllers + components, happy-dom
//   browser — real layout/focus/scroll (virtualizer), Chromium via Playwright
// Memory-conscious defaults: few workers locally; CI may raise via VITEST_MAX_WORKERS.
const maxWorkers = Number(process.env.VITEST_MAX_WORKERS ?? 2);

export default defineConfig({
  plugins: [solid()],
  // One Solid instance (the same rule consumers must follow — see AGENTS.md), and
  // pre-bundle the browser deps up front so Vite never re-optimizes mid-run.
  resolve: { dedupe: ["solid-js", "@tanstack/solid-virtual", "@tanstack/solid-query"] },
  optimizeDeps: {
    include: ["@tanstack/solid-virtual", "@tanstack/solid-query", "@solidjs/testing-library"],
    exclude: ["solid-js"],
  },
  test: {
    maxWorkers,
    environment: "node",
    setupFiles: ["tests/support/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/createVirtualizer.ts"],
      reporter: ["text-summary", "html"],
      // Ratchet: set just under the measured baseline (2026-10-20: 97.2/87.8/97.2/98.4).
      // Raise as coverage improves; never lower (PLAN §5.2).
      thresholds: { statements: 95, branches: 85, functions: 95, lines: 95 },
    },
    projects: [
      {
        extends: true,
        test: { name: "unit", environment: "node", include: ["tests/unit/**/*.test.{ts,tsx}"] },
      },
      {
        extends: true,
        test: { name: "dom", environment: "happy-dom", include: ["tests/dom/**/*.test.{ts,tsx}"] },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["tests/browser/**/*.test.{ts,tsx}"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: (process.env.BROWSER as "chromium") ?? "chromium" }],
          },
        },
      },
    ],
  },
});
