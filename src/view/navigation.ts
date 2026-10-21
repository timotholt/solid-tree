// Keyboard resolution lives in ./core/navigation.ts (resolveKey). These are the view
// helpers that remain.
import type { FlatRow, TreeRowClickPolicy } from "../types.js";

/** Locate a navigable row in the full visible-row list (which includes dividers). */
export function findVisibleRowIndex(rows: FlatRow[], id: string): number {
  return rows.findIndex((row) => row.navigable && row.node.id === id);
}

/** True when a row-body click should toggle expansion after selecting it. */
export function shouldToggleFromRowClick(
  policy: TreeRowClickPolicy,
  hasChildren: boolean,
  wasSelected: boolean,
  wasExpanded: boolean
): boolean {
  if (policy === "select-only" || !hasChildren) return false;
  return !wasExpanded || wasSelected;
}
