// Runs SQL against your Supabase project. Two paths, picked automatically:
//   1. SUPABASE_ACCESS_TOKEN → Supabase Management API (no DB password needed —
//      same endpoint the dashboard SQL editor uses). Easiest.
//   2. SUPABASE_DB_URL → direct Postgres connection (needs your DB password).
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const { SUPABASE_ACCESS_TOKEN, SUPABASE_DB_URL, SUPABASE_URL } = process.env;

export const hasDbUrl =
  !!SUPABASE_DB_URL &&
  !SUPABASE_DB_URL.includes("[YOUR-PASSWORD]") &&
  !SUPABASE_DB_URL.includes("password@host");

export function method() {
  if (SUPABASE_ACCESS_TOKEN) return "Management API (access token — no DB password)";
  if (hasDbUrl) return "direct Postgres (DB URL)";
  return "(none configured)";
}

function projectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  const m = (SUPABASE_URL ?? "").match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!m) throw new Error("can't derive project ref — set SUPABASE_URL or SUPABASE_PROJECT_REF");
  return m[1];
}

async function viaMgmt(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef()}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return null; }
}

async function viaPg(sql) {
  const pg = (await import("pg")).default;
  const client = new pg.Client({ connectionString: SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { return await client.query(sql); } finally { await client.end().catch(() => {}); }
}

export async function runSql(sql) {
  if (SUPABASE_ACCESS_TOKEN) return viaMgmt(sql);
  if (hasDbUrl) return viaPg(sql);
  throw new Error(
    "No way to run SQL. Set ONE of:\n" +
      "  • SUPABASE_ACCESS_TOKEN  (Dashboard → Account → Access Tokens — easiest, no DB password)\n" +
      "  • SUPABASE_DB_URL        (Dashboard → Settings → Database → Connection string)"
  );
}
