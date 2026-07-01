import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Resolve the database URL from the SST Resource (runtime) or an env var.
 * At runtime SST injects linked Resource values into the Lambda environment;
 * locally (tests, `supabase start`, drizzle-kit) we fall back to DATABASE_URL.
 */
function getDatabaseUrl(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resource } = require("sst");
    if (Resource.DatabaseUrl?.value) {
      return Resource.DatabaseUrl.value;
    }
  } catch {
    // Resource not available (local / tests) — fall through to env var.
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. For local dev run `supabase start` and export its " +
        "connection string, or set the SST secret: `sst secret set DatabaseUrl <url>`.",
    );
  }
  return url;
}

/**
 * Create a Drizzle client backed by `postgres.js` over TCP against Supabase Postgres.
 *
 * Connection-string guidance for Lambda: use Supabase's **Transaction-mode pooler**
 * (port 6543), not the direct connection (5432). Each Lambda invocation is short-lived
 * and the pooler multiplexes at the transaction level — the only mode that survives
 * Lambda scale-out without exhausting the server's connection limit. Pooler URL shape:
 *
 *   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
 *
 * Driver options:
 *   - `prepare: false` — required for pgbouncer transaction mode. Prepared statements
 *     persist past the pooled connection's transaction boundary; pgbouncer may serve a
 *     later query on a different backend where the plan doesn't exist. Disabling them
 *     sends each query as a one-shot simple query.
 *   - `max: 1` — a Lambda container is single-threaded and handles one request at a
 *     time, so a per-container pool has no upside and just holds idle connections open.
 */
export function createDb(databaseUrl?: string) {
  const url = databaseUrl ?? getDatabaseUrl();
  const sql = postgres(url, { prepare: false, max: 1 });
  return drizzle(sql, { schema });
}

/** Singleton used in Lambda handlers (one per cold start). */
let _db: ReturnType<typeof createDb> | null = null;

export function getDb(): ReturnType<typeof createDb> {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export type Db = ReturnType<typeof createDb>;
