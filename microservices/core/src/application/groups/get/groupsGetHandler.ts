import Elysia, { t } from "elysia";
import { GroupsGetService } from "./groupsGetService";

export const groupsGetHandler = new Elysia().use(GroupsGetService).get(
  "/groups/:id",
  async (ctx) => {
    const group = await ctx.GroupsRepository.findById(ctx.params.id);
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
