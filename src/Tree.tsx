import { Component, For, Show } from "solid-js";
import { TreeContext, type TreeCtx } from "./context.js";
import { type TreeProps, type TreeNodeData } from "./types.js";
import { createTreeController, type TreeController, type CoreControllerOptions } from "./controller.js";
import { buildContainerVars } from "./tokens.js";
import { TreeBranch } from "./TreeBranch.jsx";

/**
 * View props common to every tier: the controller inputs, but with `data`/`onSelect`
 * optional because the controller-driven form (`tree={...}`) supplies them itself.
 */
export type CoreViewProps = Omit<TreeProps, "data" | "onSelect"> & {
  data?: TreeNodeData[];
  onSelect?: (node: TreeNodeData) => void;
};

export interface TreeViewProps extends CoreViewProps {
  /** Drive this view with an external controller; omit to build one from the props. */
  tree?: TreeController;
}

/** Adapt a component's props into the shared core controller options (reactive). */
export function coreOptionsFromProps(props: CoreViewProps): CoreControllerOptions {
  return {
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

/** Core options + in-memory data, for the base/virtual views. */
export function controllerOptionsFromProps(props: CoreViewProps) {
  return { data: () => props.data ?? [], ...coreOptionsFromProps(props) };
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
