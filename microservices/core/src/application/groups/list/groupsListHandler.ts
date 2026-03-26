import Elysia, { t } from "elysia";
import { GroupsRepositoryService } from "./groupsListService";

const GroupSchema = t.Object({
  id: t.String(),
  name: t.String(),
  createdAt: t.String(),
  members: t.Array(t.Any()),
});

export const groupsListHandler = new Elysia().use(GroupsRepositoryService).get(
  "/groups",
  async (ctx) => {
    const groups = await ctx.GroupsRepository.list();
    return groups;
  },
  {
    response: {
      200: t.Array(GroupSchema),
    },
  },
);
