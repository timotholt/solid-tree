import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildIndex, DuplicateIdError } from "../../../src/core/index.js";
import { arbForest, naiveParents, naivePreorder } from "../../support/arb.js";
import { n, produce } from "../../support/fixtures.js";

describe("buildIndex", () => {
  const idx = buildIndex(produce());

  it("exposes roots, order, size", () => {
    expect(idx.roots).toEqual(["fruit", "veg"]);
    expect(idx.order).toEqual(["fruit", "apple", "seed", "banana", "berries", "straw", "blue", "veg", "carrot"]);
    expect(idx.size).toBe(9);
  });

  it("answers structural queries", () => {
    expect(idx.parentOf("seed")).toBe("apple");
    expect(idx.parentOf("fruit")).toBeNull();
    expect(idx.parentOf("kiwi")).toBeUndefined();
    expect(idx.childrenOf("berries")).toEqual(["straw", "blue"]);
    expect(idx.childrenOf("seed")).toEqual([]);
    expect(idx.siblingsOf("banana")).toEqual(["apple", "banana", "berries"]);
    expect(idx.siblingsOf("veg")).toEqual(["fruit", "veg"]);
    expect(idx.depthOf("seed")).toBe(2);
    expect(idx.depthOf("kiwi")).toBe(-1);
    expect(idx.ancestorsOf("seed")).toEqual(["apple", "fruit"]);
    expect(idx.isAncestor("fruit", "seed")).toBe(true);
    expect(idx.isAncestor("seed", "fruit")).toBe(false);
    expect(idx.isAncestor("fruit", "fruit")).toBe(false);
    expect(idx.descendantsOf("fruit")).toEqual(["apple", "seed", "banana", "berries", "straw", "blue"]);
    expect(idx.get("blue")!.id).toBe("blue");
  });

  it("classifies separators (isDivider and kind)", () => {
    const i = buildIndex([n("a"), n("d", undefined, { isDivider: true }), { id: "s", label: "", type: "t", kind: "separator" } as never]);
    expect(["a", "d", "s"].map((x) => i.kindOf(x))).toEqual(["node", "separator", "separator"]);
  });

  it("rejects duplicate ids, naming the id", () => {
    expect(() => buildIndex([n("a", [n("x")]), n("x")])).toThrow(DuplicateIdError);
    expect(() => buildIndex([n("a"), n("a")])).toThrow(/"a"/);
  });

  it("handles a 50,000-deep chain without overflowing the stack", () => {
    let node = n("d49999");
    for (let i = 49998; i >= 0; i--) node = n(`d${i}`, [node]);
    const i = buildIndex([node]);
    expect(i.depthOf("d49999")).toBe(49999);
    expect(i.isAncestor("d0", "d49999")).toBe(true);
  });

  it("property: agrees with a naive walk on random forests", () => {
    fc.assert(
      fc.property(arbForest(), (roots) => {
        const i = buildIndex(roots);
        const order = naivePreorder(roots);
        const parents = naiveParents(roots);
        expect(i.order).toEqual(order);
        expect(i.size).toBe(order.length);
        for (const id of order) {
          expect(i.parentOf(id)).toBe(parents.get(id));
          expect(i.depthOf(id)).toBe(i.ancestorsOf(id).length);
          for (const c of i.childrenOf(id)) expect(i.parentOf(c)).toBe(id);
          for (const d of i.descendantsOf(id)) expect(i.ancestorsOf(d)).toContain(id);
          expect(i.orderOf(id)).toBe(order.indexOf(id));
        }
      }),
      { numRuns: 1000 }
    );
  });
});

describe("buildIndex duplicates: skip mode", () => {
  it("keeps the first occurrence, drops the repeat with its subtree, and reports it", () => {
    const seen: string[] = [];
    const i = buildIndex([n("a"), n("b", [n("a", [n("z")])])], undefined, { duplicates: "skip", onDuplicate: (id) => seen.push(id) });
    expect(i.order).toEqual(["a", "b"]);
    expect(seen).toEqual(["a"]);
  });
});
