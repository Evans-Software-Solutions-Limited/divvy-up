import Elysia, { t } from "elysia";
import { ReceiptUploadService } from "./receiptUploadService";
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
  .use(receiptAuth)
  .post(
    "/receipts/upload-url",
    async (ctx) => {
      try {
        return await ctx.ReceiptImages.createUploadUrl(ctx.body.contentType);
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
