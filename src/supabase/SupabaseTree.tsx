import { type Component } from "solid-js";
import { coreOptionsFromProps } from "../Tree.js";
import { DatabaseTree, type DatabaseTreeProps } from "../DatabaseTree.js";
import { type TreeSource } from "../types.js";
import { createSupabaseTreeController, type SupabaseTreeController, type SupabaseTreeControllerOptions } from "./controller.js";

export interface SupabaseTreeProps extends Omit<DatabaseTreeProps, "source" | "tree"> {
  client?: SupabaseTreeControllerOptions["client"];
  /** Inject a ready-made source (multi-table / synthetic trees); omit to build from table/toNode. */
  source?: TreeSource;
  table?: string;
  toNode?: SupabaseTreeControllerOptions["toNode"];
  idColumn?: string;
  parentColumn?: string;
  select?: string;
  orderBy?: SupabaseTreeControllerOptions["orderBy"];
  schema?: string;
  realtime?: boolean;
  pageSize?: number;
  heartbeatMs?: number;
  onLockLost?: (id: string) => void;
  /** Drive this view with an external controller; omit to build one from the props. */
  tree?: SupabaseTreeController;
}

/**
 * `<DatabaseTree>` wired to a Supabase table + record lock: async roots/children, lazy
 * expand, windowing, live realtime, and server-enforced collaborative locking. Thin view
 * over {@link createSupabaseTreeController}. Pass `tree={...}` to control it externally
 * (acquireLock/releaseLock/expand/select), or the convenience props to have it build one.
 * Subpath: `@timotholt/solid-tree/supabase`. Peer: @supabase/supabase-js (optional).
 */
export const SupabaseTree: Component<SupabaseTreeProps> = (props) => {
  const tree =
    props.tree ??
    createSupabaseTreeController({
      client: props.client!,
      source: props.source,
      table: props.table,
      toNode: props.toNode,
      idColumn: props.idColumn,
      parentColumn: props.parentColumn,
      select: props.select,
      orderBy: props.orderBy,
      schema: props.schema,
      realtime: props.realtime,
      pageSize: props.pageSize,
      queryClient: props.queryClient,
      heartbeatMs: props.heartbeatMs,
      onLockLost: props.onLockLost,
      ...coreOptionsFromProps(props),
    });

  return (
    <DatabaseTree
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
