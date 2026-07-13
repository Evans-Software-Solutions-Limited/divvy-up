import Elysia from "elysia";
import { ReceiptUploadsRepository } from "./receiptUploadsRepository";

// Shared by both the upload and extract handlers: upload `record`s the
// (userId, imageKey) binding at issue time, extract `isOwner`-checks it
// before reading the image.
export const ReceiptUploadsService = new Elysia().decorate(
  ReceiptUploadsRepository.key,
  new ReceiptUploadsRepository(),
);
