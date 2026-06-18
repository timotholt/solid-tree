# Supabase scratch — prove the lock subsystem on real Postgres

Disposable reference backing for `SupabaseTree.tsx`. Implements
[`docs/SPEC-locking.md`](../docs/SPEC-locking.md) against a live Supabase project so the
**security** (not just the UX) is verified before we build the component.

> **Secrets stay with you.** Nothing here needs your service-role key or DB password
> in chat. The schema is applied by *you* pasting SQL (or your own CLI). The test
> harness uses only the **public anon key**. The service-role key appears in **one**
> place — the Edge Function env that Supabase injects server-side — and **never** in a
> browser or repo.

## Files
| File | What |
|------|------|
| `migrations/0001_scratch_lock.sql` | table `scratch_lock_demo` + seed fn + acquire/touch/release/bump RPCs + RLS + Realtime publication (idempotent) |
| `migrations/0001_scratch_lock_down.sql` | tear it all down |
| `functions/force-release-lock/index.ts` | admin "use it or lose it" override (Edge, service-role, admin-gated) |
| `test/lock-audit.ts` | adversarial §8 audit — steal/clear/forge/edit denied, anon denied |

## 1. Apply the schema
Dashboard already open → **SQL Editor** → paste all of `0001_scratch_lock.sql` → Run.
Then seed:
```sql
select public.scratch_seed(200);
```
Confirm Realtime: **Database → Replication** → `supabase_realtime` includes
`scratch_lock_demo` (the migration adds it; flip on if not).

## 2. Let the test users sign in
**Auth → Providers → Email** → turn **OFF "Confirm email"** for this scratch project
(so `signUp` users can sign in immediately). Or pre-create two confirmed users and
pass their creds via env.

## 3. Run the adversarial audit
```bash
export SUPABASE_URL="https://hijohpdispprsxefeywp.supabase.co"
export SUPABASE_ANON_KEY="<your project anon key — public, safe>"
npx tsx supabase/test/lock-audit.ts     # or: deno run -A supabase/test/lock-audit.ts
```
Expect `✅ ALL PASS`. A 🔴 means a real security hole — read the line, fix the SQL,
re-run. (Anon key is the public `anon`/`publishable` key from **Settings → API** — NOT
service-role.)

## 4. (optional) Deploy the admin override
```bash
supabase functions deploy force-release-lock
```
Requires an admin user (`app_metadata.app_admin = true`). Clears any lock; can also
revoke the holder's sessions. Reminder: revoking kills refresh tokens but an already
issued access token lives until `exp` — which is why the TTL + lazy expiry exist.

## Teardown
Paste `0001_scratch_lock_down.sql` in the SQL Editor when done.

## Then → `SupabaseTree.tsx`
Once §3 is green, the component is thin: a `supabaseSource` (TreeSource) that maps
`select`→`getRoots`/`getChildren`, a realtime channel → `subscribe` (`TreeChange`),
and `createRecordLock` calling these exact RPCs. The tree stays a pure reflector; this
verified SQL is the contract it reflects.
