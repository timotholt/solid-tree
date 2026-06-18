import { JSX } from "solid-js";

export interface TreeNodeData {
  id: string;
  label: string;
  iconLeft?: string | JSX.Element;
  iconRight?: string | JSX.Element;
  status?: string;
  count?: number;
  isDivider?: boolean;
  children?: TreeNodeData[];
  /** App-defined node kind, surfaced back to you in onSelect. Not interpreted by the component. */
  type: string;
  payload?: any;
  /**
   * "action" rows render centered, dimmed, with no chevron/indent — for
   * affordances like "+ Add new". Defaults to "default".
   */
  variant?: "default" | "action";
}

/**
 * Decides whether a node is a search hit. The comparator seam: Tree owns the
 * structural walk (keep matches + ancestors), you own the policy. Default is a
 * case-insensitive substring test on `label`; override to fuzzy-match, search
 * `payload`, span multiple fields, etc.
 */
export type TreeMatcher = (node: TreeNodeData, query: string) => boolean;

export interface TreeProps {
  data: TreeNodeData[];
  selectedId?: string | null;
  /**
   * Opt-in persistence. Provide a key unique to this tree to remember its
   * expand/collapse state across reloads (localStorage). Omit it and expand
   * state is in-memory only — so several unkeyed trees never clobber each other.
   */
  storageKey?: string;
  /** localStorage key prefix; final key is `${storagePrefix}-${storageKey}`. Default: "tree". */
  storagePrefix?: string;
  onSelect: (node: TreeNodeData) => void;
  /** Veto selection of a node (return false to make it unselectable, e.g. locked by another user). */
  canSelect?: (node: TreeNodeData) => boolean;
  onToggle?: (id: string, expanded: boolean) => void;
  renderActionNode?: (node: TreeNodeData) => JSX.Element;
  renderLabel?: (node: TreeNodeData) => JSX.Element;
  basePadding?: number;
  indentStep?: number;

  // ── Search / filter (all optional) ─────────────────────────────────────────
  /** Active query. Empty/undefined = no filtering. */
  searchQuery?: string;
  /** Hit policy. Default: case-insensitive substring on label. */
  matcher?: TreeMatcher;
  /**
   * "prune" (default) drops non-matches, keeping matches + their ancestor path.
   * "dim" keeps the whole tree and lowers opacity on non-matches.
   */
  filterMode?: "prune" | "dim";
  /** Shown (prune mode) when a query yields nothing. Default: "No matches". */
  noMatchesLabel?: string;
}

/**
 * Async data source for `<DatabaseTree>`. Backend-agnostic — a Supabase/REST/local
 * adapter implements it. Nodes returned should set `payload.leaf === true` for nodes
 * with no children (so the tree knows not to show an expander); any other node is
 * treated as lazily-expandable when `getChildren` is provided.
 */
/**
 * A live change to the data behind a `<DatabaseTree>` — emitted by `TreeSource.subscribe`
 * (e.g. a Supabase realtime row event). DatabaseTree patches its cache from these so
 * collaborators' edits/inserts/deletes (and things like lock state on `payload`) show
 * up live. Only changes to ALREADY-LOADED branches are applied; the rest load fresh.
 */
export type TreeChange =
  | { type: "update"; node: TreeNodeData } // a node's fields changed (label/status/payload/…)
  | { type: "insert"; parentId: string | null; node: TreeNodeData } // null parent = a new root
  | { type: "remove"; id: string }; // a node (and its subtree) was deleted

export interface TreeSource {
  /** Top-level nodes. */
  getRoots(): Promise<TreeNodeData[]>;
  /** Children of a node, fetched lazily on first expand. Omit for flat sources. */
  getChildren?(node: TreeNodeData): Promise<TreeNodeData[]>;
  /** Server-side search → flat matching nodes. (Ancestor hydration is a future step.) */
  search?(query: string): Promise<TreeNodeData[]>;
  /**
   * Live updates. Call `onChange` per change; return an unsubscribe fn. DatabaseTree
   * subscribes on mount and unsubscribes on cleanup. Omit for static sources.
   */
  subscribe?(onChange: (change: TreeChange) => void): () => void;
}

/** One row in the linearized, currently-visible view of the tree. */
export interface FlatRow {
  node: TreeNodeData;
  depth: number;
  hasChildren: boolean;
  /** false for dividers — keyboard nav / a11y treeitem logic should skip these. */
  navigable: boolean;
}
