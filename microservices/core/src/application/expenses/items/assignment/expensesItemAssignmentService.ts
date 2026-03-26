import Elysia from "elysia";
import { ExpensesRepositoryService } from "../../create/expensesCreateService";

export { ExpensesRepositoryService as ExpensesItemAssignmentRepositoryService };

export const ExpensesItemAssignmentService = new Elysia().use(
  ExpensesRepositoryService,
);
