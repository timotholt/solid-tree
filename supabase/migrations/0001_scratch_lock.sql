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

-- 2. Seed helper (definer so a test client can populate without insert RLS) ────
create or replace function public.scratch_seed(_n int default 200)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from scratch_lock_demo;
  insert into scratch_lock_demo (label, balance)
  select 'Account ' || lpad(g::text, 4, '0'), 0
  from generate_series(0, greatest(_n, 1) - 1) g;
end $$;

-- 3. Lock RPCs — SECURITY DEFINER, keyed on auth.uid() (unforgeable) ──────────
-- Acquire: succeeds if free / expired / already mine. Atomic. Returns row or null.
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
revoke all on function
  public.acquire_lock(uuid), public.touch_lock(uuid),
  public.release_lock(uuid), public.bump_balance(uuid, numeric),
  public.scratch_seed(int)
  from public;
grant execute on function
  public.acquire_lock(uuid), public.touch_lock(uuid),
  public.release_lock(uuid), public.bump_balance(uuid, numeric),
  public.scratch_seed(int)
  to authenticated;

-- 5. RLS — read for all authed; NO direct writes (lock + data via RPC only) ────
alter table public.scratch_lock_demo enable row level security;

drop policy if exists scratch_read   on public.scratch_lock_demo;
drop policy if exists scratch_update on public.scratch_lock_demo;

-- Read: any authenticated user (scratch). This also gates Realtime events.
create policy scratch_read on public.scratch_lock_demo
  for select to authenticated using (true);

-- Direct UPDATE: holder-only, and lock columns must stay yours. This is a
-- belt-and-suspenders policy — real writes go through the definer RPCs, which
-- bypass RLS. A direct client UPDATE on a row you don't hold is invisible
-- (using-clause fails on the OLD row) => can't steal a free or held lock.
create policy scratch_update on public.scratch_lock_demo
  for update to authenticated
  using (locked_by = auth.uid())
  with check (locked_by = auth.uid());
-- (no INSERT / DELETE policies => anon and authed direct insert/delete denied)

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
