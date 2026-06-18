// Adversarial lock audit — runs SPEC-locking.md §8 against your LIVE Supabase
// scratch table. Proves the SECURITY (not just the UX): user A cannot steal,
// clear, forge, or edit user B's lock; anon is denied; expiry works.
//
// Uses ONLY the public anon key + two throwaway test users. No service-role key.
//
// Reads supabase/.env automatically. Just:  npm run audit
// (Prereq: `npm run setup` first.)

import "../ws-polyfill.mjs";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const URL = need("SUPABASE_URL");
const ANON = need("SUPABASE_ANON_KEY");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const A = { email: env("TEST_A_EMAIL", "scratch+a@example.com"), password: env("TEST_A_PASS", "scratch-pass-A1!") };
const B = { email: env("TEST_B_EMAIL", "scratch+b@example.com"), password: env("TEST_B_PASS", "scratch-pass-B1!") };

let pass = 0, fail = 0;
const ok = (cond: boolean, name: string, detail = "") => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? "✅ PASS" : "🔴 FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

async function signIn(creds: { email: string; password: string }): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  let r = await c.auth.signInWithPassword(creds);
  if (r.error) {
    const up = await c.auth.signUp(creds);
    if (up.error) throw new Error(`auth failed for ${creds.email}: ${up.error.message}`);
    r = await c.auth.signInWithPassword(creds);
    if (r.error) throw new Error(
      `signed up ${creds.email} but cannot sign in — is "Confirm email" still ON? (${r.error.message})`
    );
  }
  return c;
}

// Create (or reuse) a confirmed user via service-role, return a signed-in client + id.
async function provision(
  admin: SupabaseClient,
  email: string,
  password: string,
  appMeta?: Record<string, unknown>
): Promise<{ id: string; client: SupabaseClient }> {
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    ...(appMeta ? { app_metadata: appMeta } : {}),
  } as any);
  if (error && !/already|registered|duplicate/i.test(error.message)) throw error;
  const client = await signIn({ email, password });
  const id = (await client.auth.getUser()).data.user!.id;
  return { id, client };
}

