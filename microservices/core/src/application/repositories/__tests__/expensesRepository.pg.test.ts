import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  expenses,
  itemAssignments,
  receiptItems,
  type Db,
  type GroupMemberRow,
  type GroupRow,
  type UserRow,
} from "@divvy-up/db";
import type { Expense } from "../../../domain/types";
import {
  createTestDb,
  seedGroup,
  seedMember,
  seedUser,
} from "./support/pgliteDb";

// The setup file mocks this module for the handler tests; get the real class here.
const { ExpensesRepository } = await vi.importActual<
  typeof import("../expensesRepository")
>("../expensesRepository");

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

type CreateInput = Parameters<
  InstanceType<typeof ExpensesRepository>["create"]
>[1];

async function seedGroupWithMembers(
  names: string[],
): Promise<{ group: GroupRow; members: GroupMemberRow[]; user: UserRow }> {
  const user = await seedUser(db);
  const group = await seedGroup(db, user.id);
  // Link the creator as an active member (colour slot 7, clear of the
  // `names` slots below) so `user.id` is a valid caller for every ownership
  // check exercised here — mirrors GroupsRepository.create()'s
  // creator-membership invariant without exercising that repo in this suite.
  await seedMember(db, group.id, "Caller", 7, { userId: user.id });
  const members: GroupMemberRow[] = [];
  for (let i = 0; i < names.length; i++) {
    members.push(await seedMember(db, group.id, names[i], i));
  }
  return { group, members, user };
}

function baseInput(
  groupId: string,
  payerId: string,
  items: CreateInput["items"],
): CreateInput {
  return {
    groupId,
    payerId,
    description: "Dinner",
    date: "2026-03-26",
    currency: "GBP",
    items,
  };
}

async function countRows(): Promise<{
  expenses: number;
  items: number;
  assignments: number;
}> {
  const [e, i, a] = await Promise.all([
    db.select().from(expenses),
    db.select().from(receiptItems),
    db.select().from(itemAssignments),
  ]);
  return { expenses: e.length, items: i.length, assignments: a.length };
}

