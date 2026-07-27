import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  expenses,
  groupMembers,
  itemAssignments,
  receiptItems,
  type Db,
  type GroupMemberRow,
  type GroupRow,
  type UserRow,
} from "@divvy-up/db";
import type { Expense, ItemAssignment } from "../../../domain/types";
import { computeBalances } from "../../expenses/finalize/computeBalances";
import { computeGroupBalances } from "../../groups/balances/computeGroupBalances";
import {
  createTestDb,
  readMigrationStatements,
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

/** The `group_members` row `seedGroupWithMembers` created for the calling user. */
async function callerMemberId(groupId: string): Promise<string> {
  const [row] = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.name, "Caller")),
    );
  return row.id;
}

/**
 * Member ids of an `equal` assignment, in hydration order — NOT sorted: the
 * order is the split's participant order, which is what decides who takes the
 * largest-remainder odd penny. Sort at the call site when comparing sets.
 */
function equalMemberIds(assignment: ItemAssignment | undefined): string[] {
  if (assignment?.type !== "equal") {
    throw new Error(`Expected an equal assignment, got ${assignment?.type}`);
  }
  return assignment.memberIds;
}

/**
 * Runs `call` against a `Db` whose `transaction()` snapshots the lock modes held
 * on `expenses` from INSIDE the repository's own transaction — after its work,
 * before commit, while the locks are still held.
 *
 * White-box on purpose. A row-locking clause is invisible to every other gate:
 * typecheck, lint and all 153 tests pass whether or not it's there, and it has
 * already gone missing from a commit once. This pins that it's still taken.
 */
