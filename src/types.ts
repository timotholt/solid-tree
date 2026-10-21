import { JSX } from "solid-js";

export interface TreeNodeData<P = any> {
  id: string;
  label: string;
  iconLeft?: string | JSX.Element;
  iconRight?: string | JSX.Element;
  status?: string;
  count?: number;
  isDivider?: boolean;
  children?: TreeNodeData<P>[];
  /** App-defined node kind, surfaced back to you in onSelect. Not interpreted by the component. */
  type: string;
  payload?: P;
  /** `"separator"` renders a divider (same as `isDivider`). */
  kind?: "separator";
  /** Focusable but not selectable or activatable. */
  disabled?: boolean;
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

/**
 * Controls what clicking the body of a row does when that row has children.
 * `"finder"` preserves the original select/expand/collapse behavior.
 * `"select-only"` leaves expansion exclusively to the chevron and keyboard.
 */
export type TreeRowClickPolicy = "finder" | "select-only";

export interface TreeProps {
  data: TreeNodeData[];
  selectedId?: string | null;
  /** Accessible name for the tree root (all component tiers). */
  ariaLabel?: string;
  /** Id of an element that labels the tree root (all component tiers). */
  ariaLabelledBy?: string;
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
  /** Enter on a row (and, from Phase 4, double-click). Distinct from selection. */
  onActivate?: (node: TreeNodeData) => void;
  onToggle?: (id: string, expanded: boolean) => void;
  /** Row-body click behavior. Default: `"finder"` (the original behavior). */
  rowClickPolicy?: TreeRowClickPolicy;
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
  | { type: "update"; node: TreeNodeData; parentId?: string | null } // fields changed; parentId when the source knows it
  | { type: "move"; id: string; parentId: string | null; index?: number } // reparented/reordered (SPEC-contracts §4)
  | { type: "insert"; parentId: string | null; node: TreeNodeData } // null parent = a new root
  | { type: "remove"; id: string } // a node (and its subtree) was deleted
  | { type: "reload" }; // source can't express the change granularly → refetch roots (+ drop lazy children)

export interface TreeSource {
  /** Top-level nodes. */
  getRoots(): Promise<TreeNodeData[]>;
  /** Children of a node, fetched lazily on first expand. Omit for flat sources. */
  getChildren?(node: TreeNodeData): Promise<TreeNodeData[]>;
  /**
   * Server-side search → flat matching nodes. When present, `<DatabaseTree>` uses it
   * while a query is active, and loads each match's ancestors via `getAncestors`.
   */
  search?(query: string): Promise<TreeNodeData[]>;
  /** Ancestor ids of a node, root first. Lets server-search results be revealed. */
  getAncestors?(id: string): Promise<string[]>;
  /** Sibling order, used to place realtime inserts and moves. Omit = append at the end. */
  compare?(a: TreeNodeData, b: TreeNodeData): number;
  /**
   * Live updates. Call `onChange` per change; return an unsubscribe fn. DatabaseTree
   * subscribes on mount and unsubscribes on cleanup. Omit for static sources.
   */
  subscribe?(onChange: (change: TreeChange) => void): () => void;
}

/** One row in the linearized, currently-visible view of the tree. */
export interface FlatRow {
  id: string;
  /** "placeholder" rows (loading/error under a lazy branch) are synthesized, not data. */
  kind: "node" | "separator" | "placeholder";
  placeholder?: "loading" | "error";
  /** The node (for placeholder rows, a synthesized stand-in). */
  node: TreeNodeData;
  /** 0-based depth. */
  depth: number;
  /** 1-based aria-level. */
  level: number;
  /** aria-posinset among visible, non-separator siblings (0 for separators/placeholders). */
  posinset: number;
  /** aria-setsize (0 for separators/placeholders). */
  setsize: number;
  hasChildren: boolean;
  expanded: boolean;
  parentId: string | null;
  /** false for separators and placeholders — never focus or select targets. */
  navigable: boolean;
}
