# Supabase scratch — prove the lock subsystem on real Postgres

Verifies [`docs/SPEC-locking.md`](../docs/SPEC-locking.md) against a live Supabase
project, so the **security** (not just the UX) is proven before we build
`SupabaseTree.tsx`. Disposable: one command to set up, one to tear down.

## Quick start (4 commands)

```bash
cd supabase
cp .env.example .env      # then open .env and fill in 3 values (see below)
npm install
npm run setup             # creates table + RPCs + RLS + Realtime, seeds rows
npm run audit             # adversarial security test → want "✅ ALL PASS"
```

That's it. No psql, no SQL-editor paste, no dashboard clicking.

### The 3 values in `.env`
Each has a comment in `.env.example` saying exactly where to click. All from your
Supabase dashboard → **Settings**:
1. `SUPABASE_URL` — Settings → API → Project URL
2. `SUPABASE_ANON_KEY` — Settings → API → anon **public** (safe, it's the browser key)
3. `SUPABASE_DB_URL` — Settings → Database → Connection string → URI (used once to
   create the table; has your DB password; stays in gitignored `.env`)

**Recommended 4th value** — `SUPABASE_SERVICE_ROLE_KEY` (Settings → API → service_role,
secret). If set, `npm run setup` auto-creates two confirmed test users and you can skip
the next paragraph entirely. It's server-side only, gitignored, never shipped to a browser.

**If you leave service_role blank:** before `npm run audit`, do one dashboard toggle —
Auth → Providers → Email → turn **OFF "Confirm email"** — so the test users can sign in.

## What `npm run audit` proves (SPEC §8)
As attacker **A**, against victim **B**'s lock — every one of these must be denied:
steal via `acquire_lock`, steal via direct `UPDATE locked_by`, clear B's lock via
`release_lock`, edit B's row via `bump_balance`, edit via direct `UPDATE balance`,
forge `locked_by`; plus anon can't read or acquire. And the holder **can** edit its own
row. A 🔴 line = a real security hole — fix the SQL in `migrations/`, `npm run reset`,
re-run.

## Commands
| Command | Does |
|---------|------|
| `npm run setup` | apply migration + seed (+ create test users if service_role set) |
| `npm run audit` | run the adversarial §8 security test |
| `npm run all`   | setup then audit |
| `npm run reset` | teardown then setup (after editing the SQL) |
| `npm run teardown` | drop everything |

## Files
| File | What |
|------|------|
| `migrations/0001_scratch_lock.sql` | `scratch_lock_demo` + seed fn + acquire/touch/release/bump RPCs (`SECURITY DEFINER`, `auth.uid()`-keyed) + RLS + Realtime publish (idempotent) |
| `migrations/0001_scratch_lock_down.sql` | teardown SQL |
| `apply.mjs` / `teardown.mjs` | run the SQL over a pg connection (no psql needed) |
| `test/lock-audit.ts` | the adversarial audit (anon key only) |
| `functions/force-release-lock/index.ts` | admin "use it or lose it" override (Edge, service-role, admin-gated) |

## (optional) admin override Edge function
```bash
supabase functions deploy force-release-lock
```
Lets an admin (`app_metadata.app_admin = true`) clear any lock and optionally revoke the
holder's sessions. Revoking kills refresh tokens, but an already-issued access token lives
until `exp` — which is why the lock TTL + lazy expiry exist.

## Secrets — where they live
| Secret | Where it's allowed |
|--------|--------------------|
| anon key | anywhere (it's public) |
| DB URL / service_role | gitignored `.env` on your machine, or the Edge env Supabase injects |
| service_role in a browser / committed file | **never** |

## Then → `SupabaseTree.tsx`
Once the audit is green, the component is thin: a `supabaseSource` (TreeSource) mapping
`select`→`getRoots`/`getChildren`, a realtime channel → `subscribe` (`TreeChange`), and
`createRecordLock` calling these exact RPCs. The tree stays a pure reflector; this
verified SQL is the contract it reflects.
