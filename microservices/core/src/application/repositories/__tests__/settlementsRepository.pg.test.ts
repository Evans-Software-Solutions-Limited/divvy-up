import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { settlements as settlementsTable, type Db } from "@divvy-up/db";
import {
  createTestDb,
  seedGroup,
  seedMember,
  seedUser,
} from "./support/pgliteDb";

// The setup file mocks this module for the handler tests; get the real class here.
const { SettlementsRepository } = await vi.importActual<
  typeof import("../settlementsRepository")
>("../settlementsRepository");

let db: Db;
let truncateAll: () => Promise<void>;

beforeAll(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  truncateAll = testDb.truncateAll;
});

beforeEach(async () => {
  await truncateAll();
});

/** A group whose creator (the caller) is an active member, plus two members. */
async function seedGroupWithMembers() {
  const user = await seedUser(db);
  const group = await seedGroup(db, user.id);
  // Caller's own member row (colour slot 7, clear of the two below).
  await seedMember(db, group.id, "Caller", 7, { userId: user.id });
  const alice = await seedMember(db, group.id, "Alice", 0);
  const bob = await seedMember(db, group.id, "Bob", 1);
  return { user, group, alice, bob };
}

describe("SettlementsRepository (PGlite, real schema)", () => {
  it("records a settlement and persists it", async () => {
    const repo = new SettlementsRepository(db);
    const { user, group, alice, bob } = await seedGroupWithMembers();

    const settlement = await repo.record(user.id, {
      groupId: group.id,
      fromMemberId: bob.id,
      toMemberId: alice.id,
      amount: 1250,
    });

    expect(settlement).not.toBeNull();
    expect(settlement).toMatchObject({
      groupId: group.id,
      fromMemberId: bob.id,
      toMemberId: alice.id,
      amount: 1250,
      recordedBy: user.id,
    });

    const rows = await db
      .select()
      .from(settlementsTable)
      .where(eq(settlementsTable.id, settlement!.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(1250);
  });

  it("allows settling a debt owed to a soft-deleted (inactive) member", async () => {
    // A removed member's outstanding balance must stay settleable — otherwise
    // removing someone strands their debt forever (Inspector Brad 🟡).
    const repo = new SettlementsRepository(db);
    const user = await seedUser(db);
    const group = await seedGroup(db, user.id);
    await seedMember(db, group.id, "Caller", 7, { userId: user.id });
    const alice = await seedMember(db, group.id, "Alice", 0);
    const bob = await seedMember(db, group.id, "Bob", 1, { active: false });

    const settlement = await repo.record(user.id, {
      groupId: group.id,
      fromMemberId: alice.id,
      toMemberId: bob.id,
      amount: 800,
    });

    expect(settlement).not.toBeNull();
    expect(settlement).toMatchObject({ toMemberId: bob.id, amount: 800 });
  });

  it("returns null when the caller is not an active member (scoping)", async () => {
    const repo = new SettlementsRepository(db);
    const { group, alice, bob } = await seedGroupWithMembers();
    const outsider = await seedUser(db);

    const settlement = await repo.record(outsider.id, {
      groupId: group.id,
      fromMemberId: bob.id,
      toMemberId: alice.id,
      amount: 500,
    });

    expect(settlement).toBeNull();
    const rows = await db.select().from(settlementsTable);
    expect(rows).toHaveLength(0);
  });

  it("returns null when a party belongs to a different group", async () => {
    const repo = new SettlementsRepository(db);
    const { user, group, bob } = await seedGroupWithMembers();
    // A member of an unrelated group.
    const otherUser = await seedUser(db);
    const otherGroup = await seedGroup(db, otherUser.id);
    const stranger = await seedMember(db, otherGroup.id, "Stranger", 0);

    const settlement = await repo.record(user.id, {
      groupId: group.id,
      fromMemberId: bob.id,
      toMemberId: stranger.id,
      amount: 500,
    });

    expect(settlement).toBeNull();
    const rows = await db.select().from(settlementsTable);
    expect(rows).toHaveLength(0);
  });

  it("returns null for a non-uuid group id", async () => {
    const repo = new SettlementsRepository(db);
    const settlement = await repo.record(
      "11111111-1111-4111-8111-111111111111",
      {
        groupId: "not-a-uuid",
        fromMemberId: "11111111-1111-4111-8111-111111111111",
        toMemberId: "22222222-2222-4222-8222-222222222222",
        amount: 500,
      },
    );
    expect(settlement).toBeNull();
  });

  it("lists a group's settlements for a member and hides them from outsiders", async () => {
    const repo = new SettlementsRepository(db);
    const { user, group, alice, bob } = await seedGroupWithMembers();

    await repo.record(user.id, {
      groupId: group.id,
      fromMemberId: bob.id,
      toMemberId: alice.id,
      amount: 300,
    });
    await repo.record(user.id, {
      groupId: group.id,
      fromMemberId: alice.id,
      toMemberId: bob.id,
      amount: 200,
    });

    const listed = await repo.listByGroup(user.id, group.id);
    expect(listed).toHaveLength(2);
    expect(listed.map((s) => s.amount).sort()).toEqual([200, 300]);

    const outsider = await seedUser(db);
    expect(await repo.listByGroup(outsider.id, group.id)).toEqual([]);
  });
});
