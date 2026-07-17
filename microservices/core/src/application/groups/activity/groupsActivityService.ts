import Elysia from "elysia";
import {
  ActivityRepository,
  activityRepo,
} from "../../repositories/activityRepository";

export const GroupsActivityService = new Elysia().decorate(
  ActivityRepository.key,
  activityRepo,
);
