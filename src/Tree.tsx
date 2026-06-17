import { Component, For, Show, createSignal, createEffect, createMemo, onMount, JSX } from "solid-js";
import { storage } from "./storage.js";
import { Chevron } from "./Chevron.jsx";

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

const TreeRenderNode: Component<{
  node: TreeNodeData;
  depth: number;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  selectedId?: string | null;
  onSelect: (node: TreeNodeData) => void;
  renderActionNode?: (node: TreeNodeData) => JSX.Element;
  renderLabel?: (node: TreeNodeData) => JSX.Element;
  basePadding: number;
  indentStep: number;
  highlightQuery: string | null;
  isDimmed: (id: string) => boolean;
}> = (props) => {
  if (props.node.isDivider) {
    return <div style="height: 1px; background: var(--border-subtle); margin: 8px 0;" />;
  }

  const isAction = () => props.node.variant === "action";
  const hasChildren = () => !!props.node.children && props.node.children.length > 0;
  const isExpanded = () => props.expanded[props.node.id] || false;
  const isSelected = () => props.selectedId === props.node.id;
  const dimmed = () => props.isDimmed(props.node.id);

  const handleToggle = (e: Event) => {
    e.stopPropagation();
    props.onToggle(props.node.id);
  };

  const calculatePadding = () => `${props.depth * props.indentStep + props.basePadding}px`;

  return (
    <>
      <div
        class={`solid-tree-row ${isSelected() ? "active" : ""}`}
        onClick={(e) => {
          // Tree-row click semantics (match VS Code / Finder):
          //   - unexpanded           → select + expand
          //   - expanded, unselected → select only (don't collapse)
          //   - expanded, selected   → toggle (collapse)
          // The chevron itself always toggles via its own handler, so
          // users can still collapse without selecting.
          const wasSelected = isSelected();
          const wasExpanded = isExpanded();
          props.onSelect(props.node);
          if (hasChildren()) {
            if (!wasExpanded) handleToggle(e);
            else if (wasSelected) handleToggle(e);
          }
        }}
        style={{
          "padding-left": isAction() ? "0" : calculatePadding(),
          "justify-content": isAction() ? "center" : "flex-start",
          opacity: isAction() ? "0.6" : dimmed() ? "0.38" : "1",
          "font-size": "12px",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            display: "flex",
            "align-items": "center",
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
              style={{ "margin-right": "4px" }}
            />
          </Show>
          <Show when={!hasChildren() && !isAction()}>
            <span style="display:inline-block; width:16px;" />
          </Show>

          <Show when={props.node.iconLeft}>
            <span style="flex-shrink: 0;">{props.node.iconLeft}</span>
          </Show>

          <span
            style={`flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; ${props.depth === 0 && hasChildren() ? "font-weight:700;" : ""}`}
          >
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <Show
                when={props.renderLabel}
                fallback={<HighlightedLabel label={props.node.label} query={props.highlightQuery} />}
              >
                {props.renderLabel!(props.node)}
              </Show>
            </span>
            <Show when={props.node.count !== undefined}>
              <span style="opacity: 0.5; margin-left: 4px; font-weight: 400; flex-shrink: 0;">
                ({props.node.count})
              </span>
            </Show>
          </span>
          <Show when={props.node.iconRight}>
            <span style="margin-left: 6px; flex-shrink: 0; font-size: 11px;">
              {props.node.iconRight}
            </span>
          </Show>
        </div>

        <Show when={props.renderActionNode}>
          <div
            class="solid-tree-action"
            style="margin-left:8px;"
            onClick={(e) => e.stopPropagation()}
          >
            {props.renderActionNode!(props.node)}
          </div>
        </Show>
      </div>

      <Show when={hasChildren() && isExpanded()}>
        <For each={props.node.children}>
          {(child) => (
            <TreeRenderNode
              node={child}
              depth={props.depth + 1}
              expanded={props.expanded}
              onToggle={props.onToggle}
              selectedId={props.selectedId}
              onSelect={props.onSelect}
              renderActionNode={props.renderActionNode}
              renderLabel={props.renderLabel}
              basePadding={props.basePadding}
              indentStep={props.indentStep}
              highlightQuery={props.highlightQuery}
              isDimmed={props.isDimmed}
            />
          )}
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

  // Auto-expand ancestors to reveal the current selection.
  createEffect(() => {
    const id = props.selectedId;
    if (!id || !props.data) return;

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

    findAndExpand(props.data, id);
  });

  const handleToggle = (id: string) => {
    const newState = !expanded()[id];
    setExpanded((prev) => ({ ...prev, [id]: newState }));
    if (props.onToggle) props.onToggle(id, newState);
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

  return (
    <div class="solid-tree-container" style="display:flex; flex-direction:column;">
      <Show
        when={!(view().active && view().keep === null && view().data.length === 0)}
        fallback={<div class="solid-tree-empty">{props.noMatchesLabel ?? "No matches"}</div>}
      >
        <For each={view().data}>
          {(node) => (
            <TreeRenderNode
              node={node}
              depth={0}
              expanded={effectiveExpanded()}
              onToggle={handleToggle}
              selectedId={props.selectedId}
              onSelect={props.onSelect}
              renderActionNode={props.renderActionNode}
              renderLabel={props.renderLabel}
              basePadding={props.basePadding ?? 12}
              indentStep={props.indentStep ?? 12}
              highlightQuery={highlightQuery()}
              isDimmed={isDimmed}
            />
          )}
        </For>
      </Show>
    </div>
  );
};
