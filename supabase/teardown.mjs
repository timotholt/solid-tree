// `npm run teardown` — drops the scratch table, RPCs, and Realtime entry.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
config({ path: join(HERE, ".env") });

const { SUPABASE_DB_URL } = process.env;
if (!SUPABASE_DB_URL || SUPABASE_DB_URL.includes("password@host")) {
  console.error("💥 SUPABASE_DB_URL not set (see .env).");
  process.exit(1);
}

const sql = readFileSync(join(HERE, "migrations", "0001_scratch_lock_down.sql"), "utf8");
const client = new pg.Client({ connectionString: SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  console.log("→ tearing down scratch_lock_demo…");
  await client.query(sql);
  console.log("✅ removed.");
} catch (e) {
  console.error("💥 teardown failed: " + e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
