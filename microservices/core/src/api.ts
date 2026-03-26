import Elysia from "elysia";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import openapi from "@elysiajs/openapi";

import { groupsListHandler } from "./application/groups/list/groupsListHandler";
import { expensesCreateHandler } from "./application/expenses/create/expensesCreateHandler";

const app = new Elysia()
  .use(openapi())
  .use(groupsListHandler)
  .use(expensesCreateHandler);

export type CoreApi = typeof app;

export const handler = handle(new Hono().mount("/", app.fetch));
