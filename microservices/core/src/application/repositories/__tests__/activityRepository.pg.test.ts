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

  // ─── editing a finalized expense ────────────────────────────────────────────
  //
  // Assignment edits stay open after finalizing — there is no delete or
  // un-finalize endpoint, so it's the only way to fix a mis-assigned receipt. But
  // the expense is already counting toward balances, so an edit moves money
  // between members and must not be silent.

  it("writes an `expense_split_changed` row when a FINALIZED expense's split is edited", async () => {
    const { user, group, alice, bob } = await seedGroupWithMembers();
    const expenses = new ExpensesRepository(db);

    const expense = await expenses.create(user.id, {
      groupId: group.id,
      payerId: alice.id,
      description: "Dinner",
      date: "2026-03-26",
      currency: "GBP",
      items: [
        {
          description: "Bottle of red",
          unitPrice: 2000,
          quantity: 1,
          assignment: { type: "one", memberId: alice.id },
        },
      ],
    });
    await expenses.finalize(user.id, expense.id);

    // The wine was actually Bob's — correcting it after finalizing moves £20 of
    // debt from Alice to Bob.
    await expenses.updateItemAssignment(
      user.id,
      expense.id,
      expense.items[0].id,
      { type: "one", memberId: bob.id },
    );

    // `activityRows` has no ORDER BY, so match by kind rather than position.
    const rows = await activityRows(group.id);
    expect(rows.map((r) => r.kind).sort()).toEqual([
      "expense_added",
      "expense_split_changed",
    ]);
    const edit = rows.find((r) => r.kind === "expense_split_changed");
    expect(edit).toMatchObject({
      expenseId: expense.id,
      settlementId: null,
      // The item's value — what was at stake in the re-split, not a transfer.
      amount: 2000,
    });
    // Both sides named, so a reader can tell whether a settlement recorded
    // against the old split still corresponds to a debt.
    expect(edit?.text).toBe(
      "Caller re-split Bottle of red on Dinner — was Alice, now Bob",
    );
  });

  it("names an equal-split re-assignment on both sides", async () => {
    const { user, group, caller, alice, bob } = await seedGroupWithMembers();
    const expenses = new ExpensesRepository(db);

    const expense = await expenses.create(user.id, {
      groupId: group.id,
      payerId: alice.id,
      description: "Dinner",
      date: "2026-03-26",
      currency: "GBP",
      items: [
        {
          description: "Sharing platter",
          unitPrice: 1500,
          quantity: 1,
          assignment: { type: "equal", memberIds: [alice.id, bob.id] },
        },
      ],
    });
    await expenses.finalize(user.id, expense.id);

    await expenses.updateItemAssignment(
      user.id,
      expense.id,
      expense.items[0].id,
      { type: "equal", memberIds: [caller.id, alice.id] },
    );

    const edit = (await activityRows(group.id)).find(
      (r) => r.kind === "expense_split_changed",
    );
    expect(edit?.text).toBe(
      "Caller re-split Sharing platter on Dinner — was Alice, Bob, now Alice, Caller",
    );
  });

  it("records the proportions when a re-split moves money between the same people", async () => {
    // The case a name-only audit line can't express: same two members, £9 of £10
    // moving between them. "was Alice, Bob, now Alice, Bob" would assert that
    // nothing happened, so the weights are part of the text.
    const { user, group, alice, bob } = await seedGroupWithMembers();
    const expenses = new ExpensesRepository(db);

    const expense = await expenses.create(user.id, {
      groupId: group.id,
      payerId: alice.id,
      description: "Dinner",
      date: "2026-03-26",
      currency: "GBP",
      items: [
        {
          description: "Bottle of red",
          unitPrice: 1000,
          quantity: 1,
          assignment: { type: "equal", memberIds: [alice.id, bob.id] },
        },
      ],
    });
    await expenses.finalize(user.id, expense.id);

    await expenses.updateItemAssignment(
      user.id,
      expense.id,
      expense.items[0].id,
      {
        type: "custom",
        shares: [
          { memberId: alice.id, fraction: 0.9 },
          { memberId: bob.id, fraction: 0.1 },
        ],
      },
    );

    const edit = (await activityRows(group.id)).find(
      (r) => r.kind === "expense_split_changed",
    );
    expect(edit).toBeDefined();
    // Weights shown for the `custom` side; the `equal` side needs none.
    expect(edit?.text).toContain("was Alice, Bob, now ");
    expect(edit?.text).toContain("×9");
    expect(edit?.text).toContain("×1");
    expect(edit?.text).not.toBe(
      "Caller re-split Bottle of red on Dinner — was Alice, Bob, now Alice, Bob",
    );
  });

  it("writes NO row when a mode change re-spells the same split", async () => {
    // `equal` over [A,B] and `custom` 0.5/0.5 over [A,B] are the same pennies.
    // Re-labelling one as the other moved nothing, so it must not claim it did.
    const { user, group, alice, bob } = await seedGroupWithMembers();
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
          assignment: { type: "equal", memberIds: [alice.id, bob.id] },
        },
      ],
    });
    await expenses.finalize(user.id, expense.id);

    await expenses.updateItemAssignment(
      user.id,
      expense.id,
      expense.items[0].id,
      {
        type: "custom",
        shares: [
          { memberId: alice.id, fraction: 0.5 },
          { memberId: bob.id, fraction: 0.5 },
        ],
      },
    );

    expect((await activityRows(group.id)).map((r) => r.kind)).toEqual([
      "expense_added",
    ]);
  });

  it("writes NO row when a DRAFT's split is edited", async () => {
    const { user, group, alice, bob } = await seedGroupWithMembers();
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

    // Assigning items IS the draft workflow — a feed row per tap would bury
    // everything else.
    await expenses.updateItemAssignment(
      user.id,
      expense.id,
      expense.items[0].id,
      { type: "one", memberId: bob.id },
    );

    expect(await activityRows(group.id)).toHaveLength(0);
  });

  it("writes a row when assigning `everyone` to a finalized item widens the split", async () => {
    // The one path where what gets WRITTEN differs from what was requested:
    // `everyone` on a finalized expense is frozen into an explicit `equal` set.
    // The comparison must be against the frozen set, not the (empty) requested
    // rows — otherwise every `everyone` request looks like a change.
    const { user, group, alice, bob } = await seedGroupWithMembers();
    const expenses = new ExpensesRepository(db);

    const expense = await expenses.create(user.id, {
      groupId: group.id,
      payerId: alice.id,
      description: "Dinner",
      date: "2026-03-26",
      currency: "GBP",
      items: [
        {
          description: "Garlic bread",
          unitPrice: 600,
          quantity: 1,
          assignment: { type: "equal", memberIds: [alice.id, bob.id] },
        },
      ],
    });
    await expenses.finalize(user.id, expense.id);

    // Freezes over all three active members (Caller, Alice, Bob) — genuinely
    // wider than the [Alice, Bob] it had, so it moved money.
    await expenses.updateItemAssignment(
      user.id,
      expense.id,
      expense.items[0].id,
      { type: "everyone" },
    );

    const rows = await activityRows(group.id);
    const edit = rows.find((r) => r.kind === "expense_split_changed");
    expect(edit).toBeDefined();
    expect(edit?.text).toContain("was Alice, Bob, now ");
  });

  it("writes NO row when `everyone` freezes to exactly the split already stored", async () => {
    // Same request, but the frozen set equals what's already there, so no money
    // moved and there is nothing to report.
    const { user, group, caller, alice, bob } = await seedGroupWithMembers();
    const expenses = new ExpensesRepository(db);

    const expense = await expenses.create(user.id, {
      groupId: group.id,
      payerId: alice.id,
      description: "Dinner",
      date: "2026-03-26",
      currency: "GBP",
      items: [
        {
          description: "Garlic bread",
          unitPrice: 600,
          quantity: 1,
          assignment: {
            type: "equal",
            memberIds: [caller.id, alice.id, bob.id], // every active member
          },
        },
      ],
    });
    await expenses.finalize(user.id, expense.id);

    await expenses.updateItemAssignment(
      user.id,
      expense.id,
      expense.items[0].id,
      { type: "everyone" },
    );

    const rows = await activityRows(group.id);
    expect(rows.map((r) => r.kind)).toEqual(["expense_added"]);
  });

  it("writes NO row when a finalized item is re-saved without changing the split", async () => {
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
          assignment: { type: "equal", memberIds: [alice.id] },
        },
      ],
    });
    await expenses.finalize(user.id, expense.id);

    // Opening the editor on a finalized item and pressing save without touching
    // anything moved no money, so it must not claim it did.
    await expenses.updateItemAssignment(
      user.id,
      expense.id,
      expense.items[0].id,
      { type: "equal", memberIds: [alice.id] },
    );

    const rows = await activityRows(group.id);
    expect(rows.map((r) => r.kind)).toEqual(["expense_added"]);
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
