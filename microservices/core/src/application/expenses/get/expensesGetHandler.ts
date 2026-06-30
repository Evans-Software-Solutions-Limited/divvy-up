import Elysia, { t } from "elysia";
import { ExpensesGetService } from "./expensesGetService";

export const expensesGetHandler = new Elysia().use(ExpensesGetService).get(
  "/expenses/:id",
  async (ctx) => {
    const expense = await ctx.ExpensesRepository.findById(ctx.params.id);
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
