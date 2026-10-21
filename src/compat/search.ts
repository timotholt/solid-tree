import type { TreeNodeData, FlatRow } from "../types.js";
import { buildIndex, flatten } from "../core/index.js";

// The pre-0.17 tree walks (pruneNode, collectExpandable, findNode, …) were replaced by
// the core index/search/flatten. Only the public flattenVisible remains, as a wrapper.

/**
 * Linearize the tree into the rows that are currently visible (descending only into
 * expanded nodes). Kept for compatibility; built on the core `flatten`.
 */
export function flattenVisible(nodes: TreeNodeData[], expanded: Record<string, boolean>, depth = 0): FlatRow[] {
  const index = buildIndex(nodes);
  return flatten(index, (id) => !!expanded[id]).map((r) => ({
    ...r,
    depth: r.depth + depth,
    level: r.level + depth,
    node: index.get(r.id)!,
    navigable: r.kind === "node",
  }));
}
