// `npm run setup` — applies the lock schema to your Supabase project and seeds
// rows. No psql, no dashboard paste. Reads supabase/.env. Idempotent: safe to
// re-run. With SUPABASE_SERVICE_ROLE_KEY set, also creates two confirmed test
// users so the audit can sign in with zero dashboard fiddling.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));
config({ path: join(HERE, ".env") });

const { SUPABASE_DB_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const SEED_ROWS = Number(process.env.SEED_ROWS ?? 200);

if (!SUPABASE_DB_URL || SUPABASE_DB_URL.includes("password@host")) {
  die(
    "SUPABASE_DB_URL is not set.\n" +
      "  1. cp .env.example .env\n" +
      "  2. Dashboard → Settings → Database → Connection string → URI → paste into SUPABASE_DB_URL\n"
  );
}

const migration = readFileSync(join(HERE, "migrations", "0001_scratch_lock.sql"), "utf8");

console.log("→ connecting to Postgres…");
const client = new pg.Client({ connectionString: SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  console.log("→ applying migration (table + RPCs + RLS + Realtime)…");
  await client.query(migration);
  console.log(`→ seeding ${SEED_ROWS} rows…`);
  await client.query("select public.scratch_seed($1)", [SEED_ROWS]);
  console.log("✅ schema applied + seeded.");
} catch (e) {
  die("schema apply failed:\n  " + e.message);
} finally {
  await client.end().catch(() => {});
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

function die(msg) {
  console.error("💥 " + msg);
  process.exit(1);
}
