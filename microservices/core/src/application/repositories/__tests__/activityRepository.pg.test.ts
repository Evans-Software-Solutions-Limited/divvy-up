import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  activity as activityTable,
  type Db,
  type GroupMemberRow,
  type GroupRow,
  type UserRow,
} from "@divvy-up/db";
import {
  createTestDb,
  seedGroup,
  seedMember,
  seedUser,
} from "./support/pgliteDb";

// The setup file mocks these modules for the handler tests; get the real
// implementations here so the emit paths write actual rows to real FK/uuid
// columns. `recordActivity`/`activityText` are preserved by the mock (not
// swapped), so the real emit-site repositories below insert genuine rows.
const { ActivityRepository, recordActivity } = await vi.importActual<
  typeof import("../activityRepository")
>("../activityRepository");
const { ExpensesRepository } = await vi.importActual<
  typeof import("../expensesRepository")
>("../expensesRepository");
const { SettlementsRepository } = await vi.importActual<
  typeof import("../settlementsRepository")
>("../settlementsRepository");
const { GroupsRepository } = await vi.importActual<
  typeof import("../groupsRepository")
>("../groupsRepository");
const { GroupInvitesRepository } = await vi.importActual<
  typeof import("../groupInvitesRepository")
>("../groupInvitesRepository");

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

/** A group whose creator (the caller) is an active member named "Caller". */
async function seedGroupWithMembers(): Promise<{
  user: UserRow;
  group: GroupRow;
  caller: GroupMemberRow;
  alice: GroupMemberRow;
  bob: GroupMemberRow;
}> {
  const user = await seedUser(db);
  const group = await seedGroup(db, user.id);
  const caller = await seedMember(db, group.id, "Caller", 7, {
    userId: user.id,
  });
  const alice = await seedMember(db, group.id, "Alice", 0);
  const bob = await seedMember(db, group.id, "Bob", 1);
  return { user, group, caller, alice, bob };
}

async function activityRows(groupId: string) {
  return db
    .select()
    .from(activityTable)
    .where(eq(activityTable.groupId, groupId));
}

