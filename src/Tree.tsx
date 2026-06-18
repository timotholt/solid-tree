import { Component, For, Show, createSignal, createEffect, createMemo, untrack, onMount } from "solid-js";
import { storage } from "./storage.js";
import { STYLE_DEFAULTS } from "./tokens.js";
import { TreeContext, type TreeCtx } from "./context.js";
import { type TreeNodeData, type TreeProps } from "./types.js";
import {
  defaultMatcher,
  pruneNode,
  collectExpandable,
  collectIds,
  findNode,
  containsDescendant,
} from "./search.js";
import { TreeBranch } from "./TreeBranch.jsx";

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
      return {
        active: false,
        data: props.data,
        forced: null as Record<string, boolean> | null,
        keep: null as Set<string> | null,
      };
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
