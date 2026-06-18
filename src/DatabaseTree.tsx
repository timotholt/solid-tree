import { Component, createMemo, onMount, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { QueryClient, QueryClientProvider, createQuery } from "@tanstack/solid-query";
import { type TreeNodeData, type TreeSource } from "./types.js";
import { findNode } from "./search.js";
import { VirtualTree, type VirtualTreeProps } from "./VirtualTree.jsx";

export interface DatabaseTreeProps extends Omit<VirtualTreeProps, "data"> {
  /** Async, backend-agnostic source (Supabase/REST/local adapter). */
  source: TreeSource;
  /** Reuse an app QueryClient; otherwise DatabaseTree makes its own. */
  queryClient?: QueryClient;
}

const LOADING_TYPE = "__solid-tree-loading";
const loadingChild = (parentId: string): TreeNodeData => ({
  id: `${parentId}::__loading`,
  label: "Loading…",
  type: LOADING_TYPE,
  payload: { leaf: true },
});

/**
 * Source-backed tree: async roots + lazy children-on-expand, cached via TanStack
 * Query, rendered windowed via `<VirtualTree>`. `<Tree>`/`<VirtualTree>` take
 * in-memory `data`; this takes a `source` and resolves it to that `data` reactively.
 * Subpath: `@timotholt/solid-tree/database`. Peers: @tanstack/solid-query +
 * @tanstack/solid-virtual (both optional). Dedupe solid-js (see AGENTS).
 */
export const DatabaseTree: Component<DatabaseTreeProps> = (props) => {
  const client = props.queryClient ?? new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <DatabaseTreeInner {...props} client={client} />
    </QueryClientProvider>
  );
};

const DatabaseTreeInner: Component<DatabaseTreeProps & { client: QueryClient }> = (props) => {
  const rootsQuery = createQuery(() => ({
    queryKey: ["solid-tree-roots"],
    queryFn: () => props.source.getRoots(),
  }));

  // Lazily-loaded children, keyed by parent id (reactive → re-assembles the tree).
  const [childrenStore, setChildren] = createStore<Record<string, TreeNodeData[]>>({});

  const expandable = (node: TreeNodeData) =>
    !!props.source.getChildren && node.payload?.leaf !== true && node.type !== LOADING_TYPE;

  // Build the in-memory tree VirtualTree renders: attach loaded children, or a
  // single "Loading…" placeholder so expandable-but-unloaded nodes show a chevron.
  const assemble = (node: TreeNodeData): TreeNodeData => {
    const loaded = childrenStore[node.id];
    if (loaded) return { ...node, children: loaded.map(assemble) };
    if (expandable(node)) return { ...node, children: [loadingChild(node.id)] };
    return node;
  };

  const data = createMemo(() =>
    // While the first roots fetch is in flight, show a single Loading… row.
    rootsQuery.isLoading ? [loadingChild("__roots")] : (rootsQuery.data ?? []).map(assemble)
  );

  // Fetch children on first expand (cached + deduped by Query).
  const fetchChildren = async (node: TreeNodeData) => {
    if (childrenStore[node.id] || !props.source.getChildren) return;
    const kids = await props.client.fetchQuery({
      queryKey: ["solid-tree-children", node.id],
      queryFn: () => props.source.getChildren!(node),
    });
    setChildren(node.id, kids);
  };

  // ── Live updates ───────────────────────────────────────────────────────────
  // Patch the cache from source.subscribe events so collaborators' changes (and
  // lock state on payload) show up live. Roots live in the Query cache; loaded
  // children in childrenStore — patch whichever holds the node. Only already-loaded
  // branches are touched; unloaded ones load fresh on expand.
  const ROOTS_KEY = ["solid-tree-roots"];
  const patchRoots = (fn: (old: TreeNodeData[]) => TreeNodeData[]) =>
    props.client.setQueryData<TreeNodeData[]>(ROOTS_KEY, (old) => fn(old ?? []));

  const handleChange = (c: { type: string } & Record<string, unknown>) => {
    if (c.type === "update") {
      const node = c.node as TreeNodeData;
      patchRoots((arr) => arr.map((n) => (n.id === node.id ? { ...n, ...node } : n)));
      for (const parentId of Object.keys(childrenStore)) {
        const idx = childrenStore[parentId].findIndex((n) => n.id === node.id);
        if (idx >= 0) setChildren(parentId, idx, (n) => ({ ...n, ...node }));
      }
    } else if (c.type === "insert") {
      const node = c.node as TreeNodeData;
      const parentId = c.parentId as string | null;
      if (parentId == null) patchRoots((arr) => [...arr, node]);
      else if (childrenStore[parentId]) setChildren(parentId, (arr) => [...arr, node]);
    } else if (c.type === "remove") {
      const id = c.id as string;
      patchRoots((arr) => arr.filter((n) => n.id !== id));
      for (const parentId of Object.keys(childrenStore)) {
        if (childrenStore[parentId].some((n) => n.id === id))
          setChildren(parentId, (arr) => arr.filter((n) => n.id !== id));
      }
    }
  };

  onMount(() => {
    const unsub = props.source.subscribe?.(handleChange as never);
    if (unsub) onCleanup(unsub);
  });

  // Render the placeholder distinctly; otherwise delegate to the consumer / default.
  const renderLabel = (node: TreeNodeData) => {
    if (node.type === LOADING_TYPE) {
      // .solid-tree-loading is a styling hook (e.g. a spinner); consumers can target it.
      return <span class="solid-tree-loading" style="opacity:.6;font-style:italic">{node.label}</span>;
    }
    return props.renderLabel ? props.renderLabel(node) : node.label;
  };

  return (
    <VirtualTree
      data={data()}
      selectedId={props.selectedId}
      onSelect={props.onSelect}
      searchQuery={props.searchQuery}
      matcher={props.matcher}
      filterMode={props.filterMode}
      noMatchesLabel={props.noMatchesLabel}
      storageKey={props.storageKey}
      storagePrefix={props.storagePrefix}
      basePadding={props.basePadding}
      indentStep={props.indentStep}
      estimateSize={props.estimateSize}
      overscan={props.overscan}
      class={props.class}
      viewportStyle={props.viewportStyle}
      renderActionNode={props.renderActionNode}
      renderLabel={renderLabel}
      onRangeChange={props.onRangeChange}
      onToggle={(id, isExpanded) => {
        if (isExpanded) {
          const node = findNode(data(), id);
          if (node) void fetchChildren(node);
        }
        props.onToggle?.(id, isExpanded);
      }}
    />
  );
};
