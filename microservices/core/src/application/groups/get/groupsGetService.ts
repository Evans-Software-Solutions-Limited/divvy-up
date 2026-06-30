import Elysia from "elysia";
import {
  GroupsRepository,
  groupsRepo,
} from "../../repositories/groupsRepository";

export const GroupsGetService = new Elysia().decorate(
  GroupsRepository.key,
  groupsRepo,
);
