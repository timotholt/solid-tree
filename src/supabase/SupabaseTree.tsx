import { type Component, mergeProps } from "solid-js";
import { coreOptionsFromProps, warnIfTreeOverridesProps } from "../view/Tree.js";
import { DatabaseTree, type DatabaseTreeProps } from "../database/DatabaseTree.js";
import { createSupabaseTreeController, SUPABASE_OPTION_KEYS, type SupabaseTreeController, type SupabaseTreeControllerOptions } from "./controller.js";
import { forward } from "../state/access.js";

export type SupabaseTreeProps = Omit<DatabaseTreeProps, "source" | "tree" | "queryClient"> &
  Partial<Pick<SupabaseTreeControllerOptions, (typeof SUPABASE_OPTION_KEYS)[number]>> & {
    /** Drive this view with an external controller; omit to build one from the props. */
    tree?: SupabaseTreeController;
  };

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
      // Every Supabase option forwarded live from one key list (D3, G1).
      mergeProps(coreOptionsFromProps(props), forward(props, SUPABASE_OPTION_KEYS)) as SupabaseTreeControllerOptions
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
