import type {
  Balance,
  Expense,
  MemberId,
  Settlement,
} from "../../../domain/types";
import { computeBalances } from "../../expenses/finalize/computeBalances";
import { simplifyDebts } from "./simplifyDebts";

/**
 * Group-wide, settlement-aware balances, collapsed into few transfers.
 *
 * Nets every finalized expense's per-item balances into a single position per
 * member, subtracts money already recorded as paid (`settlements`), then runs
 * {@link simplifyDebts}. The result is the daily "who owes whom" list the
 * Balances / Settle-up screens render.
 *
 * @param groupId            Group these balances belong to.
 * @param finalizedExpenses  Only finalized expenses (drafts don't affect debts).
 * @param memberIds          Full active member list, to resolve `everyone` splits.
 * @param settlements        Recorded mark-as-paid records for the group.
 */
export function computeGroupBalances(
  groupId: string,
  finalizedExpenses: Expense[],
  memberIds: MemberId[],
  settlements: Settlement[],
): Balance[] {
  const net = new Map<MemberId, number>();
  const bump = (id: MemberId, delta: number) =>
    net.set(id, (net.get(id) ?? 0) + delta);

  for (const expense of finalizedExpenses) {
    for (const b of computeBalances(expense, memberIds)) {
      bump(b.toMemberId, b.amount); // creditor is owed
      bump(b.fromMemberId, -b.amount); // debtor owes
    }
  }

  // A settlement is money already paid from → to: it cancels that much of the
  // payer's debt and the payee's credit.
  for (const s of settlements) {
    bump(s.fromMemberId, s.amount);
    bump(s.toMemberId, -s.amount);
  }

  return simplifyDebts(groupId, net);
}
