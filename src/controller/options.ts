import type { Accessor } from "solid-js";
import type { PersistenceAdapter } from "../state/persistence.js";
import type { SelectionMode, FilterMode } from "../core/index.js";
import type { MaybeAccessor } from "../state/access.js";
import { forward } from "../state/access.js";
import type { TreeMatcher, TreeNodeData } from "../types.js";

/**
 * Options shared by every tier's controller. This interface and CORE_OPTION_KEYS are
 * the ONLY declaration of the option set (ANALYSIS D3); adapters are derived from the
 * key list, and a type test proves the list matches the interface.
 *
 * Inputs marked "controlled" are controlled when their key is present (PLAN §2.4).
 * Every option is read where it is used, so changing it at runtime takes effect (G1).
 */
export interface CoreControllerOptions<T extends TreeNodeData = TreeNodeData> {
  // ── selection ──
  /** Controlled single selection. `null` = controlled, nothing selected. */
  selectedId?: MaybeAccessor<string | null | undefined>;
  /** Controlled multiple selection. */
  selectedIds?: MaybeAccessor<Iterable<string> | null | undefined>;
  /** Default "single". */
  selectionMode?: SelectionMode;
  onSelect?: (node: T) => void;
  /** Every selection change, including deselect and nodes removed from the data. */
  onSelectionChange?: (ids: string[]) => void;
  /** Veto selection of a node (return false → unselectable, e.g. locked by another user). */
  canSelect?: (node: T) => boolean;
  /** Enter / double-click on a node. Distinct from selection. */
  onActivate?: (node: T) => void;

  // ── expansion ──
  /** Controlled expansion. */
  expandedIds?: MaybeAccessor<Iterable<string> | null | undefined>;
  onExpandedChange?: (ids: string[]) => void;
  onToggle?: (id: string, expanded: boolean) => void;
  /** Opt-in localStorage persistence under `${storagePrefix}-${storageKey}`. */
  storageKey?: string;
  /** Default "tree". */
  storagePrefix?: string;
  /** Custom persistence (wins over storageKey). */
  persistence?: PersistenceAdapter;
  /** Expand ancestors when the selection changes. Default true. */
  revealSelection?: boolean;
  /** Collapsing an ancestor of the selection selects that ancestor. Default false (ANALYSIS B11). */
  selectAncestorOnCollapse?: boolean;

  // ── search ──
  /** Controlled search query. */
  searchQuery?: MaybeAccessor<string | undefined>;
  matcher?: TreeMatcher;
  /** Default "prune". */
  filterMode?: FilterMode;
}

/** The option set, as a runtime list. Keep in sync with CoreControllerOptions (type-tested). */
export const CORE_OPTION_KEYS = [
  "selectedId",
  "selectedIds",
  "selectionMode",
  "onSelect",
  "onSelectionChange",
  "canSelect",
  "onActivate",
  "expandedIds",
  "onExpandedChange",
  "onToggle",
  "storageKey",
  "storagePrefix",
  "persistence",
  "revealSelection",
  "selectAncestorOnCollapse",
  "searchQuery",
  "matcher",
  "filterMode",
] as const satisfies readonly (keyof CoreControllerOptions)[];

export type CoreOptionKey = (typeof CORE_OPTION_KEYS)[number];

/**
 * Forward the core options from any options/props object as live getters, keeping key
 * presence (controlled-ness) and reactivity. Used by every tier and every view.
 */
export const pickCore = <O extends Partial<Record<CoreOptionKey, unknown>>>(o: O): Pick<O, Extract<keyof O, CoreOptionKey>> =>
  forward(o, CORE_OPTION_KEYS as unknown as readonly Extract<keyof O, CoreOptionKey>[]);

/** Lazy-tier hooks (database tier). Not part of the public prop surface. */
export interface LazyHooks {
  isExpandable?: (id: string) => boolean;
  placeholder?: (id: string) => "loading" | "error" | null;
  /** Restored-but-unknown expanded ids wait for their nodes instead of being pruned. */
  lazy?: boolean;
}

export type DataInput<T> = MaybeAccessor<readonly T[]> | Accessor<readonly T[]>;
