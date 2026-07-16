import { findVisibleRowIndex, resolveTreeKeyboardAction, shouldToggleFromRowClick } from "../src/navigation.js";
import type { FlatRow, TreeNodeData } from "../src/types.js";

const node = (id: string, children?: TreeNodeData[]): TreeNodeData => ({ id, label: id, type: "test", children });
const child = node("child", [node("grandchild")]);
const rows: FlatRow[] = [
  { node: node("root", [child]), depth: 0, hasChildren: true, navigable: true },
  { node: node("divider"), depth: 1, hasChildren: false, navigable: false },
  { node: child, depth: 1, hasChildren: true, navigable: true },
  { node: node("grandchild"), depth: 2, hasChildren: false, navigable: true },
  { node: node("sibling"), depth: 0, hasChildren: false, navigable: true },
];

function expect(actual: unknown, expected: unknown, message: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}: expected ${e}, received ${a}`);
}

expect(resolveTreeKeyboardAction("ArrowDown", "root", rows, {}), { focusId: "child" }, "down skips dividers");
expect(resolveTreeKeyboardAction("ArrowUp", "sibling", rows, {}), { focusId: "grandchild" }, "up moves visibly");
expect(resolveTreeKeyboardAction("Home", "grandchild", rows, {}), { focusId: "root" }, "home focuses first");
expect(resolveTreeKeyboardAction("End", "root", rows, {}), { focusId: "sibling" }, "end focuses last");
expect(resolveTreeKeyboardAction("ArrowRight", "root", rows, {}), { toggleId: "root" }, "right expands closed parent");
expect(
  resolveTreeKeyboardAction("ArrowRight", "root", rows, { root: true }),
  { focusId: "child" },
  "right descends into open parent"
);
expect(
  resolveTreeKeyboardAction("ArrowLeft", "child", rows, { child: true }),
  { toggleId: "child" },
  "left collapses open parent"
);
expect(resolveTreeKeyboardAction("ArrowLeft", "grandchild", rows, {}), { focusId: "child" }, "left focuses parent");
expect(resolveTreeKeyboardAction("Enter", "child", rows, {}), { selectId: "child" }, "enter selects");
expect(resolveTreeKeyboardAction(" ", "child", rows, {}), { selectId: "child" }, "space selects");
expect(resolveTreeKeyboardAction("ArrowUp", "root", rows, {}), {}, "handled boundary key does not move");
expect(resolveTreeKeyboardAction("x", "root", rows, {}), null, "unhandled key passes through");
expect(findVisibleRowIndex(rows, "child"), 2, "focus index includes skipped divider positions");
expect(findVisibleRowIndex(rows, "divider"), -1, "divider cannot become a focus target");

expect(shouldToggleFromRowClick("finder", true, false, false), true, "finder expands closed parent");
expect(shouldToggleFromRowClick("finder", true, false, true), false, "finder keeps unselected open parent open");
expect(shouldToggleFromRowClick("finder", true, true, true), true, "finder collapses selected open parent");
expect(shouldToggleFromRowClick("select-only", true, true, true), false, "select-only never toggles");

console.log("solid-tree navigation behavior: ok");
