import type { RowKind, TreeIndex } from "./tree-index.js";
import type { SearchView } from "./search.js";

export type PlaceholderKind = "loading" | "error";

/** One visible row. Ids only — look the node up in the index. */
export interface Row {
  readonly id: string;
  /** "placeholder" rows are synthesized (loading/error under a lazy branch); they are not data. */
  readonly kind: RowKind | "placeholder";
  /** For placeholder rows: which state they stand for. */
  readonly placeholder?: PlaceholderKind;
  /** 0-based depth (indentation). */
  readonly depth: number;
  /** 1-based aria-level. */
  readonly level: number;
  /** 1-based position among visible, non-separator siblings (aria-posinset). 0 for separators. */
  readonly posinset: number;
  /** Count of visible, non-separator siblings (aria-setsize). 0 for separators. */
  readonly setsize: number;
  /** Has at least one visible child (drives the chevron and aria-expanded). */
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  readonly parentId: string | null;
}

export interface FlattenOptions {
  /** Lazy branches: true when a node can have children that are not loaded yet. */
  isExpandable?(id: string): boolean;
  /** For an expanded node with no loaded children: the placeholder row to show, if any. */
  placeholder?(id: string): PlaceholderKind | null;
  /**
   * Default true: search force-opens ancestors of matches. Pass false when `isExpanded`
   * already returns the effective state (e.g. it honours a user's collapse during search).
   */
  searchOpens?: boolean;
}

/** Id of the synthesized placeholder row under `parentId`. */
export const placeholderId = (parentId: string) => `${parentId}::placeholder`;

/**
 * Linearize the visible part of the tree, in document order. A node's children appear
 * only when it is expanded (`isExpanded`), or — while searching — when search opens it.
 * Prune mode drops nodes the view does not keep; dim mode keeps everything.
 */
export function flatten<T>(
  index: TreeIndex<T>,
  isExpanded: (id: string) => boolean,
  view?: SearchView | null,
  options: FlattenOptions = {}
): Row[] {
  const prune = !!view && view.mode === "prune";
  const visibleChildren = (ids: readonly string[]) => (prune ? ids.filter((id) => view!.isKept(id)) : ids);
  const out: Row[] = [];

  // Iterative DFS; each frame is a sibling list being emitted.
  const stack: { ids: readonly string[]; i: number; depth: number; parent: string | null; pos: number; size: number }[] = [];
  const pushLevel = (ids: readonly string[], depth: number, parent: string | null) => {
    const vis = visibleChildren(ids);
    const size = vis.reduce((n, id) => (index.kindOf(id) === "separator" ? n : n + 1), 0);
    stack.push({ ids: vis, i: 0, depth, parent, pos: 0, size });
  };
  pushLevel(index.roots, 0, null);

  while (stack.length) {
    const f = stack[stack.length - 1];
    if (f.i >= f.ids.length) {
      stack.pop();
      continue;
    }
    const id = f.ids[f.i++];
    const kind = index.kindOf(id)!;
    if (kind === "separator") {
      out.push({ id, kind, depth: f.depth, level: f.depth + 1, posinset: 0, setsize: 0, hasChildren: false, expanded: false, parentId: f.parent });
      continue;
    }
    const kids = visibleChildren(index.childrenOf(id));
    const lazy = kids.length === 0 && !!options.isExpandable?.(id);
    const hasChildren = kids.length > 0 || lazy;
    const searchOpen = options.searchOpens !== false && !!view && view.openAncestors.has(id);
    const expanded = hasChildren && (isExpanded(id) || searchOpen);
    out.push({
      id,
      kind,
      depth: f.depth,
      level: f.depth + 1,
      posinset: ++f.pos,
      setsize: f.size,
      hasChildren,
      expanded,
      parentId: f.parent,
    });
    if (expanded && lazy) {
      const kind = options.placeholder?.(id);
      if (kind) {
        out.push({ id: placeholderId(id), kind: "placeholder", placeholder: kind, depth: f.depth + 1, level: f.depth + 2, posinset: 0, setsize: 0, hasChildren: false, expanded: false, parentId: id });
      }
    } else if (expanded) pushLevel(index.childrenOf(id), f.depth + 1, id);
  }
  return out;
}
