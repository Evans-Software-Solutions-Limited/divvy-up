import Elysia from "elysia";
import {
  GroupsRepository,
  groupsRepo,
} from "../../repositories/groupsRepository";

export const GroupsCreateService = new Elysia().decorate(
  GroupsRepository.key,
  groupsRepo,
);
