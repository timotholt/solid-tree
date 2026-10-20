import { describe, expect, it } from "vitest";
import { findVisibleRowIndex, resolveTreeKeyboardAction, shouldToggleFromRowClick } from "../../src/navigation.js";
import type { FlatRow, TreeNodeData } from "../../src/types.js";

const node = (id: string, children?: TreeNodeData[]): TreeNodeData => ({ id, label: id, type: "test", children });
const child = node("child", [node("grandchild")]);
const rows: FlatRow[] = [
  { node: node("root", [child]), depth: 0, hasChildren: true, navigable: true },
  { node: node("divider"), depth: 1, hasChildren: false, navigable: false },
  { node: child, depth: 1, hasChildren: true, navigable: true },
  { node: node("grandchild"), depth: 2, hasChildren: false, navigable: true },
  { node: node("sibling"), depth: 0, hasChildren: false, navigable: true },
];

describe("resolveTreeKeyboardAction", () => {
  it("down skips dividers", () => expect(resolveTreeKeyboardAction("ArrowDown", "root", rows, {})).toEqual({ focusId: "child" }));
  it("up moves visibly", () => expect(resolveTreeKeyboardAction("ArrowUp", "sibling", rows, {})).toEqual({ focusId: "grandchild" }));
  it("home focuses first", () => expect(resolveTreeKeyboardAction("Home", "grandchild", rows, {})).toEqual({ focusId: "root" }));
  it("end focuses last", () => expect(resolveTreeKeyboardAction("End", "root", rows, {})).toEqual({ focusId: "sibling" }));
  it("right expands closed parent", () =>
    expect(resolveTreeKeyboardAction("ArrowRight", "root", rows, {})).toEqual({ toggleId: "root" }));
  it("right descends into open parent", () =>
    expect(resolveTreeKeyboardAction("ArrowRight", "root", rows, { root: true })).toEqual({ focusId: "child" }));
  it("right on a leaf is handled but does nothing", () =>
    expect(resolveTreeKeyboardAction("ArrowRight", "grandchild", rows, {})).toEqual({}));
  it("left collapses open parent", () =>
    expect(resolveTreeKeyboardAction("ArrowLeft", "child", rows, { child: true })).toEqual({ toggleId: "child" }));
  it("left focuses parent", () =>
    expect(resolveTreeKeyboardAction("ArrowLeft", "grandchild", rows, {})).toEqual({ focusId: "child" }));
  it("left at a root is handled but does nothing", () =>
    expect(resolveTreeKeyboardAction("ArrowLeft", "sibling", rows, {})).toEqual({}));
  it("enter selects", () => expect(resolveTreeKeyboardAction("Enter", "child", rows, {})).toEqual({ selectId: "child" }));
  it("space selects", () => expect(resolveTreeKeyboardAction(" ", "child", rows, {})).toEqual({ selectId: "child" }));
  it("legacy Spacebar selects", () =>
    expect(resolveTreeKeyboardAction("Spacebar", "child", rows, {})).toEqual({ selectId: "child" }));
  it("handled boundary key does not move", () => expect(resolveTreeKeyboardAction("ArrowUp", "root", rows, {})).toEqual({}));
  it("unhandled key passes through", () => expect(resolveTreeKeyboardAction("x", "root", rows, {})).toBeNull());
  it("unknown current row passes through", () => expect(resolveTreeKeyboardAction("ArrowDown", "nope", rows, {})).toBeNull());
  it("a divider is never the current row", () =>
    expect(resolveTreeKeyboardAction("ArrowDown", "divider", rows, {})).toBeNull());
});

describe("findVisibleRowIndex", () => {
  it("includes skipped divider positions in the index", () => expect(findVisibleRowIndex(rows, "child")).toBe(2));
  it("never returns a divider", () => expect(findVisibleRowIndex(rows, "divider")).toBe(-1));
});

describe("shouldToggleFromRowClick", () => {
  it("finder expands a closed parent", () => expect(shouldToggleFromRowClick("finder", true, false, false)).toBe(true));
  it("finder keeps an unselected open parent open", () =>
    expect(shouldToggleFromRowClick("finder", true, false, true)).toBe(false));
  it("finder collapses a selected open parent", () => expect(shouldToggleFromRowClick("finder", true, true, true)).toBe(true));
  it("finder never toggles a leaf", () => expect(shouldToggleFromRowClick("finder", false, true, true)).toBe(false));
  it("select-only never toggles", () => expect(shouldToggleFromRowClick("select-only", true, true, true)).toBe(false));
});
