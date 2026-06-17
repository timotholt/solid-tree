import { Component, For, Show, createSignal, createEffect, onMount, JSX } from "solid-js";
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
}> = (props) => {
  if (props.node.isDivider) {
    return <div style="height: 1px; background: var(--border-subtle); margin: 8px 0;" />;
  }

  const isAction = () => props.node.variant === "action";
  const hasChildren = () => !!props.node.children && props.node.children.length > 0;
  const isExpanded = () => props.expanded[props.node.id] || false;
  const isSelected = () => props.selectedId === props.node.id;

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
          opacity: isAction() ? "0.6" : "1",
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
              <Show when={props.renderLabel} fallback={props.node.label}>
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

  return (
    <div class="solid-tree-container" style="display:flex; flex-direction:column;">
      <For each={props.data}>
        {(node) => (
          <TreeRenderNode
            node={node}
            depth={0}
            expanded={expanded()}
            onToggle={handleToggle}
            selectedId={props.selectedId}
            onSelect={props.onSelect}
            renderActionNode={props.renderActionNode}
            renderLabel={props.renderLabel}
            basePadding={props.basePadding ?? 12}
            indentStep={props.indentStep ?? 12}
          />
        )}
      </For>
    </div>
  );
};
