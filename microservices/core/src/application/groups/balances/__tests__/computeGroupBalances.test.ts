import { describe, expect, it } from "vitest";
import { computeGroupBalances } from "../computeGroupBalances";
import type {
  Expense,
  ItemAssignment,
  Settlement,
} from "../../../../domain/types";

const GROUP = "group-1";

function expense(
  payerId: string,
  items: Array<{
    unitPrice: number;
    quantity?: number;
    assignment: ItemAssignment;
  }>,
): Expense {
  return {
    id: crypto.randomUUID(),
    groupId: GROUP,
    payerId,
    description: "Dinner",
    date: "2026-07-16",
    items: items.map((it) => ({
      id: crypto.randomUUID(),
      expenseId: "e",
      description: "item",
      unitPrice: it.unitPrice,
      quantity: it.quantity ?? 1,
      assignment: it.assignment,
    })),
    adjustments: [],
    status: "finalized",
    currency: "GBP",
  };
}

function settlement(
  fromMemberId: string,
  toMemberId: string,
  amount: number,
): Settlement {
  return {
    id: crypto.randomUUID(),
    groupId: GROUP,
    fromMemberId,
    toMemberId,
    amount,
    recordedBy: "user-1",
    createdAt: "2026-07-16T00:00:00.000Z",
  };
}

describe("computeGroupBalances", () => {
  it("nets expenses into minimal transfers", () => {
    // a paid; b and c each owe a for an equal split of £30.
    const e = expense("a", [
      {
        unitPrice: 3000,
        assignment: { type: "equal", memberIds: ["a", "b", "c"] },
      },
    ]);
    const balances = computeGroupBalances(GROUP, [e], ["a", "b", "c"], []);
    // b→a 1000, c→a 1000
    expect(balances).toHaveLength(2);
    expect(
      balances.every((x) => x.toMemberId === "a" && x.amount === 1000),
    ).toBe(true);
  });

  it("subtracts a recorded settlement from the outstanding balance", () => {
    const e = expense("a", [
      { unitPrice: 1000, assignment: { type: "one", memberId: "b" } },
    ]);
    // b owes a 1000, but b already paid a 400.
    const balances = computeGroupBalances(
      GROUP,
      [e],
      ["a", "b"],
      [settlement("b", "a", 400)],
    );
    expect(balances).toEqual([
      { groupId: GROUP, fromMemberId: "b", toMemberId: "a", amount: 600 },
    ]);
  });

  it("returns no balances once a debt is fully settled", () => {
    const e = expense("a", [
      { unitPrice: 1000, assignment: { type: "one", memberId: "b" } },
    ]);
    const balances = computeGroupBalances(
      GROUP,
      [e],
      ["a", "b"],
      [settlement("b", "a", 1000)],
    );
    expect(balances).toEqual([]);
  });

  it("resolves 'everyone' assignments using the member list", () => {
    const e = expense("a", [
      { unitPrice: 900, assignment: { type: "everyone" } },
    ]);
    const balances = computeGroupBalances(GROUP, [e], ["a", "b", "c"], []);
    // £9 split three ways = £3 each; payer a excluded → b and c owe 300.
    expect(balances).toHaveLength(2);
    expect(balances.every((x) => x.amount === 300)).toBe(true);
  });

  it("ignores the empty case", () => {
    expect(computeGroupBalances(GROUP, [], ["a", "b"], [])).toEqual([]);
  });
});
