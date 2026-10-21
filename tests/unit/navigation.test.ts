// Characterization of the original keyboard behavior, ported from the retired
// resolveTreeKeyboardAction onto core resolveKey (PLAN P3). Every original scenario
// is kept; rows now carry `expanded`/`parentId` instead of a separate expanded map.
import { describe, expect, it } from "vitest";
import { resolveKey } from "../../src/core/index.js";
import { findVisibleRowIndex, shouldToggleFromRowClick } from "../../src/view/navigation.js";
import { flattenVisible } from "../../src/compat/search.js";
import type { TreeNodeData } from "../../src/types.js";

const node = (id: string, children?: TreeNodeData[], extra: Partial<TreeNodeData> = {}): TreeNodeData => ({ id, label: id, type: "test", children, ...extra });
// root
//   (divider)
//   child
//     grandchild
// sibling
const data = [node("root", [node("divider", undefined, { isDivider: true }), node("child", [node("grandchild")])]), node("sibling")];
const rowsWith = (open: string[]) => flattenVisible(data, Object.fromEntries(open.map((id) => [id, true])));
const full = rowsWith(["root", "child"]); // root, divider, child, grandchild, sibling

describe("resolveKey (ported characterization)", () => {
  it("down skips dividers", () => expect(resolveKey("ArrowDown", "root", full)).toEqual({ focusId: "child" }));
  it("up moves visibly", () => expect(resolveKey("ArrowUp", "sibling", full)).toEqual({ focusId: "grandchild" }));
  it("home focuses first", () => expect(resolveKey("Home", "grandchild", full)).toEqual({ focusId: "root" }));
  it("end focuses last", () => expect(resolveKey("End", "root", full)).toEqual({ focusId: "sibling" }));
  it("right expands closed parent", () => expect(resolveKey("ArrowRight", "root", rowsWith([]))).toEqual({ toggleId: "root" }));
  it("right descends into open parent", () => expect(resolveKey("ArrowRight", "root", full)).toEqual({ focusId: "child" }));
  it("right on a leaf is handled but does nothing", () => expect(resolveKey("ArrowRight", "grandchild", full)).toEqual({}));
  it("left collapses open parent", () => expect(resolveKey("ArrowLeft", "child", full)).toEqual({ toggleId: "child" }));
  it("left focuses parent", () => expect(resolveKey("ArrowLeft", "grandchild", full)).toEqual({ focusId: "child" }));
  it("left at a root is handled but does nothing", () => expect(resolveKey("ArrowLeft", "sibling", full)).toEqual({}));
  it("enter selects", () => expect(resolveKey("Enter", "child", full)).toEqual({ selectId: "child" }));
  it("space selects", () => expect(resolveKey(" ", "child", full)).toEqual({ selectId: "child" }));
  it("legacy Spacebar selects", () => expect(resolveKey("Spacebar", "child", full)).toEqual({ selectId: "child" }));
  it("handled boundary key does not move", () => expect(resolveKey("ArrowUp", "root", full)).toEqual({}));
  it("unhandled key passes through", () => expect(resolveKey("x", "root", full)).toBeNull());
  it("unknown current row passes through", () => expect(resolveKey("ArrowDown", "nope", full)).toBeNull());
  it("a divider is never the current row", () => expect(resolveKey("ArrowDown", "divider", full)).toBeNull());
});

describe("findVisibleRowIndex", () => {
  it("includes skipped divider positions in the index", () => expect(findVisibleRowIndex(full, "child")).toBe(2));
  it("never returns a divider", () => expect(findVisibleRowIndex(full, "divider")).toBe(-1));
});

describe("flattenVisible (compat wrapper)", () => {
  it("returns FlatRows with node and navigable", () => {
    expect(full.map((r) => [r.node.id, r.depth, r.navigable])).toEqual([
      ["root", 0, true],
      ["divider", 1, false],
      ["child", 1, true],
      ["grandchild", 2, true],
      ["sibling", 0, true],
    ]);
  });
});

describe("shouldToggleFromRowClick", () => {
  it("finder expands a closed parent", () => expect(shouldToggleFromRowClick("finder", true, false, false)).toBe(true));
  it("finder keeps an unselected open parent open", () => expect(shouldToggleFromRowClick("finder", true, false, true)).toBe(false));
  it("finder collapses a selected open parent", () => expect(shouldToggleFromRowClick("finder", true, true, true)).toBe(true));
  it("finder never toggles a leaf", () => expect(shouldToggleFromRowClick("finder", false, true, true)).toBe(false));
  it("select-only never toggles", () => expect(shouldToggleFromRowClick("select-only", true, true, true)).toBe(false));
});
