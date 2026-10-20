import { describe, expect, it } from "vitest";
import { buildIndex, defaultMatcher, flatten, searchView } from "../../../src/core/index.js";
import { wide } from "../../support/fixtures.js";

// PLAN §6: gate on growth, not absolute time. Going 10× in size must cost well under
// what quadratic growth would (100×). Median of several runs, generous bound (n log n
// predicts ~12×; we allow 30× for CI noise and GC).

const time = (fn: () => void, runs = 5) => {
  const ts: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    ts.push(performance.now() - t);
  }
  return ts.sort((a, b) => a - b)[Math.floor(runs / 2)];
};

// wide(b, d): ~b^d nodes. 20k ≈ 141^2, 200k ≈ 447^2 — two levels, all expanded.
const small = wide(141, 2);
const large = wide(447, 2);
const MAX_RATIO = 30;

describe("core scaling (gated)", () => {
  it("buildIndex grows ~linearly", () => {
    time(() => buildIndex(small)); // warm up
    const a = time(() => buildIndex(small));
    const b = time(() => buildIndex(large));
    expect(b / a).toBeLessThan(MAX_RATIO);
  });

  it("flatten (everything expanded) grows ~linearly", () => {
    const si = buildIndex(small);
    const li = buildIndex(large);
    const all = () => true;
    time(() => flatten(si, all));
    const a = time(() => flatten(si, all));
    const b = time(() => flatten(li, all));
    expect(flatten(li, all).length).toBe(li.size);
    expect(b / a).toBeLessThan(MAX_RATIO);
  });

  it("searchView + flatten grows ~linearly", () => {
    const si = buildIndex(small);
    const li = buildIndex(large);
    const run = (i: typeof si) => flatten(i, () => false, searchView(i, "7", defaultMatcher, "prune"));
    run(si);
    const a = time(() => run(si));
    const b = time(() => run(li));
    expect(b / a).toBeLessThan(MAX_RATIO);
  });
});
