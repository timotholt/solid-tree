// `npm run teardown` — drops the scratch table, RPCs, and Realtime entry.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runSql, method } from "./run-sql.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(HERE, "migrations", "0001_scratch_lock_down.sql"), "utf8");

try {
  console.log("→ teardown via " + method() + " …");
  await runSql(sql);
  console.log("✅ removed.");
} catch (e) {
  console.error("💥 teardown failed: " + e.message);
  process.exit(1);
}
