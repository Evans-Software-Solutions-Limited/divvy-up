import Elysia, { t } from "elysia";
import { GroupsSettlementsService } from "./groupsSettlementsService";
import { coreAuth, getUserId } from "../../../shared/auth";

export const groupsSettlementsHandler = new Elysia()
  .use(GroupsSettlementsService)
  .use(coreAuth)
  .post(
    "/groups/:id/settlements",
    async (ctx) => {
      const userId = getUserId(ctx);

      if (ctx.body.fromMemberId === ctx.body.toMemberId) {
        ctx.set.status = 400;
        return { error: "A member cannot settle up with themselves" };
      }

      const settlement = await ctx.SettlementsRepository.record(userId, {
        groupId: ctx.params.id,
        fromMemberId: ctx.body.fromMemberId,
        toMemberId: ctx.body.toMemberId,
        amount: ctx.body.amount,
      });
      if (!settlement) {
        ctx.set.status = 404;
        return { error: "Group not found" };
      }

      ctx.set.status = 201;
      return settlement;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        fromMemberId: t.String(),
        toMemberId: t.String(),
        // Integer pence, strictly positive — a settlement of 0 or a fraction is
        // rejected at the boundary (422) rather than reaching the repository.
        // Intentionally NOT capped against the outstanding debt: V1 is pure
        // record-keeping, so overpayments/refunds (which net to a reversed
        // balance) are legitimate. A "you're paying more than you owe" guardrail
        // belongs in the settle-up UX, where the outstanding amount is known.
        amount: t.Integer({ minimum: 1 }),
      }),
      response: {
        201: t.Any(),
        400: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
  )
  .get(
    "/groups/:id/settlements",
    async (ctx) => {
      const userId = getUserId(ctx);
      const settlements = await ctx.SettlementsRepository.listByGroup(
        userId,
        ctx.params.id,
      );
      return { settlements };
    },
    {
      params: t.Object({ id: t.String() }),
      response: { 200: t.Any() },
    },
  );
