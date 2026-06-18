-- Tear down the scratch outline. Paste into the SQL editor, or `npm run teardown`.
do $$
begin
  alter publication supabase_realtime drop table public.scratch_outline;
exception when others then null;
end $$;

drop function if exists public.outline_seed();
drop function if exists public.outline_add(uuid, text);
drop function if exists public.outline_rename(uuid, text);
drop function if exists public.outline_remove(uuid);
drop table if exists public.scratch_outline;