async function expenseLockModesDuring(
  call: (db: Db) => Promise<unknown>,
): Promise<string[]> {
  let modes: string[] = [];
  const wrapped = new Proxy(db, {
    get(target, prop) {
      if (prop !== "transaction") return Reflect.get(target, prop, target);
      return (fn: (tx: unknown) => Promise<unknown>) =>
        target.transaction(async (tx) => {
          const out = await fn(tx);
          // NOT filtered by `pg_backend_pid()` — PGlite doesn't populate `pid`,
          // so that silently matches nothing. Filter by relation instead.
          const res = (await tx.execute(sql`
            select l.mode from pg_locks l
            join pg_class c on c.oid = l.relation
            where c.relname = 'expenses'
          `)) as unknown as { rows?: { mode: string }[] } | { mode: string }[];
          const rows = Array.isArray(res) ? res : (res.rows ?? []);
          modes = rows.map((r) => r.mode);
          return out;
        });
    },
  }) as Db;

  await call(wrapped);
  return modes;
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

    // findById() re-hydrates from the DB, where assignment rows come back in
    // member-id order (not input order), so compare the custom shares
    // order-independently by member.
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
    // The freeze wrote one row per active member (Caller + A).
    expect((await countRows()).assignments).toBe(2);

    const finalizedAgain = await repo.finalize(user.id, expense.id);
    expect(finalizedAgain?.status).toBe("finalized");
    // Re-finalize is a no-op: the transition guard means the freeze doesn't run
    // twice, so no duplicated participants (which would halve everyone's share).
    expect((await countRows()).assignments).toBe(2);
    expect(finalizedAgain?.items[0].assignment).toEqual(
      finalized?.items[0].assignment,
    );

    const unknown = await repo.finalize(
      user.id,
      "00000000-0000-0000-0000-000000000099",
    );
    expect(unknown).toBeNull();
  });

  // ─── freeze-at-finalize (money correctness) ──────────────────────────────
  //
  // An `everyone` item stores no member rows, so before the freeze existed its
  // balances were resolved against whoever was in the group *at read time* —
  // making a finalized (immutable) expense's split drift as membership changed.

  it("finalize() freezes 'everyone' into explicit equal rows over the active members", async () => {
    const { group, members, user } = await seedGroupWithMembers(["A", "B"]);
    const repo = new ExpensesRepository(db);
    const activeIds = [
      ...members.map((m) => m.id),
      await callerMemberId(group.id),
    ];

    const draft = await repo.create(
      user.id,
      baseInput(group.id, members[0].id, [
        {
          description: "Nachos",
          unitPrice: 1200,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ]),
    );
    expect(draft.items[0].assignment).toEqual({ type: "everyone" });

    const finalized = await repo.finalize(user.id, draft.id);

    // Mode flipped everyone → equal, naming every active member exactly once.
    const assignment = finalized?.items[0].assignment;
    expect(assignment?.type).toBe("equal");
    expect([...equalMemberIds(assignment)].sort()).toEqual(
      [...activeIds].sort(),
    );
    // Persisted, not just echoed: a fresh read sees the same frozen set.
    const reread = await repo.findById(user.id, draft.id);
    expect([...equalMemberIds(reread?.items[0].assignment)].sort()).toEqual(
      [...activeIds].sort(),
    );
    const [itemRow] = await db
      .select()
      .from(receiptItems)
      .where(eq(receiptItems.expenseId, draft.id));
    expect(itemRow.assignmentMode).toBe("equal");
  });

  it("freezing is penny-identical to resolving 'everyone' over the same members", async () => {
    // 100p across 3 members doesn't divide evenly — the largest-remainder odd
    // penny is exactly where a re-representation could silently shift money.
    const { group, members, user } = await seedGroupWithMembers(["A", "B"]);
    const repo = new ExpensesRepository(db);

    const draft = await repo.create(
      user.id,
      baseInput(group.id, members[0].id, [
        {
          description: "Odd penny",
          unitPrice: 100,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ]),
    );
    // The baseline is taken BEFORE finalizing: the draft resolved as `everyone`
    // over the active members. Deriving it from the frozen expense instead would
    // make this tautological — both sides would share one participant order and
    // the test could never catch the order (and so the odd penny) shifting.
    const activeIds = [
      ...members.map((m) => m.id),
      await callerMemberId(group.id),
    ].sort();
    const beforeFreeze = computeBalances(draft, activeIds);

    const finalized = await repo.finalize(user.id, draft.id);
    expect(finalized).not.toBeNull();
    // Frozen rows hydrate in the same member-id order they were resolved in, so
    // the same member still takes the odd penny.
    expect(equalMemberIds(finalized!.items[0].assignment)).toEqual(activeIds);
    expect(computeBalances(finalized!, [])).toEqual(beforeFreeze);

    // And the frozen split still reconciles to the penny. Viewed with a payer
    // outside the split, all three participants appear as debtors, so the whole
    // 100p is visible: largest-remainder gives 34/33/33, summing exactly to 100.
    // (Which of the three takes the odd penny follows the participant order, so
    // it's deliberately not asserted.)
    const allShares = computeBalances(
      { ...finalized!, payerId: "00000000-0000-0000-0000-0000000000ff" },
      [],
    );
    expect(allShares.map((b) => b.amount).sort()).toEqual([33, 33, 34]);
    expect(allShares.reduce((sum, b) => sum + b.amount, 0)).toBe(100);
  });

  it("a finalized expense's balances survive members joining and leaving", async () => {
    const { group, members, user } = await seedGroupWithMembers(["A", "B"]);
    const repo = new ExpensesRepository(db);

    await repo.create(
      user.id,
      baseInput(group.id, members[0].id, [
        {
          description: "Dinner",
          unitPrice: 1000,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ]),
    );
    const [draft] = await repo.listByGroup(user.id, group.id);
    await repo.finalize(user.id, draft.id);

    const balancesAt = async () =>
      computeGroupBalances(
        group.id,
        (await repo.listByGroup(user.id, group.id)).filter(
          (e) => e.status === "finalized",
        ),
        [],
      );

    const before = await balancesAt();
    expect(before).not.toEqual([]);

    // A member joins a week later. They were not at the dinner, so they must
    // owe nothing for it — and nobody else's share may shrink.
    const newcomer = await seedMember(db, group.id, "Latecomer", 5);
    const afterJoin = await balancesAt();
    expect(afterJoin).toEqual(before);
    expect(
      afterJoin.some(
        (b) => b.fromMemberId === newcomer.id || b.toMemberId === newcomer.id,
      ),
    ).toBe(false);

    // A diner is removed from the group afterwards: they still owe their frozen
    // share (consistent with how settlements treat removed members).
    await db
      .update(groupMembers)
      .set({ active: false })
      .where(eq(groupMembers.id, members[1].id));
    expect(await balancesAt()).toEqual(before);
  });

  it("updateItemAssignment() locks the expense row before reading its status", async () => {
    const { group, members, user } = await seedGroupWithMembers(["A", "B"]);

    const draft = await new ExpensesRepository(db).create(
      user.id,
      baseInput(group.id, members[0].id, [
        {
          description: "Item",
          unitPrice: 300,
          quantity: 1,
          assignment: { type: "one", memberId: members[1].id },
        },
      ]),
    );

    const modes = await expenseLockModesDuring((wrapped) =>
      new ExpensesRepository(wrapped).updateItemAssignment(
        user.id,
        draft.id,
        draft.items[0].id,
        { type: "one", memberId: members[0].id },
      ),
    );

    // `RowShareLock` is contributed specifically by the `FOR NO KEY UPDATE`
    // clause — the method's later `UPDATE expenses` contributes the separate
    // `RowExclusiveLock`, so the two are distinguishable. Without the lock, a
    // concurrent finalize can slip between this method's status read and its
    // write, leaving a finalized expense with an unfrozen `everyone` item.
    //
    // This proves the clause is still present, NOT that the interleaving is
    // correct — PGlite is single-connection, so the race itself can't be run.
    expect(modes).toContain("RowShareLock");
  });

  it("migration 0003 backfills expenses finalized before the freeze existed", async () => {
    const { group, members, user } = await seedGroupWithMembers(["A", "B"]);
    const repo = new ExpensesRepository(db);

    const draft = await repo.create(
      user.id,
      baseInput(group.id, members[0].id, [
        {
          description: "Legacy dinner",
          unitPrice: 900,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ]),
    );
    // Reproduce pre-migration data: finalized, but with the `everyone` mode and
    // no member rows — bypassing the repository, which now freezes.
    await db
      .update(expenses)
      .set({ status: "finalized" })
      .where(eq(expenses.id, draft.id));

    for (const statement of await readMigrationStatements(
      "0003_freeze_finalized_everyone_splits",
    )) {
      await db.execute(sql.raw(statement));
    }

    const migrated = await repo.findById(user.id, draft.id);
    expect([...equalMemberIds(migrated?.items[0].assignment)].sort()).toEqual(
      [...members.map((m) => m.id), await callerMemberId(group.id)].sort(),
    );
    // Now stable: adding a member no longer changes what this expense split.
    const before = computeGroupBalances(group.id, [migrated!], []);
    expect(before).not.toEqual([]);
    await seedMember(db, group.id, "Latecomer", 5);
    const after = computeGroupBalances(
      group.id,
      [(await repo.findById(user.id, draft.id))!],
      [],
    );
    expect(after).toEqual(before);

    // Drafts are left alone — `everyone` there still means "whoever is in the group".
    const stillDraft = await repo.create(
      user.id,
      baseInput(group.id, members[0].id, [
        {
          description: "Draft",
          unitPrice: 900,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ]),
    );
    for (const statement of await readMigrationStatements(
      "0003_freeze_finalized_everyone_splits",
    )) {
      await db.execute(sql.raw(statement));
    }
    const [draftItem] = await db
      .select()
      .from(receiptItems)
      .where(eq(receiptItems.id, stillDraft.items[0].id));
    expect(draftItem.assignmentMode).toBe("everyone");
  });

  it("updateItemAssignment() freezes 'everyone' when the expense is already finalized", async () => {
    const { group, members, user } = await seedGroupWithMembers(["A", "B"]);
    const repo = new ExpensesRepository(db);

    const draft = await repo.create(
      user.id,
      baseInput(group.id, members[0].id, [
        {
          description: "Item",
          unitPrice: 300,
          quantity: 1,
          assignment: { type: "one", memberId: members[1].id },
        },
      ]),
    );
    await repo.finalize(user.id, draft.id);

    // Re-assigning a finalized item to `everyone` must not leave the expense
    // carrying an unfrozen, membership-dependent split.
    const updated = await repo.updateItemAssignment(
      user.id,
      draft.id,
      draft.items[0].id,
      { type: "everyone" },
    );

    expect(updated?.items[0].assignment.type).toBe("equal");
    expect(equalMemberIds(updated?.items[0].assignment)).toHaveLength(3);

    // A draft, by contrast, keeps resolving dynamically.
    const stillDraft = await repo.create(
      user.id,
      baseInput(group.id, members[0].id, [
        {
          description: "Item",
          unitPrice: 300,
          quantity: 1,
          assignment: { type: "one", memberId: members[1].id },
        },
      ]),
    );
    const draftUpdated = await repo.updateItemAssignment(
      user.id,
      stillDraft.id,
      stillDraft.items[0].id,
      { type: "everyone" },
    );
    expect(draftUpdated?.items[0].assignment).toEqual({ type: "everyone" });
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
