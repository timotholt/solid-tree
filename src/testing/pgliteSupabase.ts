import type { PGlite, Transaction } from "@electric-sql/pglite";
import lockSql from "../../supabase/migrations/0003_solid_tree_lock.sql?raw";

/**
 * A Supabase-shaped client over an in-browser (or in-Node) Postgres — PGlite. Runs the
 * REAL solid-tree lock SQL, real row-level security and real triggers, with no server,
 * no network and no account. Several "users" share one database, so collaboration
 * (locks, realtime) can be demonstrated in a single tab or tested without Docker.
 *
 * Implements the slice of supabase-js that solid-tree uses: from().select() with
 * is/eq/gt/lt/or/order/limit/range, insert/update/delete, rpc(), auth.getUser/getSession/
 * onAuthStateChange, channel().on("postgres_changes").subscribe() and removeChannel().
 *
 * ```ts
 * const db = new PGlite();
 * const sb = await createPGliteSupabase(db);
 * await sb.exec(`create table public.docs (id text primary key, title text, parent_id text)`);
 * await sb.enableRealtime("public.docs");
 * await sb.installLock("public.docs");
 * const alice = sb.clientFor("alice"); // pass to <SupabaseTree client={alice} …>
 * ```
 */
export interface PGliteSupabase {
  db: PGlite;
  /** A client authenticated as `userId` (a uuid is minted for it). */
  clientFor(userId: string, opts?: { admin?: boolean }): PGliteSupabaseClient;
  /** Run SQL as the database owner (setup, seeding). */
  exec(sql: string): Promise<void>;
  /** Stream INSERT/UPDATE/DELETE on `table` to subscribed channels. */
  enableRealtime(table: string): Promise<void>;
  /** `select solid_tree.install_lock(table, …)` plus grants for the demo roles. */
  installLock(table: string, opts?: { ttl?: string; prefix?: string; protectUpdates?: boolean }): Promise<void>;
  /** The uuid behind a user name. */
  uuidOf(userId: string): string;
  /** The user name behind a uuid (for showing lock owners). */
  nameOf(uuid: string | null | undefined): string | null;
}

// supabase-js is typed loosely here on purpose: this is a test/demo double.
export type PGliteSupabaseClient = any;

type Row = Record<string, unknown>;
type Change = { table: string; eventType: "INSERT" | "UPDATE" | "DELETE"; new: Row | null; old: Row | null };

const AUTH_STUB = `
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema public to authenticated, anon;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant execute on function auth.jwt() to authenticated, anon;
create or replace function public._solid_tree_notify() returns trigger language plpgsql as $$
begin
  perform pg_notify('solid_tree_changes', json_build_object(
    'table', tg_table_schema || '.' || tg_table_name,
    'eventType', tg_op,
    'new', case when tg_op = 'DELETE' then null else row_to_json(new) end,
    'old', case when tg_op = 'INSERT' then null else row_to_json(old) end)::text);
  return null;
end $$;
`;

/** Deterministic uuid per user name (stable across reloads). */
function uuidFor(name: string): string {
  let h = 2166136261;
  const bytes: number[] = [];
  for (let i = 0; i < 16; i++) {
    for (const c of `${name}:${i}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    bytes.push((h >>> 0) & 0xff);
  }
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const quoteIdent = (s: string) => s.split(".").map((p) => `"${p.replace(/"/g, '""')}"`).join(".");

/** Parse the keyset `or` filter solid-tree's supabaseSource emits into SQL. */
function orToSql(expr: string, params: unknown[]): string {
  const m = /^(\w+)\.(gt|lt)\."((?:[^"\\]|\\.)*)",and\((\w+)\.eq\."((?:[^"\\]|\\.)*)",(\w+)\.(gt|lt)\."((?:[^"\\]|\\.)*)"\)$/.exec(expr);
  if (!m) throw new Error(`pglite-supabase: unsupported or() filter: ${expr}`);
  const un = (v: string) => v.replace(/\\(.)/g, "$1");
  const [, c1, op1, v1, c2, v2, c3, op3, v3] = m;
  const p = (v: string) => (params.push(un(v)), `$${params.length}`);
  const op = (o: string) => (o === "gt" ? ">" : "<");
  return `(${quoteIdent(c1)}::text ${op(op1)} ${p(v1)} or (${quoteIdent(c2)}::text = ${p(v2)} and ${quoteIdent(c3)}::text ${op(op3)} ${p(v3)}))`;
}

