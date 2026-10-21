import { Component, For, Show, createMemo, mergeProps, onCleanup } from "solid-js";
import { TreeContext, type TreeCtx } from "./context.js";
import { TreeRow } from "./TreeRow.js";
import { createTreeView, type TreeViewApi, type TreeViewOptions } from "./headless/createTreeView.js";
import { type TreeProps, type TreeNodeData } from "../types.js";
import { CORE_OPTION_KEYS, createTreeController, pickCore, type TreeController, type CoreControllerOptions } from "../controller/index.js";
import { buildContainerVars } from "./tokens.js";

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

/** Row slots + the headless view, shared by every styled view. */
export function rowContext(tree: TreeController, view: TreeViewApi, slots: CoreViewProps): TreeCtx {
  return {
    tree,
    view,
    get renderLabel() {
      return slots.renderLabel;
    },
    get renderActionNode() {
      return slots.renderActionNode;
    },
    get renderLeading() {
      return slots.renderLeading;
    },
  };
}

/** The headless view wired to a styled view's props. */
export function viewFromProps(tree: TreeController, props: CoreViewProps, extra: Partial<TreeViewOptions> & Pick<TreeViewOptions, "getContainer">) {
  return createTreeView({
    tree,
    rowClickPolicy: () => props.rowClickPolicy,
    rtl: () => props.dir === "rtl",
    ariaLabel: () => props.ariaLabel,
    ariaLabelledBy: () => props.ariaLabelledBy,
    ...extra,
  });
}

/**
 * The in-memory tree. Renders the visible rows as a flat list keyed by id (WAI-ARIA
 * allows a flat tree described by aria-level/posinset/setsize), so rows keep their
 * identity across searches and data changes (ANALYSIS G2).
 */
export const Tree: Component<TreeViewProps> = (props) => {
  warnIfTreeOverridesProps(props, "Tree");
  const tree = props.tree ?? createTreeController(controllerOptionsFromProps(props));
  let container: HTMLDivElement | undefined;
  const view = viewFromProps(tree, props, { getContainer: () => container });
  tree._registerScroller((id) => {
    const el = container?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  });
  onCleanup(() => tree._registerScroller(null));
  const ctx = rowContext(tree, view, props);
  const ids = createMemo(() => tree.flatRows().map((r) => r.id));
  const byId = createMemo(() => new Map(tree.flatRows().map((r) => [r.id, r])));

  return (
    <>
      <div
        ref={(element) => (container = element)}
        class="solid-tree-container"
        dir={props.dir}
        {...view.getRootProps()}
        style={{ display: "flex", "flex-direction": "column", ...buildContainerVars(props.basePadding, props.indentStep) }}
      >
        <TreeContext.Provider value={ctx}>
          <For each={ids()}>{(id) => <TreeRow row={() => byId().get(id)} />}</For>
        </TreeContext.Provider>
      </div>
      <Show when={tree.noMatches()}>
        <div class="solid-tree-empty">{props.noMatchesLabel ?? "No matches"}</div>
      </Show>
      <div {...view.getLiveRegionProps()}>{view.liveMessage()}</div>
    </>
  );
};
