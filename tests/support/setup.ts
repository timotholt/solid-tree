import { afterEach } from "vitest";
import { consumeConsole } from "./console.js";

// @solidjs/testing-library only auto-cleans when Vitest globals are on (they are not
// here), so unmount every rendered tree after each test — otherwise trees from earlier
// tests stay in the document and leak focus, timers and listeners into later ones.
if (typeof document !== "undefined") {
  const { cleanup } = await import("@solidjs/testing-library");
  afterEach(() => cleanup());
}

// Fail any test that logs console.warn/console.error it did not expect (PLAN §4 P0).
// Solid dev warnings ("computations created outside a root" etc.) surface here.
afterEach(() => {
  const unexpected = consumeConsole();
  if (unexpected.length) {
    throw new Error(
      "Unexpected console output:\n" + unexpected.map((c) => `  console.${c.level}: ${c.text}`).join("\n")
    );
  }
});
