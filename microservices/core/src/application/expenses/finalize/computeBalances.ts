import type { Balance, Expense, MemberId } from "../../../domain/types";

/** Largest-remainder integer split — same algorithm as the frontend splitPence. */
function splitPence(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floor = raw.map(Math.floor);
  const rem = total - floor.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => [r - floor[i], i] as [number, number])
    .sort((a, b) => b[0] - a[0]);
  const out = floor.slice();
  for (let k = 0; k < rem; k++) out[order[k % order.length][1]]++;
  return out;
}

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

    let participants: MemberId[];
    let weights: number[];

    if (assignment.type === "one") {
      participants = [assignment.memberId];
      weights = [1];
    } else if (assignment.type === "equal") {
      if (assignment.memberIds.length === 0) continue;
      participants = assignment.memberIds;
      weights = assignment.memberIds.map(() => 1);
    } else if (assignment.type === "everyone") {
      if (memberIds.length === 0) continue; // can't resolve without member list
      participants = memberIds;
      weights = memberIds.map(() => 1);
    } else {
      // custom
      participants = assignment.shares.map((s) => s.memberId);
      weights = assignment.shares.map((s) => s.fraction);
    }

    const parts = splitPence(itemTotal, weights);
    for (let i = 0; i < participants.length; i++) {
      const memberId = participants[i];
      if (memberId === expense.payerId) continue; // payer doesn't owe themselves
      owedByMember.set(memberId, (owedByMember.get(memberId) ?? 0) + parts[i]);
    }
  }

  return [...owedByMember.entries()].map(([fromMemberId, amount]) => ({
    groupId: expense.groupId,
    fromMemberId,
    toMemberId: expense.payerId,
    amount,
  }));
}
