import Elysia from "elysia";
import { ExpensesRepository } from "../../repositories/expensesRepository";

export const ExpensesRepositoryService = new Elysia().decorate(
  ExpensesRepository.key,
  new ExpensesRepository(),
);
