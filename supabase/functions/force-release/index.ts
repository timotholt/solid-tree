// Edge function: ADMIN force-release a lock on ANY whitelisted table, and optionally revoke
// the holder's sessions. One generic function for every lock-bearing table — attach a new
// table by adding its name to ALLOWED_TABLES below (it just needs locked_by / locked_at
// columns). Deno runtime.
//
// SECURITY:
//   - Server-side ONLY. Uses the service-role key Supabase injects
//     (SUPABASE_SERVICE_ROLE_KEY) — never in a browser.
//   - The caller's JWT must carry app_metadata.app_admin === true (same gate as the
//     *_admin_force_release RPCs). Without a gate anyone could clear anyone's lock.
//   - ALLOWED_TABLES is a hard whitelist: a service-role client could otherwise null
//     `locked_by` on ANY table that has the column. NEVER take the table name unchecked.
//
// Deploy:  supabase functions deploy force-release
// Call  :  POST { "table": "scratch_outline", "id": "<uuid>", "revokeSessions": false }
//          Authorization: Bearer <an admin user's access token>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Whitelist of lock-bearing tables. Add a new table here to support it (one line).
const ALLOWED_TABLES = new Set(["scratch_lock_demo", "scratch_outline"]);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing bearer token" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Authorize the caller from their verified JWT.
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who.user) return json({ error: "invalid token" }, 401);
  if (who.user.app_metadata?.app_admin !== true) return json({ error: "not an admin" }, 403);

  // 2. Validate inputs (table MUST be whitelisted).
  const body = await req.json().catch(() => ({}));
  const table = body?.table as string | undefined;
  const id = body?.id as string | undefined;
  if (!id || !table || !ALLOWED_TABLES.has(table)) {
    return json({ error: "body.id and an allowed body.table are required" }, 400);
  }

  // 3. Capture the current holder BEFORE clearing, then clear (service-role bypasses RLS).
  const { data: before } = await admin.from(table).select("locked_by").eq("id", id).maybeSingle();
  const holder = (before as { locked_by: string | null } | null)?.locked_by ?? null;

  const { data: row, error } = await admin
    .from(table)
    .update({ locked_by: null, locked_at: null })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);

  // 4. Optionally revoke the (former) holder's sessions. Kills refresh tokens; an already
  //    issued access token lives until exp (stateless JWT) — which is why the TTL exists.
  let revoked: string | null = null;
  if (body?.revokeSessions && holder) {
    const { error: soErr } = await admin.auth.admin.signOut(holder);
    if (!soErr) revoked = holder;
  }

  return json({ ok: true, table, released: id, holder, revoked });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
}
