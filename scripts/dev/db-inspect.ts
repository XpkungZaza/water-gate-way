// Inspect the droplet's Postgres (credentials fetched via SSH, never printed).
// Usage: node scripts/dev/db-inspect.ts
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

function dropletEnv(): Record<string, string> {
  const out = execFileSync(
    "ssh",
    [
      "-o", "BatchMode=yes",
      "cmmc@100.102.67.116",
      "grep -E '^(PGUSER|PGPASSWORD|PGHOST|PGPORT|PGDATABASE)=' /home/cmmc/water-web/web2/.env.local",
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  ).toString();
  const env: Record<string, string> = {};
  for (const line of out.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) env[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  return env;
}

const env = dropletEnv();
// WHY: PGHOST in the droplet env is the docker container view; from the Mac we reach Postgres via the droplet's Tailscale IP.
const pool = new Pool({
  user: env.PGUSER,
  host: process.env.DB_HOST || "100.102.67.116",
  database: env.PGDATABASE,
  password: env.PGPASSWORD,
  port: Number(process.env.DB_PORT || env.PGPORT || 5432),
  connectionTimeoutMillis: 8000,
});

const main = async () => {
  const t = await pool.query(
    "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,2"
  );
  console.log("SCHEMAS/TABLES:");
  for (const r of t.rows) console.log("  " + r.table_schema + "." + r.table_name);
  const usersSchemas = [...new Set(t.rows.filter((r: { table_name: string }) => r.table_name === "users").map((r: { table_schema: string }) => r.table_schema))];
  for (const s of usersSchemas) {
    const c = await pool.query('SELECT count(*)::int AS n FROM ' + '"'+s+'".users').catch((e: Error) => ({ rows: [{ n: "ERR " + e.message }] }));
    console.log(`users in "${s}":`, c.rows[0].n);
  }
  const au = await pool.query("SELECT table_schema FROM information_schema.tables WHERE table_name = 'control_audit'").catch(() => ({ rows: [] as { table_schema: string }[] }));
  console.log("control_audit schema(s):", au.rows.map((r: { table_schema: string }) => r.table_schema).join(",") || "(not found)");
};

main()
  .catch((e) => console.log("CONNECT FAILED:", e.message))
  .finally(() => pool.end());
