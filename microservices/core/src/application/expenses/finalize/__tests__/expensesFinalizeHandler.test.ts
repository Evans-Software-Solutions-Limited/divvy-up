import { authHeaders, TEST_USER_ID } from "../../../__tests__/support/authMock";
import { beforeEach, describe, expect, it } from "vitest";
import { expensesFinalizeHandler } from "../expensesFinalizeHandler";
import { expensesRepo as expensesRepoUntyped } from "../../create/expensesCreateService";
import type { Balance, Expense } from "../../../../domain/types";
// The vitest.setup.ts module mock swaps the real repo for this in-memory
// double at runtime; typed here so `_addMember` (test-only, not on the real
// class) is visible.
import type { InMemoryExpensesRepository } from "../../../repositories/__tests__/support/inMemoryExpensesRepository";

const expensesRepo =
  expensesRepoUntyped as unknown as InMemoryExpensesRepository;

beforeEach(() => {
  expensesRepo._clearStore();
  expensesRepo._addMember("group-1", TEST_USER_ID);
});

describe("POST /expenses/:id/finalize", () => {
  it("marks the expense as finalized", async () => {
    const expense = await expensesRepo.create(TEST_USER_ID, {
      groupId: "group-1",
      payerId: "member-1",
      description: "Lunch",
      date: "2026-03-26",
      currency: "USD",
      items: [
        {
          description: "Burger",
          unitPrice: 1500,
          quantity: 1,
          assignment: { type: "one", memberId: "member-2" },
        },
      ],
    });

    const response = await expensesFinalizeHandler.handle(
      new Request(`http://localhost/expenses/${expense.id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      expense: Expense;
      balances: Balance[];
    };
    expect(data.expense.status).toBe("finalized");
  });

  it("computes balances for 'one' assignment", async () => {
    const expense = await expensesRepo.create(TEST_USER_ID, {
      groupId: "group-1",
      payerId: "member-1",
      description: "Coffee",
      date: "2026-03-26",
      currency: "USD",
      items: [
        {
          description: "Flat white",
          unitPrice: 450,
          quantity: 1,
          assignment: { type: "one", memberId: "member-2" },
        },
      ],
    });

    const response = await expensesFinalizeHandler.handle(
      new Request(`http://localhost/expenses/${expense.id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      }),
    );

    const data = (await response.json()) as {
      expense: Expense;
      balances: Balance[];
    };
    expect(data.balances).toHaveLength(1);
    expect(data.balances[0]).toMatchObject({
      fromMemberId: "member-2",
      toMemberId: "member-1",
      amount: 450,
    });
  });

  it("computes balances for 'equal' split", async () => {
    const expense = await expensesRepo.create(TEST_USER_ID, {
      groupId: "group-1",
      payerId: "member-1",
      description: "Pizza",
      date: "2026-03-26",
      currency: "USD",
      items: [
        {
          description: "Margherita",
          unitPrice: 2400,
          quantity: 1,
          assignment: {
            type: "equal",
            memberIds: ["member-1", "member-2", "member-3"],
          },
        },
      ],
    });

    const response = await expensesFinalizeHandler.handle(
      new Request(`http://localhost/expenses/${expense.id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      }),
    );

    const data = (await response.json()) as {
      expense: Expense;
      balances: Balance[];
    };
    // member-1 is the payer so they don't appear in balances
    expect(data.balances).toHaveLength(2);
    expect(data.balances.every((b) => b.amount === 800)).toBe(true);
  });

  it("freezes 'everyone' server-side and ignores any client-supplied member list", async () => {
    expensesRepo._setGroupMemberIds("group-1", [
      "member-1",
      "member-2",
      "member-3",
      "member-4",
    ]);
    const expense = await expensesRepo.create(TEST_USER_ID, {
      groupId: "group-1",
      payerId: "member-1",
      description: "Shared snacks",
      date: "2026-03-26",
      currency: "USD",
      items: [
        {
          description: "Nachos",
          unitPrice: 1200,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ],
    });

    const response = await expensesFinalizeHandler.handle(
      new Request(`http://localhost/expenses/${expense.id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        // A stale client still sending the (now removed) member list — and
        // deliberately a *wrong* one, to prove it has no influence.
        body: JSON.stringify({ memberIds: ["member-1", "member-2"] }),
      }),
    );

    const data = (await response.json()) as {
      expense: Expense;
      balances: Balance[];
    };
    // Split over the group's 4 members (frozen at finalize), payer excluded from
    // owing: 3 × 300. The body asked for a 2-way split and got no say — the
    // participant set is the repository's to freeze, not the caller's to dictate.
    expect(response.status).toBe(200);
    expect(data.balances).toHaveLength(3);
    expect(data.balances.every((b) => b.amount === 300)).toBe(true);
  });

  it("returns 404 for unknown expense", async () => {
    const response = await expensesFinalizeHandler.handle(
      new Request("http://localhost/expenses/unknown-id/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the caller is not a member of the expense's group", async () => {
    const expense = await expensesRepo.create(TEST_USER_ID, {
      groupId: "group-1",
      payerId: "member-1",
      description: "Lunch",
      date: "2026-03-26",
      currency: "USD",
      items: [
        {
          description: "Burger",
          unitPrice: 1500,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ],
    });

    const response = await expensesFinalizeHandler.handle(
      new Request(`http://localhost/expenses/${expense.id}/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders("test-2"),
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(404);
  });
});
