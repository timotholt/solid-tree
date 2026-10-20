import { it } from "vitest";
import { buildIndex, flatten, searchView, defaultMatcher } from "../../src/core/index.js";
import { wide } from "../support/fixtures.js";

// Timing trend only (nightly, non-blocking — PLAN §6). Prints median ms per operation.
// Gated growth checks live in tests/unit/core/scaling.test.ts.
const median = (fn: () => void, runs = 9) => {
  const ts: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    ts.push(performance.now() - t);
  }
  return ts.sort((a, b) => a - b)[Math.floor(runs / 2)];
};

it("core timings", () => {
  const rows: Record<string, Record<string, string>> = {};
  for (const [name, data] of [
    ["10k", wide(100, 2)],
    ["100k", wide(316, 2)],
  ] as const) {
    const index = buildIndex(data);
    rows[name] = {
      buildIndex: median(() => void buildIndex(data)).toFixed(2),
      "flatten (all open)": median(() => void flatten(index, () => true)).toFixed(2),
      "search + flatten": median(() => void flatten(index, () => false, searchView(index, "42", defaultMatcher, "prune"))).toFixed(2),
    };
  }
  console.info("core timings (median ms)");
  console.table(rows);
});
