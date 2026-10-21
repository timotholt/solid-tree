import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildIndex, defaultMatcher, flatten, searchView } from "../../../src/core/index.js";
import { arbForest, naiveVisible, type GNode } from "../../support/arb.js";
import { n, produce } from "../../support/fixtures.js";

const idx = buildIndex(produce());
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
const none = () => false;

describe("flatten", () => {
  it("shows roots when collapsed and descends into expanded nodes", () => {
    expect(ids(flatten(idx, none))).toEqual(["fruit", "veg"]);
    const open = new Set(["fruit", "berries"]);
    expect(ids(flatten(idx, (id) => open.has(id)))).toEqual(["fruit", "apple", "banana", "berries", "straw", "blue", "veg"]);
  });

  it("emits level, posinset, setsize, parentId, expanded", () => {
    const rows = flatten(idx, (id) => id === "fruit");
    const banana = rows.find((r) => r.id === "banana")!;
    expect(banana).toMatchObject({ depth: 1, level: 2, posinset: 2, setsize: 3, parentId: "fruit", hasChildren: false, expanded: false });
    expect(rows[0]).toMatchObject({ id: "fruit", expanded: true, hasChildren: true, posinset: 1, setsize: 2 });
  });

  it("separators are rows but are not counted in set sizes", () => {
    const i = buildIndex([n("a"), n("d", undefined, { isDivider: true }), n("b")]);
    const rows = flatten(i, none);
    expect(rows.map((r) => [r.id, r.kind, r.posinset, r.setsize])).toEqual([
      ["a", "node", 1, 2],
      ["d", "separator", 0, 0],
      ["b", "node", 2, 2],
    ]);
  });

  it("property: equals the naive visible walk; set positions agree with siblings", () => {
    fc.assert(
      fc.property(arbForest(), fc.array(fc.nat(), { maxLength: 20 }), (roots, picks) => {
        const i = buildIndex(roots);
        const open = new Set(picks.map((p) => i.order[p % i.size]));
        const rows = flatten(i, (id) => open.has(id));
        expect(ids(rows)).toEqual(naiveVisible(roots, open));
        const byParent = new Map<string | null, typeof rows>();
        for (const r of rows) if (r.kind === "node") byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
        for (const [, sibs] of byParent) {
          expect(sibs.map((r) => r.posinset)).toEqual(sibs.map((_, k) => k + 1));
          for (const r of sibs) expect(r.setsize).toBe(sibs.length);
        }
      }),
      { numRuns: 1000 }
    );
  });
});

describe("searchView", () => {
  it("returns null for an empty or blank query", () => {
    expect(searchView(idx, "", defaultMatcher, "prune")).toBeNull();
    expect(searchView(idx, "   ", defaultMatcher, "prune")).toBeNull();
  });

  it("prune: shows matches with their ancestor path; opens ancestors only (A3)", () => {
    const v = searchView(idx, "Fruit", defaultMatcher, "prune")!;
    expect([...v.matches]).toEqual(["fruit"]);
    expect([...v.openAncestors]).toEqual([]);
    // The matched parent stays collapsed (user state) but its subtree is browsable.
    expect(ids(flatten(idx, none, v))).toEqual(["fruit"]);
    expect(ids(flatten(idx, (id) => id === "fruit", v))).toEqual(["fruit", "apple", "banana", "berries"]);
  });

  it("prune: a deep match opens exactly its ancestors", () => {
    const v = searchView(idx, "straw", defaultMatcher, "prune")!;
    expect([...v.openAncestors].sort()).toEqual(["berries", "fruit"]);
    expect(ids(flatten(idx, none, v))).toEqual(["fruit", "berries", "straw"]);
  });

  it("dim: keeps every row and reports what is kept", () => {
    const v = searchView(idx, "carrot", defaultMatcher, "dim")!;
    const rows = flatten(idx, none, v);
    expect(ids(rows)).toEqual(["fruit", "veg", "carrot"]);
    expect(v.isKept("fruit")).toBe(false);
    expect(v.isKept("veg")).toBe(true);
    expect(v.isKept("carrot")).toBe(true);
  });

  it("separators never match and are never kept", () => {
    const i = buildIndex([n("d", undefined, { isDivider: true, label: "x" }), n("x")]);
    const v = searchView(i, "x", (node: { label: string }) => node.label === "x", "prune")!;
    expect([...v.matches]).toEqual(["x"]);
    expect(ids(flatten(i, none, v))).toEqual(["x"]);
  });

  it("property (prune): kept = matches ∪ ancestors ∪ inside-a-match; every match is visible", () => {
    fc.assert(
      fc.property(arbForest(), fc.stringMatching(/^[abc]{1,2}$/), (roots, q) => {
        const i = buildIndex(roots);
        const v = searchView(i, q, defaultMatcher, "prune");
        const isMatch = (node: GNode) => !node.isDivider && node.label.toLowerCase().includes(q);
        const expected = new Set<string>();
        const walk = (ns: GNode[], underMatch: boolean): boolean => {
          let any = false;
          for (const node of ns) {
            const self = isMatch(node);
            const below = walk(node.children ?? [], underMatch || self);
            if (!node.isDivider && (self || below || underMatch)) expected.add(node.id);
            any = any || self || below;
          }
          return any;
        };
        walk(roots, false);
        if (!v) return;
        for (const id of i.order) expect(v.isKept(id)).toBe(expected.has(id));
        const rows = flatten(i, none, v);
        for (const m of v.matches) expect(ids(rows)).toContain(m);
        // A3: anything search expanded is an ancestor of a match.
        for (const r of rows) if (r.expanded) expect(v.openAncestors.has(r.id)).toBe(true);
      }),
      { numRuns: 1000 }
    );
  });

  it("handles a 50,000-deep chain", () => {
    let node = n("d49999");
    for (let k = 49998; k >= 0; k--) node = n(`d${k}`, [node]);
    const i = buildIndex([node]);
    const v = searchView(i, "d49999", defaultMatcher, "prune")!;
    expect(flatten(i, none, v)).toHaveLength(50000);
  });
});

describe("flatten — lazy branches", () => {
  const i = buildIndex([n("a"), n("b")]);
  it("isExpandable gives a childless node a chevron", () => {
    const rows = flatten(i, () => false, null, { isExpandable: (id) => id === "a" });
    expect(rows.map((r) => [r.id, r.hasChildren])).toEqual([["a", true], ["b", false]]);
  });
  it("an expanded lazy node shows its placeholder row (not counted in sets)", () => {
    const rows = flatten(i, (id) => id === "a", null, { isExpandable: (id) => id === "a", placeholder: () => "loading" });
    expect(rows.map((r) => [r.id, r.kind, r.placeholder, r.level, r.setsize])).toEqual([
      ["a", "node", undefined, 1, 2],
      ["a::placeholder", "placeholder", "loading", 2, 0],
      ["b", "node", undefined, 1, 2],
    ]);
  });
  it("no placeholder kind → nothing rendered under the open lazy node", () => {
    const rows = flatten(i, (id) => id === "a", null, { isExpandable: () => true, placeholder: () => null });
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
