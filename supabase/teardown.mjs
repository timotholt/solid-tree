// `npm run teardown` — drops the scratch table, RPCs, and Realtime entry.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runSql, method } from "./run-sql.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// Reverse order of apply (drop dependents first).
const downs = ["0002_scratch_outline_down.sql", "0001_scratch_lock_down.sql"];

try {
  for (const d of downs) {
    console.log(`→ teardown ${d} via ${method()} …`);
    await runSql(readFileSync(join(HERE, "migrations", d), "utf8"));
  }
  console.log("✅ removed.");
} catch (e) {
  console.error("💥 teardown failed: " + e.message);
  process.exit(1);
}
