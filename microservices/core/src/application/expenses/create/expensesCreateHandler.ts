import Elysia, { t } from "elysia";
import { ExpensesRepositoryService } from "./expensesCreateService";

const ReceiptItemInputSchema = t.Object({
  description: t.String(),
  unitPrice: t.Number(),
  quantity: t.Number({ default: 1 }),
  assignment: t.Any(),
});

const AdjustmentInputSchema = t.Object({
  kind: t.Union([t.Literal("tax"), t.Literal("tip"), t.Literal("discount")]),
  amount: t.Number(),
  isPercent: t.Boolean({ default: false }),
});

const CreateExpenseBodySchema = t.Object({
  groupId: t.String(),
  payerId: t.String(),
  description: t.String(),
  date: t.String(),
  items: t.Array(ReceiptItemInputSchema),
  adjustments: t.Optional(t.Array(AdjustmentInputSchema)),
});

export const expensesCreateHandler = new Elysia()
  .use(ExpensesRepositoryService)
  .post(
    "/expenses",
    async (ctx) => {
      const expense = await ctx.ExpensesRepository.create(ctx.body);
      return expense;
    },
    {
      body: CreateExpenseBodySchema,
      response: {
        200: t.Any(),
      },
    },
  );
