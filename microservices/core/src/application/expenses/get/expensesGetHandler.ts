import Elysia, { t } from "elysia";
import { ExpensesGetService } from "./expensesGetService";
import { coreAuth, getUserId } from "../../../shared/auth";

export const expensesGetHandler = new Elysia()
  .use(ExpensesGetService)
  .use(coreAuth)
  .get(
    "/expenses/:id",
    async (ctx) => {
      const userId = getUserId(ctx);
      const expense = await ctx.ExpensesRepository.findById(
        userId,
        ctx.params.id,
      );
      if (!expense) {
        ctx.set.status = 404;
        return { error: "Expense not found" };
      }
      return expense;
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Any(),
        404: t.Object({ error: t.String() }),
      },
    },
  );
