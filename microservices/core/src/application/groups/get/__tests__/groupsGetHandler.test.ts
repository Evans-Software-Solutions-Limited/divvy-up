import {
  authHeaders,
  OTHER_USER_ID,
  TEST_USER_ID,
} from "../../../__tests__/support/authMock";
import { beforeEach, describe, expect, it } from "vitest";
import { groupsGetHandler } from "../groupsGetHandler";
import { groupsRepo } from "../../../repositories/groupsRepository";
import type { Group } from "../../../../domain/types";

beforeEach(() => {
  groupsRepo._clearStore();
});

describe("groupsGetHandler", () => {
  it("GET /groups/:id returns the group for an active member", async () => {
    const group = await groupsRepo.create(TEST_USER_ID, "Weekend Trip");

    const response = await groupsGetHandler.handle(
      new Request(`http://localhost/groups/${group.id}`, {
        headers: authHeaders(),
      }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as Group;
    expect(data.id).toBe(group.id);
  });

  it("returns 404 for a group the caller isn't a member of (scoping)", async () => {
    const group = await groupsRepo.create(
      OTHER_USER_ID,
      "Someone Else's Group",
    );

    const response = await groupsGetHandler.handle(
      new Request(`http://localhost/groups/${group.id}`, {
        headers: authHeaders(),
      }),
    );

    expect(response.status).toBe(404);
  });
});
