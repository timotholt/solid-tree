import { Component } from "solid-js";
import { QueryClient } from "@tanstack/solid-query";
import { type TreeNodeData, type TreeSource } from "./types.js";
import { coreOptionsFromProps } from "./Tree.jsx";
import { VirtualTree, type VirtualTreeProps } from "./VirtualTree.jsx";
import {
  createDatabaseTreeController,
  type DatabaseTreeController,
  LOADING_TYPE,
} from "./DatabaseTreeController.js";

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
  const tree =
    props.tree ??
    createDatabaseTreeController({
      source: props.source!,
      queryClient: props.queryClient,
      ...coreOptionsFromProps(props),
    });

  // Render the lazy-load placeholder distinctly; otherwise delegate to consumer/default.
  const renderLabel = (node: TreeNodeData) => {
    if (node.type === LOADING_TYPE) {
      // .solid-tree-loading is a styling hook (e.g. a spinner) consumers can target.
      return <span class="solid-tree-loading" style="opacity:.6;font-style:italic">{node.label}</span>;
    }
    return props.renderLabel ? props.renderLabel(node) : node.label;
  };

  return (
    <VirtualTree
      tree={tree}
      renderLabel={renderLabel}
      renderActionNode={props.renderActionNode}
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
