import Elysia from "elysia";
import { ReceiptExtractRepository } from "../../repositories/receiptExtractRepository";

export const ReceiptExtractRepositoryService = new Elysia().decorate(
  ReceiptExtractRepository.key,
  new ReceiptExtractRepository(),
);
