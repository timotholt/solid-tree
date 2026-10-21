import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Runs the real installer SQL in Postgres (PGlite: WASM, no Docker) against a stub of
// Supabase's auth schema. auth.uid()/auth.jwt() read session settings exactly like
// Supabase's do, so the RPC logic under test is the production SQL (PLAN P6, G7).

const installer = readFileSync(resolve(__dirname, "../../supabase/migrations/0003_solid_tree_lock.sql"), "utf8");
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const ADMIN = "00000000-0000-0000-0000-0000000000ad";

let db: PGlite;

const as = async (user: string | null, claims: Record<string, unknown> = {}) => {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user, ...claims })]);
};
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const holder = async (table: string, id: unknown) => (await one<{ locked_by: string | null }>(`select locked_by from ${table} where id = $1`, [id]))?.locked_by ?? null;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    insert into auth.users values ('${A}'), ('${B}'), ('${ADMIN}');
    create table public.documents (id uuid primary key, label text not null);
    insert into public.documents values
      ('10000000-0000-0000-0000-000000000001', 'one'),
      ('10000000-0000-0000-0000-000000000002', 'two'),
      ('10000000-0000-0000-0000-000000000003', 'three');
    create table public.tasks (id bigint primary key, title text);
    insert into public.tasks values (1, 'a'), (2, 'b');
    grant usage on schema public to authenticated;
    grant select, update on public.documents to authenticated;
  `);
  await db.exec(installer);
  await db.query("select solid_tree.install_lock('public.documents')");
  await db.query("select solid_tree.install_lock('public.tasks', prefix => 'tasks_', ttl => '5 minutes', protect_updates => true)");
  await db.exec("grant select, update on public.tasks to authenticated;");
}, 60_000);

const D1 = "10000000-0000-0000-0000-000000000001";
const D2 = "10000000-0000-0000-0000-000000000002";

describe("solid_tree.install_lock — generated RPCs", () => {
  it("adds the lock columns", async () => {
    const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'documents' order by 1")).rows.map((r) => r.column_name);
    expect(cols).toEqual(expect.arrayContaining(["locked_at", "locked_by"]));
  });

  it("acquire: first caller wins; a second caller gets a null row", async () => {
    await as(A);
    expect((await one<{ id: string; locked_by: string }>("select * from acquire_lock($1)", [D1]))!.locked_by).toBe(A);
    await as(B);
    expect((await one<{ id: string | null }>("select * from acquire_lock($1)", [D1]))!.id).toBeNull();
    expect(await holder("documents", D1)).toBe(A);
  });

  it("one lock per user: acquiring another record releases the first", async () => {
    await as(A);
    await db.query("select * from acquire_lock($1)", [D2]);
    expect(await holder("documents", D1)).toBeNull();
    expect(await holder("documents", D2)).toBe(A);
  });

  it("touch only refreshes the holder's lock", async () => {
    await db.query("update documents set locked_at = now() - interval '1 minute' where id = $1", [D2]);
    const before = (await one<{ locked_at: Date }>("select locked_at from documents where id = $1", [D2]))!.locked_at;
    await as(B);
    await db.query("select touch_lock($1)", [D2]);
    expect((await one<{ locked_at: Date }>("select locked_at from documents where id = $1", [D2]))!.locked_at).toEqual(before);
    await as(A);
    await db.query("select touch_lock($1)", [D2]);
    expect((await one<{ locked_at: Date }>("select locked_at from documents where id = $1", [D2]))!.locked_at > before).toBe(true);
  });

  it("an expired lock (past ttl) can be taken by someone else", async () => {
    await db.query("update documents set locked_at = now() - interval '3 minutes' where id = $1", [D2]);
    await as(B);
    expect((await one<{ locked_by: string }>("select * from acquire_lock($1)", [D2]))!.locked_by).toBe(B);
  });

  it("release: only the holder can release", async () => {
    await as(A);
    await db.query("select release_lock($1)", [D2]);
    expect(await holder("documents", D2)).toBe(B);
    await as(B);
    await db.query("select release_lock($1)", [D2]);
    expect(await holder("documents", D2)).toBeNull();
  });

  it("release_all_locks clears only the caller's locks", async () => {
    await as(A);
    await db.query("select * from acquire_lock($1)", [D1]);
    await as(B);
    await db.query("select * from acquire_lock($1)", [D2]);
    await db.query("select release_all_locks()");
    expect(await holder("documents", D2)).toBeNull();
    expect(await holder("documents", D1)).toBe(A);
  });

  it("admin_force_release: refused for non-admins, allowed with the admin claim", async () => {
    await as(B);
    await expect(db.query("select * from admin_force_release($1)", [D1])).rejects.toThrow(/admin only/);
    await as(ADMIN, { app_metadata: { app_admin: "true" } });
    await db.query("select * from admin_force_release($1)", [D1]);
    expect(await holder("documents", D1)).toBeNull();
  });

  it("grants: authenticated can execute, anon cannot", async () => {
    const can = async (role: string, fn: string) =>
      (await one<{ ok: boolean }>(`select has_function_privilege('${role}', '${fn}', 'execute') as ok`))!.ok;
    expect(await can("authenticated", "public.acquire_lock(uuid)")).toBe(true);
    expect(await can("anon", "public.acquire_lock(uuid)")).toBe(false);
    expect(await can("anon", "public.release_all_locks()")).toBe(false);
  });
});

describe("solid_tree.install_lock — options", () => {
  it("prefix + non-uuid id types: tasks_* functions over a bigint id coexist with the defaults", async () => {
    await as(A);
    expect((await one<{ locked_by: string }>("select * from tasks_acquire_lock($1)", [1]))!.locked_by).toBe(A);
    // A lock on a task does not release A's document lock (separate tables).
    await db.query("select * from acquire_lock($1)", [D1]);
    expect(await holder("tasks", 1)).toBe(A);
  });

  it("ttl option: a 4-minute-old task lock is still held (ttl 5 minutes)", async () => {
    await db.query("update tasks set locked_at = now() - interval '4 minutes' where id = 1");
    await as(B);
    expect((await one<{ id: string | null }>("select * from tasks_acquire_lock($1)", [1]))!.id).toBeNull();
  });

  it("protect_updates: only the holder may update rows (RLS)", async () => {
    await as(B);
    await db.exec("set role authenticated");
    const denied = await db.query("update tasks set title = 'hijack' where id = 1");
    await db.exec("reset role");
    expect(denied.affectedRows).toBe(0);
    await as(A);
    await db.exec("set role authenticated");
    const allowed = await db.query("update tasks set title = 'mine' where id = 1");
    await db.exec("reset role");
    expect(allowed.affectedRows).toBe(1);
  });

  it("protect_updates keeps reads working (permissive passthrough when RLS was off)", async () => {
    await as(B);
    await db.exec("set role authenticated");
    const rows = await db.query("select * from tasks");
    await db.exec("reset role");
    expect(rows.rows.length).toBe(2);
  });

  it("protect_updates never widens an existing RLS setup (restrictive only)", async () => {
    await db.exec(`
      create table public.notes (id int primary key, body text);
      insert into public.notes values (1, 'mine'), (2, 'theirs');
      alter table public.notes enable row level security;
      grant select, update on public.notes to authenticated;
      create policy own_note on public.notes for all to authenticated using (id = 1) with check (id = 1);
    `);
    await db.query("select solid_tree.install_lock('public.notes', prefix => 'notes_', protect_updates => true)");
    await as(A);
    await db.exec("set role authenticated");
    const visible = await db.query("select id from notes order by id");
    await db.exec("reset role");
    expect(visible.rows).toEqual([{ id: 1 }]); // the existing policy still applies; nothing widened
    await db.exec("set role authenticated");
    const notHeld = await db.query("update notes set body = 'x' where id = 1");
    await db.exec("reset role");
    expect(notHeld.affectedRows).toBe(0); // visible, but not locked by A → restrictive policy blocks
    await db.query("select * from notes_acquire_lock(1)");
    await db.exec("set role authenticated");
    const held = await db.query("update notes set body = 'x' where id = 1");
    await db.exec("reset role");
    expect(held.affectedRows).toBe(1);
  });

  it("is idempotent", async () => {
    await expect(db.query("select solid_tree.install_lock('public.documents')")).resolves.toBeTruthy();
  });

  it("rejects an unknown id column and a bad prefix", async () => {
    await expect(db.query("select solid_tree.install_lock('public.documents', id_column => 'nope')")).rejects.toThrow(/has no column nope/);
    await expect(db.query("select solid_tree.install_lock('public.documents', prefix => 'x; drop')")).rejects.toThrow(/prefix must match/);
  });
});
