import { authHeaders, TEST_USER_ID } from "../../../__tests__/support/authMock";
import { beforeEach, describe, expect, it } from "vitest";
import { groupsSettlementsHandler } from "../groupsSettlementsHandler";
import { settlementsRepo as settlementsRepoUntyped } from "../../../repositories/settlementsRepository";
import type { Settlement } from "../../../../domain/types";
// The vitest.setup.ts module mock swaps the real repo for this in-memory
// double at runtime; typed here so the test-only seed helpers are visible.
import type { InMemorySettlementsRepository } from "../../../repositories/__tests__/support/inMemorySettlementsRepository";

const settlementsRepo =
  settlementsRepoUntyped as unknown as InMemorySettlementsRepository;

const GROUP = "group-1";
const ALICE = "11111111-1111-4111-8111-aaaaaaaaaaaa";
const BOB = "22222222-2222-4222-8222-bbbbbbbbbbbb";

beforeEach(() => {
  settlementsRepo._clearStore();
  settlementsRepo._addMember(GROUP, TEST_USER_ID);
  settlementsRepo._addGroupMemberId(GROUP, ALICE);
  settlementsRepo._addGroupMemberId(GROUP, BOB);
});

function post(
  groupId: string,
  body: unknown,
  token: "test" | "test-2" = "test",
) {
  return groupsSettlementsHandler.handle(
    new Request(`http://localhost/groups/${groupId}/settlements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /groups/:id/settlements", () => {
  it("records a settlement and returns 201", async () => {
    const response = await post(GROUP, {
      fromMemberId: BOB,
      toMemberId: ALICE,
      amount: 1500,
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as Settlement;
    expect(data).toMatchObject({
      groupId: GROUP,
      fromMemberId: BOB,
      toMemberId: ALICE,
      amount: 1500,
      recordedBy: TEST_USER_ID,
    });
    expect(data.id).toBeTruthy();
  });

  it("rejects a self-settlement with 400", async () => {
    const response = await post(GROUP, {
      fromMemberId: BOB,
      toMemberId: BOB,
      amount: 500,
    });
    expect(response.status).toBe(400);
  });

  it("rejects a non-positive amount at the schema boundary (422)", async () => {
    const response = await post(GROUP, {
      fromMemberId: BOB,
      toMemberId: ALICE,
      amount: 0,
    });
    // Elysia rejects schema-invalid bodies before the handler runs.
    expect(response.status).toBe(422);
  });

  it("returns 404 when the caller is not a member of the group", async () => {
    const response = await post(
      GROUP,
      { fromMemberId: BOB, toMemberId: ALICE, amount: 500 },
      "test-2",
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 when a party is not a member of the group", async () => {
    const response = await post(GROUP, {
      fromMemberId: BOB,
      toMemberId: "33333333-3333-4333-8333-cccccccccccc",
      amount: 500,
    });
    expect(response.status).toBe(404);
  });
});

describe("GET /groups/:id/settlements", () => {
  it("lists recorded settlements for a member", async () => {
    await post(GROUP, { fromMemberId: BOB, toMemberId: ALICE, amount: 700 });

    const response = await groupsSettlementsHandler.handle(
      new Request(`http://localhost/groups/${GROUP}/settlements`, {
        headers: authHeaders(),
      }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as { settlements: Settlement[] };
    expect(data.settlements).toHaveLength(1);
    expect(data.settlements[0].amount).toBe(700);
  });

  it("returns an empty list for a non-member (no existence leak)", async () => {
    await post(GROUP, { fromMemberId: BOB, toMemberId: ALICE, amount: 700 });

    const response = await groupsSettlementsHandler.handle(
      new Request(`http://localhost/groups/${GROUP}/settlements`, {
        headers: authHeaders("test-2"),
      }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as { settlements: Settlement[] };
    expect(data.settlements).toEqual([]);
  });
});
