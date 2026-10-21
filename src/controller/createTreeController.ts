import { DEV, createComputed, createEffect, createMemo, getOwner, on, untrack, type Accessor } from "solid-js";
import {
  buildIndex,
  defaultAccessors,
  flatten,
  placeholderId,
  type Row,
  type SearchView,
  type TreeIndex,
} from "../core/index.js";
import { access, isProvided } from "../state/access.js";
import { createExpansion } from "../state/createExpansion.js";
import { createSelection } from "../state/createSelection.js";
import { createSearch } from "../state/createSearch.js";
import { localStoragePersistence, type PersistenceAdapter } from "../state/persistence.js";
import type { TreeCtx } from "../view/context.js";
import type { FlatRow, TreeNodeData } from "../types.js";
import type { CoreControllerOptions, DataInput, LazyHooks } from "./options.js";

export interface TreeControllerOptions<T extends TreeNodeData = TreeNodeData> extends CoreControllerOptions<T>, LazyHooks {
  /** The tree. A plain array or an accessor (reactive). */
  data: DataInput<T>;
}

/** Placeholder node type for synthesized loading/error rows (they are not data). */
export const PLACEHOLDER_TYPE = "__solid-tree-placeholder";

/**
 * Imperative controller: owns expansion, selection and search, and exposes actions. The
 * views render from it. Database/Supabase controllers wrap it and add their layers.
 *
 * MUST be called inside a component body or `createRoot` (it creates signals/effects).
 */
export interface TreeController<T extends TreeNodeData = TreeNodeData> {
  /** The source tree. */
  nodes: Accessor<readonly T[]>;
  /** Search-applied nested tree for the recursive `<Tree>` (pruned, or full in dim mode). */
  displayNodes: Accessor<readonly T[]>;
  /** The visible rows, in order (memoized). */
  flatRows: Accessor<FlatRow[]>;
  /** The normalized index of the current data. */
  index: Accessor<TreeIndex<T>>;
  /** Effective expansion (user state plus what search opens), as a record. */
  expandedIds: Accessor<Record<string, boolean>>;
  isExpanded(id: string): boolean;
  /** Primary selected id (single mode: the selection). */
  selectedId: Accessor<string | null>;
  selectedIds: Accessor<ReadonlySet<string>>;
  query: Accessor<string>;
  searching: Accessor<boolean>;
  noMatches: Accessor<boolean>;

  expand(id: string): void;
  collapse(id: string): void;
  toggle(id: string): void;
  expandAll(): void;
  collapseAll(): void;
  select(id: string): void;
  /** Multiple mode: add/remove one id (Ctrl/Cmd-click). */
  toggleSelected(id: string): void;
  /** Multiple mode: select the visible range from the anchor to `id` (Shift-click). */
  selectRange(id: string): void;
  /** Multiple mode: select every visible node. */
  selectAll(): void;
  deselect(): void;
  activate(id: string): void;
  setSearch(query: string): void;
  /** Reveal `id` (expand its ancestors) and ask the view to scroll it into view. */
  scrollToId(id: string): void;

  /** View-internal. */
  _ctxState: Omit<TreeCtx, "renderLabel" | "renderActionNode" | "rowClickPolicy" | "accessibleTree" | "tabbableId" | "focusRow" | "onRowKeyDown">;
  /** View-internal: the view registers how to scroll a row into view. */
  _registerScroller(fn: ((id: string) => void) | null): void;
}

