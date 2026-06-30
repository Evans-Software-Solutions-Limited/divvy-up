import Elysia, { t } from "elysia";
import { GroupsExpensesService } from "./groupsExpensesService";

export const groupsExpensesHandler = new Elysia()
  .use(GroupsExpensesService)
  .get(
    "/groups/:id/expenses",
    async (ctx) => {
      const expenses = await ctx.ExpensesRepository.listByGroup(ctx.params.id);
      return expenses;
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Any(),
      },
    },
  );
