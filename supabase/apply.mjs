// `npm run setup` — applies the lock schema + seeds rows. No psql, no dashboard
// paste. Uses SUPABASE_ACCESS_TOKEN (Management API, no DB password) or, if that's
// absent, SUPABASE_DB_URL. Idempotent. With SUPABASE_SERVICE_ROLE_KEY set, also
// creates two confirmed test users so the audit signs in with zero dashboard work.
import "./ws-polyfill.mjs";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { runSql, method } from "./run-sql.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
config({ path: join(HERE, ".env") });

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
// Tree dimensions: Region × Branch × Account. Default 10×10×20 = 2000 leaves.
const I = (k, d) => Math.max(1, Number(process.env[k] ?? d) | 0);
const [REGIONS, BRANCHES, ACCOUNTS] = [I("SEED_REGIONS", 10), I("SEED_BRANCHES", 10), I("SEED_ACCOUNTS", 20)];
// All forward migrations, in order (skip the *_down.sql teardown files).
const migrations = ["0001_scratch_lock.sql", "0002_scratch_outline.sql"];

try {
  for (const m of migrations) {
    console.log(`→ applying ${m} via ${method()} …`);
    await runSql(readFileSync(join(HERE, "migrations", m), "utf8"));
  }
  console.log(`→ seeding bank tree ${REGIONS}×${BRANCHES}×${ACCOUNTS} (${REGIONS * BRANCHES * ACCOUNTS} leaves)…`);
  await runSql(`select public.scratch_seed_tree(${REGIONS}, ${BRANCHES}, ${ACCOUNTS});`);
  console.log("→ seeding outline starter…");
  await runSql(`select public.outline_seed();`);
  console.log("✅ schema applied + seeded.");
} catch (e) {
  console.error("💥 schema apply failed:\n  " + e.message);
  process.exit(1);
}

// Optional: create confirmed test users via service-role (server-side only).
if (SUPABASE_SERVICE_ROLE_KEY && SUPABASE_URL) {
  console.log("→ ensuring confirmed test users (service-role)…");
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (const [email, password] of [
    [process.env.TEST_A_EMAIL ?? "scratch+a@example.com", process.env.TEST_A_PASS ?? "scratch-pass-A1!"],
    [process.env.TEST_B_EMAIL ?? "scratch+b@example.com", process.env.TEST_B_PASS ?? "scratch-pass-B1!"],
  ]) {
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error && !/already.*registered|already been registered|duplicate/i.test(error.message))
      console.warn(`  ⚠ ${email}: ${error.message}`);
    else console.log(`  ✓ ${email}`);
  }
} else {
  console.log(
    "ℹ no SUPABASE_SERVICE_ROLE_KEY — before `npm run audit`, turn OFF\n" +
      "  Auth → Providers → Email → \"Confirm email\" so test users can sign in."
  );
}

console.log("\nNext:  npm run audit");
