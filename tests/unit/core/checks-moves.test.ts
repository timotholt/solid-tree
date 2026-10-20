import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  applyMove,
  buildIndex,
  canMove,
  checkStateOf,
  defaultAccessors,
  toggleCheck,
  type DropPosition,
} from "../../../src/core/index.js";
import { arbForest, naivePreorder, type GNode } from "../../support/arb.js";
import { produce } from "../../support/fixtures.js";

const idx = buildIndex(produce());

describe("checks — cascade", () => {
  it("checking a parent checks its subtree; unchecking a child makes ancestors mixed", () => {
    let c = toggleCheck(idx, new Set(), "fruit", "cascade");
    expect(checkStateOf(idx, c, "fruit", "cascade")).toBe("checked");
    expect(checkStateOf(idx, c, "seed", "cascade")).toBe("checked");
    c = toggleCheck(idx, c, "straw", "cascade");
    expect(checkStateOf(idx, c, "berries", "cascade")).toBe("mixed");
    expect(checkStateOf(idx, c, "fruit", "cascade")).toBe("mixed");
    expect(checkStateOf(idx, c, "apple", "cascade")).toBe("checked");
  });

  it("checking all children checks the parent; toggling mixed clears it", () => {
    let c = toggleCheck(idx, new Set(), "straw", "cascade");
    c = toggleCheck(idx, c, "blue", "cascade");
    expect(checkStateOf(idx, c, "berries", "cascade")).toBe("checked");
    c = toggleCheck(idx, c, "seed", "cascade");
    expect(checkStateOf(idx, c, "fruit", "cascade")).toBe("mixed");
    c = toggleCheck(idx, c, "fruit", "cascade");
    expect(checkStateOf(idx, c, "fruit", "cascade")).toBe("unchecked");
    expect(c.size).toBe(0);
  });

  it("an unloaded parent keeps its explicit value and is never mixed", () => {
    const isLoaded = (id: string) => id !== "berries";
    const c = toggleCheck(idx, new Set(), "berries", "cascade", isLoaded);
    expect(checkStateOf(idx, c, "berries", "cascade", isLoaded)).toBe("checked");
    expect(checkStateOf(idx, new Set(["straw"]), "berries", "cascade", isLoaded)).toBe("unchecked");
  });

  it("strict mode is independent", () => {
    const c = toggleCheck(idx, new Set(), "fruit", "strict");
    expect([...c]).toEqual(["fruit"]);
    expect(checkStateOf(idx, c, "apple", "strict")).toBe("unchecked");
  });

  it("property (cascade): toggled node ends checked/unchecked; parents agree with loaded children", () => {
    fc.assert(
      fc.property(arbForest(), fc.array(fc.nat(), { minLength: 1, maxLength: 8 }), (roots, picks) => {
        const i = buildIndex(roots);
        const nodes = i.order.filter((x) => i.kindOf(x) === "node");
        if (!nodes.length) return;
        let c = new Set<string>();
        for (const p of picks) {
          const id = nodes[p % nodes.length];
          const before = checkStateOf(i, c, id, "cascade");
          c = toggleCheck(i, c, id, "cascade");
          expect(checkStateOf(i, c, id, "cascade")).toBe(before === "unchecked" ? "checked" : "unchecked");
        }
        for (const id of nodes) {
          const kids = i.childrenOf(id).filter((k) => i.kindOf(k) === "node");
          if (!kids.length) continue;
          const states = kids.map((k) => checkStateOf(i, c, k, "cascade"));
          const s = checkStateOf(i, c, id, "cascade");
          if (states.every((x) => x === "checked")) expect(s).toBe("checked");
          else if (states.every((x) => x === "unchecked")) expect(s).toBe("unchecked");
          else expect(s).toBe("mixed");
        }
      }),
      { numRuns: 1000 }
    );
  });
});

describe("moves", () => {
  const withChildren = (node: GNode, children: GNode[] | undefined) => ({ ...node, children });
  const roots = produce() as unknown as GNode[];

  it("canMove rejects impossible moves", () => {
    expect(canMove(idx, ["fruit"], "seed", "inside")).toBe(false); // into own subtree
    expect(canMove(idx, ["apple"], "apple", "after")).toBe(false);
    expect(canMove(idx, ["kiwi"], "apple", "after")).toBe(false);
    expect(canMove(idx, [], "apple", "after")).toBe(false);
    expect(canMove(idx, ["banana"], "carrot", "inside")).toBe(true);
  });

  it("moves inside, before and after", () => {
    const ids = (r: GNode[]) => naivePreorder(r);
    const inside = applyMove(roots, idx, defaultAccessors() as never, withChildren, ["banana"], "carrot", "inside");
    expect(ids(inside)).toEqual(["fruit", "apple", "seed", "berries", "straw", "blue", "veg", "carrot", "banana"]);
    const before = applyMove(roots, idx, defaultAccessors() as never, withChildren, ["veg"], "fruit", "before");
    expect(before.map((r) => r.id)).toEqual(["veg", "fruit"]);
    const after = applyMove(roots, idx, defaultAccessors() as never, withChildren, ["seed"], "veg", "after");
    expect(after.map((r) => r.id)).toEqual(["fruit", "veg", "seed"]);
  });

  it("does not mutate the input and shares untouched subtrees", () => {
    const snapshot = JSON.stringify(roots);
    const out = applyMove(roots, idx, defaultAccessors() as never, withChildren, ["blue"], "straw", "before");
    expect(JSON.stringify(roots)).toBe(snapshot);
    expect(out[1]).toBe(roots[1]); // veg untouched → same object
  });

  it("throws on an invalid move", () => {
    expect(() => applyMove(roots, idx, defaultAccessors() as never, withChildren, ["fruit"], "seed", "inside")).toThrow(/invalid move/);
  });

  it("property: valid moves keep every id exactly once, place sources correctly, keep other order", () => {
    fc.assert(
      fc.property(
        arbForest(30),
        fc.array(fc.nat(), { minLength: 1, maxLength: 3 }),
        fc.nat(),
        fc.constantFrom<DropPosition>("before", "after", "inside"),
        (rs, srcPicks, tgtPick, pos) => {
          const i = buildIndex(rs);
          const sources = [...new Set(srcPicks.map((p) => i.order[p % i.size]))];
          const target = i.order[tgtPick % i.size];
          if (!canMove(i, sources, target, pos)) return;
          const out = applyMove(rs, i, defaultAccessors() as never, withChildren, sources, target, pos);
          const j = buildIndex(out); // throws on duplicates
          expect([...j.order].sort()).toEqual([...i.order].sort());
          const top = sources.filter((s) => !i.ancestorsOf(s).some((a) => sources.includes(a)));
          const expectedParent = pos === "inside" ? target : i.parentOf(target);
          for (const s of top) expect(j.parentOf(s)).toBe(expectedParent);
          // Moved subtrees are intact.
          for (const s of top) expect(j.descendantsOf(s)).toEqual(i.descendantsOf(s));
          // Everything that did not move keeps its relative order.
          const moved = new Set(top.flatMap((s) => [s, ...i.descendantsOf(s)]));
          const rest = (o: readonly string[]) => o.filter((x) => !moved.has(x));
          expect(rest(j.order)).toEqual(rest(i.order));
        }
      ),
      { numRuns: 1000 }
    );
  });
});
