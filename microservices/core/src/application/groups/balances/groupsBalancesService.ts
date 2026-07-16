import Elysia from "elysia";
import {
  GroupsRepository,
  groupsRepo,
} from "../../repositories/groupsRepository";
import { expensesRepo } from "../../expenses/create/expensesCreateService";
import { ExpensesRepository } from "../../repositories/expensesRepository";
import {
  SettlementsRepository,
  settlementsRepo,
} from "../../repositories/settlementsRepository";

export const GroupsBalancesService = new Elysia()
  .decorate(GroupsRepository.key, groupsRepo)
  .decorate(ExpensesRepository.key, expensesRepo)
  .decorate(SettlementsRepository.key, settlementsRepo);
