// Edge function: ADMIN force-release a lock on the collaborative OUTLINE (scratch_outline),
// and optionally revoke the holder's sessions. Same shape as force-release-lock but for the
// outline table. Deno runtime.
//
// SECURITY:
//   - Server-side ONLY. Uses the service-role key from the env Supabase injects
//     (SUPABASE_SERVICE_ROLE_KEY) — never in a browser.
//   - Gated: the caller's JWT must carry app_metadata.app_admin === true. Without a gate
//     anyone could clear anyone's lock.
//
// Deploy:  supabase functions deploy force-release-outline
// Call  :  POST { "id": "<row-uuid>", "revokeSessions": false, "holderId": "<uuid?>" }
//          Authorization: Bearer <an admin user's access token>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  const isAdmin = who.user.app_metadata?.app_admin === true; // same gate as the RPC
  if (!isAdmin) return json({ error: "not an admin" }, 403);

  // 2. Capture the CURRENT holder before clearing, then clear with the service-role client.
  const body = await req.json().catch(() => ({}));
  const id = body?.id as string | undefined;
  if (!id) return json({ error: "body.id required" }, 400);

  const { data: before } = await admin
    .from("scratch_outline").select("locked_by").eq("id", id).maybeSingle();
  const holder = (before as { locked_by: string | null } | null)?.locked_by ?? null;

  const { data: row, error } = await admin
    .from("scratch_outline")
    .update({ locked_by: null, locked_at: null })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);

  // 3. Optionally revoke the (former) holder's sessions. Kills refresh tokens; an already
  //    issued access token lives until exp (JWTs are stateless) — which is why the TTL exists.
  let revoked: string | null = null;
  if (body?.revokeSessions && holder) {
    const { error: soErr } = await admin.auth.admin.signOut(holder);
    if (!soErr) revoked = holder;
  }

  return json({ ok: true, released: id, holder, revoked });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
}
