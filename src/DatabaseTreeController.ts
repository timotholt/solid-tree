import { onMount, onCleanup, type Accessor } from "solid-js";
import { createStore } from "solid-js/store";
import { QueryClient, createQuery } from "@tanstack/solid-query";
import { type TreeNodeData, type TreeSource, type TreeChange, type TreeMatcher } from "./types.js";
import { findNode } from "./search.js";
import { createTreeController, type TreeController } from "./controller.js";

/** Placeholder node type for the "Loading…" row shown under an unloaded branch. */
export const LOADING_TYPE = "__solid-tree-loading";
export const loadingChild = (parentId: string): TreeNodeData => ({
  id: `${parentId}::__loading`,
  label: "Loading…",
  type: LOADING_TYPE,
  payload: { leaf: true },
});

export interface DatabaseTreeControllerOptions {
  /** Async, backend-agnostic source (Supabase/REST/local adapter). */
  source: TreeSource;
  /** Reuse an app QueryClient; otherwise the controller makes its own. */
  queryClient?: QueryClient;
  // forwarded to the core controller
  selectedId?: Accessor<string | null | undefined>;
  searchQuery?: Accessor<string | undefined>;
  matcher?: TreeMatcher;
  filterMode?: "prune" | "dim";
  onSelect?: (node: TreeNodeData) => void;
  onToggle?: (id: string, expanded: boolean) => void;
  storageKey?: string;
  storagePrefix?: string;
}

/** {@link TreeController} plus the source/cache/lazy/realtime layer. */
export interface DatabaseTreeController extends TreeController {
  loadChildren(id: string): Promise<void>;
  reloadChildren(id: string): Promise<void>;
  isLoading(id: string): boolean;
  subscribe(): void;
  unsubscribe(): void;
}

const ROOTS_KEY = ["solid-tree-roots"];

/**
 * Source-backed controller: async roots + lazy children-on-expand cached via TanStack
 * Query, with realtime patches from `source.subscribe`. Wraps {@link createTreeController}
 * (it assembles the source into the `data` the core consumes). The QueryClient is passed
 * to createQuery explicitly, so no QueryClientProvider is needed.
 *
 * MUST be called inside a component body or createRoot.
 */
export function createDatabaseTreeController(opts: DatabaseTreeControllerOptions): DatabaseTreeController {
  const client = opts.queryClient ?? new QueryClient();

  const rootsQuery = createQuery(
    () => ({ queryKey: ROOTS_KEY, queryFn: () => opts.source.getRoots() }),
    () => client
  );

  // Lazily-loaded children keyed by parent id (reactive → re-assembles the tree).
  const [childrenStore, setChildren] = createStore<Record<string, TreeNodeData[]>>({});
  const [loading, setLoading] = createStore<Record<string, boolean>>({});

  const expandable = (node: TreeNodeData) =>
    !!opts.source.getChildren && node.payload?.leaf !== true && node.type !== LOADING_TYPE;

  // Attach loaded children, or a single "Loading…" placeholder so expandable-but-
  // unloaded nodes still show a chevron.
  const assemble = (node: TreeNodeData): TreeNodeData => {
    const loaded = childrenStore[node.id];
    if (loaded) return { ...node, children: loaded.map(assemble) };
    if (expandable(node)) return { ...node, children: [loadingChild(node.id)] };
    return node;
  };

  const data = () =>
    rootsQuery.isLoading ? [loadingChild("__roots")] : (rootsQuery.data ?? []).map(assemble);

  // ── lazy load ────────────────────────────────────────────────────────────────
  const loadChildren = async (id: string) => {
    if (!opts.source.getChildren || childrenStore[id]) return;
    const node = findNode(data(), id);
    if (!node || !expandable(node)) return;
    setLoading(id, true);
    try {
      const kids = await client.fetchQuery({
        queryKey: ["solid-tree-children", id],
        queryFn: () => opts.source.getChildren!(node),
      });
      setChildren(id, kids);
    } finally {
      setLoading(id, false);
    }
  };

  const reloadChildren = async (id: string) => {
    client.removeQueries({ queryKey: ["solid-tree-children", id] });
    setChildren(id, undefined as unknown as TreeNodeData[]);
    await loadChildren(id);
  };

  // ── realtime patching ──────────────────────────────────────────────────────
  const patchRoots = (fn: (old: TreeNodeData[]) => TreeNodeData[]) =>
    client.setQueryData<TreeNodeData[]>(ROOTS_KEY, (old) => fn(old ?? []));

  // Apply fn to roots + every loaded child list that contains id (a node lives in
  // exactly one list, so only the holder(s) are touched).
  const patchLists = (id: string, fn: (arr: TreeNodeData[]) => TreeNodeData[]) => {
    patchRoots((arr) => (arr.some((n) => n.id === id) ? fn(arr) : arr));
    for (const parentId of Object.keys(childrenStore))
      if (childrenStore[parentId]?.some((n) => n.id === id)) setChildren(parentId, fn);
  };

  const handleChange = (c: TreeChange) => {
    if (c.type === "update") {
      patchLists(c.node.id, (arr) => arr.map((n) => (n.id === c.node.id ? { ...n, ...c.node } : n)));
    } else if (c.type === "insert") {
      if (c.parentId == null) patchRoots((arr) => [...arr, c.node]);
      else if (childrenStore[c.parentId]) setChildren(c.parentId, (arr) => [...arr, c.node]);
    } else {
      patchLists(c.id, (arr) => arr.filter((n) => n.id !== c.id));
    }
  };

  let unsub: (() => void) | undefined;
  const subscribe = () => {
    if (unsub) return;
    unsub = opts.source.subscribe?.(handleChange);
  };
  const unsubscribe = () => {
    unsub?.();
    unsub = undefined;
  };
  onMount(() => {
    subscribe();
    onCleanup(unsubscribe);
  });

  // ── core controller over the assembled data; expand triggers a lazy load ─────
  const core = createTreeController({
    data,
    selectedId: opts.selectedId,
    searchQuery: opts.searchQuery,
    matcher: opts.matcher,
    filterMode: opts.filterMode,
    onSelect: opts.onSelect,
    storageKey: opts.storageKey,
    storagePrefix: opts.storagePrefix,
    onToggle: (id, expanded) => {
      if (expanded) void loadChildren(id);
      opts.onToggle?.(id, expanded);
    },
  });

  return {
    ...core,
    loadChildren,
    reloadChildren,
    isLoading: (id: string) => !!loading[id],
    subscribe,
    unsubscribe,
  };
}
