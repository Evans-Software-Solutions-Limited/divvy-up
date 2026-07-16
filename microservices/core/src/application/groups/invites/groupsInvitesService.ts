import Elysia from "elysia";
import {
  GroupInvitesRepository,
  groupInvitesRepo,
} from "../../repositories/groupInvitesRepository";

export const GroupsInvitesService = new Elysia().decorate(
  GroupInvitesRepository.key,
  groupInvitesRepo,
);
