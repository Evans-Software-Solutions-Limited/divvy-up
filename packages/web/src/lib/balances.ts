import type { Balance, Expense, Member } from "@divvy-up/core";

/**
 * Client-side balance preview that mirrors the backend `computeBalances`
 * algorithm exactly. Used to show a live balance estimate during receipt
 * review before the expense is finalized.
 *
 * Keep this in sync with:
 *   microservices/core/src/application/expenses/finalize/computeBalances.ts
 */
export function computeBalancesPreview(
  expense: Expense,
  members: Member[],
): Omit<Balance, "groupId">[] {
  const memberIds = members.map((m) => m.id);
  // Track every member's item cost (including payer) for fair adjustment
  // distribution — mirrors the backend computeBalances approach.
  const itemShareAll = new Map<string, number>();
  const owedByMember = new Map<string, number>();

  for (const item of expense.items) {
    const itemTotal = item.unitPrice * item.quantity;
    const { assignment } = item;

    let shares: { memberId: string; fraction: number }[];

    if (assignment.type === "one") {
      shares = [{ memberId: assignment.memberId, fraction: 1 }];
    } else if (assignment.type === "equal") {
      const count = assignment.memberIds.length;
      if (count === 0) continue;
      shares = assignment.memberIds.map((id) => ({
        memberId: id,
        fraction: 1 / count,
      }));
    } else if (assignment.type === "everyone") {
      const count = memberIds.length;
      if (count === 0) continue;
      shares = memberIds.map((id) => ({ memberId: id, fraction: 1 / count }));
    } else {
      // custom
      shares = assignment.shares.map((s) => ({
        memberId: s.memberId,
        fraction: s.fraction,
      }));
    }

    for (const { memberId, fraction } of shares) {
      const share = Math.round(itemTotal * fraction);
      itemShareAll.set(memberId, (itemShareAll.get(memberId) ?? 0) + share);
      if (memberId === expense.payerId) continue;
      owedByMember.set(memberId, (owedByMember.get(memberId) ?? 0) + share);
    }
  }

  // Distribute adjustments proportionally — mirrors backend behaviour.
  if (expense.adjustments.length > 0) {
    const totalAllShares = [...itemShareAll.values()].reduce(
      (a, b) => a + b,
      0,
    );
    if (totalAllShares > 0) {
      for (const adj of expense.adjustments) {
        const adjAmount = adj.isPercent
          ? Math.round((totalAllShares * adj.amount) / 100)
          : adj.amount;
        const signed = adj.kind === "discount" ? -adjAmount : adjAmount;
        for (const [memberId, owed] of owedByMember.entries()) {
          const memberFullShare = itemShareAll.get(memberId) ?? 0;
          owedByMember.set(
            memberId,
            owed + Math.round((signed * memberFullShare) / totalAllShares),
          );
        }
      }
    }
  }

  return [...owedByMember.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([fromMemberId, amount]) => ({
      fromMemberId,
      toMemberId: expense.payerId,
      amount,
    }));
}
