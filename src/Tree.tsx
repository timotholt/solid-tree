import {
  Component,
  For,
  Show,
  createSignal,
  createEffect,
  createMemo,
  createContext,
  useContext,
  untrack,
  onMount,
  JSX,
} from "solid-js";
import { storage } from "./storage.js";
import { Chevron } from "./Chevron.jsx";

// ── Style defaults ───────────────────────────────────────────────────────────
// The ONLY place style literals live. Each is published on the container as
// `--tree-<name>-default`; component styles read `tok(name)` =
// `var(--tree-<name>, var(--tree-<name>-default))`. So consumers override the
// un-suffixed token on the container or any ancestor (no specificity fight),
// while these stay the single source of truth — no magic numbers in the markup.
// --tree-font-size is the master scale anchor (px). All spatial/text metrics are
// `em` relative to it, so overriding --tree-font-size proportionally resizes the
// whole tree. (em defaults chosen to equal the old px values at the 12px anchor.)
// Exceptions kept in px: the divider hairline + its margin (a divider has no
// font context — em there would resolve against the page font, not the tree's).
const STYLE_DEFAULTS = {
  "--tree-font-size-default": "12px",
  "--tree-indent-base-default": "1em",
  "--tree-indent-step-default": "1em",
  "--tree-group-weight-default": "700",
  "--tree-count-opacity-default": "0.5",
  "--tree-count-gap-default": "0.33em",
  "--tree-count-weight-default": "400",
  "--tree-icon-left-gap-default": "0",
  "--tree-icon-right-gap-default": "0.5em",
  "--tree-icon-right-size-default": "0.92em",
  "--tree-chevron-gap-default": "0.33em",
  "--tree-action-gap-default": "0.67em",
  "--tree-action-opacity-default": "0.6",
  "--tree-dim-opacity-default": "0.38",
  "--tree-divider-color-default": "var(--border-subtle)",
  "--tree-divider-margin-default": "8px",
  "--tree-divider-height-default": "1px",
  "--tree-spacer-width-default": "1.33em",
  "--tree-user-select-default": "none",
  // Multi-line: set --tree-label-white-space:normal + --tree-row-align-items:flex-start
  // (with a stacked renderLabel) to get 2/3/N-line rows. Defaults = single line.
  "--tree-row-align-items-default": "center",
  "--tree-label-white-space-default": "nowrap",
} satisfies JSX.CSSProperties;

const tok = (name: string) => `var(--tree-${name}, var(--tree-${name}-default))`;

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

const defaultMatcher: TreeMatcher = (node, query) =>
  node.label.toLowerCase().includes(query.toLowerCase());

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

// Shared per-render state for the recursive rows — carried via context so the
// recursion only passes what actually varies per node (node + depth). Reactive
// bits (expanded/selectedId/highlightQuery) are accessors so tracking flows.
interface TreeCtx {
  expanded: () => Record<string, boolean>;
  selectedId: () => string | null | undefined;
  highlightQuery: () => string | null;
  isDimmed: (id: string) => boolean;
  onToggle: (id: string) => void;
  onSelect: (node: TreeNodeData) => void;
  renderActionNode?: (node: TreeNodeData) => JSX.Element;
  renderLabel?: (node: TreeNodeData) => JSX.Element;
}

const TreeContext = createContext<TreeCtx>();
const useTree = (): TreeCtx => useContext(TreeContext)!;

// Built-in highlight for the DEFAULT matcher path — wraps the matched substring
// of the label in <mark>. Skipped when a custom matcher or renderLabel is used
// (Tree can't know what a custom matcher matched on).
const HighlightedLabel: Component<{ label: string; query: string | null }> = (props) => (
  <Show when={props.query} fallback={<>{props.label}</>}>
    {(() => {
      const label = props.label;
      const q = props.query!.toLowerCase();
      const i = label.toLowerCase().indexOf(q);
      if (i < 0 || q.length === 0) return <>{label}</>;
      return (
        <>
          {label.slice(0, i)}
          <mark class="solid-tree-mark">{label.slice(i, i + q.length)}</mark>
          {label.slice(i + q.length)}
        </>
      );
    })()}
  </Show>
);

