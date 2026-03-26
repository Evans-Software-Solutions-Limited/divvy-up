import Elysia, { t } from "elysia";
import { ReceiptExtractRepositoryService } from "./receiptExtractService";

const ExtractedItemSchema = t.Object({
  description: t.String(),
  unitPrice: t.Number(),
  quantity: t.Number(),
});

const ReceiptExtractResultSchema = t.Object({
  items: t.Array(ExtractedItemSchema),
  /** Raw text returned by OCR, useful for debugging */
  rawText: t.Optional(t.String()),
});

export const receiptExtractHandler = new Elysia()
  .use(ReceiptExtractRepositoryService)
  .post(
    "/receipts/extract",
    async (ctx) => {
      const result = await ctx.ReceiptExtractRepository.extract(
        ctx.body.imageKey,
      );
      return result;
    },
    {
      body: t.Object({
        /** S3 key of the uploaded receipt image */
        imageKey: t.String(),
      }),
      response: {
        200: ReceiptExtractResultSchema,
      },
    },
  );
