import Elysia from "elysia";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import openapi from "@elysiajs/openapi";

import { coreErrorHandler } from "./shared/errorHandler";
import { coreAuth } from "./shared/auth";
import { groupsListHandler } from "./application/groups/list/groupsListHandler";
import { groupsCreateHandler } from "./application/groups/create/groupsCreateHandler";
import { groupsGetHandler } from "./application/groups/get/groupsGetHandler";
import { groupsMembersHandler } from "./application/groups/members/groupsMembersHandler";
import { groupsExpensesHandler } from "./application/groups/expenses/groupsExpensesHandler";
import { expensesCreateHandler } from "./application/expenses/create/expensesCreateHandler";
import { expensesGetHandler } from "./application/expenses/get/expensesGetHandler";
import { expensesItemAssignmentHandler } from "./application/expenses/items/assignment/expensesItemAssignmentHandler";
import { expensesFinalizeHandler } from "./application/expenses/finalize/expensesFinalizeHandler";
import { groupsBalancesHandler } from "./application/groups/balances/groupsBalancesHandler";

const app = new Elysia()
  .use(coreErrorHandler) // global onError, registered first
  .use(openapi())
  .use(coreAuth) // every route below requires a verified user (openapi docs stay unguarded)
  .use(groupsListHandler)
  .use(groupsCreateHandler)
  .use(groupsGetHandler)
  .use(groupsMembersHandler)
  .use(groupsExpensesHandler)
  .use(expensesCreateHandler)
  .use(expensesGetHandler)
  .use(expensesItemAssignmentHandler)
  .use(expensesFinalizeHandler)
  .use(groupsBalancesHandler);

export type CoreApi = typeof app;
// Exported for tests only — lets the auth-guard test exercise the real
// composed app instead of reconstructing the `.use()` chain in parallel.
export { app };

const lambda = handle(new Hono().mount("/", app.fetch));

// Lambda backstop (R8.2): if an error escapes Elysia's own error handler entirely (e.g. a
// failure thrown outside the Elysia request lifecycle), this is the last place a non-Elysia
// error can be shaped into a structured response instead of an opaque Lambda invocation failure.
export const handler = async (
  event: Parameters<typeof lambda>[0],
  context: Parameters<typeof lambda>[1],
) => {
  try {
    return await lambda(event, context);
  } catch (err) {
    console.error("[api:lambda-fatal]", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "FATAL",
        error: "Internal server error",
        detail: "An internal error occurred. See server logs for details.",
      }),
    };
  }
};
