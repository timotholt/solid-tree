-- ============================================================================
-- SCRATCH lock demo — disposable. Mirrors docs/SPEC-locking.md exactly.
-- Apply: paste this whole file into the Supabase SQL editor and run.
-- Tear down with 0001_scratch_lock_down.sql when done.
-- Table name is deliberately ugly + namespaced so it can never be mistaken for
-- a real table. Idempotent: safe to re-run.
-- ============================================================================

-- 1. Table ───────────────────────────────────────────────────────────────────
create table if not exists public.scratch_lock_demo (
  id        uuid primary key default gen_random_uuid(),
  label     text        not null,
  balance   numeric      not null default 0,
  locked_by uuid         references auth.users(id),
  locked_at timestamptz
);
create index if not exists scratch_lock_demo_locked_by_idx
  on public.scratch_lock_demo (locked_by);

-- Self-reference for hierarchy: roots have parent_id IS NULL. kind marks whether a
-- row is an expandable 'group' or a 'leaf'. (Added idempotently so re-runs are safe.)
alter table public.scratch_lock_demo
  add column if not exists parent_id uuid references public.scratch_lock_demo(id) on delete cascade;
alter table public.scratch_lock_demo
  add column if not exists kind text not null default 'leaf';
create index if not exists scratch_lock_demo_parent_idx
  on public.scratch_lock_demo (parent_id);

-- 2. Seed helper (definer so a test client can populate without insert RLS) ────
create or replace function public.scratch_seed(_n int default 200)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from scratch_lock_demo;
  insert into scratch_lock_demo (label, balance)
  select 'Account ' || lpad(g::text, 4, '0'), 0
  from generate_series(0, greatest(_n, 1) - 1) g;
end $$;

-- Seed a 3-level hierarchy: Region → Branch → Account(leaf). Lockable leaves only.
create or replace function public.scratch_seed_tree(
  _regions int default 10, _branches int default 10, _accounts int default 20)
returns void language plpgsql security definer set search_path = public as $$
declare r int; b int; a int; rid uuid; bid uuid;
begin
  delete from scratch_lock_demo;
  for r in 0.._regions - 1 loop
    insert into scratch_lock_demo(label, kind, parent_id)
      values ('Region ' || lpad(r::text, 2, '0'), 'group', null) returning id into rid;
    for b in 0.._branches - 1 loop
      insert into scratch_lock_demo(label, kind, parent_id)
        values ('Branch ' || lpad(r::text,2,'0') || '-' || lpad(b::text,2,'0'), 'group', rid)
        returning id into bid;
      for a in 0.._accounts - 1 loop
        -- full path so it's unambiguous: region-branch-account, e.g. "Account 01-01-0001"
        insert into scratch_lock_demo(label, kind, parent_id, balance)
          values ('Account ' || lpad(r::text,2,'0') || '-' || lpad(b::text,2,'0') || '-' || lpad(a::text,4,'0'),
                  'leaf', bid, 0);
      end loop;
    end loop;
  end loop;
end $$;

