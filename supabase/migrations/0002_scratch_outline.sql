-- ============================================================================
-- SCRATCH collaborative outline — disposable. A MUTABLE tree: signed-in users add /
-- rename / remove nodes; changes broadcast over Realtime (INSERT/UPDATE/DELETE).
-- Separate table from scratch_lock_demo. Idempotent. Powers the ?outline demo.
--
-- Record locking (like the bank demo, but for structural edits): selecting a node
-- acquires its lock; rename/remove/add-child REFUSE when another user holds it — so a
-- node you're editing (or adding children to) can't be renamed or deleted out from under
-- you. Enforced server-side in the SECURITY DEFINER RPCs (RLS denies direct writes).
-- NOTE (scratch): no per-user ownership beyond the lock — fine for a demo, not prod authz.
-- ============================================================================

create table if not exists public.scratch_outline (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.scratch_outline(id) on delete cascade,
  label      text        not null,
  created_by uuid        references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  locked_by  uuid        references auth.users(id),
  locked_at  timestamptz
);
create index if not exists scratch_outline_parent_idx on public.scratch_outline(parent_id);

alter table public.scratch_outline add column if not exists locked_by uuid references auth.users(id);
alter table public.scratch_outline add column if not exists locked_at timestamptz;

-- Stored child count so a LAZY tree knows leaf-vs-parent WITHOUT loading children.
-- Maintained by a trigger; rides realtime UPDATE payloads → chevrons flip live.
alter table public.scratch_outline add column if not exists child_count int not null default 0;

create or replace function public.scratch_outline_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.parent_id is not null then
    update scratch_outline set child_count = child_count + 1 where id = new.parent_id;
  elsif tg_op = 'DELETE' and old.parent_id is not null then
    update scratch_outline set child_count = child_count - 1 where id = old.parent_id;
  end if;
  return null;
end $$;

drop trigger if exists scratch_outline_count_trg on public.scratch_outline;
create trigger scratch_outline_count_trg
  after insert or delete on public.scratch_outline
  for each row execute function public.scratch_outline_count();

-- Lock TTL helper: true when a row is held by SOMEONE ELSE and not expired.
create or replace function public.outline_held_by_other(_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from scratch_outline
    where id = _id and locked_by is not null and locked_by <> auth.uid()
      and locked_at >= now() - interval '2 minutes'
  );
$$;

-- ── lock RPCs (mirror the bank demo; one editor → one lock; "use it or lose it") ──
create or replace function public.outline_lock(_id uuid)
returns public.scratch_outline language plpgsql security definer set search_path = public as $$
declare r public.scratch_outline;
begin
  update scratch_outline set locked_by = auth.uid(), locked_at = now()
   where id = _id
     and (locked_by is null or locked_by = auth.uid() or locked_at < now() - interval '2 minutes')
  returning * into r;
  if r.id is not null then
    update scratch_outline set locked_by = null, locked_at = null
     where locked_by = auth.uid() and id <> _id;
  end if;
  return r;  -- null = held by someone else (refused)
end $$;

create or replace function public.outline_touch(_id uuid)
returns void language sql security definer set search_path = public as $$
  update scratch_outline set locked_at = now() where id = _id and locked_by = auth.uid();
$$;

create or replace function public.outline_unlock(_id uuid)
returns void language sql security definer set search_path = public as $$
  update scratch_outline set locked_by = null, locked_at = null where id = _id and locked_by = auth.uid();
$$;

create or replace function public.outline_unlock_all()
returns void language sql security definer set search_path = public as $$
  update scratch_outline set locked_by = null, locked_at = null where locked_by = auth.uid();
$$;

-- Seed a tiny starter outline (definer, so it works without insert RLS).
create or replace function public.outline_seed()
returns void language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  delete from scratch_outline;
  insert into scratch_outline(label, parent_id) values ('Roadmap', null) returning id into a;
  insert into scratch_outline(label, parent_id) values ('Q3 goals', a);
  insert into scratch_outline(label, parent_id) values ('Q4 goals', a);
  insert into scratch_outline(label, parent_id) values ('Notes', null);
end $$;

-- Add a child (or root when null). Refuses if the parent is held by another user.
create or replace function public.outline_add(_parent uuid, _label text)
returns public.scratch_outline language plpgsql security definer set search_path = public as $$
declare r public.scratch_outline;
begin
  if _parent is not null and outline_held_by_other(_parent) then return null; end if;
  insert into scratch_outline(parent_id, label, created_by)
  values (_parent, coalesce(nullif(trim(_label), ''), 'untitled'), auth.uid())
  returning * into r;
  return r;
end $$;

-- Rename. Refuses if the node is held by another user.
create or replace function public.outline_rename(_id uuid, _label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if outline_held_by_other(_id) then return; end if;
  update scratch_outline set label = coalesce(nullif(trim(_label), ''), label) where id = _id;
end $$;

-- Remove (cascade). SUBTREE-aware: refuses if the node OR any descendant is held by
-- another user — otherwise a parent delete would cascade away a child someone else has
-- locked. Returns true if removed, false if blocked.
drop function if exists public.outline_remove(uuid);  -- return type changed void→boolean
create or replace function public.outline_remove(_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if exists(
    with recursive sub as (
      select id, locked_by, locked_at from scratch_outline where id = _id
      union all
      select c.id, c.locked_by, c.locked_at
      from scratch_outline c join sub s on c.parent_id = s.id
    )
    select 1 from sub
    where locked_by is not null and locked_by <> auth.uid()
      and locked_at >= now() - interval '2 minutes'
  ) then
    return false;  -- node or a descendant is locked by another user
  end if;
  delete from scratch_outline where id = _id;
  return true;
end $$;

-- ADMIN force-release: clear ANY lock, admin only (app_metadata.app_admin in the JWT —
-- unforgeable). The testable core of the override; the Edge Function adds session-revoke.
create or replace function public.outline_admin_force_release(_id uuid)
returns public.scratch_outline language plpgsql security definer set search_path = public as $$
declare r public.scratch_outline;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'app_admin', 'false') <> 'true' then
    raise exception 'not authorized: admin only' using errcode = '42501';
  end if;
  update scratch_outline set locked_by = null, locked_at = null where id = _id returning * into r;
  return r;
end $$;

revoke all on function
  public.outline_seed(), public.outline_add(uuid, text), public.outline_rename(uuid, text),
  public.outline_remove(uuid), public.outline_held_by_other(uuid),
  public.outline_lock(uuid), public.outline_touch(uuid), public.outline_unlock(uuid),
  public.outline_unlock_all(), public.outline_admin_force_release(uuid)
  from public, anon;
grant execute on function
  public.outline_seed(), public.outline_add(uuid, text), public.outline_rename(uuid, text),
  public.outline_remove(uuid), public.outline_held_by_other(uuid),
  public.outline_lock(uuid), public.outline_touch(uuid), public.outline_unlock(uuid),
  public.outline_unlock_all(), public.outline_admin_force_release(uuid)
  to authenticated;

-- RLS: read for any authed (gates Realtime); NO direct writes — all via the RPCs.
alter table public.scratch_outline enable row level security;
drop policy if exists scratch_outline_read on public.scratch_outline;
create policy scratch_outline_read on public.scratch_outline
  for select to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.scratch_outline;
exception
  when duplicate_object then null;
  when undefined_object then raise notice 'enable Realtime for scratch_outline';
end $$;
