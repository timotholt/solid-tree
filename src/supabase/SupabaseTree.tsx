import { type Component } from "solid-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DatabaseTree, type DatabaseTreeProps } from "../DatabaseTree.jsx";
import { supabaseSource, type SupabaseSourceConfig } from "./source.js";

export interface SupabaseTreeProps extends Omit<DatabaseTreeProps, "source"> {
  client: SupabaseClient;
  table: string;
  toNode: SupabaseSourceConfig["toNode"];
  idColumn?: string;
  parentColumn?: string;
  select?: string;
  orderBy?: SupabaseSourceConfig["orderBy"];
  schema?: string;
  realtime?: boolean;
}

/**
 * `<DatabaseTree>` wired to a Supabase table: async roots/children + lazy expand +
 * windowing + live realtime updates, with RLS doing access control server-side.
 * Thin preset — it builds a {@link supabaseSource} and hands it to `<DatabaseTree>`;
 * pair it with {@link createSupabaseLock} for collaborative record locking.
 * Subpath: `@timotholt/solid-tree/supabase`. Peers: @supabase/supabase-js +
 * @tanstack/solid-query + @tanstack/solid-virtual (all optional). Dedupe solid-js.
 */
export const SupabaseTree: Component<SupabaseTreeProps> = (props) => {
  // Built once from the initial client+table (stable for a mounted tree).
  const source = supabaseSource({
    client: props.client,
    table: props.table,
    toNode: props.toNode,
    idColumn: props.idColumn,
    parentColumn: props.parentColumn,
    select: props.select,
    orderBy: props.orderBy,
    schema: props.schema,
    realtime: props.realtime,
  });
  return <DatabaseTree {...props} source={source} />;
};
