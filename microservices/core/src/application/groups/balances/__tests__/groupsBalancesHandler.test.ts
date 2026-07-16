import { authHeaders, TEST_USER_ID } from "../../../__tests__/support/authMock";
import { beforeEach, describe, expect, it } from "vitest";
import { groupsBalancesHandler } from "../groupsBalancesHandler";
import { groupsRepo } from "../../../repositories/groupsRepository";
import { expensesRepo as expensesRepoUntyped } from "../../../expenses/create/expensesCreateService";
import { settlementsRepo as settlementsRepoUntyped } from "../../../repositories/settlementsRepository";
import type { Balance, Group } from "../../../../domain/types";
// vitest.setup.ts swaps these for in-memory doubles at runtime; typed here so
// the test-only seed helpers (`_addMember` etc.) are visible.
import type { InMemoryExpensesRepository } from "../../../repositories/__tests__/support/inMemoryExpensesRepository";
import type { InMemorySettlementsRepository } from "../../../repositories/__tests__/support/inMemorySettlementsRepository";

const expensesRepo =
  expensesRepoUntyped as unknown as InMemoryExpensesRepository;
const settlementsRepo =
  settlementsRepoUntyped as unknown as InMemorySettlementsRepository;

beforeEach(() => {
  groupsRepo._clearStore();
  expensesRepo._clearStore();
  settlementsRepo._clearStore();
});

function getBalances(groupId: string, token: "test" | "test-2" = "test") {
  return groupsBalancesHandler.handle(
    new Request(`http://localhost/groups/${groupId}/balances`, {
      headers: authHeaders(token),
    }),
  );
}

/**
 * Seeds a group (creator = active member for TEST_USER_ID) + one extra member,
 * a finalized expense where the extra member owes the creator `amount`, and
 * wires the expense/settlement doubles' membership so the caller is scoped in.
 */
async function seedGroupWithDebt(amount: number) {
  const group = await groupsRepo.create(TEST_USER_ID, "Trip");
  const creator = group.members[0];
  const bob = (await groupsRepo.addMember(TEST_USER_ID, group.id, "Bob"))!;

  expensesRepo._addMember(group.id, TEST_USER_ID);
  const expense = await expensesRepo.create(TEST_USER_ID, {
    groupId: group.id,
    payerId: creator.id,
    description: "Dinner",
    date: "2026-07-16",
    currency: "GBP",
    items: [
      {
        description: "Steak",
        unitPrice: amount,
        quantity: 1,
        assignment: { type: "one", memberId: bob.id },
      },
    ],
  });
  await expensesRepo.finalize(TEST_USER_ID, expense.id);

  settlementsRepo._addMember(group.id, TEST_USER_ID);
  settlementsRepo._addGroupMemberId(group.id, creator.id);
  settlementsRepo._addGroupMemberId(group.id, bob.id);

  return { group, creator, bob };
}

describe("GET /groups/:id/balances", () => {
  it("returns the minimized who-owes-whom for finalized expenses", async () => {
    const { group, creator, bob } = await seedGroupWithDebt(1000);

    const response = await getBalances(group.id);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      group: Group;
      balances: Balance[];
    };
    expect(data.balances).toEqual([
      {
        groupId: group.id,
        fromMemberId: bob.id,
        toMemberId: creator.id,
        amount: 1000,
      },
    ]);
  });

  it("subtracts a recorded settlement from the outstanding balance", async () => {
    const { group, creator, bob } = await seedGroupWithDebt(1000);
    await settlementsRepo.record(TEST_USER_ID, {
      groupId: group.id,
      fromMemberId: bob.id,
      toMemberId: creator.id,
      amount: 400,
    });

    const data = (await (await getBalances(group.id)).json()) as {
      balances: Balance[];
    };
    expect(data.balances).toEqual([
      {
        groupId: group.id,
        fromMemberId: bob.id,
        toMemberId: creator.id,
        amount: 600,
      },
    ]);
  });

  it("shows no balances once the debt is fully settled", async () => {
    const { group, creator, bob } = await seedGroupWithDebt(1000);
    await settlementsRepo.record(TEST_USER_ID, {
      groupId: group.id,
      fromMemberId: bob.id,
      toMemberId: creator.id,
      amount: 1000,
    });

    const data = (await (await getBalances(group.id)).json()) as {
      balances: Balance[];
    };
    expect(data.balances).toEqual([]);
  });

  it("returns 404 for a group the caller isn't a member of", async () => {
    const { group } = await seedGroupWithDebt(1000);
    const response = await getBalances(group.id, "test-2");
    expect(response.status).toBe(404);
  });
});
