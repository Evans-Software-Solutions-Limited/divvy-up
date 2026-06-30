import Elysia, { t } from "elysia";
import { GroupsMembersService } from "./groupsMembersService";

export const groupsMembersHandler = new Elysia().use(GroupsMembersService).post(
  "/groups/:id/members",
  async (ctx) => {
    const member = await ctx.GroupsRepository.addMember(
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