describe("recordActivity + ActivityRepository (PGlite, real schema)", () => {
  it("lists a group's feed newest-first, tie-breaking by id desc, for a member only", async () => {
    const { user, group, caller } = await seedGroupWithMembers();
    const outsider = await seedUser(db);
    const early = new Date("2026-01-01T00:00:00.000Z");
    const same = new Date("2026-05-01T00:00:00.000Z");
    // Direct inserts with controlled id + createdAt so order is fully determined:
    // one earlier row, and two sharing a timestamp (id desc breaks the tie).
    await db.insert(activityTable).values([
      {
        id: "11111111-1111-4111-8111-000000000001",
        groupId: group.id,
        actorMemberId: caller.id,
        kind: "member_added",
        text: "earliest",
        createdAt: early,
      },
      {
        id: "aaaaaaaa-1111-4111-8111-000000000002",
        groupId: group.id,
        actorMemberId: caller.id,
        kind: "member_added",
        text: "tie-low-id",
        createdAt: same,
      },
      {
        id: "bbbbbbbb-1111-4111-8111-000000000003",
        groupId: group.id,
        actorMemberId: caller.id,
        kind: "member_added",
        text: "tie-high-id",
        createdAt: same,
      },
    ]);

    const repo = new ActivityRepository(db);
    const listed = await repo.listByGroup(user.id, group.id);
    expect(listed.map((a) => a.text)).toEqual([
      "tie-high-id", // same ts, higher id first
      "tie-low-id",
      "earliest",
    ]);

    // An outsider sees nothing (existence not leaked).
    expect(await repo.listByGroup(outsider.id, group.id)).toEqual([]);
  });

  it("clamps the limit to the most-recent-N", async () => {
    const { user, group, caller } = await seedGroupWithMembers();
    for (let i = 0; i < 5; i++) {
      await recordActivity(db, {
        groupId: group.id,
        actorMemberId: caller.id,
        kind: "member_added",
        text: `row-${i}`,
      });
    }
    const repo = new ActivityRepository(db);
    expect(await repo.listByGroup(user.id, group.id, 2)).toHaveLength(2);
  });

  it("writes an `expense_added` row atomically when an expense is finalized", async () => {
    const { user, group, alice } = await seedGroupWithMembers();
    const expenses = new ExpensesRepository(db);

    const expense = await expenses.create(user.id, {
      groupId: group.id,
      payerId: alice.id,
      description: "Dinner",
      date: "2026-03-26",
      currency: "GBP",
      items: [
        {
          description: "Main",
          unitPrice: 1000,
          quantity: 2,
          assignment: { type: "one", memberId: alice.id },
        },
      ],
      adjustments: [{ kind: "tax", amount: 500, isPercent: false }],
    });

    await expenses.finalize(user.id, expense.id);

    const rows = await activityRows(group.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "expense_added",
      amount: 2500, // 2×1000 items + 500 tax
      expenseId: expense.id,
      settlementId: null,
    });
    expect(rows[0].text).toBe("Caller finalized Dinner — £25.00");
  });

  it("does NOT emit a second `expense_added` row when re-finalized (idempotent)", async () => {
    const { user, group, alice } = await seedGroupWithMembers();
    const expenses = new ExpensesRepository(db);

    const expense = await expenses.create(user.id, {
      groupId: group.id,
      payerId: alice.id,
      description: "Dinner",
      date: "2026-03-26",
      currency: "GBP",
      items: [
        {
          description: "Main",
          unitPrice: 1000,
          quantity: 1,
          assignment: { type: "one", memberId: alice.id },
        },
      ],
    });

    // Re-finalizing (double-tap / retry / balance refresh) must not duplicate the
    // forward-only feed row.
    await expenses.finalize(user.id, expense.id);
    const second = await expenses.finalize(user.id, expense.id);
    expect(second?.status).toBe("finalized"); // still idempotently returns it

    const rows = await activityRows(group.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("expense_added");
  });

  it("writes a `settled_up` row atomically when a settlement is recorded", async () => {
    const { user, group, alice, bob } = await seedGroupWithMembers();
    const settlements = new SettlementsRepository(db);

    const settlement = await settlements.record(user.id, {
      groupId: group.id,
      fromMemberId: alice.id,
      toMemberId: bob.id,
      amount: 1250,
    });

    const rows = await activityRows(group.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "settled_up",
      amount: 1250,
      settlementId: settlement!.id,
      expenseId: null,
    });
    expect(rows[0].text).toBe("Alice paid Bob £12.50");
  });

  it("writes NO row when a settlement is rejected (guard path leaves nothing)", async () => {
    const { group, alice, bob } = await seedGroupWithMembers();
    const outsider = await seedUser(db);
    const settlements = new SettlementsRepository(db);

    const result = await settlements.record(outsider.id, {
      groupId: group.id,
      fromMemberId: alice.id,
      toMemberId: bob.id,
      amount: 500,
    });

    expect(result).toBeNull();
    expect(await activityRows(group.id)).toEqual([]);
  });

  it("writes a `member_added` row atomically on a direct add", async () => {
    const { user, group } = await seedGroupWithMembers();
    const groups = new GroupsRepository(db);

    await groups.addMember(user.id, group.id, "Jordan");

    const rows = await activityRows(group.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "member_added", amount: null });
    expect(rows[0].text).toBe("Caller added Jordan");
  });

  it("writes a `member_added` row atomically when a member joins by link", async () => {
    const { user, group } = await seedGroupWithMembers();
    const invites = new GroupInvitesRepository(db);
    const joiner = await seedUser(db, { displayName: "Jordan" });

    const created = await invites.create(user.id, { groupId: group.id });
    expect(created.ok).toBe(true);
    if (!created.ok) return; // narrow for TS

    const accepted = await invites.accept(joiner.id, created.token);
    expect(accepted.ok).toBe(true);

    const rows = await activityRows(group.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "member_added", amount: null });
    expect(rows[0].text).toBe("Jordan joined");
    // Actor is the joiner's own new member row, not the inviter.
    if (accepted.ok) {
      expect(rows[0].actorMemberId).toBe(accepted.member.id);
    }
  });
});
