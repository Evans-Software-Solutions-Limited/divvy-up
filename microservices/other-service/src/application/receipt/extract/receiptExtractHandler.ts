import Elysia, { t } from "elysia";
import { ReceiptExtractRepositoryService } from "./receiptExtractService";

const ExtractedItemSchema = t.Object({
  description: t.String(),
  unitPrice: t.Number(),
  quantity: t.Number(),
});

/**
 * Full OCR result schema — mirrors OcrExtractResult.
 * All monetary amounts are in minor currency units (e.g. cents for USD).
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
  groupId: t.Optional(t.String()),
});

export const receiptExtractHandler = new Elysia()
  .use(ReceiptExtractRepositoryService)
  .post(
    "/receipts/extract",
    async (ctx) => {
      const result = await ctx.ReceiptExtractRepository.extract(
        ctx.body.imageKey,
        ctx.body.groupId,
      );
      return result;
    },
    {
      body: t.Object({
        /** S3 key of the uploaded receipt image */
        imageKey: t.String(),
        /**
         * Group this receipt belongs to. Returned in the response so the
         * caller can immediately POST /expenses with the extracted data.
         */
        groupId: t.Optional(t.String()),
      }),
      response: {
        200: OcrExtractResultSchema,
      },
    },
  );
