import Elysia, { t } from "elysia";
import { GroupsActivityService } from "./groupsActivityService";
import { coreAuth, getUserId } from "../../../shared/auth";

export const groupsActivityHandler = new Elysia()
  .use(GroupsActivityService)
  .use(coreAuth)
  .get(
    "/groups/:id/activity",
    async (ctx) => {
      const userId = getUserId(ctx);
      const activity = await ctx.ActivityRepository.listByGroup(
        userId,
        ctx.params.id,
        ctx.query.limit,
      );
      return { activity };
    },
    {
      params: t.Object({ id: t.String() }),
      // `limit` is the most-recent-N size, not a cursor page (see repository).
      // Coerced from the query string; the repository clamps it to [1, 200].
      query: t.Object({
        limit: t.Optional(t.Numeric({ minimum: 1 })),
      }),
      response: { 200: t.Any() },
    },
  );