describe("ExpensesRepository (PGlite)", () => {
  it("create() round-trips pence exactly and preserves item order", async () => {
    const { group, members, user } = await seedGroupWithMembers([
      "Payer",
      "Diner",
    ]);
    const repo = new ExpensesRepository(db);

    const expense: Expense = await repo.create(user.id, {
      ...baseInput(group.id, members[0].id, [
        {
          description: "Starter",
          unitPrice: 1299,
          quantity: 2,
          assignment: { type: "everyone" },
        },
        {
          description: "Main",
          unitPrice: 2350,
          quantity: 1,
          assignment: { type: "one", memberId: members[1].id },
        },
      ]),
      adjustments: [
        { kind: "tax", amount: 875, isPercent: false },
        { kind: "discount", amount: -200, isPercent: false },
      ],
    });

    expect(expense.items.map((i) => i.description)).toEqual([
      "Starter",
      "Main",
    ]);
    expect(expense.items[0].unitPrice).toBe(1299);
    expect(expense.items[1].unitPrice).toBe(2350);
    expect(expense.adjustments).toEqual([
      { kind: "tax", amount: 875, isPercent: false },
      { kind: "discount", amount: -200, isPercent: false },
    ]);

    // Round-trip through findById() too, not just the create() echo.
    const found = await repo.findById(user.id, expense.id);
    expect(found?.items.map((i) => i.unitPrice)).toEqual([1299, 2350]);
    expect(found?.adjustments).toEqual(expense.adjustments);
  });

  it("round-trips all four assignment modes", async () => {
    const { group, members, user } = await seedGroupWithMembers([
      "A",
      "B",
      "C",
    ]);
    const repo = new ExpensesRepository(db);

    const expense = await repo.create(
      user.id,
      baseInput(group.id, members[0].id, [
        {
          description: "One",
          unitPrice: 100,
          quantity: 1,
          assignment: { type: "one", memberId: members[1].id },
        },
        {
          description: "Equal",
          unitPrice: 200,
          quantity: 1,
          assignment: {
            type: "equal",
            memberIds: [members[0].id, members[1].id],
          },
        },
        {
          description: "Everyone",
          unitPrice: 300,
          quantity: 1,
          assignment: { type: "everyone" },
        },
        {
          description: "Custom",
          unitPrice: 400,
          quantity: 1,
          assignment: {
            type: "custom",
            shares: [
              { memberId: members[0].id, fraction: 0.75 },
              { memberId: members[1].id, fraction: 0.25 },
            ],
          },
        },
      ]),
    );

    expect(expense.items[0].assignment).toEqual({
      type: "one",
      memberId: members[1].id,
    });
    expect(expense.items[1].assignment).toEqual({
      type: "equal",
      memberIds: [members[0].id, members[1].id],
    });
    expect(expense.items[2].assignment).toEqual({ type: "everyone" });
    expect(expense.items[3].assignment).toEqual({
      type: "custom",
      shares: [
        { memberId: members[0].id, fraction: 3 },
        { memberId: members[1].id, fraction: 1 },
      ],
    });

    // "everyone" stores zero item_assignments rows.
    const everyoneItemId = expense.items[2].id;
    const everyoneRows = await db
      .select()
      .from(itemAssignments)
      .where(eq(itemAssignments.itemId, everyoneItemId));
    expect(everyoneRows).toHaveLength(0);

    // findById() re-hydrates from the DB, where assignment rows come back in a
    // stable-but-id-ordered sequence (not tied to input order), so compare the
    // custom shares order-independently by member.
    const found = await repo.findById(user.id, expense.id);
    const foundCustom = found?.items[3].assignment;
    expect(foundCustom?.type).toBe("custom");
    const weightByMember = Object.fromEntries(
      (
        foundCustom as { shares: { memberId: string; fraction: number }[] }
      ).shares.map((s) => [s.memberId, s.fraction]),
    );
    expect(weightByMember).toEqual({
      [members[0].id]: 3,
      [members[1].id]: 1,
    });
  });

  it("create() throws and persists zero rows when the caller isn't a member of the group", async () => {
    const { group } = await seedGroupWithMembers(["A"]);
    const outsider = await seedUser(db);
    const repo = new ExpensesRepository(db);

    await expect(
      repo.create(
        outsider.id,
        baseInput(group.id, "00000000-0000-0000-0000-000000000099", [
          {
            description: "Item",
            unitPrice: 100,
            quantity: 1,
            assignment: { type: "everyone" },
          },
        ]),
      ),
    ).rejects.toThrow();

    expect(await countRows()).toEqual({
      expenses: 0,
      items: 0,
      assignments: 0,
    });
  });

  it("create() throws and persists zero rows when the payer is not an active member", async () => {
    const { group, user } = await seedGroupWithMembers(["A"]);
    const repo = new ExpensesRepository(db);

    await expect(
      repo.create(
        user.id,
        baseInput(group.id, "00000000-0000-0000-0000-000000000099", [
          {
            description: "Item",
            unitPrice: 100,
            quantity: 1,
            assignment: { type: "everyone" },
          },
        ]),
      ),
    ).rejects.toThrow();

    expect(await countRows()).toEqual({
      expenses: 0,
      items: 0,
      assignments: 0,
    });
  });

  it("create() throws when an assignment memberId belongs to a different group", async () => {
    const {
      group: groupA,
      members: membersA,
      user,
    } = await seedGroupWithMembers(["A"]);
    const { members: membersB } = await seedGroupWithMembers(["X"]);
    const repo = new ExpensesRepository(db);

    await expect(
      repo.create(
        user.id,
        baseInput(groupA.id, membersA[0].id, [
          {
            description: "Item",
            unitPrice: 100,
            quantity: 1,
            assignment: { type: "one", memberId: membersB[0].id },
          },
        ]),
      ),
    ).rejects.toThrow();

    expect(await countRows()).toEqual({
      expenses: 0,
      items: 0,
      assignments: 0,
    });
  });

  it("create() throws and rolls back on a duplicate memberId in an equal split", async () => {
    const { group, members, user } = await seedGroupWithMembers(["A", "B"]);
    const repo = new ExpensesRepository(db);

    await expect(
      repo.create(
        user.id,
        baseInput(group.id, members[0].id, [
          {
            description: "Item",
            unitPrice: 100,
            quantity: 1,
            assignment: {
              type: "equal",
              memberIds: [members[0].id, members[0].id],
            },
          },
        ]),
      ),
    ).rejects.toThrow();

    expect(await countRows()).toEqual({
      expenses: 0,
      items: 0,
      assignments: 0,
    });
  });

  it("updateItemAssignment() replaces rows atomically (custom → everyone leaves zero rows)", async () => {
    const { group, members, user } = await seedGroupWithMembers(["A", "B"]);
    const repo = new ExpensesRepository(db);

    const expense = await repo.create(
      user.id,
      baseInput(group.id, members[0].id, [
        {
          description: "Item",
          unitPrice: 100,
          quantity: 1,
          assignment: {
            type: "custom",
            shares: [
              { memberId: members[0].id, fraction: 0.75 },
              { memberId: members[1].id, fraction: 0.25 },
            ],
          },
        },
      ]),
    );
    const itemId = expense.items[0].id;

    const updated = await repo.updateItemAssignment(
      user.id,
      expense.id,
      itemId,
      { type: "everyone" },
    );

    expect(updated?.items[0].assignment).toEqual({ type: "everyone" });
    const rows = await db
      .select()
      .from(itemAssignments)
      .where(eq(itemAssignments.itemId, itemId));
    expect(rows).toHaveLength(0);
  });

  it("updateItemAssignment() returns null for a wrong expense/item pairing", async () => {
    const { group, members, user } = await seedGroupWithMembers(["A"]);
    const repo = new ExpensesRepository(db);

    const expenseOne = await repo.create(
      user.id,
      baseInput(group.id, members[0].id, [
        {
          description: "One",
          unitPrice: 100,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ]),
    );
    const expenseTwo = await repo.create(
      user.id,
      baseInput(group.id, members[0].id, [
        {
          description: "Two",
          unitPrice: 100,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ]),
    );

    const result = await repo.updateItemAssignment(
      user.id,
      expenseOne.id,
      expenseTwo.items[0].id,
      { type: "one", memberId: members[0].id },
    );
    expect(result).toBeNull();
  });

  it("finalize() flips draft to finalized, is idempotent, and null for unknown", async () => {
    const { group, members, user } = await seedGroupWithMembers(["A"]);
    const repo = new ExpensesRepository(db);

    const expense = await repo.create(
      user.id,
      baseInput(group.id, members[0].id, [
        {
          description: "Item",
          unitPrice: 100,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ]),
    );
    expect(expense.status).toBe("draft");

    const finalized = await repo.finalize(user.id, expense.id);
    expect(finalized?.status).toBe("finalized");

    const finalizedAgain = await repo.finalize(user.id, expense.id);
    expect(finalizedAgain?.status).toBe("finalized");

    const unknown = await repo.finalize(
      user.id,
      "00000000-0000-0000-0000-000000000099",
    );
    expect(unknown).toBeNull();
  });

  it("listByGroup() returns only that group's expenses in createdAt order", async () => {
    const {
      group: groupA,
      members: membersA,
      user: userA,
    } = await seedGroupWithMembers(["A"]);
    const {
      group: groupB,
      members: membersB,
      user: userB,
    } = await seedGroupWithMembers(["B"]);
    const repo = new ExpensesRepository(db);

    const first = await repo.create(
      userA.id,
      baseInput(groupA.id, membersA[0].id, [
        {
          description: "First",
          unitPrice: 100,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ]),
    );
    await new Promise((r) => setTimeout(r, 5));
    const second = await repo.create(
      userA.id,
      baseInput(groupA.id, membersA[0].id, [
        {
          description: "Second",
          unitPrice: 100,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ]),
    );
    await repo.create(
      userB.id,
      baseInput(groupB.id, membersB[0].id, [
        {
          description: "Other group",
          unitPrice: 100,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ]),
    );

    const result = await repo.listByGroup(userA.id, groupA.id);
    expect(result.map((e) => e.id)).toEqual([first.id, second.id]);
  });

  it("returns null/[] and blocks writes for a userId who isn't a member of the group (scoping, Req 7.3/7.4)", async () => {
    const { group, members, user } = await seedGroupWithMembers(["A"]);
    const outsider = await seedUser(db);
    const repo = new ExpensesRepository(db);

    const expense = await repo.create(
      user.id,
      baseInput(group.id, members[0].id, [
        {
          description: "Item",
          unitPrice: 100,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ]),
    );

    expect(await repo.findById(outsider.id, expense.id)).toBeNull();
    expect(await repo.listByGroup(outsider.id, group.id)).toEqual([]);
    expect(
      await repo.updateItemAssignment(
        outsider.id,
        expense.id,
        expense.items[0].id,
        { type: "everyone" },
      ),
    ).toBeNull();
    expect(await repo.finalize(outsider.id, expense.id)).toBeNull();
  });

  it("returns null/[] for non-UUID ids everywhere", async () => {
    const user = await seedUser(db);
    const repo = new ExpensesRepository(db);
    expect(await repo.findById(user.id, "not-a-uuid")).toBeNull();
    expect(await repo.listByGroup(user.id, "not-a-uuid")).toEqual([]);
    expect(
      await repo.updateItemAssignment(user.id, "not-a-uuid", "not-a-uuid", {
        type: "everyone",
      }),
    ).toBeNull();
    expect(await repo.finalize(user.id, "not-a-uuid")).toBeNull();
  });
});
