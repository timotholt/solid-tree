import { createSignal, createEffect, createMemo, untrack, on, onMount, getOwner, type Accessor } from "solid-js";
import { storage } from "./storage.js";
import { type TreeCtx } from "./context.js";
import { type TreeNodeData, type TreeMatcher, type FlatRow } from "./types.js";
import {
  defaultMatcher,
  pruneNode,
  collectExpandable,
  collectIds,
  findNode,
  containsDescendant,
  flattenVisible,
} from "./search.js";

export interface SearchView {
  active: boolean;
  data: TreeNodeData[];
  forced: Record<string, boolean> | null;
  keep: Set<string> | null;
}

/**
 * Options shared by every tier's controller (selection/search/persistence/events).
 * Reactive inputs are Accessors so a controller works standalone or driven from a
 * component's props. Selection and search are controller-owned signals; the matching
 * `selectedId`/`searchQuery` accessor, when provided, is a CONTROLLED input that wins
 * over the internal signal. Declared once here; the database/supabase option types
 * extend it so a new core option is added in exactly one place.
 */
export interface CoreControllerOptions {
  /** Controlled selection. When provided it wins over the internal signal. */
  selectedId?: Accessor<string | null | undefined>;
  /** Controlled search query. When provided it wins over setSearch(). */
  searchQuery?: Accessor<string | undefined>;
  matcher?: TreeMatcher;
  filterMode?: "prune" | "dim";
  onSelect?: (node: TreeNodeData) => void;
  /** Veto selection of a node (return false → unselectable, e.g. locked by another user). */
  canSelect?: (node: TreeNodeData) => boolean;
  onToggle?: (id: string, expanded: boolean) => void;
  /** Opt-in expand-state persistence (localStorage). Omit = in-memory only. */
  storageKey?: string;
  storagePrefix?: string;
}

/** Options for {@link createTreeController}: the core options plus the in-memory data. */
export interface TreeControllerOptions extends CoreControllerOptions {
  data: Accessor<TreeNodeData[]>;
}

/** Pluck just the core fields, for one controller to forward to the one it wraps. */
export const pickCore = (o: CoreControllerOptions): CoreControllerOptions => ({
  selectedId: o.selectedId,
  searchQuery: o.searchQuery,
  matcher: o.matcher,
  filterMode: o.filterMode,
  onSelect: o.onSelect,
  canSelect: o.canSelect,
  onToggle: o.onToggle,
  storageKey: o.storageKey,
  storagePrefix: o.storagePrefix,
});

/**
 * Imperative controller for the in-memory tree: owns expand/select/search state and
 * exposes actions (`expand`/`toggle`/`select`/`expandAll`/`setSearch`…). The JSX views
 * (`<Tree>`/`<VirtualTree>`) render from it. `createDatabaseTreeController` /
 * `createSupabaseTreeController` wrap this and add their layers.
 *
 * MUST be called inside a component body or `createRoot` (it creates signals/effects).
 */
export interface TreeController {
  /** The source tree (for DB controllers: assembled with loaded children). */
  nodes: Accessor<TreeNodeData[]>;
  /** Search-applied nested tree the recursive `<Tree>` renders (pruned or full+dim). */
  displayNodes: Accessor<TreeNodeData[]>;
  /** Visible linearization the view feeds to a virtualizer. */
  flatRows: Accessor<FlatRow[]>;
  expandedIds: Accessor<Record<string, boolean>>;
  selectedId: Accessor<string | null | undefined>;
  searching: Accessor<boolean>;
  noMatches: Accessor<boolean>;

  expand(id: string): void;
  collapse(id: string): void;
  toggle(id: string): void;
  expandAll(): void;
  collapseAll(): void;
  select(id: string): void;
  deselect(): void;
  setSearch(query: string): void;

  /** View-internal: the row-context state (the view adds renderLabel/renderActionNode). */
  _ctxState: Omit<
    TreeCtx,
    | "renderLabel"
    | "renderActionNode"
    | "rowClickPolicy"
    | "accessibleTree"
    | "tabbableId"
    | "focusRow"
    | "onRowKeyDown"
  >;
}