-- 3. Lock RPCs — SECURITY DEFINER, keyed on auth.uid() (unforgeable) ──────────
-- Acquire: succeeds if free / expired / already mine. Atomic. Returns row or null.
-- One editor → one lock: on success, release any OTHER row this user still holds
-- (so a refresh — which loses client-side lock state — can't strand the old lock).
create or replace function public.acquire_lock(_id uuid)
returns public.scratch_lock_demo
language plpgsql security definer set search_path = public as $$
declare r public.scratch_lock_demo;
begin
  update scratch_lock_demo
     set locked_by = auth.uid(), locked_at = now()
   where id = _id
     and (locked_by is null
          or locked_by = auth.uid()
          or locked_at < now() - interval '2 minutes')
  returning * into r;
  if r.id is not null then
    update scratch_lock_demo set locked_by = null, locked_at = null
     where locked_by = auth.uid() and id <> _id;
  end if;
  return r;   -- null row => held by someone else (refused)
end $$;

-- Heartbeat: only the holder can refresh.
create or replace function public.touch_lock(_id uuid)
returns void language sql security definer set search_path = public as $$
  update scratch_lock_demo set locked_at = now()
   where id = _id and locked_by = auth.uid();
$$;

-- Release: only your own lock.
create or replace function public.release_lock(_id uuid)
returns void language sql security definer set search_path = public as $$
  update scratch_lock_demo set locked_by = null, locked_at = null
   where id = _id and locked_by = auth.uid();
$$;

-- Release every lock this user holds — clean slate on page load / sign-out.
create or replace function public.release_all_locks()
returns void language sql security definer set search_path = public as $$
  update scratch_lock_demo set locked_by = null, locked_at = null
   where locked_by = auth.uid();
$$;

-- ADMIN force-release: clear ANY lock, but only for an admin (app_metadata.app_admin
-- in the caller's JWT). Non-admins get an exception — this is the testable core of the
-- "use it or lose it" override (the Edge fn additionally revokes sessions, which an RPC
-- can't do). auth.jwt() is the verified JWT, so the admin claim is unforgeable.
create or replace function public.admin_force_release(_id uuid)
returns public.scratch_lock_demo
language plpgsql security definer set search_path = public as $$
declare r public.scratch_lock_demo;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'app_admin', 'false') <> 'true' then
    raise exception 'not authorized: admin only' using errcode = '42501';
  end if;
  update scratch_lock_demo set locked_by = null, locked_at = null
   where id = _id returning * into r;
  return r;
end $$;

-- Edit data: holder-only money move (proves RLS gates edits, not just UI).
create or replace function public.bump_balance(_id uuid, _delta numeric)
returns public.scratch_lock_demo
language plpgsql security definer set search_path = public as $$
declare r public.scratch_lock_demo;
begin
  update scratch_lock_demo
     set balance = balance + _delta
   where id = _id and locked_by = auth.uid()
  returning * into r;
  return r;   -- null => you don't hold the lock (refused)
end $$;

-- 4. Grants — RPCs callable by signed-in users only; revoke from anon/public ───
-- NOTE: Supabase auto-grants function EXECUTE to anon + authenticated via default
-- privileges, so revoking from PUBLIC alone is NOT enough — anon keeps its own
-- grant. Revoke from anon explicitly, then grant only to authenticated.
revoke all on function
  public.acquire_lock(uuid), public.touch_lock(uuid),
  public.release_lock(uuid), public.release_all_locks(),
  public.admin_force_release(uuid),
  public.bump_balance(uuid, numeric),
  public.scratch_seed(int), public.scratch_seed_tree(int, int, int)
  from public, anon;
grant execute on function
  public.acquire_lock(uuid), public.touch_lock(uuid),
  public.release_lock(uuid), public.release_all_locks(),
  public.admin_force_release(uuid),
  public.bump_balance(uuid, numeric),
  public.scratch_seed(int), public.scratch_seed_tree(int, int, int)
  to authenticated;

-- 5. RLS — read for all authed; NO direct writes (lock + data via RPC only) ────
alter table public.scratch_lock_demo enable row level security;

drop policy if exists scratch_read   on public.scratch_lock_demo;
drop policy if exists scratch_update on public.scratch_lock_demo;

-- Read: any authenticated user (scratch). This also gates Realtime events.
create policy scratch_read on public.scratch_lock_demo
  for select to authenticated using (true);

-- NO direct INSERT/UPDATE/DELETE policies → ALL writes go through the SECURITY DEFINER
-- RPCs (which bypass RLS). This is stricter than a holder-only UPDATE policy: even the
-- lock HOLDER can't directly write balance or forge locked_at to extend their own TTL —
-- balance changes only via bump_balance, lock columns only via acquire/touch/release.

-- 6. Realtime — publish row changes so collaborators see locks live ───────────
do $$
begin
  alter publication supabase_realtime add table public.scratch_lock_demo;
exception
  when duplicate_object then null;   -- already in the publication
  when undefined_object then
    raise notice 'supabase_realtime publication missing — enable Realtime in dashboard';
end $$;

-- 7. Stale-lock sweep — OPTIONAL (lazy expiry in acquire_lock already covers
--    correctness). Enable pg_cron extension first, then uncomment:
-- select cron.schedule('scratch-release-stale', '* * * * *', $$
--   update public.scratch_lock_demo set locked_by = null, locked_at = null
--   where locked_at < now() - interval '2 minutes' $$);

-- Done. Seed rows:  select public.scratch_seed(200);
