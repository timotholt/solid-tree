import { Component, For, Show } from "solid-js";
import { TreeContext, type TreeCtx } from "./context.js";
import { type TreeProps, type TreeNodeData } from "./types.js";
import { createTreeController, type TreeController, type CoreControllerOptions } from "./controller.js";
import { buildContainerVars } from "./tokens.js";
import { TreeBranch } from "./TreeBranch.jsx";
import { createTreeInteraction } from "./interaction.js";

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
    canSelect: props.canSelect,
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
  slots: {
    renderLabel?: TreeProps["renderLabel"];
    renderActionNode?: TreeProps["renderActionNode"];
    rowClickPolicy?: TreeProps["rowClickPolicy"];
  },
  interaction?: Pick<TreeCtx, "tabbableId" | "focusRow" | "onRowKeyDown">
): TreeCtx {
  return {
    ...tree._ctxState,
    rowClickPolicy: slots.rowClickPolicy ?? "finder",
    accessibleTree: !!interaction,
    tabbableId: interaction?.tabbableId ?? (() => undefined),
    focusRow: interaction?.focusRow ?? (() => undefined),
    onRowKeyDown: interaction?.onRowKeyDown ?? (() => undefined),
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
  let container: HTMLDivElement | undefined;
  const interaction = createTreeInteraction({ tree, getContainer: () => container });
  const ctx = ctxFromController(tree, props, interaction);

  return (
    <div
      ref={(element) => (container = element)}
      class="solid-tree-container"
      role="tree"
      aria-label={props.ariaLabel}
      aria-labelledby={props.ariaLabelledBy}
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
