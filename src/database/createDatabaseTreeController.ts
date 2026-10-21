import { createEffect, createMemo, mergeProps, onMount, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { QueryClient, createQuery } from "@tanstack/solid-query";
import { type TreeNodeData, type TreeSource, type TreeChange } from "../types.js";
import { findNode } from "../compat/search.js";
import { createTreeController, pickCore, type TreeController, type CoreControllerOptions } from "../controller/index.js";

/** Placeholder node type for the "Loading…" row shown under an unloaded branch. */
export const LOADING_TYPE = "__solid-tree-loading";
export const loadingChild = (parentId: string): TreeNodeData => ({
  id: `${parentId}::__loading`,
  label: "Loading…",
  type: LOADING_TYPE,
  payload: { leaf: true },
});

export interface DatabaseTreeControllerOptions extends CoreControllerOptions {
  /** Async, backend-agnostic source (Supabase/REST/local adapter). */
  source: TreeSource;
  /** Reuse an app QueryClient; otherwise the controller makes its own. */
  queryClient?: QueryClient;
}

/** {@link TreeController} plus the source/cache/lazy/realtime layer. */
export interface DatabaseTreeController extends TreeController {
  loadChildren(id: string): Promise<void>;
  reloadChildren(id: string): Promise<void>;
  /** Re-run source.getRoots() (e.g. after a filter/sort change that the source reads live). */
  refetchRoots(): Promise<void>;
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
  // Non-reactive guards: in-flight (no double-fetch) + failed (don't auto-retry a rejected
  // load — otherwise the self-heal effect would hammer the network forever). Read by the
  // effect WITHOUT subscribing, so the loading-store writes don't re-trigger it.
  const inFlight = new Set<string>();
  const failed = new Set<string>();

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

  // Memoized so `.map(assemble)` doesn't rebuild the tree on every read. TanStack
  // structural-shares rootsQuery.data (stable ref when a refetch returns equal data), so an
  // idle refetch (e.g. the lock heartbeat) recomputes nothing — no tree churn. Recomputes
  // only when roots, loading, or a lazily-loaded child list actually change.
  const data = createMemo(() =>
    rootsQuery.isLoading ? [loadingChild("__roots")] : (rootsQuery.data ?? []).map(assemble)
  );

  // ── lazy load ────────────────────────────────────────────────────────────────
  const loadChildren = async (id: string) => {
    if (!opts.source.getChildren || childrenStore[id] || inFlight.has(id)) return;
    const node = findNode(data(), id);
    if (!node || !expandable(node)) return;
    inFlight.add(id);
    failed.delete(id);
    setLoading(id, true);
    try {
      const kids = await client.fetchQuery({
        queryKey: ["solid-tree-children", id],
        queryFn: () => opts.source.getChildren!(node),
      });
      setChildren(id, kids);
    } catch {
      failed.add(id); // leave the placeholder; a manual re-expand or reloadChildren retries
    } finally {
      inFlight.delete(id);
      setLoading(id, false);
    }
  };

  const reloadChildren = async (id: string) => {
    client.removeQueries({ queryKey: ["solid-tree-children", id] });
    failed.delete(id);
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
    } else if (c.type === "remove") {
      patchLists(c.id, (arr) => arr.filter((n) => n.id !== c.id));
    } else if (c.type === "reload") {
      // Coarse invalidation: the source can't express the change as a granular patch
      // (a brand-new root, a reordered/filtered set, an appended immutable child…).
      // Drop loaded lazy children + refetch roots so the visible tree rebuilds from source.
      setChildren(reconcile({}));
      void rootsQuery.refetch();
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
  const core = createTreeController(
    mergeProps(pickCore(opts), {
      data,
      // Restored expansion of not-yet-loaded nodes waits for them instead of being pruned.
      lazy: true,
      // override the forwarded onToggle: expand triggers a lazy load, then the user's hook.
      onToggle: (id: string, expanded: boolean) => {
        if (expanded) void loadChildren(id);
        opts.onToggle?.(id, expanded);
      },
    })
  );

  // Self-heal: any node that is expanded + expandable + not-yet-loaded gets loaded.
  // Covers the race where expand() ran before the node was expandable (e.g. a leaf that
  // just gained its first child via realtime) — onToggle already fired and bailed, so
  // without this the row would sit on a stuck "Loading…" placeholder.
  createEffect(() => {
    const exp = core.expandedIds();
    const tree = data();
    for (const id in exp) {
      // inFlight/failed are plain Sets (non-reactive) so this effect re-runs only on
      // expandedIds/data/childrenStore changes — never on the loading-store toggle.
      if (!exp[id] || childrenStore[id] || inFlight.has(id) || failed.has(id)) continue;
      const node = findNode(tree, id);
      if (node && expandable(node)) void loadChildren(id);
    }
  });

  return {
    ...core,
    loadChildren,
    reloadChildren,
    refetchRoots: () => rootsQuery.refetch().then(() => undefined),
    isLoading: (id: string) => !!loading[id],
    subscribe,
    unsubscribe,
  };
}