export async function createPGliteSupabase(db: PGlite): Promise<PGliteSupabase> {
  await db.exec(AUTH_STUB);
  await db.exec(lockSql);

  const names = new Map<string, string>(); // uuid → name
  const uuidOf = (name: string) => {
    const id = uuidFor(name);
    names.set(id, name);
    return id;
  };

  // One LISTEN for the whole database; channels filter by table.
  const listeners = new Set<(c: Change) => void>();
  await db.listen("solid_tree_changes", (payload) => {
    const change = JSON.parse(payload) as Change;
    listeners.forEach((l) => l(change));
  });

  /** Every request runs in its own transaction, as the user, under RLS. */
  const asUser = async <T>(uuid: string, claims: Row, fn: (tx: Transaction) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [
        uuid,
        JSON.stringify({ sub: uuid, role: "authenticated", ...claims }),
      ]);
      await tx.exec("set local role authenticated");
      return fn(tx);
    });

  const clientFor = (name: string, opts: { admin?: boolean } = {}): PGliteSupabaseClient => {
    const uuid = uuidOf(name);
    const claims = opts.admin ? { app_metadata: { app_admin: "true" } } : {};
    void db.query("insert into auth.users (id) values ($1) on conflict do nothing", [uuid]);
    const session = { access_token: `pglite-${name}`, user: { id: uuid, email: `${name}@demo.local` } };
    const run = <T>(fn: (tx: Transaction) => Promise<T>) => asUser(uuid, claims, fn);

    const from = (table: string) => {
      const where: string[] = [];
      const params: unknown[] = [];
      const order: string[] = [];
      let cols = "*";
      let limit: number | undefined;
      let offset: number | undefined;
      let mutation: { kind: "insert" | "update" | "delete"; values?: Row | Row[] } | undefined;
      const p = (v: unknown) => (params.push(v), `$${params.length}`);
      const q: any = {
        select: (c = "*") => ((cols = c === "*" ? "*" : c.split(",").map((x: string) => quoteIdent(x.trim())).join(", ")), q),
        eq: (c: string, v: unknown) => (where.push(`${quoteIdent(c)} = ${p(v)}`), q),
        is: (c: string, v: unknown) => (where.push(v === null ? `${quoteIdent(c)} is null` : `${quoteIdent(c)} is ${v ? "true" : "false"}`), q),
        gt: (c: string, v: unknown) => (where.push(`${quoteIdent(c)}::text > ${p(String(v))}`), q),
        lt: (c: string, v: unknown) => (where.push(`${quoteIdent(c)}::text < ${p(String(v))}`), q),
        or: (expr: string) => (where.push(orToSql(expr, params)), q),
        order: (c: string, o: { ascending?: boolean } = {}) => (order.push(`${quoteIdent(c)} ${o.ascending === false ? "desc" : "asc"}`), q),
        limit: (n: number) => ((limit = n), q),
        range: (a: number, b: number) => ((offset = a), (limit = b - a + 1), q),
        insert: (values: Row | Row[]) => ((mutation = { kind: "insert", values }), q),
        update: (values: Row) => ((mutation = { kind: "update", values }), q),
        delete: () => ((mutation = { kind: "delete" }), q),
        then: (resolve: (r: unknown) => void, reject?: (e: unknown) => void) => {
          const t = quoteIdent(table.includes(".") ? table : `public.${table}`);
          const w = where.length ? ` where ${where.join(" and ")}` : "";
          let sql: string;
          if (mutation?.kind === "insert") {
            const rows = Array.isArray(mutation.values) ? mutation.values : [mutation.values!];
            const keys = Object.keys(rows[0]);
            const values = rows.map((r) => `(${keys.map((k) => p(r[k])).join(", ")})`).join(", ");
            sql = `insert into ${t} (${keys.map(quoteIdent).join(", ")}) values ${values} returning *`;
          } else if (mutation?.kind === "update") {
            const sets = Object.entries(mutation.values as Row).map(([k, v]) => `${quoteIdent(k)} = ${p(v)}`);
            sql = `update ${t} set ${sets.join(", ")}${w} returning *`;
          } else if (mutation?.kind === "delete") {
            sql = `delete from ${t}${w} returning *`;
          } else {
            sql = `select ${cols} from ${t}${w}${order.length ? ` order by ${order.join(", ")}` : ""}${limit !== undefined ? ` limit ${limit}` : ""}${offset ? ` offset ${offset}` : ""}`;
          }
          run((tx) => tx.query<Row>(sql, params))
            .then((r) => ({ data: r.rows, error: null }), (e) => ({ data: null, error: { message: String(e?.message ?? e) } }))
            .then(resolve, reject);
        },
      };
      return q;
    };

    const rpc = async (fn: string, args: Row = {}) => {
      const keys = Object.keys(args);
      const named = keys.map((k, i) => `${quoteIdent(k)} => $${i + 1}`).join(", ");
      try {
        const r = await run((tx) => tx.query<Row>(`select * from public.${quoteIdent(fn)}(${named})`, keys.map((k) => args[k])));
        const row = r.rows[0];
        // void functions come back as one row with a single null column.
        const isVoid = !row || (Object.keys(row).length === 1 && Object.values(row)[0] === null && Object.keys(row)[0] === fn);
        return { data: isVoid ? null : row, error: null };
      } catch (e) {
        return { data: null, error: { message: String((e as Error)?.message ?? e) } };
      }
    };

    const channels = new Set<{ unlisten: () => void }>();
    return {
      from,
      rpc,
      auth: {
        getUser: async () => ({ data: { user: session.user }, error: null }),
        getSession: async () => ({ data: { session }, error: null }),
        onAuthStateChange: (cb: (event: string, s: typeof session) => void) => {
          queueMicrotask(() => cb("INITIAL_SESSION", session));
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
      },
      channel: (_topic: string) => {
        let handler: ((p: unknown) => void) | undefined;
        let filterTable = "";
        const ch: any = {
          on: (_event: string, filter: { schema?: string; table: string }, h: (p: unknown) => void) => {
            filterTable = `${filter.schema ?? "public"}.${filter.table}`;
            handler = h;
            return ch;
          },
          subscribe: () => {
            const l = (c: Change) => {
              if (c.table === filterTable) handler?.({ eventType: c.eventType, new: c.new ?? {}, old: c.old ?? {} });
            };
            listeners.add(l);
            ch.unlisten = () => listeners.delete(l);
            channels.add(ch);
            return ch;
          },
          unlisten: () => {},
        };
        return ch;
      },
      removeChannel: async (ch: { unlisten: () => void }) => {
        ch.unlisten();
        channels.delete(ch);
        return "ok";
      },
      // No REST endpoint: the lock's pagehide keepalive release is skipped (it checks for these).
      supabaseUrl: undefined,
      supabaseKey: undefined,
    };
  };

  return {
    db,
    clientFor,
    uuidOf,
    nameOf: (uuid) => (uuid ? (names.get(uuid) ?? null) : null),
    exec: async (sql) => {
      await db.exec(sql);
    },
    enableRealtime: async (table) => {
      const t = quoteIdent(table);
      const trig = quoteIdent(`${table.split(".").pop()}_solid_tree_realtime`);
      await db.exec(`drop trigger if exists ${trig} on ${t};
        create trigger ${trig} after insert or update or delete on ${t} for each row execute function public._solid_tree_notify();`);
    },
    installLock: async (table, opts = {}) => {
      await db.query(`select solid_tree.install_lock($1::regclass, prefix => $2, ttl => $3::interval, protect_updates => $4)`, [
        table,
        opts.prefix ?? "",
        opts.ttl ?? "2 minutes",
        opts.protectUpdates ?? false,
      ]);
      await db.exec(`grant select, insert, update, delete on ${quoteIdent(table)} to authenticated;`);
    },
  };
}
