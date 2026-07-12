import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "@divvy-up/db";
import type { Db } from "@divvy-up/db";
import { provisionUser } from "../provisionUser";
import type { SupabaseUser } from "../supabaseAuth";
import { createTestDb } from "./support/pgliteDb";

function claimsFor(sub: string, email = `${sub}@example.com`): SupabaseUser {
  return {
    sub,
    email,
    email_verified: true,
    iat: 1_700_000_000,
    exp: 1_700_003_600,
  };
}

describe("provisionUser", () => {
  let db: Db;
  let truncateAll: () => Promise<void>;

  beforeAll(async () => {
    ({ db, truncateAll } = await createTestDb());
  });

  afterEach(async () => {
    await truncateAll();
  });

  it("creates the users row on first call, keyed by sub, with the derived displayName", async () => {
    const sub = crypto.randomUUID();
    const claims = claimsFor(sub, `${sub}@example.com`);

    const result = await provisionUser(claims, db);

    expect(result).toEqual({ userId: sub });

    const rows = await db.select().from(users).where(eq(users.id, sub));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: sub,
      email: claims.email,
      displayName: sub, // email local-part, since email is "<sub>@example.com"
    });
  });

  it("does not create a duplicate on a second call for the same sub", async () => {
    const sub = crypto.randomUUID();
    const claims = claimsFor(sub);

    const first = await provisionUser(claims, db);
    const second = await provisionUser(claims, db);

    expect(first).toEqual({ userId: sub });
    expect(second).toEqual({ userId: sub });

    const rows = await db.select().from(users).where(eq(users.id, sub));
    expect(rows).toHaveLength(1);
  });

  it("is safe under concurrent first calls for the same sub — exactly one row", async () => {
    const sub = crypto.randomUUID();
    const claims = claimsFor(sub);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => provisionUser(claims, db)),
    );

    for (const result of results) {
      expect(result).toEqual({ userId: sub });
    }

    const rows = await db.select().from(users).where(eq(users.id, sub));
    expect(rows).toHaveLength(1);
  });
});
