import { Component, For, Show, mergeProps } from "solid-js";
import { TreeContext, type TreeCtx } from "./context.js";
import { type TreeProps, type TreeNodeData } from "../types.js";
import { CORE_OPTION_KEYS, createTreeController, pickCore, type TreeController, type CoreControllerOptions } from "../controller/index.js";
import { buildContainerVars } from "./tokens.js";
import { TreeBranch } from "./TreeBranch.js";
import { createTreeInteraction } from "./interaction.js";

/**
 * View props common to every tier: the controller inputs, but with `data`/`onSelect`
 * optional because the controller-driven form (`tree={...}`) supplies them itself.
 */
export type CoreViewProps = Omit<TreeProps, "data" | "onSelect" | keyof CoreControllerOptions> &
  CoreControllerOptions & {
    data?: TreeNodeData[];
  };

export interface TreeViewProps extends CoreViewProps {
  /** Drive this view with an external controller; omit to build one from the props. */
  tree?: TreeController;
}

/**
 * Adapt a component's props into the shared core controller options. Live getters, key
 * presence preserved: controlled-iff-passed and runtime option changes both work (A1, G1).
 */
export const coreOptionsFromProps = (props: CoreViewProps): CoreControllerOptions => pickCore(props as never);

/** Core options + in-memory data, for the base/virtual views. */
export function controllerOptionsFromProps(props: CoreViewProps) {
  return mergeProps(coreOptionsFromProps(props), { data: () => props.data ?? [] });
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
    get rowClickPolicy() {
      return slots.rowClickPolicy ?? "finder";
    },
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

/**
 * Dev warning (ANALYSIS D5): with `tree={...}` the controller owns state, so data and
 * controller options passed as props are ignored. Say so instead of failing silently.
 */
export function warnIfTreeOverridesProps(props: object & { tree?: unknown }, view: string) {
  if (!props.tree) return;
  const ignored = ["data", "source", ...CORE_OPTION_KEYS].filter((k) => k in props);
  if (ignored.length) {
    console.warn(`[solid-tree] <${view} tree={...}> ignores these props (configure the controller instead): ${ignored.join(", ")}`);
  }
}

export const Tree: Component<TreeViewProps> = (props) => {
  warnIfTreeOverridesProps(props, "Tree");
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
