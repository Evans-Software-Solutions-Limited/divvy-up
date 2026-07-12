import Elysia, { t } from "elysia";
import { GroupsCreateService } from "./groupsCreateService";
import { coreAuth, getUserId } from "../../../shared/auth";

const GroupSchema = t.Object({
  id: t.String(),
  name: t.String(),
  createdAt: t.String(),
  members: t.Array(t.Any()),
});

export const groupsCreateHandler = new Elysia()
  .use(GroupsCreateService)
  .use(coreAuth)
  .post(
    "/groups",
    async (ctx) => {
      const userId = getUserId(ctx);
      const group = await ctx.GroupsRepository.create(userId, ctx.body.name);
      return group;
    },
    {
      body: t.Object({ name: t.String({ minLength: 1 }) }),
      response: {
        200: GroupSchema,
      },
    },
  );
