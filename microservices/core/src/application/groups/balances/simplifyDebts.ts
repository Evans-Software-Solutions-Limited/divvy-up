import type { Balance, MemberId } from "../../../domain/types";

/**
 * Greedy debt simplification — Tricount-style "who owes whom", collapsed into
 * few transfers. Largest debtor is matched against largest creditor repeatedly,
 * yielding at most `n − 1` transfers for `n` non-zero members. This is not
 * guaranteed to be the global minimum (that's NP-hard — subset-sum coincidences
 * can occasionally do better), but totals are always exact and the count is
 * far below the naive per-pair list.
 *
 * Input: the signed net position per member, in integer pence.
 *   `net > 0` → member should RECEIVE money (creditor)
 *   `net < 0` → member should PAY money (debtor)
 * The nets are expected to sum to zero (expense-derived balances and recorded
 * settlements are both zero-sum), which guarantees the greedy match drains
 * both sides to empty at the same time.
 *
 * Output: a minimal list of `from owes to` transfers. Members with a zero net
 * never appear. The result is deterministic (largest amounts first, ties broken
 * by member id) so callers and tests see a stable ordering.
 *
 * Integer-safe: every amount is `Math.min` of two integers, so no rounding is
 * introduced here — pence in, pence out.
 */
export function simplifyDebts(
  groupId: string,
  net: Map<MemberId, number>,
): Balance[] {
  const debtors: Array<{ id: MemberId; amt: number }> = []; // amt = amount owed
  const creditors: Array<{ id: MemberId; amt: number }> = []; // amt = amount due

  for (const [id, n] of net) {
    if (n < 0) debtors.push({ id, amt: -n });
    else if (n > 0) creditors.push({ id, amt: n });
  }

  const byAmountThenId = (
    a: { id: MemberId; amt: number },
    b: { id: MemberId; amt: number },
  ) => b.amt - a.amt || (a.id < b.id ? -1 : 1);
  debtors.sort(byAmountThenId);
  creditors.sort(byAmountThenId);

  const transfers: Balance[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0) {
      transfers.push({
        groupId,
        fromMemberId: debtors[i].id,
        toMemberId: creditors[j].id,
        amount: pay,
      });
    }
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }

  return transfers;
}
