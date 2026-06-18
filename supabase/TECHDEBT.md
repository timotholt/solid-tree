# TECH DEBT — lock subsystem (RESOLVED ✅)

The adversarial audit (`npm run audit`) proves the **steady-state** lock guarantees
(steal/clear/forge/edit-without-hold + anon all denied, holder can edit) AND the three
edge cases that were previously uncovered. **15/15 green** against live Supabase.

> Status: ✅ all three automated in `test/lock-audit.ts` (the edge cases need
> `SUPABASE_SERVICE_ROLE_KEY` for privileged setup — aging locks, minting racers,
> promoting an admin; they auto-skip with a notice if it's absent). Re-run after any
> SQL change. Remaining manual-only item: deploying + smoke-testing the
> `force-release-lock` *Edge function* (its JWT session-revoke can't be unit-tested);
> the security-critical authorization is covered by the `admin_force_release` RPC test.

## 1. ✅ Expiry-after-TTL grab (the whole "use it or lose it" promise)
**Property:** a lock whose `locked_at` is older than the TTL must become acquirable by
anyone; the prior holder must lose the ability to edit.
**Why it must be fixed:** this IS the feature. If expiry doesn't actually free the row,
a user who walks away (or whose tab dies mid-heartbeat) locks the record **forever** —
collaboration deadlocks. If it frees too eagerly, two people edit at once → clobber.
**How to test:** B acquires X; force `locked_at = now() - interval '3 minutes'` (via
service-role or an RPC); assert A's `acquire_lock(X)` now succeeds AND B's subsequent
`bump_balance(X)` now fails. Also assert the `pg_cron` sweep (if enabled) nulls it and
fires a realtime event.

## 2. ✅ Simultaneous-acquire race (atomicity under contention)
**Property:** if A and B call `acquire_lock(X)` at the same instant on a free row,
**exactly one** wins; the other gets null. No interleaving yields two holders.
**Why it must be fixed:** the entire safety model assumes acquisition is atomic. A race
that lets both win = silent double-edit = data corruption, exactly what the lock exists
to prevent. The single-statement `UPDATE ... WHERE free/expired/mine RETURNING` should
be atomic, but that's a claim until it's tested under real concurrency.
**How to test:** fire N concurrent `acquire_lock(X)` from N clients on a freshly-freed
row (`Promise.all`); assert exactly one returns a non-null row with its own `locked_by`.
Repeat many rounds to shake out interleavings.

## 3. ✅ Service-role / admin override (force-release authorization)
**Property:** the `force-release-lock` Edge function clears any lock **only** for an
authorized admin; a normal authenticated user invoking it is rejected (403); the cleared
row fires a realtime event so clients drop the stale lock.
**Why it must be fixed:** the override is the escape hatch for stuck locks — but an
unauthorized override is itself a lock-theft / denial primitive. If the admin gate is
wrong, any user can force-release (or worse, the function leaks service-role behavior).
Also verify the documented JWT caveat: revoking sessions kills refresh tokens but an
already-issued access token stays valid until `exp`.
**How to test:** deploy the function; call as a non-admin → expect 403, lock unchanged;
call as an admin (`app_metadata.app_admin = true`) → lock cleared + realtime event seen.

---

All three are automated in `test/lock-audit.ts` (T1/T2/T3 after the §8 steady-state
checks). `admin_force_release(uuid)` RPC added to the migration as the testable core of
case 3. Keep this file honest: if you add a new lock behavior, add its adversarial test
before trusting it. See `../docs/SPEC-locking.md` §8.
