import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildIndex, flatten, isTypeaheadKey, resolveKey, typeahead } from "../../../src/core/index.js";
import { arbForest } from "../../support/arb.js";
import { n, produce } from "../../support/fixtures.js";

const idx = buildIndex(produce());
const open = new Set(["fruit", "berries"]);
const rows = flatten(idx, (id) => open.has(id));
// fruit, apple, banana, berries, straw, blue, veg
const label = (id: string) => (idx.get(id) as { label: string }).label;

describe("resolveKey", () => {
  it("moves focus with arrows, Home and End", () => {
    expect(resolveKey("ArrowDown", "fruit", rows)).toEqual({ focusId: "apple" });
    expect(resolveKey("ArrowUp", "apple", rows)).toEqual({ focusId: "fruit" });
    expect(resolveKey("Home", "blue", rows)).toEqual({ focusId: "fruit" });
    expect(resolveKey("End", "fruit", rows)).toEqual({ focusId: "veg" });
    expect(resolveKey("ArrowUp", "fruit", rows)).toEqual({});
  });

  it("ArrowRight expands, then enters; ArrowLeft collapses, then goes to the parent", () => {
    expect(resolveKey("ArrowRight", "apple", rows)).toEqual({ toggleId: "apple" });
    expect(resolveKey("ArrowRight", "berries", rows)).toEqual({ focusId: "straw" });
    expect(resolveKey("ArrowRight", "banana", rows)).toEqual({});
    expect(resolveKey("ArrowLeft", "berries", rows)).toEqual({ toggleId: "berries" });
    expect(resolveKey("ArrowLeft", "straw", rows)).toEqual({ focusId: "berries" });
    expect(resolveKey("ArrowLeft", "veg", rows)).toEqual({});
  });

  it("RTL swaps ArrowLeft and ArrowRight", () => {
    expect(resolveKey("ArrowLeft", "apple", rows, { rtl: true })).toEqual({ toggleId: "apple" });
    expect(resolveKey("ArrowRight", "straw", rows, { rtl: true })).toEqual({ focusId: "berries" });
  });

  it("* expands all collapsed siblings that have children", () => {
    expect(resolveKey("*", "banana", rows)).toEqual({ expandIds: ["apple"] });
    expect(resolveKey("*", "straw", rows)).toEqual({});
  });

  it("Enter/Space select, but not a disabled node (which stays focusable)", () => {
    expect(resolveKey("Enter", "banana", rows)).toEqual({ selectId: "banana" });
    expect(resolveKey(" ", "banana", rows)).toEqual({ selectId: "banana" });
    const isDisabled = (id: string) => id === "banana";
    expect(resolveKey("Enter", "banana", rows, { isDisabled })).toEqual({});
    expect(resolveKey("ArrowDown", "apple", rows, { isDisabled })).toEqual({ focusId: "banana" });
    expect(resolveKey("ArrowDown", "apple", rows, { isDisabled, skipDisabled: true })).toEqual({ focusId: "berries" });
  });

  it("skips separators and passes through unknown keys/rows", () => {
    const i = buildIndex([n("a"), n("d", undefined, { isDivider: true }), n("b")]);
    const r = flatten(i, () => false);
    expect(resolveKey("ArrowDown", "a", r)).toEqual({ focusId: "b" });
    expect(resolveKey("x", "a", r)).toBeNull();
    expect(resolveKey("ArrowDown", "d", r)).toBeNull();
    expect(resolveKey("ArrowDown", "zzz", r)).toBeNull();
  });

  it("property: focus never leaves the visible, navigable rows", () => {
    const keys = ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "*", "Enter"];
    fc.assert(
      fc.property(arbForest(), fc.array(fc.nat(), { maxLength: 10 }), fc.nat(), fc.constantFrom(...keys), (roots, picks, at, key) => {
        const i = buildIndex(roots);
        const o = new Set(picks.map((p) => i.order[p % i.size]));
        const r = flatten(i, (id) => o.has(id));
        const navigable = r.filter((x) => x.kind === "node");
        if (!navigable.length) return;
        const current = navigable[at % navigable.length].id;
        const action = resolveKey(key, current, r)!;
        expect(action).not.toBeNull();
        if (action.focusId) expect(navigable.map((x) => x.id)).toContain(action.focusId);
        for (const e of action.expandIds ?? []) expect(r.find((x) => x.id === e)?.hasChildren).toBe(true);
      }),
      { numRuns: 1000 }
    );
  });
});

describe("typeahead", () => {
  it("jumps to the next row starting with the character, wrapping", () => {
    const t1 = typeahead(null, "b", 0, rows, "fruit", label);
    expect(t1.focusId).toBe("banana");
    const t2 = typeahead(t1.state, "b", 100, rows, "banana", label);
    expect(t2.focusId).toBe("berries");
    const t3 = typeahead(t2.state, "b", 200, rows, "berries", label);
    expect(t3.focusId).toBe("blue");
    const t4 = typeahead(t3.state, "b", 300, rows, "blue", label);
    expect(t4.focusId).toBe("banana"); // wraps
  });

  it("builds a word within the reset window and keeps the current row if it still matches", () => {
    const a = typeahead(null, "b", 0, rows, "fruit", label);
    const b = typeahead(a.state, "e", 100, rows, a.focusId!, label);
    expect(b.focusId).toBe("berries");
    const c = typeahead(b.state, "r", 200, rows, b.focusId!, label);
    expect(c.focusId).toBe("berries");
  });

  it("resets after the timeout", () => {
    const a = typeahead(null, "b", 0, rows, "fruit", label);
    const b = typeahead(a.state, "v", 10_000, rows, a.focusId!, label);
    expect(b.state.buffer).toBe("v");
    expect(b.focusId).toBe("veg");
  });

  it("leaves focus alone when nothing matches", () => {
    expect(typeahead(null, "z", 0, rows, "fruit", label).focusId).toBeUndefined();
  });

  it("isTypeaheadKey accepts printable characters only", () => {
    expect(isTypeaheadKey({ key: "a" })).toBe(true);
    expect(isTypeaheadKey({ key: "a", ctrlKey: true })).toBe(false);
    expect(isTypeaheadKey({ key: " " })).toBe(false);
    expect(isTypeaheadKey({ key: "*" })).toBe(false);
    expect(isTypeaheadKey({ key: "ArrowDown" })).toBe(false);
  });
});
