import { authHeaders, TEST_USER_ID } from "../../../__tests__/support/authMock";
import { beforeEach, describe, expect, it } from "vitest";
import { groupsCreateHandler } from "../groupsCreateHandler";
import { groupsRepo } from "../../../repositories/groupsRepository";
import type { Group } from "../../../../domain/types";

beforeEach(() => {
  groupsRepo._clearStore();
});

describe("groupsCreateHandler", () => {
  // Intended change vs Phase 1 (data-and-persistence Requirement 7.5): the
  // creator's own `group_members` row is inserted in the same transaction as
  // the group, so the response now includes the creator as a member (it used
  // to come back with `members: []`).
  it("POST /groups includes the creator as a member", async () => {
    const response = await groupsCreateHandler.handle(
      new Request("http://localhost/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name: "Weekend Trip" }),
      }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as Group;
    expect(data.name).toBe("Weekend Trip");
    expect(data.members).toHaveLength(1);
    expect(data.members[0].userId).toBe(TEST_USER_ID);
  });
});