async function main() {
  console.log("→ signing in test users A and B (anon key only)…");
  const a = await signIn(A);
  const b = await signIn(B);
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });

  const aId = (await a.auth.getUser()).data.user!.id;
  const bId = (await b.auth.getUser()).data.user!.id;

  console.log("→ seeding rows…");
  await a.rpc("scratch_seed", { _n: 20 });
  const { data: rows, error: selErr } = await a.from("scratch_lock_demo").select("id").limit(1);
  if (selErr || !rows?.length) throw new Error("seed/select failed: " + (selErr?.message ?? "no rows"));
  const X = rows[0].id as string;

  // Ground truth: read X's real state as B (authenticated can select). A refused
  // RPC returns a NULL-composite that PostgREST serializes as an object of null
  // fields (NOT json null), so assert on the DB, never the RPC return shape.
  const read = async () =>
    (await b.from("scratch_lock_demo").select("locked_by,balance").eq("id", X).single()).data as
      | { locked_by: string | null; balance: number }
      | null;

  // B acquires X.
  const bAcq = await b.rpc("acquire_lock", { _id: X });
  ok((bAcq.data as any)?.locked_by === bId, "B can acquire a free lock");

  // §8 — every attempt below is user A against B's lock; assert via ground truth.
  await a.rpc("acquire_lock", { _id: X });
  ok((await read())?.locked_by === bId, "A cannot acquire B's lock (B still holds)");

  const aSteal = await a.from("scratch_lock_demo")
    .update({ locked_by: aId, locked_at: new Date().toISOString() }).eq("id", X).select();
  ok((aSteal.data?.length ?? 0) === 0 && (await read())?.locked_by === bId,
    "A cannot steal via direct UPDATE locked_by");

  await a.rpc("release_lock", { _id: X });
  ok((await read())?.locked_by === bId, "A's release_lock does NOT clear B's lock");

  const bal0 = Number((await read())?.balance ?? 0);
  await a.rpc("bump_balance", { _id: X, _delta: 999 });
  ok(Number((await read())?.balance) === bal0, "A cannot edit (bump_balance) a row it doesn't hold");

  const aData = await a.from("scratch_lock_demo").update({ balance: 999 }).eq("id", X).select();
  ok((aData.data?.length ?? 0) === 0 && Number((await read())?.balance) === bal0,
    "A cannot edit via direct UPDATE balance (RLS gates on holder)");

  const aForge = await a.from("scratch_lock_demo").update({ locked_by: bId }).eq("id", X).select();
  ok((aForge.data?.length ?? 0) === 0, "A cannot forge locked_by on a row it doesn't hold");

  const anonRead = await anon.from("scratch_lock_demo").select("id").limit(1);
  ok((anonRead.data?.length ?? 0) === 0 || !!anonRead.error, "anon (no JWT) cannot read records");
  const anonAcq = await anon.rpc("acquire_lock", { _id: X });
  ok(!!anonAcq.error || (await read())?.locked_by === bId, "anon cannot acquire a lock");

  // Holder CAN edit.
  await b.rpc("bump_balance", { _id: X, _delta: 100 });
  ok(Number((await read())?.balance) === bal0 + 100, "B (holder) CAN edit its own row");

  // Cleanup.
  await b.rpc("release_lock", { _id: X });

  // ── Tech-debt cases: need service-role for privileged setup (aging locks,
  //    minting racers, promoting an admin). Skipped with a notice if absent. ────
  if (!SERVICE) {
    console.log("\n⚠ SKIPPED (set SUPABASE_SERVICE_ROLE_KEY to run): expiry, race, admin force-release");
  } else {
    const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const readRow = async (id: string) =>
      (await admin.from("scratch_lock_demo").select("locked_by,balance").eq("id", id).single()).data as
        | { locked_by: string | null; balance: number }
        | null;

    // T1 — expiry-after-TTL grab: a lock older than the TTL is acquirable by anyone,
    //      and the stale holder can no longer edit.
    await admin.from("scratch_lock_demo").update({ locked_by: bId, locked_at: new Date().toISOString() }).eq("id", X);
    await admin.from("scratch_lock_demo").update({ locked_at: new Date(Date.now() - 5 * 60_000).toISOString() }).eq("id", X);
    await a.rpc("acquire_lock", { _id: X });
    ok((await readRow(X))?.locked_by === aId, "expiry: lock past TTL is grabbable by a new user");
    const balE = Number((await readRow(X))?.balance);
    await b.rpc("bump_balance", { _id: X, _delta: 500 });
    ok(Number((await readRow(X))?.balance) === balE, "expiry: the expired holder can no longer edit");
    await a.rpc("release_lock", { _id: X });

    // T2 — simultaneous-acquire race: N distinct users hit one free row at once;
    //      exactly one must win, every round.
    const N = 6;
    const racers = await Promise.all(
      Array.from({ length: N }, (_, i) => provision(admin, `scratch+r${i}@example.com`, `scratch-pass-R${i}!`))
    );
    const Y = ((await admin.from("scratch_lock_demo").select("id").neq("id", X).limit(1).single()).data as any).id as string;
    let raceFails = 0;
    for (let round = 0; round < 3; round++) {
      await admin.from("scratch_lock_demo").update({ locked_by: null, locked_at: null }).eq("id", Y);
      const res = await Promise.all(racers.map((r) => r.client.rpc("acquire_lock", { _id: Y })));
      const winners = res.filter((r, i) => (r.data as any)?.locked_by === racers[i].id).length;
      const dbHolder = (await readRow(Y))?.locked_by;
      if (winners !== 1 || !racers.some((r) => r.id === dbHolder)) raceFails++;
    }
    ok(raceFails === 0, "race: exactly one winner across 3 concurrent rounds", `${N} racers`);
    await admin.from("scratch_lock_demo").update({ locked_by: null, locked_at: null }).eq("id", Y);

    // T3 — admin force-release authorization: non-admin denied, admin clears any lock.
    const adminUser = await provision(admin, "scratch+admin@example.com", "scratch-pass-ADM1!", { app_admin: true });
    await admin.auth.admin.updateUserById(adminUser.id, { app_metadata: { app_admin: true } } as any);
    const adminClient = await signIn({ email: "scratch+admin@example.com", password: "scratch-pass-ADM1!" });
    await b.rpc("acquire_lock", { _id: X }); // B holds X again
    const nonAdmin = await a.rpc("admin_force_release", { _id: X });
    ok(!!nonAdmin.error && (await readRow(X))?.locked_by === bId, "admin: non-admin force-release DENIED");
    await adminClient.rpc("admin_force_release", { _id: X });
    ok((await readRow(X))?.locked_by == null, "admin: admin CAN force-release any lock");
  }

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "🔴 FAILURES"}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

function env(k: string, d: string) { return process.env[k] ?? d; }
function need(k: string) { const v = process.env[k]; if (!v) throw new Error(`env ${k} required`); return v; }

main().catch((e) => { console.error("💥", e.message); process.exit(1); });
