import Elysia, { t } from "elysia";
import { ExpensesItemAssignmentService } from "./expensesItemAssignmentService";

/**
 * Discriminated union schema for all supported assignment modes.
 * Mirrors the ItemAssignment domain type.
 */
const AssignmentSchema = t.Union([
  t.Object({ type: t.Literal("one"), memberId: t.String() }),
  t.Object({ type: t.Literal("equal"), memberIds: t.Array(t.String()) }),
  t.Object({ type: t.Literal("everyone") }),
  t.Object({
    type: t.Literal("custom"),
    shares: t.Array(t.Object({ memberId: t.String(), fraction: t.Number() })),
  }),
]);

export const expensesItemAssignmentHandler = new Elysia()
  .use(ExpensesItemAssignmentService)
  .put(
    "/expenses/:id/items/:itemId/assignment",
    async (ctx) => {
      const expense = await ctx.ExpensesRepository.updateItemAssignment(
        ctx.params.id,
        ctx.params.itemId,
        ctx.body.assignment,
      );
      if (!expense) {
        ctx.set.status = 404;
        return { error: "Expense or item not found" };
      }
      return expense;
    },
    {
      params: t.Object({ id: t.String(), itemId: t.String() }),
      body: t.Object({ assignment: AssignmentSchema }),
      response: {
        200: t.Any(),
        404: t.Object({ error: t.String() }),
      },
    },
  );
