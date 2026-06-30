import Elysia from "elysia";
import {
  GroupsRepository,
  groupsRepo,
} from "../../repositories/groupsRepository";

export const GroupsMembersService = new Elysia().decorate(
  GroupsRepository.key,
  groupsRepo,
);
