import Elysia, { t } from "elysia";
import { GroupsGetService } from "./groupsGetService";
import { coreAuth, getUserId } from "../../../shared/auth";

export const groupsGetHandler = new Elysia()
  .use(GroupsGetService)
  .use(coreAuth)
  .get(
    "/groups/:id",
    async (ctx) => {
      const userId = getUserId(ctx);
      const group = await ctx.GroupsRepository.findById(userId, ctx.params.id);
      if (!group) {
        ctx.set.status = 404;
        return { error: "Group not found" };
      }
      return group;
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Any(),
        404: t.Object({ error: t.String() }),
      },
    },
  );
