import { beforeEach, describe, expect, it } from "vitest";
import { expensesFinalizeHandler } from "../expensesFinalizeHandler";
import { expensesRepo } from "../../create/expensesCreateService";
import type { Balance, Expense } from "../../../../domain/types";

beforeEach(() => {
  expensesRepo._clearStore();
});

describe("POST /expenses/:id/finalize", () => {
  it("marks the expense as finalized", async () => {
    const expense = await expensesRepo.create({
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
        headers: { "Content-Type": "application/json" },
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
    const expense = await expensesRepo.create({
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
        headers: { "Content-Type": "application/json" },
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
    const expense = await expensesRepo.create({
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
        headers: { "Content-Type": "application/json" },
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

  it("resolves 'everyone' assignments when memberIds provided", async () => {
    const expense = await expensesRepo.create({
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds: ["member-1", "member-2", "member-3", "member-4"],
        }),
      }),
    );

    const data = (await response.json()) as {
      expense: Expense;
      balances: Balance[];
    };
    // 4 members, payer excluded from owing: 3 balance entries of 300 each
    expect(data.balances).toHaveLength(3);
    expect(data.balances.every((b) => b.amount === 300)).toBe(true);
  });

  it("returns 404 for unknown expense", async () => {
    const response = await expensesFinalizeHandler.handle(
      new Request("http://localhost/expenses/unknown-id/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(404);
  });

  describe("adjustment distribution", () => {
    it("distributes tax proportionally to item shares", async () => {
      // member-2 and member-3 each get a $10 item, $2 tax split evenly
      const expense = await expensesRepo.create({
        groupId: "group-1",
        payerId: "member-1",
        description: "Dinner",
        date: "2026-03-26",
        currency: "USD",
        items: [
          {
            description: "member-2 item",
            unitPrice: 1000,
            quantity: 1,
            assignment: { type: "one", memberId: "member-2" },
          },
          {
            description: "member-3 item",
            unitPrice: 1000,
            quantity: 1,
            assignment: { type: "one", memberId: "member-3" },
          },
        ],
        adjustments: [{ kind: "tax", amount: 200, isPercent: false }],
      });

      const response = await expensesFinalizeHandler.handle(
        new Request(`http://localhost/expenses/${expense.id}/finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );

      const data = (await response.json()) as { balances: Balance[] };
      expect(data.balances).toHaveLength(2);
      // Each member owes $10 item + $1 tax share = $11
      expect(data.balances.every((b) => b.amount === 1100)).toBe(true);
    });

    it("distributes tip proportionally when item shares differ", async () => {
      // member-2 owes $20, member-3 owes $10 → 2:1 ratio
      // $3 tip: member-2 +$2, member-3 +$1
      const expense = await expensesRepo.create({
        groupId: "group-1",
        payerId: "member-1",
        description: "Lunch",
        date: "2026-03-26",
        currency: "USD",
        items: [
          {
            description: "member-2 large item",
            unitPrice: 2000,
            quantity: 1,
            assignment: { type: "one", memberId: "member-2" },
          },
          {
            description: "member-3 small item",
            unitPrice: 1000,
            quantity: 1,
            assignment: { type: "one", memberId: "member-3" },
          },
        ],
        adjustments: [{ kind: "tip", amount: 300, isPercent: false }],
      });

      const response = await expensesFinalizeHandler.handle(
        new Request(`http://localhost/expenses/${expense.id}/finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );

      const data = (await response.json()) as { balances: Balance[] };
      const m2 = data.balances.find((b) => b.fromMemberId === "member-2");
      const m3 = data.balances.find((b) => b.fromMemberId === "member-3");
      expect(m2?.amount).toBe(2200);
      expect(m3?.amount).toBe(1100);
    });

    it("applies discount proportionally reducing what each member owes", async () => {
      const expense = await expensesRepo.create({
        groupId: "group-1",
        payerId: "member-1",
        description: "Happy hour",
        date: "2026-03-26",
        currency: "USD",
        items: [
          {
            description: "Shared round",
            unitPrice: 3000,
            quantity: 1,
            assignment: {
              type: "equal",
              memberIds: ["member-1", "member-2", "member-3"],
            },
          },
        ],
        adjustments: [{ kind: "discount", amount: 300, isPercent: false }],
      });

      const response = await expensesFinalizeHandler.handle(
        new Request(`http://localhost/expenses/${expense.id}/finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );

      const data = (await response.json()) as { balances: Balance[] };
      // Each non-payer owes $10 item share − $1 discount = $9
      expect(data.balances).toHaveLength(2);
      expect(data.balances.every((b) => b.amount === 900)).toBe(true);
    });
  });
});
