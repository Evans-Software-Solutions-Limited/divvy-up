// PGlite test harness: an in-process Postgres running the REAL committed
// migration (packages/db/drizzle/0000_init.sql), so provisioning tests exercise
// actual constraints (uuid PK, unique email) instead of a hand-rolled fake.
// Mirrors microservices/core/src/application/repositories/__tests__/support/pgliteDb.ts.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@divvy-up/db/schema";
import { type Db } from "@divvy-up/db";

// Resolved relative to this file: .../src/auth/__tests__/support -> repo root
// -> packages/db/drizzle
const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../packages/db/drizzle",
);

export async function createTestDb(): Promise<{
  db: Db;
  truncateAll: () => Promise<void>;
}> {
  const client = new PGlite();
  const drizzleDb = drizzle(client, { schema });

  await migrate(drizzleDb, { migrationsFolder: MIGRATIONS_FOLDER });

  // The `as unknown as Db` cast is the repo's established test convention —
  // PGlite's driver type differs from postgres-js's, but both satisfy the
  // same query-builder shape.
  const db = drizzleDb as unknown as Db;

  async function truncateAll(): Promise<void> {
    await db.execute(sql.raw(`TRUNCATE TABLE "users" CASCADE`));
  }

  return { db, truncateAll };
}
