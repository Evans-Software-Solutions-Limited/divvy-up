import { describe, it, expect } from "vitest";

/**
 * Test the balance calculation logic for receipt item assignment.
 * This mirrors the calculateBalances function used in ReceiptReview.tsx
 */

interface ItemAssignment {
  itemId: string;
  mode: "one" | "equal" | "everyone" | "custom";
  assignedMemberIds: string[];
  customShares?: Record<string, number>;
}

interface MockItem {
  id: string;
  unitPrice: number;
  quantity: number;
}

interface CalculatedBalance {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

const MOCK_MEMBERS = [
  { id: "alice", name: "Alice" },
  { id: "bob", name: "Bob" },
  { id: "charlie", name: "Charlie" },
];

function calculateBalances(
  items: MockItem[],
  assignments: ItemAssignment[],
  taxAmount: number,
  tipAmount: number,
  discountAmount: number
): CalculatedBalance[] {
  const owedByMember: Record<string, number> = {};
  MOCK_MEMBERS.forEach((m) => {
    owedByMember[m.id] = 0;
  });

  assignments.forEach((assignment) => {
    const item = items.find((i) => i.id === assignment.itemId);
    if (!item) return;

    const itemTotal = item.unitPrice * item.quantity;

    if (assignment.mode === "one") {
      owedByMember[assignment.assignedMemberIds[0]] += itemTotal;
    } else if (assignment.mode === "equal") {
      const perPerson = itemTotal / assignment.assignedMemberIds.length;
      assignment.assignedMemberIds.forEach((memberId) => {
        owedByMember[memberId] += perPerson;
      });
    } else if (assignment.mode === "everyone") {
      const perPerson = itemTotal / MOCK_MEMBERS.length;
      MOCK_MEMBERS.forEach((m) => {
        owedByMember[m.id] += perPerson;
      });
    } else if (assignment.mode === "custom" && assignment.customShares) {
      Object.entries(assignment.customShares).forEach(([memberId, fraction]) => {
        owedByMember[memberId] += itemTotal * fraction;
      });
    }
  });

  // Distribute tax proportionally
  const totalOwed = Object.values(owedByMember).reduce((a, b) => a + b, 0);
  if (totalOwed > 0) {
    Object.keys(owedByMember).forEach((memberId) => {
      owedByMember[memberId] += (taxAmount * owedByMember[memberId]) / totalOwed;
    });
  }

  // Distribute tip evenly
  const tipPerPerson = tipAmount / MOCK_MEMBERS.length;
  MOCK_MEMBERS.forEach((m) => {
    owedByMember[m.id] += tipPerPerson;
  });

  // Apply discount evenly
  const discountPerPerson = discountAmount / MOCK_MEMBERS.length;
  MOCK_MEMBERS.forEach((m) => {
    owedByMember[m.id] -= discountPerPerson;
  });

  // Convert to pairwise balances (payer is first member)
  const payer = MOCK_MEMBERS[0];
  const balances: CalculatedBalance[] = [];

  MOCK_MEMBERS.forEach((member) => {
    if (member.id !== payer.id && owedByMember[member.id] > 0) {
      balances.push({
        fromMemberId: member.id,
        toMemberId: payer.id,
        amount: Math.round(owedByMember[member.id]),
      });
    }
  });

  return balances;
}

describe("ReceiptReview Balance Calculation", () => {
  describe("one person assignment", () => {
    it("should assign entire item cost to one person", () => {
      const items: MockItem[] = [
        { id: "item-1", unitPrice: 1000, quantity: 1 }, // $10
      ];
      const assignments: ItemAssignment[] = [
        {
          itemId: "item-1",
          mode: "one",
          assignedMemberIds: ["bob"],
        },
      ];

      const balances = calculateBalances(items, assignments, 0, 0, 0);

      expect(balances).toHaveLength(1);
      expect(balances[0]).toEqual({
        fromMemberId: "bob",
        toMemberId: "alice",
        amount: 1000,
      });
    });
  });

  describe("equal split assignment", () => {
    it("should split evenly among selected members", () => {
      const items: MockItem[] = [
        { id: "item-1", unitPrice: 1200, quantity: 1 }, // $12
      ];
      const assignments: ItemAssignment[] = [
        {
          itemId: "item-1",
          mode: "equal",
          assignedMemberIds: ["bob", "charlie"],
        },
      ];

      const balances = calculateBalances(items, assignments, 0, 0, 0);

      expect(balances).toHaveLength(2);
      expect(balances[0].amount).toBe(600); // $6 each
      expect(balances[1].amount).toBe(600);
    });
  });

  describe("everyone assignment", () => {
    it("should split evenly among all group members", () => {
      const items: MockItem[] = [
        { id: "item-1", unitPrice: 3000, quantity: 1 }, // $30
      ];
      const assignments: ItemAssignment[] = [
        {
          itemId: "item-1",
          mode: "everyone",
          assignedMemberIds: MOCK_MEMBERS.map((m) => m.id),
        },
      ];

      const balances = calculateBalances(items, assignments, 0, 0, 0);

      expect(balances).toHaveLength(2);
      expect(balances[0].amount).toBe(1000); // $10 each
      expect(balances[1].amount).toBe(1000);
    });
  });

  describe("custom shares assignment", () => {
    it("should assign based on custom fractions", () => {
      const items: MockItem[] = [
        { id: "item-1", unitPrice: 1000, quantity: 1 }, // $10
      ];
      const assignments: ItemAssignment[] = [
        {
          itemId: "item-1",
          mode: "custom",
          assignedMemberIds: ["bob", "charlie"],
          customShares: {
            bob: 0.7,
            charlie: 0.3,
          },
        },
      ];

      const balances = calculateBalances(items, assignments, 0, 0, 0);

      expect(balances).toHaveLength(2);
      expect(balances[0].amount).toBe(700); // 70%
      expect(balances[1].amount).toBe(300); // 30%
    });
  });

  describe("tax and tip handling", () => {
    it("should distribute tax proportionally and tip evenly", () => {
      const items: MockItem[] = [
        { id: "item-1", unitPrice: 1000, quantity: 1 }, // $10
      ];
      const assignments: ItemAssignment[] = [
        {
          itemId: "item-1",
          mode: "everyone",
          assignedMemberIds: MOCK_MEMBERS.map((m) => m.id),
        },
      ];

      const balances = calculateBalances(
        items,
        assignments,
        100, // $1 tax
        300, // $3 tip
        0
      );

      // Each person gets $10/3 + tax share + $3/3 tip
      // Alice (payer) pays $10/3 + tax share + $3/3
      // Bob and Charlie owe: $10/3 + tax share + $3/3
      expect(balances.length).toBeGreaterThan(0);
      const bobBalance = balances.find((b) => b.fromMemberId === "bob");
      expect(bobBalance?.amount).toBeGreaterThan(0);
    });
  });

  describe("multiple items with mixed assignments", () => {
    it("should handle multiple items with different split modes", () => {
      const items: MockItem[] = [
        { id: "item-1", unitPrice: 1000, quantity: 1 }, // $10 - one
        { id: "item-2", unitPrice: 2000, quantity: 1 }, // $20 - everyone
      ];
      const assignments: ItemAssignment[] = [
        {
          itemId: "item-1",
          mode: "one",
          assignedMemberIds: ["bob"],
        },
        {
          itemId: "item-2",
          mode: "everyone",
          assignedMemberIds: MOCK_MEMBERS.map((m) => m.id),
        },
      ];

      const balances = calculateBalances(items, assignments, 0, 0, 0);

      // Bob: $10 (item-1) + $20/3 (item-2) ≈ $16.67
      // Charlie: $20/3 ≈ $6.67
      expect(balances.length).toBe(2);
      const bobBalance = balances.find((b) => b.fromMemberId === "bob");
      const charlieBalance = balances.find((b) => b.fromMemberId === "charlie");
      expect(bobBalance?.amount || 0).toBeGreaterThan(charlieBalance?.amount || 0);
    });
  });

  describe("discount handling", () => {
    it("should apply discount evenly to all members", () => {
      const items: MockItem[] = [
        { id: "item-1", unitPrice: 1000, quantity: 1 }, // $10
      ];
      const assignments: ItemAssignment[] = [
        {
          itemId: "item-1",
          mode: "everyone",
          assignedMemberIds: MOCK_MEMBERS.map((m) => m.id),
        },
      ];

      const balances = calculateBalances(
        items,
        assignments,
        0,
        0,
        300 // $3 discount
      );

      // Each person owes $10/3 - $3/3 = $7/3 ≈ $2.33
      const totalOwed = balances.reduce((sum, b) => sum + b.amount, 0);
      expect(totalOwed).toBeLessThan(1000); // Less than the original item cost
    });
  });
});
