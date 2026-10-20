import type { TreeIndex } from "./tree-index.js";

export type FilterMode = "prune" | "dim";
export type Matcher<T> = (node: T, query: string) => boolean;

/**
 * Result of applying a query to an index. Holds ids only — it never clones nodes, so
 * views keep node identity across keystrokes (ANALYSIS G2).
 *
 * Visibility rule (both modes): a node is "kept" if it matches, is an ancestor of a
 * match, or lies inside a matched subtree (a match stays browsable). Prune hides
 * everything not kept; dim shows everything and dims what is not kept.
 *
 * Search opens only the ANCESTORS of matches (ANALYSIS A3): a matched node's own
 * subtree keeps the user's expansion state.
 */
export interface SearchView {
  readonly query: string;
  readonly mode: FilterMode;
  readonly matches: ReadonlySet<string>;
  /** Ancestors of matches — the ids search force-opens. */
  readonly openAncestors: ReadonlySet<string>;
  /** Kept by the visibility rule above. */
  isKept(id: string): boolean;
}

/** `null` when the (trimmed) query is empty — i.e. not searching. */
export function searchView<T>(index: TreeIndex<T>, rawQuery: string, matcher: Matcher<T>, mode: FilterMode): SearchView | null {
  const query = rawQuery.trim();
  if (!query) return null;
  const matches = new Set<string>();
  const openAncestors = new Set<string>();
  for (const id of index.order) {
    if (index.kindOf(id) === "separator") continue;
    if (matcher(index.get(id)!, query)) matches.add(id);
  }
  for (const id of matches) {
    let p = index.parentOf(id) ?? null;
    while (p !== null && !openAncestors.has(p)) {
      openAncestors.add(p);
      p = index.parentOf(p) ?? null;
    }
  }
  // "Inside a matched subtree", memoized. Iterative so deep trees cannot overflow.
  const underMatch = new Map<string, boolean>();
  const isUnderMatch = (id: string): boolean => {
    const path: string[] = [];
    let cur: string | null = id;
    let result = false;
    while (cur !== null) {
      const cached = underMatch.get(cur);
      if (cached !== undefined) {
        result = cached;
        break;
      }
      path.push(cur);
      const p: string | null = index.parentOf(cur) ?? null;
      if (p !== null && matches.has(p)) {
        result = true;
        break;
      }
      cur = p;
    }
    // Every id on the walked path shares the result (a matched ancestor covers them all).
    for (const step of path) underMatch.set(step, result);
    return result;
  };
  return {
    query,
    mode,
    matches,
    openAncestors,
    isKept: (id) =>
      index.kindOf(id) !== "separator" && (matches.has(id) || openAncestors.has(id) || isUnderMatch(id)),
  };
}

export const defaultMatcher = <T extends { label: string }>(node: T, query: string) =>
  node.label.toLowerCase().includes(query.toLowerCase());
