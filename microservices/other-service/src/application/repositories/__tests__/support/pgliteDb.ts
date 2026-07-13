// PGlite test harness: an in-process Postgres running the REAL committed
// migrations (packages/db/drizzle), so ReceiptUploadsRepository tests exercise
// actual FK/uuid/PK constraints instead of a hand-rolled fake.
// Mirrors microservices/core/src/application/repositories/__tests__/support/pgliteDb.ts
// and packages/api-utils/src/auth/__tests__/support/pgliteDb.ts.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@divvy-up/db/schema";
import { users, type Db, type UserRow } from "@divvy-up/db";

// Resolved relative to this file: .../src/application/repositories/__tests__/support
// -> repo root -> packages/db/drizzle
const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../../packages/db/drizzle",
);

const TABLES = ["receipt_uploads", "users"] as const;

export async function createTestDb(): Promise<{
  db: Db;
  truncateAll: () => Promise<void>;
}> {
  const client = new PGlite();
  const drizzleDb = drizzle(client, { schema });

  await migrate(drizzleDb, { migrationsFolder: MIGRATIONS_FOLDER });

  // The `as unknown as Db` cast is the repo's established test convention
  // (see microservices/core's/api-utils' pgliteDb harnesses) — PGlite's
  // driver type differs from postgres-js's, but both satisfy the same
  // query-builder shape.
  const db = drizzleDb as unknown as Db;

  async function truncateAll(): Promise<void> {
    const tableList = TABLES.map((t) => `"${t}"`).join(", ");
    await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} CASCADE`));
  }

  return { db, truncateAll };
}

// ─── Seed helpers ───────────────────────────────────────────────────────────

export async function seedUser(
  db: Db,
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<UserRow> {
  const [row] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email: `user-${crypto.randomUUID()}@test.local`,
      displayName: "Test User",
      ...overrides,
    })
    .returning();
  return row;
}
