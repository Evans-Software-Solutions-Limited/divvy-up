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
  adjustments: Expense["adjustments"] = [],
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
    adjustments,
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
    const balances = computeGroupBalances(GROUP, [e], []);
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
      [settlement("b", "a", 1000)],
    );
    expect(balances).toEqual([]);
  });

  it("takes a finalized expense's split from the expense itself, not the group's membership", () => {
    // The frozen split names b and c; a paid. Whoever else is in the group today
    // is irrelevant — there is no member-list input to be influenced by.
    const e = expense("a", [
      {
        unitPrice: 900,
        assignment: { type: "equal", memberIds: ["b", "c"] },
      },
    ]);
    const balances = computeGroupBalances(GROUP, [e], []);
    expect(balances).toHaveLength(2);
    expect(balances.every((x) => x.amount === 450)).toBe(true);
  });

  it("throws rather than silently dropping an unfrozen 'everyone' item", () => {
    // Not reachable through the app — finalize freezes `everyone` into `equal`
    // rows, and migration 0003 backfilled expenses finalized before it did. The
    // remaining way to get here is deploying the code without running the
    // migration, where under-reporting a debt to zero would be far worse than
    // failing loudly.
    const e = expense("a", [
      { unitPrice: 900, assignment: { type: "everyone" } },
    ]);
    expect(() => computeGroupBalances(GROUP, [e], [])).toThrow(/unfrozen/);
  });

  it("ignores the empty case", () => {
    expect(computeGroupBalances(GROUP, [], [])).toEqual([]);
  });

  it("inherits adjustment distribution from computeBalances", () => {
    // a and b split a £20 item; a paid. A £2 fixed tax splits 1:1, so b's
    // £1 tax share rides along into the group view → b owes a £11 total.
    const e = expense(
      "a",
      [
        {
          unitPrice: 2000,
          assignment: { type: "equal", memberIds: ["a", "b"] },
        },
      ],
      [{ kind: "tax", amount: 200, isPercent: false }],
    );
    const balances = computeGroupBalances(GROUP, [e], []);
    expect(balances).toEqual([
      { groupId: GROUP, fromMemberId: "b", toMemberId: "a", amount: 1100 },
    ]);
  });
});
