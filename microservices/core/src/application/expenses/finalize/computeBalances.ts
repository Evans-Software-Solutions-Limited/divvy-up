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
 * Each member owes their share of each item back to the payer, plus their
 * share of the receipt-level adjustments (tax / tip / discount).
 *
 * ── Adjustment distribution policy ──────────────────────────────────────────
 * Adjustments are split **proportionally to each member's pre-adjustment
 * consumption** (whoever ordered the steak pays more of the service charge than
 * whoever had tap water). The weight basis is each member's *gross* item share,
 * INCLUDING the payer's own consumption — the payer's slice of an adjustment
 * simply stays on the payer (never becomes a debt), so a receipt the payer ate
 * entirely yields no balances even with tax and tip.
 *
 * - **Percent adjustments** (`isPercent`) are in *basis points* (1250 = 12.5%)
 *   applied to the *distributable subtotal* — the sum of the gross member shares,
 *   i.e. only the consumption that can actually be attributed to someone.
 *   Unassigned items (which the payer effectively absorbs) neither attract nor
 *   spread adjustment. Each adjustment is computed independently off that same
 *   base (non-compounding), rounded once to the penny, then split.
 * - **Fixed adjustments** distribute their stored pence amount directly.
 * - **Discounts** are stored negative; the magnitude is split via
 *   largest-remainder and the sign re-applied, so a discount larger than the
 *   subtotal can flip a member into credit (a reversed balance) — tolerated by
 *   the settle-up path.
 * - **No basis to distribute onto** (nothing assigned to anyone): `splitPence`'s
 *   `sum <= 0` guard yields all-zero shares, so adjustment pence deterministically
 *   go nowhere rather than landing on the payer or breaking reconciliation.
 *
 * Every adjustment reconciles exactly: the distributed shares (across all
 * members, payer included) sum to the adjustment amount to the penny.
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
  // Gross per-member consumption, INCLUDING the payer — the weight basis for
  // distributing receipt-level adjustments proportionally.
  const grossByMember = new Map<MemberId, number>();

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
      grossByMember.set(
        memberId,
        (grossByMember.get(memberId) ?? 0) + parts[i],
      );
      if (memberId === expense.payerId) continue; // payer doesn't owe themselves
      owedByMember.set(memberId, (owedByMember.get(memberId) ?? 0) + parts[i]);
    }
  }

  // Distribute each receipt-level adjustment across the gross-consumption basis.
  const basisMembers = [...grossByMember.keys()];
  const basisWeights = basisMembers.map((m) => grossByMember.get(m) ?? 0);
  const subtotal = basisWeights.reduce((a, b) => a + b, 0);

  for (const adj of expense.adjustments) {
    // Signed total pence for this adjustment (negative for discounts).
    const total = adj.isPercent
      ? Math.round((subtotal * adj.amount) / 10000)
      : adj.amount;
    if (total === 0) continue;

    // Largest-remainder on the magnitude, sign re-applied — keeps discounts
    // reconciling exactly to the (negative) total.
    const shares = splitPence(Math.abs(total), basisWeights).map((s) =>
      total < 0 ? -s : s,
    );
    for (let i = 0; i < basisMembers.length; i++) {
      const memberId = basisMembers[i];
      if (memberId === expense.payerId) continue; // payer's share stays on payer
      owedByMember.set(memberId, (owedByMember.get(memberId) ?? 0) + shares[i]);
    }
  }

  return [...owedByMember.entries()]
    .filter(([, amount]) => amount !== 0) // a discount can net a member to zero
    .map(([fromMemberId, amount]) => ({
      groupId: expense.groupId,
      fromMemberId,
      toMemberId: expense.payerId,
      amount,
    }));
}
