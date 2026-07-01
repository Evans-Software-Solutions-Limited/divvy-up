import Elysia from "elysia";
import { ExpensesRepository } from "../../repositories/expensesRepository";
import { expensesRepo } from "../../expenses/create/expensesCreateService";

export const GroupsExpensesService = new Elysia().decorate(
  ExpensesRepository.key,
  expensesRepo,
);
