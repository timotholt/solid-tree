# Spec — collaborative record locking with `<DatabaseTree>` / `<SupabaseTree>`

> **Scope & boundary.** This describes the **app + database** subsystem that pairs
> with the tree for "one editor per record" collaboration. **None of this ships in
> `@timotholt/solid-tree`** — the tree only *reflects* lock state (via `payload`) and
> *triggers* acquisition (via `onSelect`). The enforcement is 100% your Postgres
> (RLS + `SECURITY DEFINER` RPCs). It is **security-critical**: done wrong = lock
> theft / data clobber. Build it deliberately, test it adversarially, ship it as one
> versioned unit (migrations + client helper + tests). Do **not** improvise it.

> **Verification caveat.** The security only exists when RLS + RPC + JWT run together
> on **real Postgres**. In-memory demos (`?database2`) simulate the UX, NOT the
> security. "Correct" = the adversarial tests (below) pass against a **live Supabase
> project**.

---

## 1. Model — "use it or lose it"
- Selecting a record **acquires** a lock for the current user (atomic).
- Moving the cursor elsewhere / explicit release **releases** it.
- A held lock is valid only while **fresh**: `locked_at > now() - TTL`. An idle/closed
  client stops heart­beating → the lock **expires** → others may take it.
- Enforcement is server-side; the UI is advisory only.

**Params (tune):** `TTL = 2 min`, `heartbeat = 30s` (only while focused + recently
active), `expiry sweep = 1 min` (pg_cron).

---

## 2. Schema (on your record table)
```sql
alter table records
  add column locked_by  uuid references auth.users(id),
  add column locked_at  timestamptz;
create index on records (locked_by);
```

## 3. Lock RPCs — `SECURITY DEFINER`, keyed on `auth.uid()`
Lock changes go **only** through these (never a direct client UPDATE of the lock
columns — see RLS). `auth.uid()` comes from the signed JWT and cannot be forged.

```sql
-- Acquire: succeeds if free / expired / already mine. Atomic; returns the row or null.
create or replace function acquire_lock(_id uuid)
returns records language plpgsql security definer set search_path = public as $$
declare r records;
begin
  update records
     set locked_by = auth.uid(), locked_at = now()
   where id = _id
     and (locked_by is null or locked_by = auth.uid()
          or locked_at < now() - interval '2 minutes')
  returning * into r;
  return r;   -- null = held by someone else (refused)
end $$;

-- Heartbeat: only the holder can refresh; cheap.
create or replace function touch_lock(_id uuid)
returns void language sql security definer set search_path = public as $$
  update records set locked_at = now()
   where id = _id and locked_by = auth.uid();
$$;

-- Release: you can only release your OWN lock.
create or replace function release_lock(_id uuid)
returns void language sql security definer set search_path = public as $$
  update records set locked_by = null, locked_at = null
   where id = _id and locked_by = auth.uid();
$$;

revoke all on function acquire_lock(uuid), touch_lock(uuid), release_lock(uuid) from public;
grant execute on function acquire_lock(uuid), touch_lock(uuid), release_lock(uuid) to authenticated;
```

## 4. RLS — deny direct lock writes; gate edits on ownership
```sql
alter table records enable row level security;

-- Read: your existing scope (also gates Realtime events).
create policy read_records on records for select to authenticated using ( /* your scope */ true );

-- Edit data: only the lock holder, AND the row's lock columns must be unchanged by
-- the client (lock changes happen ONLY via the RPCs above).
create policy edit_owned on records for update to authenticated
  using ( locked_by = auth.uid() )
  with check ( locked_by = auth.uid() );
```
> Because Postgres RLS is row- not column-level, the safe pattern is: **the RPCs (definer)
> own the lock columns; the table UPDATE policy is for data and requires you already
> hold the lock.** A normal client UPDATE that tries to change `locked_by` is rejected
> (the `with check` keeps `locked_by = auth.uid()`, and acquisition isn't a client UPDATE
> path). Anon has no policy → denied entirely.

