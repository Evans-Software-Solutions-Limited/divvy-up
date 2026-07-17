import { authHeaders, TEST_USER_ID } from "../../../__tests__/support/authMock";
import { beforeEach, describe, expect, it } from "vitest";
import { groupsActivityHandler } from "../groupsActivityHandler";
import { activityRepo as activityRepoUntyped } from "../../../repositories/activityRepository";
import type { Activity } from "../../../../domain/types";
// The vitest.setup.ts module mock swaps the real repo for this in-memory double
// at runtime; typed here so the test-only seed helpers are visible.
import type { InMemoryActivityRepository } from "../../../repositories/__tests__/support/inMemoryActivityRepository";

const activityRepo =
  activityRepoUntyped as unknown as InMemoryActivityRepository;

const GROUP = "group-1";
const MEMBER = "11111111-1111-4111-8111-aaaaaaaaaaaa";

function seed(overrides: Partial<Activity> & { id: string }): Activity {
  const row: Activity = {
    groupId: GROUP,
    actorMemberId: MEMBER,
    kind: "member_added",
    text: "Someone joined",
    amount: null,
    expenseId: null,
    settlementId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  activityRepo._add(row);
  return row;
}

beforeEach(() => {
  activityRepo._clearStore();
  activityRepo._addMember(GROUP, TEST_USER_ID);
});

function get(groupId: string, query = "", token: "test" | "test-2" = "test") {
  return groupsActivityHandler.handle(
    new Request(`http://localhost/groups/${groupId}/activity${query}`, {
      headers: authHeaders(token),
    }),
  );
}

describe("GET /groups/:id/activity", () => {
  it("returns the group's feed newest-first for a member", async () => {
    seed({ id: "a", text: "oldest", createdAt: "2026-01-01T00:00:00.000Z" });
    seed({ id: "b", text: "newest", createdAt: "2026-03-01T00:00:00.000Z" });
    seed({ id: "c", text: "middle", createdAt: "2026-02-01T00:00:00.000Z" });

    const response = await get(GROUP);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { activity: Activity[] };
    expect(data.activity.map((a) => a.text)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });

  it("tie-breaks equal timestamps deterministically by id desc", async () => {
    const ts = "2026-05-01T00:00:00.000Z";
    seed({ id: "aaa", text: "a", createdAt: ts });
    seed({ id: "ccc", text: "c", createdAt: ts });
    seed({ id: "bbb", text: "b", createdAt: ts });

    const data = (await (await get(GROUP)).json()) as { activity: Activity[] };
    expect(data.activity.map((a) => a.id)).toEqual(["ccc", "bbb", "aaa"]);
  });

  it("honours the limit query (most-recent-N)", async () => {
    seed({ id: "a", text: "1", createdAt: "2026-01-01T00:00:00.000Z" });
    seed({ id: "b", text: "2", createdAt: "2026-02-01T00:00:00.000Z" });
    seed({ id: "c", text: "3", createdAt: "2026-03-01T00:00:00.000Z" });

    const data = (await (await get(GROUP, "?limit=2")).json()) as {
      activity: Activity[];
    };
    expect(data.activity.map((a) => a.text)).toEqual(["3", "2"]);
  });

  it("returns an empty list for a non-member (no existence leak)", async () => {
    seed({ id: "a", text: "secret" });

    const response = await get(GROUP, "", "test-2");
    expect(response.status).toBe(200);
    const data = (await response.json()) as { activity: Activity[] };
    expect(data.activity).toEqual([]);
  });

  it("rejects a non-positive limit at the schema boundary (422)", async () => {
    const response = await get(GROUP, "?limit=0");
    // Elysia coerces + validates the query before the handler runs.
    expect(response.status).toBe(422);
  });
});
