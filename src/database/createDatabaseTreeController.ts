import { batch, createEffect, createMemo, createSignal, mergeProps, on, onCleanup, onMount, untrack, type Accessor } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { QueryClient, createQuery } from "@tanstack/solid-query";
import { type FlatRow, type TreeNodeData, type TreeSource, type TreeChange } from "../types.js";
import { createTreeController, pickCore, PLACEHOLDER_TYPE, type TreeController, type CoreControllerOptions } from "../controller/index.js";
import { placeholderId } from "../core/index.js";

/** @deprecated Use PLACEHOLDER_TYPE. Loading/error rows are synthesized rows now, not data (B5). */
export const LOADING_TYPE = PLACEHOLDER_TYPE;

export interface DatabaseTreeControllerOptions extends CoreControllerOptions {
  /** Async, backend-agnostic source (Supabase/REST/local adapter). */
  source: TreeSource;
  /** Reuse an app QueryClient; otherwise the controller makes its own (cleared on dispose). */
  queryClient?: QueryClient;
  /** Namespaces this tree's cache entries. Default: unique per controller (ANALYSIS B2). */
  queryKeyPrefix?: string;
  /** Maximum concurrent child loads, e.g. during expandAll. Default 4 (ANALYSIS G5). */
  maxConcurrentLoads?: number;
  /** Use `source.search` while a query is active. Default true when the source has it. */
  serverSearch?: boolean;
}

/** {@link TreeController} plus the source/cache/lazy/realtime layer. */
export interface DatabaseTreeController extends TreeController {
  loadChildren(id: string): Promise<void>;
  reloadChildren(id: string): Promise<void>;
  /** Re-run source.getRoots() (e.g. after a filter/sort change that the source reads live). */
  refetchRoots(): Promise<void>;
  isLoading(id: string): boolean;
  /** `null` = the roots. */
  loading(id: string | null): boolean;
  /** The load error for a branch (`null` = the roots), or null. */
  error(id: string | null): unknown;
  /** Retry a failed (or any) load. `null` = the roots. */
  retry(id: string | null): Promise<void>;
  subscribe(): void;
  unsubscribe(): void;
}

let instances = 0;

/**
 * Source-backed controller: async roots + lazy children-on-expand cached via TanStack
 * Query, with realtime patches from `source.subscribe`. Wraps {@link createTreeController}
 * (it assembles the source into the `data` the core consumes, and supplies the lazy
 * hooks that make unloaded branches expandable and render placeholder rows).
 *
 * MUST be called inside a component body or createRoot.
 */