## 5. Expiry — `pg_cron` (makes the unlock appear by itself)
```sql
select cron.schedule('release-stale-locks', '* * * * *', $$
  update records set locked_by = null, locked_at = null
  where locked_at < now() - interval '2 minutes' $$);
```
The `UPDATE` fires Realtime `postgres_changes` → every client drops the stale 🔒
without anyone re-acquiring. (Lazy alternative: it clears when someone next acquires.)

## 6. Client helper (`createRecordLock`) — wires to the tree
Lives in your app / a `supabase-collab-kit`, **not** the package.
```ts
const lock = createRecordLock({ client, user: session.user.id, ttlMs: 120_000, heartbeatMs: 30_000 });
// acquire(id): rpc('acquire_lock') → true/false (false = held by someone else)
// release():   rpc('release_lock') for current held id
// starts/stops a heartbeat (rpc('touch_lock')) gated on document.hasFocus() + recent activity
// emits 'lockLost' when a heartbeat fails or realtime shows locked_by moved off you
```
Wiring (the tree's existing props — no new component API):
- `onSelect={(n) => n.payload.leaf ? lock.acquire(n.id) : lock.release()}`
- `renderActionNode={(n) => lockBadge(n.payload.locked_by, user)}` → 🔒 / 👤
- `subscribe` (Supabase realtime) already patches `payload.locked_by` live.
- On `lockLost`: **warn + discard the user's unsaved edits** (don't clobber on a stale save).

## 7. Security model (the guarantees)
- **`auth.uid()` is unforgeable** (signed JWT) → no impersonation.
- Lock writes only via definer RPCs that force `locked_by = auth.uid()` and check
  free/expired/own → **can't steal, can't clear someone else's, can't forge owner**.
- Data edits require holding the lock (RLS) → **can't edit unheld records**.
- Anon denied; Realtime read-gated by RLS → **can't even see locks out of scope**.
- Service-role (Edge Function) can force-override — **admin only, gated**.

## 8. Adversarial test checklist — RUN ON REAL SUPABASE
As **user A**, with **user B** holding a lock on record X:
- [ ] `acquire_lock(X)` → returns null (refused). 🔴 if A gets it.
- [ ] direct `update records set locked_by=A where id=X` → rejected by RLS. 🔴 if it works.
- [ ] `release_lock(X)` → no-op (A isn't holder). 🔴 if B's lock clears.
- [ ] `update records set <data> where id=X` → rejected (A doesn't hold). 🔴 if it writes.
- [ ] forge: `update set locked_by=B` as A → rejected.
- [ ] anon (no JWT) → any read/write to records denied.
- [ ] expiry: let B's `locked_at` age past TTL → A's `acquire_lock(X)` now succeeds.
- [ ] race: A and B `acquire_lock(X)` simultaneously → exactly one row returned non-null.
- [ ] Realtime: A subscribed → receives X's lock change ONLY if A can SELECT X.
- [ ] service-role override clears any lock; a normal user cannot invoke that path.

## 9. Failure modes (all misconfiguration)
- Broad UPDATE policy letting any authed user write `locked_by` → theft.
- Trusting a client-supplied user id instead of `auth.uid()` → impersonation.
- Service-role key in the browser → bypasses everything (never ship it).
- RLS disabled on the table → wide open.
- Lock columns left client-writable (no definer RPC) → theft via direct UPDATE.

## 10. Build & verify order
1. Migration: columns + RPCs + RLS + pg_cron (one versioned file).
2. Enable Realtime on the table (publication).
3. `createRecordLock` client helper + `lockBadge`; wire to the tree.
4. **Run §8 against a live Supabase project.** Don't trust it until those pass.
5. Pin RPC signatures ⇄ client calls together; a drift should fail a test, not prod.

---

**Bottom line:** the tree reflects (`payload.locked_by`) and triggers (`onSelect`);
**Postgres enforces** (RLS + definer RPCs on `auth.uid()`). Treat this like auth —
versioned, adversarially tested on real Supabase, never improvised.