export function createTreeController<T extends TreeNodeData = TreeNodeData>(opts: TreeControllerOptions<T>): TreeController<T> {
  if (!getOwner()) {
    console.warn(
      "[solid-tree] createTreeController() called without a reactive owner — call it " +
        "inside a component body or createRoot(), not at module top."
    );
  }

  const data = createMemo(() => access(opts.data) ?? []);

  // PLAN §2.4: controlled-ness is decided once. Warn (dev) if a controlled input later
  // drops to `undefined` — use `null` for "nothing" so it stays controlled on purpose.
  for (const key of ["selectedId", "selectedIds", "searchQuery", "expandedIds"] as const) {
    if (!isProvided(opts, key)) continue;
    let wasDefined = false;
    createEffect(() => {
      const v = access(opts[key] as unknown);
      if (v !== undefined) wasDefined = true;
      else if (wasDefined) {
        console.warn(`[solid-tree] controlled \`${key}\` became undefined; it stays controlled. Pass null for "none".`);
        wasDefined = false;
      }
    });
  }
  // Duplicate ids: throw in development (find the bug), skip + report in production
  // (a racing or buggy source must not take the whole tree down).
  const index = createMemo(() =>
    buildIndex(data() as T[], defaultAccessors<T>(), {
      duplicates: DEV ? "throw" : "skip",
      onDuplicate: (id) => console.error(`[solid-tree] duplicate node id "${id}" skipped`),
    })
  );
  const nodeOf = (id: string) => index().get(id);

  // ── selection ──────────────────────────────────────────────────────────────
  const selection = createSelection<T>({
    index,
    mode: () => opts.selectionMode ?? "single",
    controlledId: isProvided(opts, "selectedId") ? () => access(opts.selectedId) : undefined,
    controlledIds: isProvided(opts, "selectedIds") ? () => access(opts.selectedIds) : undefined,
    canSelect: (node) => !opts.canSelect || opts.canSelect(node),
    onSelect: (node) => opts.onSelect?.(node),
    onSelectionChange: (ids) => opts.onSelectionChange?.(ids),
  });

  // ── expansion (user layer, persisted) ──────────────────────────────────────
  const persistence = ((): PersistenceAdapter | null => {
    if (opts.persistence) return opts.persistence;
    if (opts.storageKey == null) return null;
    return localStoragePersistence(`${opts.storagePrefix ?? "tree"}-${opts.storageKey}`);
  })();
  const expansion = createExpansion({
    index: index as Accessor<TreeIndex<unknown>>,
    controlled: isProvided(opts, "expandedIds") ? () => access(opts.expandedIds) : undefined,
    onExpandedChange: (ids) => opts.onExpandedChange?.(ids),
    onToggle: (id, open) => opts.onToggle?.(id, open),
    persistence,
    pruneUnknown: !opts.lazy,
    // Ancestors of the initial selection, in the initial state (G8: SSR shows them too).
    initial: opts.revealSelection === false ? [] : untrack(() => {
      const id = selection.id();
      return id ? [...index().ancestorsOf(id)].reverse() : [];
    }),
  });

  // ── search ─────────────────────────────────────────────────────────────────
  const search = createSearch<T>({
    index,
    controlled: isProvided(opts, "searchQuery") ? () => access(opts.searchQuery) : undefined,
    matcher: () => opts.matcher ?? ((node: T, q: string) => node.label.toLowerCase().includes(q.toLowerCase())),
    mode: () => opts.filterMode ?? "prune",
  });

  // Effective expansion: user state, plus (while searching) what search opens, with the
  // ephemeral override layer on top.
  const isExpanded = (id: string): boolean => {
    const view = search.view();
    if (!view) return expansion.isOpen(id);
    const o = search.override(id);
    if (o !== undefined) return o;
    return expansion.isOpen(id) || view.openAncestors.has(id);
  };

  const rows = createMemo<FlatRow[]>(() => {
    const idx = index();
    const view = search.view();
    const core = flatten(idx, isExpanded, view, {
      isExpandable: opts.isExpandable,
      placeholder: opts.placeholder,
      searchOpens: false, // isExpanded already includes search + the ephemeral layer
    });
    return core.map((r) => toFlatRow(r, idx));
  });

  const expandedRecord = createMemo(() => {
    const rec: Record<string, boolean> = {};
    for (const id of expansion.ids()) rec[id] = true;
    const view = search.view();
    if (view) {
      for (const id of view.openAncestors) rec[id] = true;
      for (const id of index().order) {
        const o = search.override(id);
        if (o !== undefined) rec[id] = o;
      }
    }
    return rec;
  });

  // ── reveal policy ──────────────────────────────────────────────────────────
  const reveal = (id: string | null) => {
    if (!id) return;
    const ancestors = untrack(index).ancestorsOf(id);
    if (ancestors.length) expansion.openMany([...ancestors].reverse());
  };
  if (opts.revealSelection !== false) {
    // The initial selection is revealed through the expansion's initial state (above);
    // controlled expansion cannot be seeded, so it is asked to open them instead.
    if (isProvided(opts, "expandedIds")) untrack(() => reveal(selection.id()));
    createComputed(on(selection.id, (id) => reveal(id), { defer: true }));
  }

  // Selection that points at a node removed from the data is dropped (ANALYSIS B7).
  createEffect(
    on(
      index,
      (idx, prev) => {
        if (!prev) return;
        const gone = [...untrack(selection.ids)].some((id) => prev.has(id) && !idx.has(id));
        if (gone) selection.apply({ type: "retain", has: (id) => idx.has(id) || !prev.has(id) });
      },
      { defer: false }
    )
  );

  // ── actions ────────────────────────────────────────────────────────────────
  const visibleOrder = () => untrack(rows).filter((r) => r.kind === "node").map((r) => r.id);

  const setOpen = (id: string, open: boolean) => {
    if (untrack(search.view)) {
      // While searching, toggles go to the ephemeral layer (ANALYSIS A2). onToggle still
      // fires so lazy tiers load what the user opens.
      if (untrack(() => isExpanded(id)) === open) return;
      search.setOverride(id, open);
      opts.onToggle?.(id, open);
    } else {
      expansion.set(id, open);
    }
    if (!open && opts.selectAncestorOnCollapse) {
      const sel = untrack(selection.id);
      if (sel && sel !== id && untrack(index).isAncestor(id, sel)) selection.apply({ type: "select", id });
    }
  };

  let scroller: ((id: string) => void) | null = null;

  const ctxState: TreeController<T>["_ctxState"] = {
    expanded: expandedRecord,
    selectedId: selection.id,
    highlightQuery: () => (search.view() && !opts.matcher ? search.query() : null),
    isDimmed: (id) => {
      const view = search.view();
      return !!view && view.mode === "dim" && !view.isKept(id);
    },
    onToggle: (id) => setOpen(id, !untrack(() => isExpanded(id))),
    onSelect: (node) => selection.apply({ type: "select", id: node.id }),
  };

  return {
    nodes: data,
    displayNodes: createMemo(() => displayTree(data(), index(), search.view())),
    flatRows: rows,
    index,
    expandedIds: expandedRecord,
    isExpanded,
    selectedId: selection.id,
    selectedIds: selection.ids,
    query: search.query,
    searching: () => search.view() !== null,
    noMatches: () => {
      const view = search.view();
      return !!view && view.mode === "prune" && view.matches.size === 0;
    },

    expand: (id) => setOpen(id, true),
    collapse: (id) => setOpen(id, false),
    toggle: (id) => setOpen(id, !untrack(() => isExpanded(id))),
    expandAll: () => {
      const idx = untrack(index);
      expansion.openMany(idx.order.filter((id) => idx.childrenOf(id).length > 0 || !!opts.isExpandable?.(id)));
    },
    collapseAll: () => expansion.closeAll(),
    select: (id) => selection.apply({ type: "select", id }),
    toggleSelected: (id) => selection.apply({ type: "toggle", id }),
    selectRange: (id) => selection.apply({ type: "range", id, order: visibleOrder() }),
    selectAll: () => selection.apply({ type: "all", order: visibleOrder() }),
    deselect: () => selection.apply({ type: "clear" }),
    activate: (id) => {
      const node = untrack(() => nodeOf(id));
      if (node) opts.onActivate?.(node);
    },
    setSearch: (q) => search.setQuery(q),
    scrollToId: (id) => {
      reveal(id);
      scroller?.(id);
    },

    _ctxState: ctxState,
    _registerScroller: (fn) => {
      scroller = fn;
    },
  };
}