export function createDatabaseTreeController(opts: DatabaseTreeControllerOptions): DatabaseTreeController {
  const ownsClient = !opts.queryClient;
  const client = opts.queryClient ?? new QueryClient();
  const prefix = opts.queryKeyPrefix ?? `solid-tree#${++instances}`;
  const rootsKey = [prefix, "roots"];
  const childrenKey = (id: string) => [prefix, "children", id];
  const compare = (a: TreeNodeData, b: TreeNodeData) => opts.source.compare?.(a, b) ?? 0;
  const insertSorted = (list: TreeNodeData[], node: TreeNodeData) => {
    if (!opts.source.compare) return [...list, node];
    const i = list.findIndex((x) => compare(node, x) < 0);
    return i < 0 ? [...list, node] : [...list.slice(0, i), node, ...list.slice(i)];
  };

  const rootsQuery = createQuery(
    () => ({ queryKey: rootsKey, queryFn: () => opts.source.getRoots() }),
    () => client
  );

  // Lazily-loaded children keyed by parent id (raw source nodes, without `children`).
  const [childrenStore, setChildren] = createStore<Record<string, TreeNodeData[] | undefined>>({});
  const [status, setStatus] = createStore<Record<string, "loading" | "error" | undefined>>({});
  const [errors, setErrors] = createStore<Record<string, unknown>>({});
  // Leaves (payload.leaf) that gained a child through realtime before being loaded (B6).
  const [promoted, setPromoted] = createStore<Record<string, true | undefined>>({});
  // Non-reactive guards: in-flight (no double fetch) and failed (no automatic retry loop).
  const inFlight = new Set<string>();
  const failed = new Set<string>();

  const canHaveChildren = (node: TreeNodeData) =>
    !!opts.source.getChildren && (node.payload?.leaf !== true || !!promoted[node.id]);

  const assemble = (node: TreeNodeData): TreeNodeData => {
    const loaded = childrenStore[node.id];
    return loaded ? { ...node, children: loaded.map(assemble) } : node;
  };
  // Roots mirrored into a signal: realtime patches apply synchronously and in the same
  // batch as child-list patches (query-cache notifications arrive on a later tick, which
  // would briefly show a moved node in two places).
  const [roots, setRoots] = createSignal<TreeNodeData[] | undefined>(undefined);
  createEffect(on(() => rootsQuery.data, (d) => setRoots(d)));
  const data = createMemo(() => (roots() ?? rootsQuery.data ?? []).map(assemble));

  // Raw node lookup (roots + loaded lists), for realtime patches.
  const rawNode = (id: string): TreeNodeData | undefined => {
    const inRoots = (untrack(roots) ?? []).find((n) => n.id === id);
    if (inRoots) return inRoots;
    for (const list of Object.values(childrenStore)) {
      const hit = list?.find((n) => n.id === id);
      if (hit) return hit;
    }
    return undefined;
  };

  // ── lazy loading, with bounded concurrency (G5) ─────────────────────────────
  const max = Math.max(1, opts.maxConcurrentLoads ?? 4);
  let active = 0;
  const waiting: (() => void)[] = [];
  const acquire = () =>
    new Promise<void>((resolve) => {
      if (active < max) {
        active++;
        resolve();
      } else {
        waiting.push(() => {
          active++;
          resolve();
        });
      }
    });
  const release = () => {
    active--;
    waiting.shift()?.();
  };

  // Assigned below. The lazy hooks and loaders only run once data exists, which is
  // after createTreeController returns (the first flatten sees empty roots).
  const ref: { core?: TreeController } = {};

  const loadChildren = async (id: string) => {
    if (!opts.source.getChildren || childrenStore[id] || inFlight.has(id)) return;
    const node = untrack(() => ref.core!.index().get(id));
    if (!node || !canHaveChildren(node)) return;
    inFlight.add(id);
    failed.delete(id);
    setStatus(id, "loading");
    setErrors(id, undefined);
    await acquire();
    try {
      const kids = await client.fetchQuery({ queryKey: childrenKey(id), queryFn: () => opts.source.getChildren!(node) });
      setChildren(id, kids);
      setStatus(id, undefined);
    } catch (e) {
      failed.add(id); // a manual re-expand, retry() or reloadChildren retries
      setStatus(id, "error");
      setErrors(id, e ?? new Error("load failed"));
    } finally {
      inFlight.delete(id);
      release();
    }
  };

  const reloadChildren = async (id: string) => {
    client.removeQueries({ queryKey: childrenKey(id) });
    failed.delete(id);
    setChildren(id, undefined);
    await loadChildren(id);
  };

  // ── realtime patching ──────────────────────────────────────────────────────
  const patchRoots = (fn: (old: TreeNodeData[]) => TreeNodeData[]) => {
    const cur = untrack(roots) ?? [];
    const next = fn(cur);
    if (next === cur) return;
    setRoots(next);
    client.setQueryData<TreeNodeData[]>(rootsKey, next);
  };

  /** Apply fn to whichever list holds `id` (roots or a loaded child list). */
  const patchHolder = (id: string, fn: (arr: TreeNodeData[]) => TreeNodeData[]) => {
    patchRoots((arr) => (arr.some((n) => n.id === id) ? fn(arr) : arr));
    for (const parentId of Object.keys(childrenStore))
      if (childrenStore[parentId]?.some((n) => n.id === id)) setChildren(parentId, (arr) => fn(arr ?? []));
  };

  const insertUnder = (parentId: string | null, node: TreeNodeData) => {
    if (parentId == null) patchRoots((arr) => insertSorted(arr, node));
    else if (childrenStore[parentId]) setChildren(parentId, (arr) => insertSorted(arr ?? [], node));
    else setPromoted(parentId, true); // unloaded parent: make it expandable; it loads fresh
  };

  /** Forget cached lists for a removed subtree (B7 leak). */
  const forgetSubtree = (id: string) => {
    const ids = [id, ...untrack(() => ref.core!.index().descendantsOf(id))];
    setChildren(produce((s) => ids.forEach((x) => delete s[x])));
    setStatus(produce((s) => ids.forEach((x) => delete s[x])));
    ids.forEach((x) => client.removeQueries({ queryKey: childrenKey(x) }));
  };

  const move = (id: string, parentId: string | null) => {
    const node = rawNode(id);
    if (!node) {
      // We never loaded the moved node, so we cannot place it ourselves: refetch the
      // destination if it is visible; otherwise it loads correctly when opened.
      if (parentId === null) void rootsQuery.refetch();
      else if (childrenStore[parentId]) void reloadChildren(parentId);
      else setPromoted(parentId, true);
      return;
    }
    patchHolder(id, (arr) => arr.filter((n) => n.id !== id));
    insertUnder(parentId, node);
  };

  const handleChange = (c: TreeChange) => batch(() => applyChange(c));
  const applyChange = (c: TreeChange) => {
    if (c.type === "update") {
      const current = untrack(() => ref.core!.index().parentOf(c.node.id));
      if (c.parentId !== undefined && current !== undefined && c.parentId !== current) move(c.node.id, c.parentId);
      patchHolder(c.node.id, (arr) => arr.map((n) => (n.id === c.node.id ? { ...n, ...c.node } : n)));
      if (c.node.payload?.leaf === false) setPromoted(c.node.id, true);
    } else if (c.type === "move") {
      move(c.id, c.parentId);
    } else if (c.type === "insert") {
      insertUnder(c.parentId, c.node);
    } else if (c.type === "remove") {
      forgetSubtree(c.id);
      patchHolder(c.id, (arr) => arr.filter((n) => n.id !== c.id));
    } else if (c.type === "reload") {
      // Coarse invalidation: drop loaded lazy children and refetch roots.
      setChildren(reconcile({}));
      setPromoted(reconcile({}));
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
  onCleanup(() => {
    // Our own client goes entirely; on a shared app client, remove only our entries.
    if (ownsClient) client.clear();
    else client.removeQueries({ queryKey: [prefix] });
  });

  // ── server search (D6) ─────────────────────────────────────────────────────
  const useServerSearch = opts.serverSearch !== false && !!opts.source.search;
  const [serverMatches, setServerMatches] = createSignal<ReadonlySet<string> | null>(null);
  const serverMatcher = (node: TreeNodeData) => !!serverMatches()?.has(node.id);

  // ── core controller over the assembled data ────────────────────────────────
  const core = (ref.core = createTreeController(
    mergeProps(pickCore(opts), {
      data,
      lazy: true,
      isExpandable: (id: string) => {
        if (childrenStore[id]) return false;
        const node = ref.core?.index().get(id);
        return !!node && canHaveChildren(node);
      },
      placeholder: (id: string) => (status[id] === "error" ? ("error" as const) : ("loading" as const)),
      onToggle: (id: string, expanded: boolean) => {
        if (expanded) void loadChildren(id);
        opts.onToggle?.(id, expanded);
      },
      ...(useServerSearch
        ? {
            get matcher() {
              return serverMatches() ? serverMatcher : opts.matcher;
            },
          }
        : {}),
    })
  ));

  if (useServerSearch) {
    let seq = 0;
    createEffect(
      on(core.query, async (q) => {
        const token = ++seq;
        if (!q) {
          setServerMatches(null);
          return;
        }
        try {
          const hits = await opts.source.search!(q);
          if (token !== seq) return;
          // Load each hit's ancestors so it can appear in the tree.
          if (opts.source.getAncestors) {
            for (const hit of hits) {
              const chain = await opts.source.getAncestors(hit.id);
              for (const a of chain) await loadChildren(a);
              if (token !== seq) return;
            }
          }
          setServerMatches(new Set(hits.map((h) => h.id)));
        } catch {
          if (token === seq) setServerMatches(null); // fall back to local matching
        }
      })
    );
  }

  // Self-heal: an expanded, expandable, unloaded node gets loaded (e.g. it became
  // expandable after being expanded). Non-reactive guards keep it from looping.
  createEffect(() => {
    const exp = core.expandedIds();
    const idx = core.index();
    for (const id in exp) {
      if (!exp[id] || childrenStore[id] || inFlight.has(id) || failed.has(id)) continue;
      const node = idx.get(id);
      if (node && canHaveChildren(node)) void loadChildren(id);
    }
  });

  // Roots placeholder rows (loading / error) — the roots have no parent to hang one on.
  const rootRow = (kind: "loading" | "error"): FlatRow => ({
    id: placeholderId("__roots"),
    kind: "placeholder",
    placeholder: kind,
    node: { id: placeholderId("__roots"), label: kind === "error" ? "Failed to load" : "Loading…", type: PLACEHOLDER_TYPE, payload: { placeholder: kind, parentId: null } },
    depth: 0,
    level: 1,
    posinset: 0,
    setsize: 0,
    hasChildren: false,
    expanded: false,
    parentId: null,
    navigable: false,
  });
  const flatRows: Accessor<FlatRow[]> = createMemo(() => {
    if (rootsQuery.isLoading) return [rootRow("loading")];
    if (rootsQuery.isError && !rootsQuery.data) return [rootRow("error")];
    return core.flatRows();
  });

  return {
    ...core,
    flatRows,
    loadChildren,
    reloadChildren,
    refetchRoots: () => rootsQuery.refetch().then(() => undefined),
    isLoading: (id: string) => status[id] === "loading",
    loading: (id) => (id === null ? rootsQuery.isLoading || rootsQuery.isFetching : status[id] === "loading"),
    error: (id) => (id === null ? rootsQuery.error ?? null : errors[id] ?? null),
    retry: (id) => (id === null ? rootsQuery.refetch().then(() => undefined) : reloadChildren(id)),
    subscribe,
    unsubscribe,
  };
}