// Prune walk: keep a node if it matches OR any descendant matches. A matched
// node keeps its full original subtree (browse into it); a non-matching node on
// a match path keeps only its surviving children.
function pruneNode(node: TreeNodeData, query: string, matcher: TreeMatcher): TreeNodeData | null {
  if (node.isDivider) return null; // dividers have no label; drop while filtering
  const survivingKids = (node.children ?? [])
    .map((c) => pruneNode(c, query, matcher))
    .filter((c): c is TreeNodeData => c !== null);
  const selfHit = matcher(node, query);
  if (!selfHit && survivingKids.length === 0) return null;
  return {
    ...node,
    children: selfHit ? node.children : survivingKids,
  };
}

// Every node in the (pruned) tree that has children — force-expanded while a
// query is active so matches are revealed without touching saved expand state.
function collectExpandable(nodes: TreeNodeData[], acc: Record<string, boolean>): Record<string, boolean> {
  for (const n of nodes) {
    if (n.children && n.children.length) {
      acc[n.id] = true;
      collectExpandable(n.children, acc);
    }
  }
  return acc;
}

function collectIds(nodes: TreeNodeData[], acc: Set<string>): Set<string> {
  for (const n of nodes) {
    acc.add(n.id);
    if (n.children) collectIds(n.children, acc);
  }
  return acc;
}

function findNode(nodes: TreeNodeData[], id: string): TreeNodeData | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function containsDescendant(node: TreeNodeData, id: string): boolean {
  return !!node.children && node.children.some((c) => c.id === id || containsDescendant(c, id));
}

/** One row in the linearized, currently-visible view of the tree. */
export interface FlatRow {
  node: TreeNodeData;
  depth: number;
  hasChildren: boolean;
  /** false for dividers — keyboard nav / a11y treeitem logic should skip these. */
  navigable: boolean;
}

/**
 * Linearize the tree into the rows that are currently visible (descending only
 * into expanded nodes). Dividers are included with `navigable: false`. This is
 * the seam `<VirtualTree>` feeds to a virtualizer; `<Tree>` renders recursively
 * and doesn't need it.
 */
export function flattenVisible(
  nodes: TreeNodeData[],
  expanded: Record<string, boolean>,
  depth = 0,
  acc: FlatRow[] = []
): FlatRow[] {
  for (const node of nodes) {
    const hasChildren = !!node.children && node.children.length > 0;
    acc.push({ node, depth, hasChildren, navigable: !node.isDivider });
    if (hasChildren && expanded[node.id]) {
      flattenVisible(node.children!, expanded, depth + 1, acc);
    }
  }
  return acc;
}

