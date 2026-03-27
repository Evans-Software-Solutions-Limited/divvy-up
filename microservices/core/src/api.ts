import Elysia from "elysia";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import openapi from "@elysiajs/openapi";

import { groupsListHandler } from "./application/groups/list/groupsListHandler";
import { expensesCreateHandler } from "./application/expenses/create/expensesCreateHandler";
import { expensesItemAssignmentHandler } from "./application/expenses/items/assignment/expensesItemAssignmentHandler";
import { expensesFinalizeHandler } from "./application/expenses/finalize/expensesFinalizeHandler";
import { expensesGetHandler } from "./application/expenses/get/expensesGetHandler";

const app = new Elysia()
  .use(openapi())
  .use(groupsListHandler)
  .use(expensesCreateHandler)
  .use(expensesGetHandler)
  .use(expensesItemAssignmentHandler)
  .use(expensesFinalizeHandler);

export type CoreApi = typeof app;

export const handler = handle(new Hono().mount("/", app.fetch));
