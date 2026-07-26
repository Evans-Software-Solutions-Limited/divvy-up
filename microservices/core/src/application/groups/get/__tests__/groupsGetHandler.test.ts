import {
  authHeaders,
  OTHER_USER_ID,
  TEST_USER_ID,
} from "../../../__tests__/support/authMock";
import { beforeEach, describe, expect, it } from "vitest";
import { groupsGetHandler } from "../groupsGetHandler";
import { groupsRepo as groupsRepoUntyped } from "../../../repositories/groupsRepository";
import type { Group } from "../../../../domain/types";
// The vitest.setup.ts module mock swaps the real repo for this in-memory double
// at runtime; typed here so `_deactivateMember` (test-only, not on the real
// class) is visible.
import type { InMemoryGroupsRepository } from "../../../repositories/__tests__/support/inMemoryGroupsRepository";

const groupsRepo = groupsRepoUntyped as unknown as InMemoryGroupsRepository;

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

  it("includes former members, flagged, all the way out to the HTTP response", async () => {
    // The roster widening has to survive the whole path, not just the repository:
    // if an `active` filter reappeared anywhere between repository and response,
    // the Balances screen would go back to silently dropping debts owed by people
    // who have left. Asserted at the endpoint boundary for exactly that reason.
    const group = await groupsRepo.create(TEST_USER_ID, "Weekend Trip");
    const departing = await groupsRepo.addMember(
      TEST_USER_ID,
      group.id,
      "Departing",
    );
    if (!departing) throw new Error("addMember failed");
    groupsRepo._deactivateMember(group.id, departing.id);

    const response = await groupsGetHandler.handle(
      new Request(`http://localhost/groups/${group.id}`, {
        headers: authHeaders(),
      }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as Group;
    const former = data.members.find((m) => m.id === departing.id);
    expect(former).toMatchObject({ name: "Departing", active: false });
    // The caller is still a member and still flagged active.
    expect(data.members.some((m) => m.active)).toBe(true);
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
