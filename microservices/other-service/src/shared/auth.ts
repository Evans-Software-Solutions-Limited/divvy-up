import { Elysia } from "elysia";
import {
  getAuthUser,
  provisionUser,
  requireAuth,
} from "@divvy-up/api-utils/auth";

// `name` makes Elysia DEDUPLICATE this plugin: it can be `.use()`d by the root app AND by each
// individual handler plugin (so their route context is typed with `user`/`userId`) while the
// derive + guard still run exactly ONCE per request.
//
// `{ as: "global" }` on BOTH the derive and the guard is load-bearing, not cosmetic: Elysia's
// default ("local") scope only applies a hook to routes defined on the SAME instance that
// declared it. `receiptAuth` itself defines no routes, so without `global` scope neither the
// derive nor `requireAuth` ever runs for routes added by a separately-authored `.use()`d
// handler plugin — even one that itself `.use(receiptAuth)`s. Proven by
// `shared/__tests__/auth.test.ts`: with only "local" scope, an unauthenticated request sailed
// straight through to the handler (502 from the downstream call) instead of 401ing.
export const receiptAuth = new Elysia({ name: "receipt-auth" })
  .derive({ as: "global" }, async ({ headers }) => {
    const user = await getAuthUser(headers.authorization);
    const userId = user ? (await provisionUser(user)).userId : null;
    return { user, userId };
  })
  .onBeforeHandle({ as: "global" }, (ctx) =>
    // `requireAuth`'s declared parameter (`set: { status: number }`) is narrower than
    // Elysia's real `set.status` (which also accepts named HTTP status strings), so a direct
    // structural handoff doesn't typecheck even though the runtime shape is exactly what
    // `requireAuth` expects (this route only ever assigns a numeric status). The
    // `unknown`-mediated cast is the escape hatch; behaviour is unchanged.
    requireAuth(ctx as unknown as Parameters<typeof requireAuth>[0]),
  );
