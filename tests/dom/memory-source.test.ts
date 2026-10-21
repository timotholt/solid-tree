import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/solid-query";
import { createMemorySource, runTreeSourceContract } from "../../src/testing.js";
import { createDatabaseTreeController } from "../../src/database/createDatabaseTreeController.js";
import { flush, inRoot } from "../support/root.js";
import { produce } from "../support/fixtures.js";

// The shipped contract suite, run against the shipped memory source.
runTreeSourceContract(
  "createMemorySource",
  (tree) => {
    const source = createMemorySource(tree);
    return { source, mutate: { insert: source.insert, update: source.update, remove: source.remove } };
  },
  { describe, it, expect }
);

describe("createMemorySource", () => {
  it("latency and seeded failures are reproducible", async () => {
    vi.useFakeTimers();
    const a = createMemorySource(produce(), { latency: [10, 50], failRate: 0.5, seed: 7 });
    const b = createMemorySource(produce(), { latency: [10, 50], failRate: 0.5, seed: 7 });
    const outcome = async (s: typeof a) => {
      const p = s.getRoots().then(() => "ok", () => "fail");
      await vi.runAllTimersAsync();
      return p;
    };
    const ra = [await outcome(a), await outcome(a), await outcome(a)];
    const rb = [await outcome(b), await outcome(b), await outcome(b)];
    expect(ra).toEqual(rb);
    vi.useRealTimers();
  });

  it("drives a DatabaseTree controller end to end, including moves", async () => {
    const source = createMemorySource(produce());
    const t = inRoot(() => createDatabaseTreeController({ source, queryClient: new QueryClient() }));
    await flush();
    t.expand("veg");
    await flush();
    source.insert("veg", { id: "pea", label: "Pea", type: "t" });
    source.moveTo("banana", "veg");
    await flush();
    expect(t.flatRows().map((r) => r.id)).toEqual(["fruit", "veg", "carrot", "pea", "banana"]);
    t.expand("fruit");
    await flush();
    expect(t.index().parentOf("banana")).toBe("veg");
    expect(t.index().childrenOf("fruit")).toEqual(["apple", "berries"]);
    t.dispose();
  });
});
