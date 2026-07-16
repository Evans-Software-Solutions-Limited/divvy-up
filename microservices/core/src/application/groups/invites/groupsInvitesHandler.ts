import Elysia, { t } from "elysia";
import { GroupsInvitesService } from "./groupsInvitesService";
import { coreAuth, getUserId } from "../../../shared/auth";

// The invite token is a bearer secret, so it travels in the request BODY, not
// the URL path — this keeps it out of access logs / API Gateway request logs
// (a plain `POST /invites/:token/...` would leak it into every log line). Both
// redeem and preview are POSTs for the same reason.
export const groupsInvitesHandler = new Elysia()
  .use(GroupsInvitesService)
  .use(coreAuth)
  .post(
    "/groups/:id/invites",
    async (ctx) => {
      const userId = getUserId(ctx);
      const result = await ctx.GroupInvitesRepository.create(userId, {
        groupId: ctx.params.id,
        memberId: ctx.body.memberId,
      });

      if (!result.ok) {
        if (result.reason === "seat_unavailable") {
          ctx.set.status = 409;
          return { error: "That seat is not available to invite" };
        }
        // not_member / member_not_found → 404, existence never leaked
        ctx.set.status = 404;
        return { error: "Group not found" };
      }

      ctx.set.status = 201;
      // The raw token is returned exactly once, here. It is never persisted or logged.
      return { token: result.token, invite: result.invite };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ memberId: t.Optional(t.String()) }),
      response: {
        201: t.Any(),
        404: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
      },
    },
  )
  .post(
    "/invites/accept",
    async (ctx) => {
      const userId = getUserId(ctx);
      const result = await ctx.GroupInvitesRepository.accept(
        userId,
        ctx.body.token,
      );

      if (!result.ok) {
        switch (result.reason) {
          case "expired":
            ctx.set.status = 410;
            return { error: "This invite has expired" };
          case "used":
            ctx.set.status = 410;
            return { error: "This invite has already been used" };
          case "seat_unavailable":
            ctx.set.status = 409;
            return { error: "That seat has already been claimed" };
          case "invalid":
          default:
            ctx.set.status = 404;
            return { error: "Invalid or expired invite" };
        }
      }

      return {
        group: result.group,
        member: result.member,
        alreadyMember: result.alreadyMember,
      };
    },
    {
      body: t.Object({ token: t.String({ minLength: 1 }) }),
      response: {
        200: t.Any(),
        404: t.Object({ error: t.String() }),
        409: t.Object({ error: t.String() }),
        410: t.Object({ error: t.String() }),
      },
    },
  )
  .post(
    "/invites/lookup",
    async (ctx) => {
      const preview = await ctx.GroupInvitesRepository.lookup(ctx.body.token);
      if (!preview) {
        ctx.set.status = 404;
        return { error: "Invalid or expired invite" };
      }
      return preview;
    },
    {
      body: t.Object({ token: t.String({ minLength: 1 }) }),
      response: {
        200: t.Any(),
        404: t.Object({ error: t.String() }),
      },
    },
  );
