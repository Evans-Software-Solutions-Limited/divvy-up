import Elysia from "elysia";
import { ExpensesRepositoryService } from "../create/expensesCreateService";

export const ExpensesFinalizeService = new Elysia().use(
  ExpensesRepositoryService,
);
