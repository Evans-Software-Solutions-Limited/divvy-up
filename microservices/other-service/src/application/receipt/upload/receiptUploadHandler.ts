import Elysia, { t } from "elysia";
import { getUser } from "@divvy-up/api-utils/auth";
import { ReceiptUploadService } from "./receiptUploadService";
import { ReceiptUploadsService } from "../../repositories/receiptUploadsService";
import { ReceiptExtractError } from "../../../types/errors";
import { receiptAuth } from "../../../shared/auth";

/**
 * Upload URL response schema — mirrors UploadUrlResult. Keep in sync.
 */
const UploadUrlResultSchema = t.Object({
  key: t.String(),
  uploadUrl: t.String(),
  expiresIn: t.Number(),
});

const ErrorResponseSchema = t.Object({
  code: t.String(),
  message: t.String(),
});

export const receiptUploadHandler = new Elysia()
  .use(ReceiptUploadService)
  .use(ReceiptUploadsService)
  .use(receiptAuth)
  .post(
    "/receipts/upload-url",
    async (ctx) => {
      let result;
      try {
        result = await ctx.ReceiptImages.createUploadUrl(ctx.body.contentType);
      } catch (error) {
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

      // Bind the issued key to its uploader BEFORE returning it — a caller
      // must never receive a key with no ownership record. Deliberately
      // outside the try/catch above: a thrown error here is NOT one of the
      // typed upload failures, so it should surface as an uncaught 500 via
      // the global error handler, not be folded into 502 upstream_error.
      await ctx.ReceiptUploadsRepository.record(getUser(ctx).sub, result.key);

      return result;
    },
    {
      body: t.Object({
        /** MIME type of the image the client intends to upload */
        contentType: t.String(),
      }),
      response: {
        200: UploadUrlResultSchema,
        415: ErrorResponseSchema,
        502: ErrorResponseSchema,
      },
    },
  );
