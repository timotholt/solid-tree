-- Tear down the scratch lock demo. Paste into the SQL editor and run.
do $$
begin
  alter publication supabase_realtime drop table public.scratch_lock_demo;
exception when others then null;
end $$;

-- select cron.unschedule('scratch-release-stale');  -- if you enabled the sweep

drop function if exists public.bump_balance(uuid, numeric);
drop function if exists public.acquire_lock(uuid);
drop function if exists public.touch_lock(uuid);
drop function if exists public.release_lock(uuid);
drop function if exists public.release_all_locks();
drop function if exists public.scratch_seed(int);
drop table if exists public.scratch_lock_demo;
