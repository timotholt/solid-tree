-- ============================================================================
-- solid-tree record locking — installable on ANY table (ANALYSIS G7).
--
--   select solid_tree.install_lock('public.documents');
--   select solid_tree.install_lock('public.tasks', prefix => 'tasks_', ttl => '5 minutes');
--
-- Adds `locked_by uuid` + `locked_at timestamptz` to the table and creates these
-- SECURITY DEFINER RPCs (names prefixed by `prefix`), callable by `authenticated` only:
--   acquire_lock(_id)        → the row if you now hold it, else a null row
--   touch_lock(_id)          → heartbeat (holder only)
--   release_lock(_id)        → release (holder only)
--   release_all_locks()      → release everything you hold
--   admin_force_release(_id) → clear any lock; requires app_metadata.<admin_claim> = true
-- Semantics match docs/SPEC-locking.md: one lock per user per table (acquiring releases
-- your others atomically), expiry after `ttl` without a heartbeat.
--
-- protect_updates => true adds a RESTRICTIVE row-level-security policy: only the current
-- holder may UPDATE a row. It narrows whatever policies exist and never widens access.
-- If the table did not use RLS yet, RLS is enabled together with a permissive policy that
-- keeps every other operation exactly as the table grants already allowed.
--
-- Idempotent: re-running replaces the functions with the same definitions.
-- Point the client at prefixed names with `lockRpc` (see README).
-- ============================================================================

create schema if not exists solid_tree;

create or replace function solid_tree.install_lock(
  _table          regclass,
  prefix          text     default '',
  ttl             interval default '2 minutes',
  id_column       name     default 'id',
  admin_claim     text     default 'app_admin',
  protect_updates boolean  default false
) returns void
language plpgsql
set search_path = public
as $install$
declare
  tbl        text := _table::text;
  id_type    text;
  rel_name   text;
  f_acquire  text := prefix || 'acquire_lock';
  f_touch    text := prefix || 'touch_lock';
  f_release  text := prefix || 'release_lock';
  f_all      text := prefix || 'release_all_locks';
  f_force    text := prefix || 'admin_force_release';
begin
  if prefix !~ '^[a-z0-9_]*$' then
    raise exception 'solid_tree.install_lock: prefix must match [a-z0-9_]*, got %', prefix;
  end if;

  select format_type(a.atttypid, a.atttypmod), c.relname
    into id_type, rel_name
    from pg_attribute a join pg_class c on c.oid = a.attrelid
   where a.attrelid = _table and a.attname = id_column and not a.attisdropped;
  if id_type is null then
    raise exception 'solid_tree.install_lock: % has no column %', tbl, id_column;
  end if;

  -- Columns + index
  execute format('alter table %s add column if not exists locked_by uuid references auth.users(id) on delete set null', tbl);
  execute format('alter table %s add column if not exists locked_at timestamptz', tbl);
  execute format('create index if not exists %I on %s (locked_by)', rel_name || '_locked_by_idx', tbl);

  -- acquire: free / expired / already mine → take it; then drop my other locks.
  execute format($f$
    create or replace function public.%1$I(_id %2$s) returns %3$s
    language plpgsql security definer set search_path = public as $body$
    declare r %3$s;
    begin
      update %3$s set locked_by = auth.uid(), locked_at = now()
       where %4$I = _id
         and (locked_by is null or locked_by = auth.uid() or locked_at < now() - %5$L::interval)
      returning * into r;
      if r.%4$I is not null then
        update %3$s set locked_by = null, locked_at = null
         where locked_by = auth.uid() and %4$I <> _id;
      end if;
      return r;  -- null row ⇒ held by someone else
    end $body$ $f$, f_acquire, id_type, tbl, id_column, ttl);

  execute format($f$
    create or replace function public.%1$I(_id %2$s) returns void
    language sql security definer set search_path = public as $body$
      update %3$s set locked_at = now() where %4$I = _id and locked_by = auth.uid();
    $body$ $f$, f_touch, id_type, tbl, id_column);

  execute format($f$
    create or replace function public.%1$I(_id %2$s) returns void
    language sql security definer set search_path = public as $body$
      update %3$s set locked_by = null, locked_at = null where %4$I = _id and locked_by = auth.uid();
    $body$ $f$, f_release, id_type, tbl, id_column);

  execute format($f$
    create or replace function public.%1$I() returns void
    language sql security definer set search_path = public as $body$
      update %2$s set locked_by = null, locked_at = null where locked_by = auth.uid();
    $body$ $f$, f_all, tbl);

  execute format($f$
    create or replace function public.%1$I(_id %2$s) returns %3$s
    language plpgsql security definer set search_path = public as $body$
    declare r %3$s;
    begin
      if coalesce(auth.jwt() -> 'app_metadata' ->> %5$L, 'false') <> 'true' then
        raise exception 'not authorized: admin only' using errcode = '42501';
      end if;
      update %3$s set locked_by = null, locked_at = null where %4$I = _id returning * into r;
      return r;
    end $body$ $f$, f_force, id_type, tbl, id_column, admin_claim);

  -- Grants: Supabase grants EXECUTE to anon by default privileges, so revoking from
  -- PUBLIC alone is not enough.
  execute format('revoke all on function public.%I(%s) from public, anon', f_acquire, id_type);
  execute format('revoke all on function public.%I(%s) from public, anon', f_touch, id_type);
  execute format('revoke all on function public.%I(%s) from public, anon', f_release, id_type);
  execute format('revoke all on function public.%I() from public, anon', f_all);
  execute format('revoke all on function public.%I(%s) from public, anon', f_force, id_type);
  execute format('grant execute on function public.%I(%s) to authenticated', f_acquire, id_type);
  execute format('grant execute on function public.%I(%s) to authenticated', f_touch, id_type);
  execute format('grant execute on function public.%I(%s) to authenticated', f_release, id_type);
  execute format('grant execute on function public.%I() to authenticated', f_all);
  execute format('grant execute on function public.%I(%s) to authenticated', f_force, id_type);

  if protect_updates then
    if not (select relrowsecurity from pg_class where oid = _table) then
      -- RLS was off: access came from grants alone. Keep that, then narrow updates.
      execute format('alter table %s enable row level security', tbl);
      execute format('drop policy if exists %I on %s', rel_name || '_grants_passthrough', tbl);
      execute format('create policy %I on %s as permissive for all to public using (true) with check (true)',
        rel_name || '_grants_passthrough', tbl);
    end if;
    execute format('drop policy if exists %I on %s', rel_name || '_holder_updates', tbl);
    execute format(
      'create policy %I on %s as restrictive for update to authenticated using (locked_by = auth.uid()) with check (locked_by = auth.uid())',
      rel_name || '_holder_updates', tbl);
  end if;
end
$install$;

comment on function solid_tree.install_lock is
  'Install solid-tree record locking on a table: columns, RPCs (optionally prefixed), grants, optional holder-only UPDATE policy.';

-- Only the migration owner (service role / postgres) installs locking.
revoke all on function solid_tree.install_lock(regclass, text, interval, name, text, boolean) from public;
