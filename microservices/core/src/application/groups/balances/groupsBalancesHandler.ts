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

      // Aggregate net balances across all finalized expenses
      const netOwed = new Map<string, number>();
      const key = (from: string, to: string) => `${from}→${to}`;

      for (const expense of finalized) {
        const balances = computeBalances(expense, memberIds);
        for (const b of balances) {
          const k = key(b.fromMemberId, b.toMemberId);
          netOwed.set(k, (netOwed.get(k) ?? 0) + b.amount);
        }
      }

      const balances: Balance[] = [...netOwed.entries()]
        .filter(([, amount]) => amount > 0)
        .map(([k, amount]) => {
          const [fromMemberId, toMemberId] = k.split("→");
          return {
            groupId: ctx.params.id,
            fromMemberId,
            toMemberId,
            amount,
          };
        });

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
