import Elysia from "elysia";
import { GroupsRepository } from "../../repositories/groupsRepository";

export const GroupsRepositoryService = new Elysia().decorate(
  GroupsRepository.key,
  new GroupsRepository(),
);
