import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { emptySelection, reduceSelection, type SelectionState } from "../../../src/core/index.js";

const order = ["a", "b", "c", "d", "e"];
const sel = (s: SelectionState) => [...s.selected];

describe("reduceSelection", () => {
  it("select replaces and sets the anchor", () => {
    const s = reduceSelection(emptySelection, { type: "select", id: "b" }, "multiple");
    expect(sel(s)).toEqual(["b"]);
    expect(s.anchor).toBe("b");
  });

  it("toggle adds/removes in multiple mode and acts as select/clear in single mode", () => {
    let s = reduceSelection(emptySelection, { type: "toggle", id: "a" }, "multiple");
    s = reduceSelection(s, { type: "toggle", id: "c" }, "multiple");
    expect(sel(s)).toEqual(["a", "c"]);
    s = reduceSelection(s, { type: "toggle", id: "a" }, "multiple");
    expect(sel(s)).toEqual(["c"]);
    let t = reduceSelection(emptySelection, { type: "toggle", id: "a" }, "single");
    t = reduceSelection(t, { type: "toggle", id: "b" }, "single");
    expect(sel(t)).toEqual(["b"]);
    expect(sel(reduceSelection(t, { type: "toggle", id: "b" }, "single"))).toEqual([]);
  });

  it("range selects from the anchor in visible order, in either direction, and keeps the anchor", () => {
    let s = reduceSelection(emptySelection, { type: "select", id: "b" }, "multiple");
    s = reduceSelection(s, { type: "range", id: "d", order }, "multiple");
    expect(sel(s)).toEqual(["b", "c", "d"]);
    s = reduceSelection(s, { type: "range", id: "a", order }, "multiple");
    expect(sel(s)).toEqual(["a", "b"]);
    expect(s.anchor).toBe("b");
  });

  it("range in single mode, or with an unknown id, degrades to select", () => {
    expect(sel(reduceSelection(emptySelection, { type: "range", id: "c", order }, "single"))).toEqual(["c"]);
    const s = reduceSelection({ selected: new Set(["x"]), anchor: "x" }, { type: "range", id: "c", order }, "multiple");
    expect(sel(s)).toEqual(["c"]);
  });

  it("all, clear, retain", () => {
    expect(sel(reduceSelection(emptySelection, { type: "all", order }, "multiple"))).toEqual(order);
    expect(reduceSelection(emptySelection, { type: "all", order }, "single")).toBe(emptySelection);
    expect(reduceSelection(emptySelection, { type: "clear" }, "multiple")).toBe(emptySelection);
    const s: SelectionState = { selected: new Set(["a", "z"]), anchor: "z" };
    const r = reduceSelection(s, { type: "retain", has: (id) => id !== "z" }, "multiple");
    expect(sel(r)).toEqual(["a"]);
    expect(r.anchor).toBeNull();
    const same = reduceSelection(r, { type: "retain", has: () => true }, "multiple");
    expect(same).toBe(r);
  });

  it("property: a range is a contiguous slice containing the anchor and the target", () => {
    fc.assert(
      fc.property(fc.nat(4), fc.nat(4), (a, b) => {
        const s0 = reduceSelection(emptySelection, { type: "select", id: order[a] }, "multiple");
        const s = reduceSelection(s0, { type: "range", id: order[b], order }, "multiple");
        const idxs = sel(s).map((x) => order.indexOf(x));
        expect(idxs).toContain(a);
        expect(idxs).toContain(b);
        expect(idxs.length).toBe(Math.abs(a - b) + 1);
      })
    );
  });

  it("property: toggling the same id twice restores the selected set (multiple)", () => {
    fc.assert(
      fc.property(fc.subarray(order), fc.constantFrom(...order), (start, id) => {
        const s: SelectionState = { selected: new Set(start), anchor: null };
        const twice = reduceSelection(reduceSelection(s, { type: "toggle", id }, "multiple"), { type: "toggle", id }, "multiple");
        expect([...twice.selected].sort()).toEqual([...start].sort());
      })
    );
  });
});
