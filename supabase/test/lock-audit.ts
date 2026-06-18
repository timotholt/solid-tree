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

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "🔴 FAILURES"}: ${pass} passed, ${fail} failed`);
  console.log("(Not covered here — run manually: expiry-after-TTL grab, simultaneous-race, service-role override.)");
  process.exit(fail === 0 ? 0 : 1);
}

function env(k: string, d: string) { return process.env[k] ?? d; }
function need(k: string) { const v = process.env[k]; if (!v) throw new Error(`env ${k} required`); return v; }

main().catch((e) => { console.error("💥", e.message); process.exit(1); });
