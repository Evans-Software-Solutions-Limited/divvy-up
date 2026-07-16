import Elysia, { t } from "elysia";
import { GroupsBalancesService } from "./groupsBalancesService";
import { computeGroupBalances } from "./computeGroupBalances";
import type { Balance } from "../../../domain/types";
import { coreAuth, getUserId } from "../../../shared/auth";

export const groupsBalancesHandler = new Elysia()
  .use(GroupsBalancesService)
  .use(coreAuth)
  .get(
    "/groups/:id/balances",
    async (ctx) => {
      const userId = getUserId(ctx);
      const group = await ctx.GroupsRepository.findById(userId, ctx.params.id);
      if (!group) {
        ctx.set.status = 404;
        return { error: "Group not found" };
      }

      const expenses = await ctx.ExpensesRepository.listByGroup(
        userId,
        ctx.params.id,
      );
      const finalized = expenses.filter((e) => e.status === "finalized");
      const memberIds = group.members.map((m) => m.id);
      const settlements = await ctx.SettlementsRepository.listByGroup(
        userId,
        ctx.params.id,
      );

      // Net across all finalized expenses, subtract what's already been paid,
      // then minimise to the fewest transfers ("who owes whom").
      const balances: Balance[] = computeGroupBalances(
        ctx.params.id,
        finalized,
        memberIds,
        settlements,
      );

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
