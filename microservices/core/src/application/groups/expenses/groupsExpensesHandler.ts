import Elysia, { t } from "elysia";
import { GroupsExpensesService } from "./groupsExpensesService";
import { coreAuth, getUserId } from "../../../shared/auth";

export const groupsExpensesHandler = new Elysia()
  .use(GroupsExpensesService)
  .use(coreAuth)
  .get(
    "/groups/:id/expenses",
    async (ctx) => {
      const userId = getUserId(ctx);
      const expenses = await ctx.ExpensesRepository.listByGroup(
        userId,
        ctx.params.id,
      );
      return expenses;
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Any(),
      },
    },
  );