// A single row's interior (no child recursion) — shared by the recursive
// <Tree> (via TreeBranch) and, later, the flat <VirtualTree>.
const TreeRow: Component<{ node: TreeNodeData; depth: number }> = (props) => {
  const ctx = useTree();

  if (props.node.isDivider) {
    return (
      <div
        class="solid-tree-divider"
        style={`height: ${tok("divider-height")}; background: ${tok("divider-color")}; margin: ${tok("divider-margin")} 0;`}
      />
    );
  }

  const isAction = () => props.node.variant === "action";
  const hasChildren = () => !!props.node.children && props.node.children.length > 0;
  const isExpanded = () => ctx.expanded()[props.node.id] || false;
  const isSelected = () => ctx.selectedId() === props.node.id;
  const dimmed = () => ctx.isDimmed(props.node.id);

  const handleToggle = (e: Event) => {
    e.stopPropagation();
    ctx.onToggle(props.node.id);
  };

  return (
      <div
        class="solid-tree-row"
        data-depth={props.depth}
        data-variant={props.node.variant ?? "default"}
        data-selected={isSelected() ? "" : undefined}
        data-has-children={hasChildren() ? "" : undefined}
        data-dimmed={dimmed() ? "" : undefined}
        onClick={(e) => {
          // Tree-row click semantics (match VS Code / Finder):
          //   - unexpanded           → select + expand
          //   - expanded, unselected → select only (don't collapse)
          //   - expanded, selected   → toggle (collapse)
          // The chevron itself always toggles via its own handler, so
          // users can still collapse without selecting.
          const wasSelected = isSelected();
          const wasExpanded = isExpanded();
          ctx.onSelect(props.node);
          if (hasChildren()) {
            if (!wasExpanded) handleToggle(e);
            else if (wasSelected) handleToggle(e);
          }
        }}
        style={{
          display: "flex",
          "align-items": tok("row-align-items") as JSX.CSSProperties["align-items"],
          "--tree-depth": String(props.depth),
          "padding-left": isAction()
            ? "0"
            : `calc(${tok("indent-base")} + var(--tree-depth) * ${tok("indent-step")})`,
          "justify-content": isAction() ? "center" : "flex-start",
          opacity: isAction() ? tok("action-opacity") : dimmed() ? tok("dim-opacity") : "1",
          "font-size": tok("font-size"),
          "user-select": tok("user-select") as JSX.CSSProperties["user-select"],
          "-webkit-user-select": tok("user-select") as JSX.CSSProperties["-webkit-user-select"],
          cursor: "pointer",
        }}
      >
        <div
          class="solid-tree-row-content"
          style={{
            display: "flex",
            "align-items": tok("row-align-items") as JSX.CSSProperties["align-items"],
            flex: isAction() ? "initial" : "1",
            overflow: "hidden",
          }}
        >
          <Show when={hasChildren() && !isAction()}>
            <Chevron
              expanded={isExpanded()}
              onClick={(e) => {
                e.stopPropagation();
                handleToggle(e);
              }}
              style={{ "margin-right": tok("chevron-gap") }}
            />
          </Show>
          <Show when={!hasChildren() && !isAction()}>
            <span class="solid-tree-spacer" style={`display:inline-block; width:${tok("spacer-width")};`} />
          </Show>

          <Show when={props.node.iconLeft}>
            <span class="solid-tree-icon-left" style={`flex-shrink: 0; margin-right: ${tok("icon-left-gap")};`}>
              {props.node.iconLeft}
            </span>
          </Show>

          <span
            class="solid-tree-label"
            style={`flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: ${tok("label-white-space")}; display: flex; align-items: center; ${props.depth === 0 && hasChildren() ? `font-weight:${tok("group-weight")};` : ""}`}
          >
            <span style={`overflow: hidden; text-overflow: ellipsis; white-space: ${tok("label-white-space")};`}>
              <Show
                when={ctx.renderLabel}
                fallback={<HighlightedLabel label={props.node.label} query={ctx.highlightQuery()} />}
              >
                {ctx.renderLabel!(props.node)}
              </Show>
            </span>
            <Show when={props.node.count !== undefined}>
              <span
                class="solid-tree-count"
                style={`opacity: ${tok("count-opacity")}; margin-left: ${tok("count-gap")}; font-weight: ${tok("count-weight")}; flex-shrink: 0;`}
              >
                ({props.node.count})
              </span>
            </Show>
          </span>
          <Show when={props.node.iconRight}>
            <span
              class="solid-tree-icon-right"
              style={`margin-left: ${tok("icon-right-gap")}; flex-shrink: 0; font-size: ${tok("icon-right-size")};`}
            >
              {props.node.iconRight}
            </span>
          </Show>
        </div>

        <Show when={ctx.renderActionNode}>
          <div
            class="solid-tree-action"
            style={`display:flex; align-items:center; margin-left:${tok("action-gap")};`}
            onClick={(e) => e.stopPropagation()}
          >
            {ctx.renderActionNode!(props.node)}
          </div>
        </Show>
      </div>
  );
};

// Recursive wrapper: a row plus its expanded children. <Tree> renders these.
// (Kept recursive on purpose — fine-grained, stable identity. Flattening +
// by-id keying is a virtualizer concern, handled by flattenVisible/VirtualTree.)
const TreeBranch: Component<{ node: TreeNodeData; depth: number }> = (props) => {
  const ctx = useTree();
  const hasChildren = () => !!props.node.children && props.node.children.length > 0;
  const isExpanded = () => ctx.expanded()[props.node.id] || false;
  return (
    <>
      <TreeRow node={props.node} depth={props.depth} />
      <Show when={!props.node.isDivider && hasChildren() && isExpanded()}>
        <For each={props.node.children}>
          {(child) => <TreeBranch node={child} depth={props.depth + 1} />}
        </For>
      </Show>
    </>
  );
};

