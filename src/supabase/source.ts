import type { SupabaseClient } from "@supabase/supabase-js";
import type { TreeNodeData, TreeSource, TreeChange } from "../types.js";

/**
 * Config for {@link supabaseSource} — the opinionated Supabase adapter that turns a
 * table into a `TreeSource` for `<DatabaseTree>`/`<SupabaseTree>`. Flat by default;
 * set `parentColumn` for a self-referential hierarchy (roots = parent IS NULL).
 * RLS does the access control server-side; this is just a lens over the rows you
 * can already see. See ../../supabase/ for the matching SQL.
 */
export interface SupabaseSourceConfig {
  client: SupabaseClient;
  /** Table name (in `schema`, default "public"). */
  table: string;
  /** Map a DB row → a tree node. Put lock state etc. on `payload`. */
  toNode: (row: Record<string, any>) => TreeNodeData;
  /** Primary key column. Default "id". */
  idColumn?: string;
  /** Self-reference for hierarchy; roots are rows where this IS NULL. Omit = flat. */
  parentColumn?: string;
  /** Columns to select. Default "*". */
  select?: string;
  /** Sort. Default: by id ascending. */
  orderBy?: { column: string; ascending?: boolean };
  /** Postgres schema. Default "public". */
  schema?: string;
  /** Subscribe to realtime row changes. Default true. */
  realtime?: boolean;
  /** Page size for the keyset pagination that works around PostgREST's row cap. Default 1000. */
  pageSize?: number;
}

let channels = 0;

/** Quote a value for a PostgREST `or=(…)` filter (commas/parens/quotes are syntax there). */
const pgrstValue = (v: unknown) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * Build a `TreeSource` backed by a Supabase table: `select`→getRoots/getChildren and
 * a realtime channel→subscribe (mapping INSERT/UPDATE/DELETE to `TreeChange`). Pass
 * the result to `<DatabaseTree source={...}/>`, or just use `<SupabaseTree/>` which
 * wires this for you. Subpath: `@timotholt/solid-tree/supabase`. Peer:
 * @supabase/supabase-js (optional). Dedupe solid-js (see AGENTS).
 */
export function supabaseSource(cfg: SupabaseSourceConfig): TreeSource {
  const idCol = cfg.idColumn ?? "id";
  const sel = cfg.select ?? "*";
  const order = cfg.orderBy ?? { column: idCol, ascending: true };
  const parentCol = cfg.parentColumn;

  // PostgREST caps a single response at `db-max-rows` (1000 on Supabase by default), so a
  // plain select silently truncates large tables. Page with KEYSET pagination on
  // (orderColumn, id) — unlike offset ranges it never skips or repeats rows when other
  // users insert or delete during the load (ANALYSIS D12).
  const PAGE = cfg.pageSize ?? 1000;
  const asc = order.ascending ?? true;
  const fetchWhere = async (apply: (q: any) => any): Promise<TreeNodeData[]> => {
    const rows: Record<string, any>[] = [];
    let last: Record<string, any> | undefined;
    for (;;) {
      let q = apply(cfg.client.from(cfg.table).select(sel)).order(order.column, { ascending: asc });
      if (order.column !== idCol) q = q.order(idCol, { ascending: asc });
      if (last) {
        const op = asc ? "gt" : "lt";
        q =
          order.column === idCol
            ? q[op](idCol, last[idCol])
            : q.or(
                `${order.column}.${op}.${pgrstValue(last[order.column])},` +
                  `and(${order.column}.eq.${pgrstValue(last[order.column])},${idCol}.${op}.${pgrstValue(last[idCol])})`
              );
      }
      const { data, error } = await q.limit(PAGE);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
      last = data[data.length - 1];
    }
    return rows.map(cfg.toNode);
  };

  const source: TreeSource = {
    getRoots: () => fetchWhere((q) => (parentCol ? q.is(parentCol, null) : q)),
  };

  if (parentCol) {
    source.getChildren = (node) => fetchWhere((q) => q.eq(parentCol, node.id));
  }

  if (cfg.realtime !== false) {
    source.subscribe = (onChange) => {
      const channel = cfg.client
        // One channel per subscription: realtime-js dedupes channels by topic, so a shared
        // topic made a second tree reuse (and unmount-kill) the first's channel (B3).
        .channel(`solid-tree:${cfg.schema ?? "public"}:${cfg.table}:${++channels}`)
        .on(
          "postgres_changes",
          { event: "*", schema: cfg.schema ?? "public", table: cfg.table },
          (payload: any) => {
            const change = toChange(payload, idCol, parentCol, cfg.toNode);
            if (change) onChange(change);
          }
        )
        .subscribe();
      return () => {
        void cfg.client.removeChannel(channel);
      };
    };
  }

  return source;
}

function toChange(
  payload: { eventType: string; new?: Record<string, any>; old?: Record<string, any> },
  idCol: string,
  parentCol: string | undefined,
  toNode: (row: Record<string, any>) => TreeNodeData
): TreeChange | null {
  const { eventType, new: rowNew, old: rowOld } = payload;
  if (eventType === "INSERT" && rowNew)
    return { type: "insert", parentId: parentCol ? rowNew[parentCol] ?? null : null, node: toNode(rowNew) };
  if (eventType === "UPDATE" && rowNew)
    // parentId lets the tree detect moves without Supabase's `old` row (B6).
    return parentCol ? { type: "update", node: toNode(rowNew), parentId: rowNew[parentCol] ?? null } : { type: "update", node: toNode(rowNew) };
  if (eventType === "DELETE") {
    const id = rowOld?.[idCol];
    return id != null ? { type: "remove", id: String(id) } : null;
  }
  return null;
}