function toFlatRow<T extends TreeNodeData>(r: Row, idx: TreeIndex<T>): FlatRow {
  const node =
    r.kind === "placeholder"
      ? ({ id: r.id, label: r.placeholder === "error" ? "Failed to load" : "Loading…", type: PLACEHOLDER_TYPE, payload: { placeholder: r.placeholder, parentId: r.parentId } } as TreeNodeData)
      : (idx.get(r.id) as TreeNodeData);
  return { ...r, node, navigable: r.kind === "node" };
}

/** Nested tree for the recursive view: the data itself unless prune-searching. */
function displayTree<T extends TreeNodeData>(data: readonly T[], idx: TreeIndex<T>, view: SearchView | null): readonly T[] {
  if (!view || view.mode === "dim") return data;
  const build = (ids: readonly string[]): T[] => {
    const out: T[] = [];
    for (const id of ids) {
      if (!view.isKept(id)) continue;
      const node = idx.get(id)!;
      if (view.matches.has(id) || !node.children) {
        out.push(node); // a match keeps its whole subtree, by identity
        continue;
      }
      const kids = build(idx.childrenOf(id));
      const same = kids.length === node.children.length && kids.every((k, i) => k === node.children![i]);
      out.push(same ? node : ({ ...node, children: kids } as T));
    }
    return out;
  };
  return build(idx.roots);
}

export { placeholderId };
