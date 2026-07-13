import Elysia, { t } from "elysia";
import { getUser, isGroupMember } from "@divvy-up/api-utils/auth";
import { ReceiptExtractRepositoryService } from "./receiptExtractService";
import { ReceiptExtractError } from "../../../types/errors";
import { receiptAuth } from "../../../shared/auth";

const ExtractedItemSchema = t.Object({
  description: t.String(),
  unitPrice: t.Number(),
  quantity: t.Number(),
  confidence: t.Optional(t.Number()),
  flag: t.Optional(t.String()),
});

/**
 * Full OCR result schema — mirrors OcrExtractResult. Keep in sync.
 * All monetary amounts are in minor currency units (pence for GBP).
 */
const OcrExtractResultSchema = t.Object({
  merchant: t.Nullable(t.String()),
  date: t.Nullable(t.String()),
  currency: t.String(),
  subtotal: t.Number(),
  tax: t.Number(),
  tip: t.Number(),
  total: t.Number(),
  items: t.Array(ExtractedItemSchema),
  rawText: t.Optional(t.String()),
  warnings: t.Optional(t.Array(t.String())),
  groupId: t.Optional(t.String()),
});

/** Shared error body shape for every non-2xx response from this route. */
const ErrorResponseSchema = t.Object({
  code: t.String(),
  message: t.String(),
});

export const receiptExtractHandler = new Elysia()
  .use(ReceiptExtractRepositoryService)
  .use(receiptAuth)
  .post(
    "/receipts/extract",
    async (ctx) => {
      // Object-level authorization: if the caller names a group, they must be an
      // active member of it — otherwise 404 (not-found ≡ not-authorised, no
      // existence leak). `requireAuth` (via receiptAuth) has already guaranteed a
      // verified user. NOTE: this scopes the *group association* only; binding the
      // `imageKey` itself to its uploader (so a caller can't extract another
      // user's receipt image) is tracked as a separate follow-up for the
      // receipts-multitenancy / scan-flow phase.
      const { groupId } = ctx.body;
      if (groupId) {
        const { sub: userId } = getUser(ctx);
        if (!(await isGroupMember(userId, groupId))) {
          ctx.set.status = 404;
          return { code: "not_found", message: "Group not found" };
        }
      }

      try {
        return await ctx.ReceiptExtractRepository.extract(
          ctx.body.imageKey,
          ctx.body.groupId,
        );
      } catch (error) {
        // Any typed ReceiptExtractError carries its own status/code. Any
        // other (unexpected) error must never surface as a bare 500 — map
        // it to the generic upstream_error 502.
        if (error instanceof ReceiptExtractError) {
          ctx.set.status = error.status;
          return { code: error.code, message: error.message };
        }
        ctx.set.status = 502;
        return {
          code: "upstream_error",
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      body: t.Object({
        /**
         * S3 key of the uploaded receipt image. Constrained to exactly the
         * shape /receipts/upload-url generates (receipts/<uuid>.<ext>) so a
         * caller can't probe arbitrary bucket keys through this endpoint.
         * Full per-user authorization lands with the JWT authorizer
         * (tracked in infra/api.ts).
         */
        imageKey: t.String({
          pattern:
            "^receipts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpe?g|png|gif|webp)$",
        }),
        /**
         * Group this receipt belongs to. Returned in the response so the
         * caller can immediately POST /expenses with the extracted data. UUID
         * pattern (like `imageKey` above) so a malformed value is a clean 422 at
         * the edge, not a Postgres uuid-cast 500 when the membership check runs.
         */
        groupId: t.Optional(
          t.String({
            pattern:
              "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
          }),
        ),
      }),
      response: {
        200: OcrExtractResultSchema,
        422: ErrorResponseSchema,
        404: ErrorResponseSchema,
        413: ErrorResponseSchema,
        415: ErrorResponseSchema,
        429: ErrorResponseSchema,
        502: ErrorResponseSchema,
        504: ErrorResponseSchema,
      },
    },
  );
