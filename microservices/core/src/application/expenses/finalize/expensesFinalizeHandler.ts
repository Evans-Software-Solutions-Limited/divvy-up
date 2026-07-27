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
      // No member list needed: `finalize` has just frozen any `everyone` items
      // into explicit `equal` rows, so the expense it returned already names
      // every participant. (The endpoint used to take a `memberIds` body for
      // this; it was what made a finalized split re-resolvable — and therefore
      // unstable — so it's gone. A body sent by an older client is ignored.)
      const balances = computeBalances(expense, []);
      return { expense, balances };
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Any(),
        404: t.Object({ error: t.String() }),
      },
    },
  );
