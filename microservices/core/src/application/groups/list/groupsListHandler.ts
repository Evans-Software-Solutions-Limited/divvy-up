import Elysia, { t } from "elysia";
import { GroupsRepositoryService } from "./groupsListService";
import { coreAuth, getUserId } from "../../../shared/auth";

const GroupSchema = t.Object({
  id: t.String(),
  name: t.String(),
  createdAt: t.String(),
  members: t.Array(t.Any()),
});

export const groupsListHandler = new Elysia()
  .use(GroupsRepositoryService)
  .use(coreAuth)
  .get(
    "/groups",
    async (ctx) => {
      const userId = getUserId(ctx);
      const groups = await ctx.GroupsRepository.list(userId);
      return groups;
    },
    {
      response: {
        200: t.Array(GroupSchema),
      },
    },
  );
