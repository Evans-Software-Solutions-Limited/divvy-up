import { describe, it, expect } from "vitest";
import { computeBalancesPreview } from "@/lib/balances";
import type { Expense, Member } from "@divvy-up/core";

/**
 * Tests for the balance preview helper used in ReceiptReview.
 *
 * This function mirrors the backend computeBalances algorithm. Keeping these
 * tests aligned with the backend finalize handler tests ensures UI and
 * backend produce identical numbers.
 */

const MEMBERS: Member[] = [
  { id: "alice", groupId: "group-1", name: "Alice" },
  { id: "bob", groupId: "group-1", name: "Bob" },
  { id: "charlie", groupId: "group-1", name: "Charlie" },
];

function makeExpense(
  overrides: Partial<Expense> & {
    items: Expense["items"];
  },
): Expense {
  return {
    id: "exp-1",
    groupId: "group-1",
    payerId: "alice",
    description: "Test",
    date: "2026-03-26",
    currency: "USD",
    status: "draft",
    adjustments: [],
    ...overrides,
  };
}

describe("computeBalancesPreview", () => {
  describe("empty members guard", () => {
    it("returns empty array when members list is empty", () => {
      // This mirrors the ReceiptReview canFinalize guard: calling with no
      // members would skip type:'everyone' items and send memberIds:[] to
      // finalize, producing incorrect balances.
      const expense = makeExpense({
        items: [
          {
            id: "item-1",
            expenseId: "exp-1",
            description: "Shared item",
            unitPrice: 3000,
            quantity: 1,
            assignment: { type: "everyone" },
          },
        ],
      });

      const balances = computeBalancesPreview(expense, []);

      expect(balances).toHaveLength(0);
    });
  });

  describe("one person assignment", () => {
    it("assigns entire item cost to one person", () => {
      const expense = makeExpense({
        items: [
          {
            id: "item-1",
            expenseId: "exp-1",
            description: "Burger",
            unitPrice: 1000,
            quantity: 1,
            assignment: { type: "one", memberId: "bob" },
          },
        ],
      });

      const balances = computeBalancesPreview(expense, MEMBERS);

      expect(balances).toHaveLength(1);
      expect(balances[0]).toEqual({
        fromMemberId: "bob",
        toMemberId: "alice",
        amount: 1000,
      });
    });
  });

  describe("equal split assignment", () => {
    it("splits evenly among selected members", () => {
      const expense = makeExpense({
        items: [
          {
            id: "item-1",
            expenseId: "exp-1",
            description: "Pizza",
            unitPrice: 1200,
            quantity: 1,
            assignment: { type: "equal", memberIds: ["bob", "charlie"] },
          },
        ],
      });

      const balances = computeBalancesPreview(expense, MEMBERS);

      expect(balances).toHaveLength(2);
      expect(balances.every((b) => b.amount === 600)).toBe(true);
    });
  });

  describe("everyone assignment", () => {
    it("splits evenly among all group members", () => {
      const expense = makeExpense({
        items: [
          {
            id: "item-1",
            expenseId: "exp-1",
            description: "Nachos",
            unitPrice: 3000,
            quantity: 1,
            assignment: { type: "everyone" },
          },
        ],
      });

      const balances = computeBalancesPreview(expense, MEMBERS);

      // alice is payer — only bob and charlie owe
      expect(balances).toHaveLength(2);
      expect(balances.every((b) => b.amount === 1000)).toBe(true);
    });
  });

  describe("custom shares assignment", () => {
    it("assigns based on custom fractions", () => {
      const expense = makeExpense({
        items: [
          {
            id: "item-1",
            expenseId: "exp-1",
            description: "Shared platter",
            unitPrice: 1000,
            quantity: 1,
            assignment: {
              type: "custom",
              shares: [
                { memberId: "bob", fraction: 0.7 },
                { memberId: "charlie", fraction: 0.3 },
              ],
            },
          },
        ],
      });

      const balances = computeBalancesPreview(expense, MEMBERS);

      expect(balances).toHaveLength(2);
      const bob = balances.find((b) => b.fromMemberId === "bob");
      const charlie = balances.find((b) => b.fromMemberId === "charlie");
      expect(bob?.amount).toBe(700);
      expect(charlie?.amount).toBe(300);
    });
  });

  describe("adjustment distribution", () => {
    it("distributes tax proportionally to item shares", () => {
      // bob gets $10 item, charlie gets $10 item, alice (payer) gets nothing
      // $2 tax should be split evenly between bob and charlie
      const expense = makeExpense({
        items: [
          {
            id: "item-1",
            expenseId: "exp-1",
            description: "Bob's item",
            unitPrice: 1000,
            quantity: 1,
            assignment: { type: "one", memberId: "bob" },
          },
          {
            id: "item-2",
            expenseId: "exp-1",
            description: "Charlie's item",
            unitPrice: 1000,
            quantity: 1,
            assignment: { type: "one", memberId: "charlie" },
          },
        ],
        adjustments: [{ kind: "tax", amount: 200, isPercent: false }],
      });

      const balances = computeBalancesPreview(expense, MEMBERS);

      const bob = balances.find((b) => b.fromMemberId === "bob");
      const charlie = balances.find((b) => b.fromMemberId === "charlie");
      // Each owes $10 item + $1 tax = $11
      expect(bob?.amount).toBe(1100);
      expect(charlie?.amount).toBe(1100);
    });

    it("distributes tax proportionally when shares differ", () => {
      // bob owes $20, charlie owes $10 (2:1 ratio)
      // $3 tip should be split 2:1 → bob +$2, charlie +$1
      const expense = makeExpense({
        items: [
          {
            id: "item-1",
            expenseId: "exp-1",
            description: "Bob's item",
            unitPrice: 2000,
            quantity: 1,
            assignment: { type: "one", memberId: "bob" },
          },
          {
            id: "item-2",
            expenseId: "exp-1",
            description: "Charlie's item",
            unitPrice: 1000,
            quantity: 1,
            assignment: { type: "one", memberId: "charlie" },
          },
        ],
        adjustments: [{ kind: "tip", amount: 300, isPercent: false }],
      });

      const balances = computeBalancesPreview(expense, MEMBERS);

      const bob = balances.find((b) => b.fromMemberId === "bob");
      const charlie = balances.find((b) => b.fromMemberId === "charlie");
      expect(bob?.amount).toBe(2200); // 2000 + 200 tip
      expect(charlie?.amount).toBe(1100); // 1000 + 100 tip
    });

    it("applies discount proportionally", () => {
      const expense = makeExpense({
        items: [
          {
            id: "item-1",
            expenseId: "exp-1",
            description: "Everyone's item",
            unitPrice: 3000,
            quantity: 1,
            assignment: { type: "everyone" },
          },
        ],
        adjustments: [{ kind: "discount", amount: 300, isPercent: false }],
      });

      const balances = computeBalancesPreview(expense, MEMBERS);

      // each owes 1000, discount reduces by 100 each → 900
      expect(balances).toHaveLength(2);
      expect(balances.every((b) => b.amount === 900)).toBe(true);
    });
  });

  describe("multiple items with mixed assignments", () => {
    it("handles multiple items with different split modes", () => {
      const expense = makeExpense({
        items: [
          {
            id: "item-1",
            expenseId: "exp-1",
            description: "Bob only",
            unitPrice: 1000,
            quantity: 1,
            assignment: { type: "one", memberId: "bob" },
          },
          {
            id: "item-2",
            expenseId: "exp-1",
            description: "Everyone",
            unitPrice: 2100,
            quantity: 1,
            assignment: { type: "everyone" },
          },
        ],
      });

      const balances = computeBalancesPreview(expense, MEMBERS);

      // bob: $10 + $7 = $17
      // charlie: $7
      const bob = balances.find((b) => b.fromMemberId === "bob");
      const charlie = balances.find((b) => b.fromMemberId === "charlie");
      expect(bob!.amount).toBeGreaterThan(charlie!.amount);
    });
  });
});
