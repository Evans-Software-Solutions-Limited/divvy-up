import Elysia from "elysia";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import openapi from "@elysiajs/openapi";

import { receiptErrorHandler } from "./shared/errorHandler";
import { receiptAuth } from "./shared/auth";
import { receiptExtractHandler } from "./application/receipt/extract/receiptExtractHandler";
import { receiptUploadHandler } from "./application/receipt/upload/receiptUploadHandler";

const app = new Elysia()
  .use(receiptErrorHandler) // global onError, registered first
  .use(openapi())
  .use(receiptAuth) // every route below requires a verified user (openapi docs stay unguarded)
  .use(receiptExtractHandler)
  .use(receiptUploadHandler);

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
