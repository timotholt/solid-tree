import { afterEach } from "vitest";
import { consumeConsole } from "./console.js";

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
