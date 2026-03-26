import Elysia from "elysia";
import { ExpensesRepository } from "../../repositories/expensesRepository";

/** Module-level singleton shared across all expense handlers */
export const expensesRepo = new ExpensesRepository();

export const ExpensesRepositoryService = new Elysia().decorate(
  ExpensesRepository.key,
  expensesRepo,
);
