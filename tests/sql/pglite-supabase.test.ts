import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createRoot } from "solid-js";
import { QueryClient } from "@tanstack/solid-query";
import { createPGliteSupabase, type PGliteSupabase } from "../../src/testing.js";
import { createSupabaseTreeController } from "../../src/supabase/controller.js";
import { supabaseSource } from "../../src/supabase/source.js";

// The in-browser Supabase double: real lock SQL + RLS + triggers, driven through the
// real supabaseSource / lock client / controller. Two users, one database.

let sb: PGliteSupabase;
const until = async (cond: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
};
const toNode = (r: Record<string, any>) => ({ id: r.id, label: r.title, type: "doc", payload: { leaf: !r.has_children, locked_by: r.locked_by } });

beforeAll(async () => {
  sb = await createPGliteSupabase(new PGlite());
  await sb.exec(`
    create table public.docs (id text primary key, title text not null, parent_id text references public.docs(id), has_children boolean default false);
    insert into public.docs values ('plan', 'Q3 plan', null, true), ('budget', 'Budget', 'plan', false), ('hiring', 'Hiring', 'plan', false);
  `);
  await sb.enableRealtime("public.docs");
  await sb.installLock("public.docs", { ttl: "2 seconds" });
}, 60_000);

function mount(user: string, admin = false) {
  let dispose!: () => void;
  const t = createRoot((d) => {
    dispose = d;
    return createSupabaseTreeController({
      client: sb.clientFor(user, { admin }),
      table: "docs",
      parentColumn: "parent_id",
      toNode,
      queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
      heartbeatMs: 200,
    });
  });
  return Object.assign(t, { dispose });
}

describe("createPGliteSupabase", () => {
  it("serves a table through the real supabaseSource (roots, children, keyset order)", async () => {
    const src = supabaseSource({ client: sb.clientFor("reader"), table: "docs", parentColumn: "parent_id", toNode, realtime: false });
    expect((await src.getRoots()).map((n) => n.id)).toEqual(["plan"]);
    expect((await src.getChildren!({ id: "plan", label: "", type: "doc" })).map((n) => n.id)).toEqual(["budget", "hiring"]);
  });

  it("locks: Alice acquires, Bob is refused, Bob sees Alice's lock arrive by realtime", async () => {
    const alice = mount("alice");
    const bob = mount("bob");
    await until(() => alice.flatRows().length > 0 && bob.flatRows().length > 0);
    bob.expand("plan");
    await until(() => bob.index().has("budget"));
    expect(await alice.acquireLock("budget")).toBe(true);
    expect(alice.heldId()).toBe("budget");
    expect(await bob.acquireLock("budget")).toBe(false);
    await until(() => bob.index().get("budget")?.payload?.locked_by === sb.uuidOf("alice"));
    expect(sb.nameOf(bob.index().get("budget")!.payload!.locked_by)).toBe("alice");
    await alice.releaseLock();
    expect(await bob.acquireLock("budget")).toBe(true);
    await bob.releaseLock();
    alice.dispose();
    bob.dispose();
  });

  it("use it or lose it: a lock without heartbeats expires after the TTL", async () => {
    const alice = mount("alice");
    const bob = mount("bob");
    await until(() => alice.flatRows().length > 0);
    expect(await alice.acquireLock("hiring")).toBe(true);
    // Simulate Alice's laptop going to sleep: age the lock past the TTL.
    await sb.exec(`update public.docs set locked_at = now() - interval '5 seconds' where id = 'hiring'`);
    expect(await bob.acquireLock("hiring")).toBe(true);
    await bob.releaseLock();
    alice.dispose();
    bob.dispose();
  });

  it("row-level security applies to plain queries (they run as 'authenticated')", async () => {
    const c = sb.clientFor("eve");
    const { data } = await c.from("docs").select("*");
    expect(data.length).toBe(3);
    const denied = await c.from("auth.users").select("*");
    expect(denied.error).not.toBeNull();
  });

  it("admin force-release requires the admin claim", async () => {
    const holder = sb.clientFor("carol");
    await holder.rpc("acquire_lock", { _id: "plan" });
    expect((await sb.clientFor("dave").rpc("admin_force_release", { _id: "plan" })).error?.message).toMatch(/admin only/);
    expect((await sb.clientFor("root", { admin: true }).rpc("admin_force_release", { _id: "plan" })).error).toBeNull();
    const { data } = await holder.from("docs").select("locked_by").eq("id", "plan");
    expect(data[0].locked_by).toBeNull();
  });
});

afterAll(async () => {
  await sb.db.close();
});
