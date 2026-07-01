import Elysia, { t } from "elysia";
import { GroupsBalancesService } from "./groupsBalancesService";
import { computeBalances } from "../../expenses/finalize/computeBalances";
import type { Balance } from "../../../domain/types";

export const groupsBalancesHandler = new Elysia()
  .use(GroupsBalancesService)
  .get(
    "/groups/:id/balances",
    async (ctx) => {
      const group = await ctx.GroupsRepository.findById(ctx.params.id);
      if (!group) {
        ctx.set.status = 404;
        return { error: "Group not found" };
      }

      const expenses = await ctx.ExpensesRepository.listByGroup(ctx.params.id);
      const finalized = expenses.filter((e) => e.status === "finalized");
      const memberIds = group.members.map((m) => m.id);

      // Aggregate net balances across all finalized expenses.
      // Use a canonical key (lower ID first) so A→B and B→A accumulate into
      // one signed value; positive means first ID owes second ID.
      const netOwed = new Map<string, number>();

      for (const expense of finalized) {
        const expenseBalances = computeBalances(expense, memberIds);
        for (const b of expenseBalances) {
          const [lo, hi] =
            b.fromMemberId < b.toMemberId
              ? [b.fromMemberId, b.toMemberId]
              : [b.toMemberId, b.fromMemberId];
          const k = `${lo}→${hi}`;
          // positive = lo owes hi; negative = hi owes lo
          const sign = b.fromMemberId === lo ? 1 : -1;
          netOwed.set(k, (netOwed.get(k) ?? 0) + sign * b.amount);
        }
      }

      const balances: Balance[] = [];
      for (const [k, net] of netOwed) {
        if (net === 0) continue;
        const [lo, hi] = k.split("→");
        balances.push({
          groupId: ctx.params.id,
          fromMemberId: net > 0 ? lo : hi,
          toMemberId: net > 0 ? hi : lo,
          amount: Math.abs(net),
        });
      }

      return { group, balances };
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Any(),
        404: t.Object({ error: t.String() }),
      },
    },
  );
