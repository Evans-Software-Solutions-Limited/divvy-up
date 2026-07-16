import Elysia from "elysia";
import {
  SettlementsRepository,
  settlementsRepo,
} from "../../repositories/settlementsRepository";

export const GroupsSettlementsService = new Elysia().decorate(
  SettlementsRepository.key,
  settlementsRepo,
);
