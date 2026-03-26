import Elysia from "elysia";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import openapi from "@elysiajs/openapi";

import { receiptExtractHandler } from "./application/receipt/extract/receiptExtractHandler";

const app = new Elysia().use(openapi()).use(receiptExtractHandler);

export const handler = handle(new Hono().mount("/", app.fetch));
