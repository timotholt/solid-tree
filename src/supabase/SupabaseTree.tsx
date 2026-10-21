import { type Component, mergeProps } from "solid-js";
import { coreOptionsFromProps, warnIfTreeOverridesProps } from "../view/Tree.js";
import { DatabaseTree, type DatabaseTreeProps } from "../database/DatabaseTree.js";
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
  warnIfTreeOverridesProps(props, "SupabaseTree");
  const tree =
    props.tree ??
    createSupabaseTreeController(
      mergeProps(coreOptionsFromProps(props), {
        get client() {
          return props.client!;
        },
        get source() {
          return props.source;
        },
        get table() {
          return props.table;
        },
        get toNode() {
          return props.toNode;
        },
        get idColumn() {
          return props.idColumn;
        },
        get parentColumn() {
          return props.parentColumn;
        },
        get select() {
          return props.select;
        },
        get orderBy() {
          return props.orderBy;
        },
        get schema() {
          return props.schema;
        },
        get realtime() {
          return props.realtime;
        },
        get pageSize() {
          return props.pageSize;
        },
        get queryClient() {
          return props.queryClient;
        },
        get heartbeatMs() {
          return props.heartbeatMs;
        },
        get onLockLost() {
          return props.onLockLost;
        },
      })
    );

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
