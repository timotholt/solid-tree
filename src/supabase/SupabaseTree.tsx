import { type Component } from "solid-js";
import { DatabaseTree, type DatabaseTreeProps } from "../DatabaseTree.jsx";
import { createSupabaseTreeController, type SupabaseTreeController, type SupabaseTreeControllerOptions } from "./controller.js";

export interface SupabaseTreeProps extends Omit<DatabaseTreeProps, "source" | "tree"> {
  client?: SupabaseTreeControllerOptions["client"];
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
      table: props.table!,
      toNode: props.toNode!,
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
      selectedId: () => props.selectedId,
      searchQuery: () => props.searchQuery,
      matcher: props.matcher,
      filterMode: props.filterMode,
      onSelect: props.onSelect,
      onToggle: props.onToggle,
      storageKey: props.storageKey,
      storagePrefix: props.storagePrefix,
    });

  return (
    <DatabaseTree
      tree={tree}
      renderLabel={props.renderLabel}
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