export function createTreeController(opts: TreeControllerOptions): TreeController {
  if (!getOwner()) {
    console.warn(
      "[solid-tree] createTreeController() called without a reactive owner — call it " +
        "inside a component body or createRoot(), not at module top."
    );
  }

  const data = () => opts.data();
  const persistKey = () =>
    opts.storageKey == null ? null : `${opts.storagePrefix ?? "tree"}-${opts.storageKey}`;

  // ── expand state (+ opt-in persistence) ──────────────────────────────────────
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>(
    (() => {
      const k = persistKey();
      return k ? storage.get(k, {}) : {};
    })()
  );
  createEffect(() => {
    const k = persistKey();
    if (k) storage.set(k, expanded());
  });

  const fireToggle = (id: string, isExpanded: boolean) => opts.onToggle?.(id, isExpanded);

  onMount(() => {
    // Replay persisted-open nodes so a DB controller lazy-loads them on restore.
    Object.entries(expanded()).forEach(([id, isE]) => {
      if (isE) fireToggle(id, true);
    });
  });

  // ── selection (controller-owned signal + optional controlled input) ──────────
  const [selSig, setSelSig] = createSignal<string | null>(null);
  const selectedId = () => (opts.selectedId ? opts.selectedId() : selSig());

  const selectNode = (node: TreeNodeData) => {
    if (opts.canSelect && !opts.canSelect(node)) return; // vetoed (e.g. locked by another user)
    setSelSig(node.id);
    opts.onSelect?.(node);
  };

  // ── search (controller-owned signal + optional controlled input) ─────────────
  const [searchSig, setSearchSig] = createSignal("");
  const query = () => (opts.searchQuery ? opts.searchQuery() ?? "" : searchSig()).trim();

  // Auto-expand ancestors to reveal the current selection. Tracks ONLY selectedId (via
  // `on`); data is read untracked. So it fires when the selection changes — NOT on every
  // data churn (e.g. a realtime patch), which would otherwise re-open a branch the user
  // just manually collapsed.
  createEffect(on(selectedId, (id) => {
    const nodes = untrack(data);
    if (!id || !nodes) return;
    const findAndExpand = (arr: TreeNodeData[], target: string): boolean => {
      for (const node of arr) {
        if (node.id === target) return true;
        if (node.children?.length && findAndExpand(node.children, target)) {
          if (!expanded()[node.id]) {
            setExpanded((p) => ({ ...p, [node.id]: true }));
            fireToggle(node.id, true);
          }
          return true;
        }
      }
      return false;
    };
    untrack(() => findAndExpand(nodes, id));
  }));

  const handleToggle = (id: string) => {
    const newState = !expanded()[id];
    setExpanded((p) => ({ ...p, [id]: newState }));
    fireToggle(id, newState);
    // Collapsing a node that hides the selection → move selection to it.
    if (!newState) {
      const sel = selectedId();
      if (sel && sel !== id) {
        const node = findNode(data(), id);
        if (node && containsDescendant(node, sel)) selectNode(node);
      }
    }
  };

  // ── search view (single memo; gates everything) ──────────────────────────────
  const view = createMemo<SearchView>(() => {
    const q = query();
    if (!q) return { active: false, data: data(), forced: null, keep: null };
    const matcher = opts.matcher ?? defaultMatcher;
    const pruned = data()
      .map((n) => pruneNode(n, q, matcher))
      .filter((n): n is TreeNodeData => n !== null);
    const forced = collectExpandable(pruned, {});
    if (opts.filterMode === "dim") {
      return { active: true, data: data(), forced, keep: collectIds(pruned, new Set<string>()) };
    }
    return { active: true, data: pruned, forced, keep: null };
  });

  const effectiveExpanded = () => {
    const v = view();
    return v.forced ? { ...expanded(), ...v.forced } : expanded();
  };

  // Built-in highlight only for the default matcher. (The row also skips highlight
  // when a custom renderLabel is set, so renderLabel needn't be known here.)
  const highlightQuery = (): string | null =>
    view().active && !opts.matcher ? query() : null;

  const isDimmed = (id: string): boolean => {
    const v = view();
    return v.active && v.keep ? !v.keep.has(id) : false;
  };

  const noMatches = () => view().active && !view().keep && view().data.length === 0;

  const _ctxState: Omit<
    TreeCtx,
    | "renderLabel"
    | "renderActionNode"
    | "rowClickPolicy"
    | "accessibleTree"
    | "tabbableId"
    | "focusRow"
    | "onRowKeyDown"
  > = {
    expanded: effectiveExpanded,
    selectedId,
    highlightQuery,
    isDimmed,
    onToggle: handleToggle,
    onSelect: selectNode,
  };

  return {
    nodes: data,
    displayNodes: () => view().data,
    flatRows: () => flattenVisible(view().data, effectiveExpanded()),
    expandedIds: effectiveExpanded,
    selectedId,
    searching: () => view().active,
    noMatches,

    expand: (id) => {
      if (!expanded()[id]) handleToggle(id);
    },
    collapse: (id) => {
      if (expanded()[id]) handleToggle(id);
    },
    toggle: handleToggle,
    expandAll: () => {
      const all = collectExpandable(data(), {});
      const prev = expanded();
      setExpanded({ ...prev, ...all });
      for (const id of Object.keys(all)) if (!prev[id]) fireToggle(id, true);
    },
    collapseAll: () => {
      const prev = expanded();
      setExpanded({});
      for (const id of Object.keys(prev)) if (prev[id]) fireToggle(id, false);
    },
    select: (id) => {
      const node = findNode(data(), id);
      if (node) selectNode(node);
    },
    deselect: () => setSelSig(null),
    setSearch: (q) => setSearchSig(q),

    _ctxState,
  };
}
