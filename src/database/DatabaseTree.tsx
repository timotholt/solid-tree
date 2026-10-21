import { Component, mergeProps } from "solid-js";
import { QueryClient } from "@tanstack/solid-query";
import { type TreeSource } from "../types.js";
import { coreOptionsFromProps, warnIfTreeOverridesProps } from "../view/Tree.js";
import { VirtualTree, type VirtualTreeProps } from "../view/VirtualTree.js";
import { createDatabaseTreeController, type DatabaseTreeController } from "./createDatabaseTreeController.js";

export interface DatabaseTreeProps extends Omit<VirtualTreeProps, "data" | "tree"> {
  /** Async, backend-agnostic source (Supabase/REST/local adapter). */
  source?: TreeSource;
  /** Reuse an app QueryClient; otherwise the controller makes its own. */
  queryClient?: QueryClient;
  /** Drive this view with an external controller; omit to build one from the props. */
  tree?: DatabaseTreeController;
}

/**
 * Source-backed tree: async roots + lazy children-on-expand cached via TanStack Query,
 * rendered windowed via `<VirtualTree>`, with realtime patches from `source.subscribe`.
 * Thin view over {@link createDatabaseTreeController}. Subpath:
 * `@timotholt/solid-tree/database`. Peers: @tanstack/solid-query + @tanstack/solid-virtual
 * (both optional). Dedupe solid-js (see AGENTS).
 */
export const DatabaseTree: Component<DatabaseTreeProps> = (props) => {
  warnIfTreeOverridesProps(props, "DatabaseTree");
  const tree =
    props.tree ??
    createDatabaseTreeController(
      mergeProps(coreOptionsFromProps(props), {
        get source() {
          return props.source!;
        },
        get queryClient() {
          return props.queryClient;
        },
      })
    );

  props.controllerRef?.(tree);
  return (
    <VirtualTree
      tree={tree}
      renderLabel={props.renderLabel}
      renderActionNode={props.renderActionNode}
      ariaLabel={props.ariaLabel}
      ariaLabelledBy={props.ariaLabelledBy}
      rowClickPolicy={props.rowClickPolicy}
      noMatchesLabel={props.noMatchesLabel}
      basePadding={props.basePadding}
      indentStep={props.indentStep}
      estimateSize={props.estimateSize}
      overscan={props.overscan}
      class={props.class}
      viewportStyle={props.viewportStyle}
      onRangeChange={props.onRangeChange}
    />
  );
};
