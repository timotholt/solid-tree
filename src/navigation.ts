import type { FlatRow, TreeRowClickPolicy } from "./types.js";

export interface TreeKeyboardAction {
  focusId?: string;
  toggleId?: string;
  selectId?: string;
}

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

/**
 * Resolve one WAI-ARIA tree navigation key against the currently visible rows.
 * Kept pure so recursive and virtualized views share behavior without coupling
 * navigation decisions to DOM traversal.
 */
export function resolveTreeKeyboardAction(
  key: string,
  currentId: string,
  rows: FlatRow[],
  expanded: Record<string, boolean>
): TreeKeyboardAction | null {
  const navigable = rows.filter((row) => row.navigable);
  const index = navigable.findIndex((row) => row.node.id === currentId);
  if (index < 0) return null;

  const current = navigable[index];
  const focusAt = (nextIndex: number): TreeKeyboardAction => {
    const next = navigable[nextIndex];
    return next ? { focusId: next.node.id } : {};
  };

  switch (key) {
    case "ArrowDown":
      return focusAt(index + 1);
    case "ArrowUp":
      return focusAt(index - 1);
    case "Home":
      return focusAt(0);
    case "End":
      return focusAt(navigable.length - 1);
    case "ArrowRight": {
      if (!current.hasChildren) return {};
      if (!expanded[current.node.id]) return { toggleId: current.node.id };
      const child = navigable[index + 1];
      return child && child.depth > current.depth ? { focusId: child.node.id } : {};
    }
    case "ArrowLeft": {
      if (current.hasChildren && expanded[current.node.id]) return { toggleId: current.node.id };
      for (let i = index - 1; i >= 0; i -= 1) {
        if (navigable[i].depth < current.depth) return { focusId: navigable[i].node.id };
      }
      return {};
    }
    case "Enter":
    case " ":
    case "Spacebar":
      return { selectId: current.node.id };
    default:
      return null;
  }
}