export const Tree: Component<TreeProps> = (props) => {
  // Persistence is opt-in. With no storageKey, persistKey() is null → we never
  // touch localStorage and expand state lives only in the signal.
  const persistKey = () =>
    props.storageKey == null ? null : `${props.storagePrefix ?? "tree"}-${props.storageKey}`;

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

  onMount(() => {
    Object.entries(expanded()).forEach(([id, isExpanded]) => {
      if (isExpanded && props.onToggle) props.onToggle(id, true);
    });
  });

  // Auto-expand ancestors to reveal the current selection. Tracks ONLY
  // selectedId + data — the expand reads/writes are untracked, so a manual
  // collapse never retriggers this (which would otherwise snap the node back open).
  createEffect(() => {
    const id = props.selectedId;
    const data = props.data;
    if (!id || !data) return;

    const findAndExpand = (nodes: TreeNodeData[], targetId: string): boolean => {
      for (const node of nodes) {
        if (node.id === targetId) return true;
        if (node.children && node.children.length > 0) {
          if (findAndExpand(node.children, targetId)) {
            if (!expanded()[node.id]) {
              setExpanded((prev) => ({ ...prev, [node.id]: true }));
              if (props.onToggle) props.onToggle(node.id, true);
            }
            return true;
          }
        }
      }
      return false;
    };

    untrack(() => findAndExpand(data, id));
  });

  const handleToggle = (id: string) => {
    const newState = !expanded()[id];
    setExpanded((prev) => ({ ...prev, [id]: newState }));
    if (props.onToggle) props.onToggle(id, newState);

    // Collapsing a node that hides the current selection → move selection to it,
    // so the selection never disappears into a collapsed branch.
    if (!newState) {
      const sel = props.selectedId;
      if (sel && sel !== id) {
        const node = findNode(props.data, id);
        if (node && containsDescendant(node, sel)) props.onSelect(node);
      }
    }
  };

  // ── Search derivation ────────────────────────────────────────────────────
  // Single memoized pass. `active` gates everything; when off, render props.data
  // untouched and persisted expand state is authoritative.
  const view = createMemo(() => {
    const query = (props.searchQuery ?? "").trim();
    if (!query) {
      return { active: false, data: props.data, forced: null as Record<string, boolean> | null, keep: null as Set<string> | null };
    }
    const matcher = props.matcher ?? defaultMatcher;
    const pruned = props.data
      .map((n) => pruneNode(n, query, matcher))
      .filter((n): n is TreeNodeData => n !== null);
    const forced = collectExpandable(pruned, {});
    if (props.filterMode === "dim") {
      // Keep the whole tree on screen; dim everything not on a match path.
      return { active: true, data: props.data, forced, keep: collectIds(pruned, new Set<string>()) };
    }
    return { active: true, data: pruned, forced, keep: null };
  });

  // Force-expand overlay: merged on top of saved state, never written back.
  const effectiveExpanded = () => {
    const v = view();
    return v.forced ? { ...expanded(), ...v.forced } : expanded();
  };

  // Built-in highlight only when the default matcher + default label render are
  // in play — otherwise the consumer owns the label.
  const highlightQuery = (): string | null =>
    view().active && !props.matcher && !props.renderLabel ? (props.searchQuery ?? "").trim() : null;

  const isDimmed = (id: string): boolean => {
    const v = view();
    return v.active && v.keep ? !v.keep.has(id) : false;
  };

  // prune mode + active query + nothing left = empty state.
  const noMatches = () => view().active && !view().keep && view().data.length === 0;

  const ctx: TreeCtx = {
    expanded: effectiveExpanded,
    selectedId: () => props.selectedId,
    highlightQuery,
    isDimmed,
    onToggle: handleToggle,
    onSelect: (node) => props.onSelect(node),
    get renderActionNode() {
      return props.renderActionNode;
    },
    get renderLabel() {
      return props.renderLabel;
    },
  };

  return (
    <div
      class="solid-tree-container"
      data-searching={view().active ? "" : undefined}
      style={{
        display: "flex",
        "flex-direction": "column",
        // Publish the default layer (single source of truth for style literals).
        ...STYLE_DEFAULTS,
        // Props, when passed, pin the user-facing token for this instance — they
        // win over both the token override and the default.
        ...(props.basePadding != null ? { "--tree-indent-base": `${props.basePadding}px` } : {}),
        ...(props.indentStep != null ? { "--tree-indent-step": `${props.indentStep}px` } : {}),
      }}
    >
      <TreeContext.Provider value={ctx}>
        <Show
          when={!noMatches()}
          fallback={<div class="solid-tree-empty">{props.noMatchesLabel ?? "No matches"}</div>}
        >
          <For each={view().data}>{(node) => <TreeBranch node={node} depth={0} />}</For>
        </Show>
      </TreeContext.Provider>
    </div>
  );
};
