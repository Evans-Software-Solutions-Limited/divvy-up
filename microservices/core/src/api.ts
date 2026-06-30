import Elysia from "elysia";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import openapi from "@elysiajs/openapi";

import { groupsListHandler } from "./application/groups/list/groupsListHandler";
import { groupsCreateHandler } from "./application/groups/create/groupsCreateHandler";
import { groupsGetHandler } from "./application/groups/get/groupsGetHandler";
import { groupsMembersHandler } from "./application/groups/members/groupsMembersHandler";
import { groupsExpensesHandler } from "./application/groups/expenses/groupsExpensesHandler";
import { expensesCreateHandler } from "./application/expenses/create/expensesCreateHandler";
import { expensesGetHandler } from "./application/expenses/get/expensesGetHandler";
import { expensesItemAssignmentHandler } from "./application/expenses/items/assignment/expensesItemAssignmentHandler";
import { expensesFinalizeHandler } from "./application/expenses/finalize/expensesFinalizeHandler";

const app = new Elysia()
  .use(openapi())
  .use(groupsListHandler)
  .use(groupsCreateHandler)
  .use(groupsGetHandler)
  .use(groupsMembersHandler)
  .use(groupsExpensesHandler)
  .use(expensesCreateHandler)
  .use(expensesGetHandler)
  .use(expensesItemAssignmentHandler)
  .use(expensesFinalizeHandler);

export type CoreApi = typeof app;

export const handler = handle(new Hono().mount("/", app.fetch));
