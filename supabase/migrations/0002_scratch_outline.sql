-- ============================================================================
-- SCRATCH collaborative outline — disposable. A MUTABLE tree: any signed-in user
-- can add / rename / remove nodes; every change broadcasts over Realtime
-- (INSERT/UPDATE/DELETE). Separate table from scratch_lock_demo so the demos don't
-- collide. Idempotent. Powers the ?outline demo.
-- NOTE (scratch): any authenticated user may mutate ANY node — fine for a demo, not a
-- production authz model. Real apps would gate on created_by / membership in the RPCs.
-- ============================================================================

create table if not exists public.scratch_outline (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.scratch_outline(id) on delete cascade,
  label      text        not null,
  created_by uuid        references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists scratch_outline_parent_idx on public.scratch_outline(parent_id);

-- Stored child count so a LAZY tree knows leaf-vs-parent WITHOUT loading children
-- (leaf = child_count = 0). Maintained by a trigger; because it's a real column it
-- rides realtime UPDATE payloads, so adding/removing a child flips the parent's chevron
-- LIVE on every client. This is the canonical lazy-tree pattern (vs. guessing).
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

-- Add a node (child of _parent, or a root when null). Returns the new row.
create or replace function public.outline_add(_parent uuid, _label text)
returns public.scratch_outline language plpgsql security definer set search_path = public as $$
declare r public.scratch_outline;
begin
  insert into scratch_outline(parent_id, label, created_by)
  values (_parent, coalesce(nullif(trim(_label), ''), 'untitled'), auth.uid())
  returning * into r;
  return r;
end $$;

-- Rename a node.
create or replace function public.outline_rename(_id uuid, _label text)
returns void language sql security definer set search_path = public as $$
  update scratch_outline set label = coalesce(nullif(trim(_label), ''), label) where id = _id;
$$;

-- Remove a node (cascade deletes its whole subtree).
create or replace function public.outline_remove(_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from scratch_outline where id = _id;
$$;

revoke all on function
  public.outline_seed(), public.outline_add(uuid, text),
  public.outline_rename(uuid, text), public.outline_remove(uuid)
  from public, anon;
grant execute on function
  public.outline_seed(), public.outline_add(uuid, text),
  public.outline_rename(uuid, text), public.outline_remove(uuid)
  to authenticated;

-- RLS: read for any authed (gates Realtime); NO direct writes — all mutations go
-- through the definer RPCs above.
alter table public.scratch_outline enable row level security;
drop policy if exists scratch_outline_read on public.scratch_outline;
create policy scratch_outline_read on public.scratch_outline
  for select to authenticated using (true);

-- Realtime so add/remove sync live.
do $$
begin
  alter publication supabase_realtime add table public.scratch_outline;
exception
  when duplicate_object then null;
  when undefined_object then raise notice 'enable Realtime for scratch_outline';
end $$;
