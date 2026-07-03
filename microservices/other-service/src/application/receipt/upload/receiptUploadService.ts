import Elysia from "elysia";
import { S3ReceiptImagesAdapter } from "../../../adapters/s3ReceiptImages";

// Decorates the S3 adapter directly (rather than a repository wrapper) —
// this route is a thin pass-through to `createUploadUrl`, with no domain
// orchestration to justify a repository layer of its own, unlike
// ReceiptExtractRepository which validates money and reconciles totals.
export const ReceiptUploadService = new Elysia().decorate(
  "ReceiptImages",
  new S3ReceiptImagesAdapter(),
);
