-- Tear down the scratch outline. Paste into the SQL editor, or `npm run teardown`.
do $$
begin
  alter publication supabase_realtime drop table public.scratch_outline;
exception when others then null;
end $$;

drop trigger if exists scratch_outline_count_trg on public.scratch_outline;
drop function if exists public.scratch_outline_count();
drop function if exists public.outline_seed();
drop function if exists public.outline_add(uuid, text);
drop function if exists public.outline_rename(uuid, text);
drop function if exists public.outline_remove(uuid);
drop function if exists public.outline_held_by_other(uuid);
drop function if exists public.outline_lock(uuid);
drop function if exists public.outline_touch(uuid);
drop function if exists public.outline_unlock(uuid);
drop function if exists public.outline_unlock_all();
drop function if exists public.outline_admin_force_release(uuid);
drop table if exists public.scratch_outline;
