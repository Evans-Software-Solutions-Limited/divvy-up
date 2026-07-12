import Elysia, { t } from "elysia";
import { GroupsMembersService } from "./groupsMembersService";
import { coreAuth, getUserId } from "../../../shared/auth";

export const groupsMembersHandler = new Elysia()
  .use(GroupsMembersService)
  .use(coreAuth)
  .post(
    "/groups/:id/members",
    async (ctx) => {
      const userId = getUserId(ctx);
      const member = await ctx.GroupsRepository.addMember(
        userId,
        ctx.params.id,
        ctx.body.name,
      );
      if (!member) {
        ctx.set.status = 404;
        return { error: "Group not found" };
      }
      return member;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ name: t.String({ minLength: 1 }) }),
      response: {
        200: t.Any(),
        404: t.Object({ error: t.String() }),
      },
    },
  );
