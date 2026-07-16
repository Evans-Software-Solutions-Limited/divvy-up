import { describe, expect, it } from "vitest";
import { computeBalances } from "../computeBalances";
import type {
  Expense,
  ItemAssignment,
  ReceiptAdjustment,
} from "../../../../domain/types";

const GROUP = "group-1";

function expense(
  payerId: string,
  items: Array<{
    unitPrice: number;
    quantity?: number;
    assignment: ItemAssignment;
  }>,
  adjustments: ReceiptAdjustment[] = [],
): Expense {
  return {
    id: "expense-1",
    groupId: GROUP,
    payerId,
    description: "Dinner",
    date: "2026-07-16",
    items: items.map((it, i) => ({
      id: `item-${i}`,
      expenseId: "expense-1",
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

/** Map fromMemberId → amount for terse assertions. */
function byMember(balances: ReturnType<typeof computeBalances>) {
  return Object.fromEntries(balances.map((b) => [b.fromMemberId, b.amount]));
}

describe("computeBalances — adjustment distribution", () => {
  it("distributes a fixed tax proportionally to consumption", () => {
    // b ate £20, c ate £10; a paid. £6 fixed tax over a £30 subtotal.
    const e = expense(
      "a",
      [
        { unitPrice: 2000, assignment: { type: "one", memberId: "b" } },
        { unitPrice: 1000, assignment: { type: "one", memberId: "c" } },
      ],
      [{ kind: "tax", amount: 600, isPercent: false }],
    );
    // tax split 2:1 → b +400, c +200.
    expect(byMember(computeBalances(e, ["a", "b", "c"]))).toEqual({
      b: 2400,
      c: 1200,
    });
  });

  it("applies a percent tip in basis points off the subtotal", () => {
    const e = expense(
      "a",
      [
        { unitPrice: 2000, assignment: { type: "one", memberId: "b" } },
        { unitPrice: 1000, assignment: { type: "one", memberId: "c" } },
      ],
      // 10% = 1000 bps of £30 = £3, split 2:1 → b +200, c +100.
      [{ kind: "tip", amount: 1000, isPercent: true }],
    );
    expect(byMember(computeBalances(e, ["a", "b", "c"]))).toEqual({
      b: 2200,
      c: 1100,
    });
  });

  it("distributes a negative fixed discount, reducing what members owe", () => {
    const e = expense(
      "a",
      [
        { unitPrice: 2000, assignment: { type: "one", memberId: "b" } },
        { unitPrice: 1000, assignment: { type: "one", memberId: "c" } },
      ],
      [{ kind: "discount", amount: -300, isPercent: false }],
    );
    // -£3 split 2:1 → b -200, c -100.
    expect(byMember(computeBalances(e, ["a", "b", "c"]))).toEqual({
      b: 1800,
      c: 900,
    });
  });

  it("composes multiple adjustments independently off the same subtotal", () => {
    const e = expense(
      "a",
      [
        { unitPrice: 2000, assignment: { type: "one", memberId: "b" } },
        { unitPrice: 1000, assignment: { type: "one", memberId: "c" } },
      ],
      [
        { kind: "tax", amount: 600, isPercent: false }, // +400 / +200
        { kind: "tip", amount: 1000, isPercent: true }, // 10% = +200 / +100
        { kind: "discount", amount: -150, isPercent: false }, // -100 / -50
      ],
    );
    expect(byMember(computeBalances(e, ["a", "b", "c"]))).toEqual({
      b: 2000 + 400 + 200 - 100,
      c: 1000 + 200 + 100 - 50,
    });
  });

  it("reconciles an indivisible adjustment to the exact penny (largest-remainder)", () => {
    // £30 split equally among b, c, d + £1 tax that doesn't divide by 3.
    const e = expense(
      "a",
      [
        {
          unitPrice: 3000,
          assignment: { type: "equal", memberIds: ["b", "c", "d"] },
        },
      ],
      [{ kind: "tax", amount: 100, isPercent: false }],
    );
    const balances = computeBalances(e, ["a", "b", "c", "d"]);
    const amounts = byMember(balances);
    // Tax split 100/3 → 34,33,33 (extra penny to the first by index), never 33/33/33.
    expect(amounts).toEqual({ b: 1034, c: 1033, d: 1033 });
    const taxDistributed =
      amounts.b - 1000 + (amounts.c - 1000) + (amounts.d - 1000);
    expect(taxDistributed).toBe(100); // no penny invented or lost
  });

  it("counts the payer in the basis but never charges them (payer ate everything)", () => {
    const e = expense(
      "a",
      [{ unitPrice: 2000, assignment: { type: "one", memberId: "a" } }],
      [
        { kind: "tax", amount: 600, isPercent: false },
        { kind: "tip", amount: 1000, isPercent: true },
      ],
    );
    expect(computeBalances(e, ["a"])).toEqual([]);
  });

  it("keeps the payer's proportional share of an adjustment on the payer", () => {
    // a and b each ate £10; a paid. Fixed £2 tax splits 1:1 → a's £1 stays on a.
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
    // b owes their £10 + their £1 of tax; a's £1 of tax is absorbed by the payer.
    expect(byMember(computeBalances(e, ["a", "b"]))).toEqual({ b: 1100 });
  });

  it("does not spread adjustment onto unassigned consumption (payer absorbs it)", () => {
    const e = expense(
      "a",
      [
        { unitPrice: 1000, assignment: { type: "one", memberId: "b" } },
        { unitPrice: 500, assignment: { type: "equal", memberIds: [] } }, // unassigned
      ],
      [{ kind: "tax", amount: 100, isPercent: false }],
    );
    // Only b's £10 is in the basis → the whole £1 tax lands on b; the unassigned
    // £5 and its tax are absorbed by the payer.
    expect(byMember(computeBalances(e, ["a", "b"]))).toEqual({ b: 1100 });
  });

  it("drops adjustment pence with no basis to distribute onto", () => {
    const e = expense(
      "a",
      [{ unitPrice: 3000, assignment: { type: "equal", memberIds: [] } }],
      [
        { kind: "tax", amount: 600, isPercent: false },
        { kind: "tip", amount: 1000, isPercent: true },
      ],
    );
    // Nothing assigned → nowhere to attach the adjustment; it vanishes rather
    // than landing on the payer or breaking reconciliation.
    expect(computeBalances(e, ["a", "b", "c"])).toEqual([]);
  });

  it("allows a discount larger than the subtotal to flip a member into credit", () => {
    const e = expense(
      "a",
      [{ unitPrice: 1000, assignment: { type: "one", memberId: "b" } }],
      [{ kind: "discount", amount: -1500, isPercent: false }],
    );
    // b consumed £10 but the £15 discount over-runs it → a owes b £5 (reversed).
    expect(byMember(computeBalances(e, ["a", "b"]))).toEqual({ b: -500 });
  });

  it("omits a member whose adjustment exactly cancels their consumption", () => {
    const e = expense(
      "a",
      [{ unitPrice: 500, assignment: { type: "one", memberId: "b" } }],
      [{ kind: "discount", amount: -500, isPercent: false }],
    );
    expect(computeBalances(e, ["a", "b"])).toEqual([]);
  });

  it("leaves adjustment-free receipts unchanged", () => {
    const e = expense("a", [
      { unitPrice: 450, assignment: { type: "one", memberId: "b" } },
    ]);
    expect(byMember(computeBalances(e, ["a", "b"]))).toEqual({ b: 450 });
  });
});
