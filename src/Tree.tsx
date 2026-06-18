import { Component, For, Show } from "solid-js";
import { TreeContext, type TreeCtx } from "./context.js";
import { type TreeProps } from "./types.js";
import { createTreeController, type TreeController } from "./controller.js";
import { buildContainerVars } from "./tokens.js";
import { TreeBranch } from "./TreeBranch.jsx";

export interface TreeViewProps extends TreeProps {
  /** Drive this view with an external controller; omit to build one from the props. */
  tree?: TreeController;
}

/** Adapt a component's props into TreeController options (reactive via accessors). */
export function controllerOptionsFromProps(props: TreeProps) {
  return {
    data: () => props.data,
    selectedId: () => props.selectedId,
    searchQuery: () => props.searchQuery,
    matcher: props.matcher,
    filterMode: props.filterMode,
    onSelect: props.onSelect,
    onToggle: props.onToggle,
    storageKey: props.storageKey,
    storagePrefix: props.storagePrefix,
  };
}

/** Build the row-render context from controller state + the view's render slots. */
export function ctxFromController(
  tree: TreeController,
  slots: { renderLabel?: TreeProps["renderLabel"]; renderActionNode?: TreeProps["renderActionNode"] }
): TreeCtx {
  return {
    ...tree._ctxState,
    get renderActionNode() {
      return slots.renderActionNode;
    },
    get renderLabel() {
      return slots.renderLabel;
    },
  };
}

export const Tree: Component<TreeViewProps> = (props) => {
  const tree = props.tree ?? createTreeController(controllerOptionsFromProps(props));
  const ctx = ctxFromController(tree, props);

  return (
    <div
      class="solid-tree-container"
      data-searching={tree.searching() ? "" : undefined}
      style={{ display: "flex", "flex-direction": "column", ...buildContainerVars(props.basePadding, props.indentStep) }}
    >
      <TreeContext.Provider value={ctx}>
        <Show
          when={!tree.noMatches()}
          fallback={<div class="solid-tree-empty">{props.noMatchesLabel ?? "No matches"}</div>}
        >
          <For each={tree.displayNodes()}>{(node) => <TreeBranch node={node} depth={0} />}</For>
        </Show>
      </TreeContext.Provider>
    </div>
  );
};
