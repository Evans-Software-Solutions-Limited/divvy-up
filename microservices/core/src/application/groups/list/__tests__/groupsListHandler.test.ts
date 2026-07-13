import {
  authHeaders,
  OTHER_USER_ID,
  TEST_USER_ID,
} from "../../../__tests__/support/authMock";
import { beforeEach, describe, expect, it } from "vitest";
import { groupsListHandler } from "../groupsListHandler";
import { groupsRepo } from "../../../repositories/groupsRepository";
import type { Group } from "../../../../domain/types";

beforeEach(() => {
  groupsRepo._clearStore();
});

describe("groupsListHandler", () => {
  it("GET /groups returns 200 with an array of the caller's groups", async () => {
    await groupsRepo.create(TEST_USER_ID, "Weekend Trip");

    const response = await groupsListHandler.handle(
      new Request("http://localhost/groups", { headers: authHeaders() }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as Group[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.map((g) => g.name)).toEqual(["Weekend Trip"]);
  });

  it("returns an empty array for a group the caller isn't a member of (scoping)", async () => {
    await groupsRepo.create(OTHER_USER_ID, "Someone Else's Group");

    const response = await groupsListHandler.handle(
      new Request("http://localhost/groups", { headers: authHeaders() }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as Group[];
    expect(data).toEqual([]);
  });
});
