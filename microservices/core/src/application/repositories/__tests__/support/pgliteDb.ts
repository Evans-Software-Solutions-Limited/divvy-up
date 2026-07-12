// PGlite test harness: an in-process Postgres running the REAL committed
// migration (packages/db/drizzle/0000_init.sql), so repository tests exercise
// actual FK/uuid/check constraints instead of a hand-rolled fake.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@divvy-up/db/schema";
import {
  groupMembers,
  groups,
  users,
  type Db,
  type GroupMemberRow,
  type GroupRow,
  type UserRow,
} from "@divvy-up/db";

// Resolved relative to this file: .../src/application/repositories/__tests__/support
// -> repo root -> packages/db/drizzle
const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../../packages/db/drizzle",
);

const TABLES = [
  "activity",
  "settlements",
  "receipt_adjustments",
  "item_assignments",
  "receipt_items",
  "expenses",
  "group_invites",
  "group_members",
  "groups",
  "users",
] as const;

export async function createTestDb(): Promise<{
  db: Db;
  truncateAll: () => Promise<void>;
}> {
  const client = new PGlite();
  const drizzleDb = drizzle(client, { schema });

  await migrate(drizzleDb, { migrationsFolder: MIGRATIONS_FOLDER });

  // The `as unknown as Db` cast is the repo's established test convention
  // (see microservices/other-service's adapter fakes) — PGlite's driver type
  // differs from postgres-js's, but both satisfy the same query-builder shape.
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

export async function seedGroup(
  db: Db,
  createdBy: string,
  overrides: Partial<typeof groups.$inferInsert> = {},
): Promise<GroupRow> {
  const [row] = await db
    .insert(groups)
    .values({
      name: "Test Group",
      createdBy,
      ...overrides,
    })
    .returning();
  return row;
}

export async function seedMember(
  db: Db,
  groupId: string,
  name: string,
  colourIndex: number,
  overrides: Partial<typeof groupMembers.$inferInsert> = {},
): Promise<GroupMemberRow> {
  const [row] = await db
    .insert(groupMembers)
    .values({
      groupId,
      name,
      colourIndex,
      ...overrides,
    })
    .returning();
  return row;
}
