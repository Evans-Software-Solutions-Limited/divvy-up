import { Elysia, ValidationError } from "elysia";

import { AppError } from "./AppError";

interface ErrorResponseBody {
  code: string;
  error: string;
  detail: string;
  validation?: unknown[];
  requestId?: string;
  stack?: string;
}

/** Status mapping per the production-readiness design's Data Models → `mapStatus`. */
function mapStatus(code: string | number, error: unknown): number {
  if (code === "VALIDATION") return 422;
  if (code === "NOT_FOUND") return 404;
  if (code === "PARSE") return 400;
  if (error instanceof AppError) return error.status;
  return 500;
}

function statusLabel(status: number): string {
  switch (status) {
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 409:
      return "Conflict";
    case 422:
      return "Unprocessable Entity";
    default:
      return status >= 500 ? "Internal Server Error" : "Error";
  }
}

/**
 * Global Elysia error handler for `other-service` (receipts). Registered first in the app chain
 * so every thrown error (validation, not-found, parse, `AppError`, or anything unrecognised)
 * resolves to a consistent JSON body and a single `[api:error]` log line.
 */
export const receiptErrorHandler = new Elysia({
  name: "receipt-error-handler",
}).onError({ as: "global" }, ({ code, error, set, request }) => {
  const status = mapStatus(code, error);
  set.status = status;

  // The design prefers the correlation id from the API Gateway v2 request context
  // (`event.requestContext.requestId`), but that isn't threaded through the current
  // `hono/aws-lambda` mount (`api.ts` only exposes the fetch-style `Request`). Fall back to the
  // X-Ray trace header, which is the only inbound AWS-supplied header available here.
  // TODO: upgrade to event.requestContext.requestId once the Lambda event is threaded
  const requestId = request.headers.get("x-amzn-trace-id") ?? undefined;

  const isProd = process.env.SST_STAGE === "production";
  const isServerError = status >= 500;
  const message = error instanceof Error ? error.message : String(error);

  const body: ErrorResponseBody = {
    code: String(code),
    error: statusLabel(status),
    detail: isProd && isServerError ? "An internal error occurred." : message,
    requestId,
  };

  if (status === 422 && error instanceof ValidationError) {
    body.validation = error.all;
  }

  if (!isProd && error instanceof Error && error.stack) {
    body.stack = error.stack;
  }

  console.error("[api:error]", { code, status, requestId }, error);

  return body;
});
