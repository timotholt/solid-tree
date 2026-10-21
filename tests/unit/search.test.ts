import { describe, expect, it } from "vitest";
import { flattenVisible } from "../../src/compat/search.js";
import { n, produce } from "../support/fixtures.js";

// The legacy helpers tested here before (defaultMatcher/pruneNode/collectExpandable/
// collectIds/findNode/containsDescendant) were removed as dead code; their behavior is
// covered by tests/unit/core/*.test.ts (unit + property tests against a naive oracle).

const ids = (rows: { node: { id: string } }[]) => rows.map((r) => r.node.id);

describe("flattenVisible", () => {
  it("descends only into expanded nodes, in document order, with depth", () => {
    const rows = flattenVisible(produce(), { fruit: true, berries: true });
    expect(ids(rows)).toEqual(["fruit", "apple", "banana", "berries", "straw", "blue", "veg"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 1, 2, 2, 0]);
    expect(rows.find((r) => r.node.id === "apple")!.hasChildren).toBe(true);
  });
  it("marks dividers as non-navigable", () => {
    const rows = flattenVisible([n("a"), n("d", undefined, { isDivider: true }), n("b")], {});
    expect(rows.map((r) => r.navigable)).toEqual([true, false, true]);
  });
  it("ignores expanded flags on leaves and on nodes with empty children", () => {
    expect(ids(flattenVisible([n("a", []), n("b")], { a: true, b: true }))).toEqual(["a", "b"]);
  });
});
