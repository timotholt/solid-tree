import { TreeNodeData, TreeMatcher, FlatRow } from "../types.js";
import { buildIndex, flatten } from "../core/index.js";

export const defaultMatcher: TreeMatcher = (node, query) =>
  node.label.toLowerCase().includes(query.toLowerCase());

// Prune walk: keep a node if it matches OR any descendant matches. A matched
// node keeps its full original subtree (browse into it); a non-matching node on
// a match path keeps only its surviving children.
export function pruneNode(node: TreeNodeData, query: string, matcher: TreeMatcher): TreeNodeData | null {
  if (node.isDivider) return null; // dividers have no label; drop while filtering
  const survivingKids = (node.children ?? [])
    .map((c) => pruneNode(c, query, matcher))
    .filter((c): c is TreeNodeData => c !== null);
  const selfHit = matcher(node, query);
  if (!selfHit && survivingKids.length === 0) return null;
  return {
    ...node,
    children: selfHit ? node.children : survivingKids,
  };
}

// Every node in the (pruned) tree that has children — force-expanded while a
// query is active so matches are revealed without touching saved expand state.
export function collectExpandable(
  nodes: TreeNodeData[],
  acc: Record<string, boolean>
): Record<string, boolean> {
  for (const n of nodes) {
    if (n.children && n.children.length) {
      acc[n.id] = true;
      collectExpandable(n.children, acc);
    }
  }
  return acc;
}

export function collectIds(nodes: TreeNodeData[], acc: Set<string>): Set<string> {
  for (const n of nodes) {
    acc.add(n.id);
    if (n.children) collectIds(n.children, acc);
  }
  return acc;
}

export function findNode(nodes: TreeNodeData[], id: string): TreeNodeData | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function containsDescendant(node: TreeNodeData, id: string): boolean {
  return !!node.children && node.children.some((c) => c.id === id || containsDescendant(c, id));
}

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
