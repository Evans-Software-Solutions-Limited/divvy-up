import Elysia, { t } from "elysia";
import { GroupsCreateService } from "./groupsCreateService";

const GroupSchema = t.Object({
  id: t.String(),
  name: t.String(),
  createdAt: t.String(),
  members: t.Array(t.Any()),
});

export const groupsCreateHandler = new Elysia().use(GroupsCreateService).post(
  "/groups",
  async (ctx) => {
    const group = await ctx.GroupsRepository.create(ctx.body.name);
    return group;
  },
  {
    body: t.Object({ name: t.String({ minLength: 1 }) }),
    response: {
      200: GroupSchema,
    },
  },
);
