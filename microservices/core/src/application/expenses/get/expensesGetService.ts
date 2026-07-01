import Elysia from "elysia";
import { ExpensesRepository } from "../../repositories/expensesRepository";
import { expensesRepo } from "../create/expensesCreateService";

export const ExpensesGetService = new Elysia().decorate(
  ExpensesRepository.key,
  expensesRepo,
);
