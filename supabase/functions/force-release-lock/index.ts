// Edge function: ADMIN force-release a lock (and optionally revoke the holder's
// sessions). The "use it or lose it" override for when someone walks away and the
// TTL sweep isn't fast enough. Deno runtime.
//
// SECURITY:
//   - Runs server-side ONLY. Uses the service-role key from the env Supabase
//     injects (SUPABASE_SERVICE_ROLE_KEY) — this key NEVER goes to the browser.
//   - Gate who may call this. Below: require the caller's JWT to carry an
//     `app_admin` claim. Adjust to your admin model. Without a gate, anyone could
//     clear anyone's lock — defeats the whole point.
//
// Deploy:  supabase functions deploy force-release-lock
// Call  :  POST { "id": "<row-uuid>", "revokeSessions": false }
//          Authorization: Bearer <an admin user's access token>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing bearer token" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Identify + authorize the caller from their JWT (verified by GoTrue).
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who.user) return json({ error: "invalid token" }, 401);
  const isAdmin = who.user.app_metadata?.app_admin === true; // same gate as the RPC
  if (!isAdmin) return json({ error: "not an admin" }, 403);

  // 2. Override with the service-role client (bypasses RLS). Capture the CURRENT holder
  //    before clearing, so session-revoke can target the actual holder (not a client hint).
  const body = await req.json().catch(() => ({}));
  const id = body?.id as string | undefined;
  if (!id) return json({ error: "body.id required" }, 400);

  const { data: before } = await admin
    .from("scratch_lock_demo").select("locked_by").eq("id", id).maybeSingle();
  const holder = (before as { locked_by: string | null } | null)?.locked_by ?? null;

  const { data: row, error } = await admin
    .from("scratch_lock_demo")
    .update({ locked_by: null, locked_at: null })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);

  // 3. Optionally revoke the (former) holder's sessions. Kills refresh tokens immediately,
  //    but an already-issued access token stays valid until exp (stateless JWT) — hence TTL.
  let revoked: string | null = null;
  if (body?.revokeSessions && holder) {
    const { error: soErr } = await admin.auth.admin.signOut(holder);
    if (!soErr) revoked = holder;
  }

  return json({ ok: true, released: id, holder, revoked });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { "content-type": "application/json" },
  });
}
