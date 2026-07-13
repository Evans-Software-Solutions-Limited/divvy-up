import Elysia, { t } from "elysia";
import { ExpensesFinalizeService } from "./expensesFinalizeService";
import { computeBalances } from "./computeBalances";
import { coreAuth, getUserId } from "../../../shared/auth";

export const expensesFinalizeHandler = new Elysia()
  .use(ExpensesFinalizeService)
  .use(coreAuth)
  .post(
    "/expenses/:id/finalize",
    async (ctx) => {
      const userId = getUserId(ctx);
      const expense = await ctx.ExpensesRepository.finalize(
        userId,
        ctx.params.id,
      );
      if (!expense) {
        ctx.set.status = 404;
        return { error: "Expense not found" };
      }
      const balances = computeBalances(expense, ctx.body?.memberIds ?? []);
      return { expense, balances };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Optional(
        t.Object({
          /**
           * Full member list for the group. Required to resolve
           * `type: "everyone"` item assignments into per-member balances.
           */
          memberIds: t.Optional(t.Array(t.String())),
        }),
      ),
      response: {
        200: t.Any(),
        404: t.Object({ error: t.String() }),
      },
    },
  );
