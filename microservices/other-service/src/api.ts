import Elysia from "elysia";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import openapi from "@elysiajs/openapi";

import { receiptExtractHandler } from "./application/receipt/extract/receiptExtractHandler";
import { receiptUploadHandler } from "./application/receipt/upload/receiptUploadHandler";

const app = new Elysia()
  .use(openapi())
  .use(receiptExtractHandler)
  .use(receiptUploadHandler);

export const handler = handle(new Hono().mount("/", app.fetch));
