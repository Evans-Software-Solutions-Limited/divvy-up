import type { Balance, Expense, MemberId } from "../../../domain/types";

/**
 * Derives per-member balances from a finalized expense.
 *
 * Each member owes their share of each item back to the payer.
 * Adjustments (tax, tip, discount) are NOT distributed here — they affect
 * the receipt total but per-member distribution requires a dedicated design
 * pass (tracked as a future task).
 *
 * @param expense   The expense to compute balances from.
 * @param memberIds Full member list of the group, used to resolve
 *                  `type: "everyone"` assignments. Pass `[]` if unknown;
 *                  "everyone" items will be skipped.
 */
export function computeBalances(
  expense: Expense,
  memberIds: MemberId[],
): Balance[] {
  const owedByMember = new Map<MemberId, number>();

  for (const item of expense.items) {
    const itemTotal = item.unitPrice * item.quantity;
    const { assignment } = item;

    let shares: { memberId: MemberId; fraction: number }[];

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
      if (count === 0) continue; // can't resolve without member list
      shares = memberIds.map((id) => ({ memberId: id, fraction: 1 / count }));
    } else {
      // custom
      shares = assignment.shares.map((s) => ({
        memberId: s.memberId,
        fraction: s.fraction,
      }));
    }

    for (const { memberId, fraction } of shares) {
      if (memberId === expense.payerId) continue; // payer doesn't owe themselves
      const owed = Math.round(itemTotal * fraction);
      owedByMember.set(memberId, (owedByMember.get(memberId) ?? 0) + owed);
    }
  }

  return [...owedByMember.entries()].map(([fromMemberId, amount]) => ({
    groupId: expense.groupId,
    fromMemberId,
    toMemberId: expense.payerId,
    amount,
  }));
}
