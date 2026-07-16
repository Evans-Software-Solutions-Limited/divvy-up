import {
  authHeaders,
  OTHER_USER_ID,
  TEST_USER_ID,
} from "../../../__tests__/support/authMock";
import { beforeEach, describe, expect, it } from "vitest";
import { groupsInvitesHandler } from "../groupsInvitesHandler";
import { groupInvitesRepo as repoUntyped } from "../../../repositories/groupInvitesRepository";
// The vitest.setup.ts module mock swaps the real repo for this in-memory
// double at runtime; typed here so the test-only seed helpers are visible.
import type { InMemoryGroupInvitesRepository } from "../../../repositories/__tests__/support/inMemoryGroupInvitesRepository";

const repo = repoUntyped as unknown as InMemoryGroupInvitesRepository;

const GROUP = "group-1";

beforeEach(() => {
  repo._clearStore();
  repo._addGroup(GROUP, "Trip to Rome");
  repo._addMember(GROUP, TEST_USER_ID, "Owner");
});

type Token = "test" | "test-2";

async function createInvite(
  groupId: string,
  body: unknown,
  token: Token = "test",
) {
  return groupsInvitesHandler.handle(
    new Request(`http://localhost/groups/${groupId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(body ?? {}),
    }),
  );
}

/** Create an open invite and return its raw token. */
async function createOpenToken(): Promise<string> {
  const data = (await (await createInvite(GROUP, {})).json()) as {
    token: string;
  };
  return data.token;
}

function post(path: string, body: unknown, token: Token = "test") {
  return groupsInvitesHandler.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /groups/:id/invites", () => {
  it("creates an open invite and returns 201 with the raw token once (no hash)", async () => {
    const response = await createInvite(GROUP, {});
    expect(response.status).toBe(201);
    const data = (await response.json()) as {
      token: string;
      invite: Record<string, unknown>;
    };
    expect(data.token).toBeTruthy();
    expect(data.invite).not.toHaveProperty("tokenHash");
    expect(data.invite.memberId).toBeNull();
  });

  it("returns 404 when the caller is not a member of the group", async () => {
    const response = await createInvite(GROUP, {}, "test-2");
    expect(response.status).toBe(404);
  });

  it("returns 409 for a seat that is not an unclaimed placeholder", async () => {
    // OTHER_USER_ID is a linked (non-placeholder) member — not invitable as a seat.
    const linkedSeatId = repo._addMember(GROUP, OTHER_USER_ID, "Linked");
    const response = await createInvite(GROUP, { memberId: linkedSeatId });
    expect(response.status).toBe(409);
  });

  it("returns 404 for a seat that does not belong to the group", async () => {
    const response = await createInvite(GROUP, {
      memberId: "99999999-9999-4999-8999-999999999999",
    });
    expect(response.status).toBe(404);
  });
});

describe("POST /invites/accept", () => {
  it("accepts an open invite and returns 200 with the group + membership", async () => {
    const token = await createOpenToken();
    const response = await post("/invites/accept", { token }, "test-2");

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      group: { id: string };
      member: { name: string };
      alreadyMember: boolean;
    };
    expect(data.group.id).toBe(GROUP);
    expect(data.alreadyMember).toBe(false);
  });

  it("is idempotent (200, alreadyMember) when the caller is already a member", async () => {
    const token = await createOpenToken();
    // TEST_USER_ID (token "test") is already the owner/member.
    const response = await post("/invites/accept", { token });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { alreadyMember: boolean };
    expect(data.alreadyMember).toBe(true);
  });

  it("returns 404 for an unknown token", async () => {
    const response = await post("/invites/accept", { token: "no-such-token" });
    expect(response.status).toBe(404);
  });

  it("returns 410 for an expired token", async () => {
    repo._seedInvite("expired-token", {
      groupId: GROUP,
      expiresAt: new Date(Date.now() - 1000),
    });
    const response = await post(
      "/invites/accept",
      { token: "expired-token" },
      "test-2",
    );
    expect(response.status).toBe(410);
  });

  it("returns 410 for an already-used seat invite", async () => {
    const seatId = repo._addPlaceholderSeat(GROUP, "Reserved");
    repo._seedInvite("used-token", {
      groupId: GROUP,
      memberId: seatId,
      usedAt: new Date(),
    });
    const response = await post(
      "/invites/accept",
      { token: "used-token" },
      "test-2",
    );
    expect(response.status).toBe(410);
  });

  it("returns 409 when the seat was already claimed by someone else", async () => {
    // A seat already linked to another account (claimed out-of-band). The
    // accepter (test-2) is a brand-new user, so it passes the already-member
    // check and reaches the seat guard.
    const claimedSeatId = repo._addMember(GROUP, "someone-else", "Claimed");
    repo._seedInvite("seat-token", { groupId: GROUP, memberId: claimedSeatId });
    const response = await post(
      "/invites/accept",
      { token: "seat-token" },
      "test-2",
    );
    expect(response.status).toBe(409);
  });

  it("rejects an empty token at the schema boundary (422)", async () => {
    const response = await post("/invites/accept", { token: "" });
    expect(response.status).toBe(422);
  });
});

describe("POST /invites/lookup", () => {
  it("returns a preview for a valid token", async () => {
    const token = await createOpenToken();
    const response = await post("/invites/lookup", { token });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      groupName: string;
      memberCount: number;
    };
    expect(data.groupName).toBe("Trip to Rome");
    expect(data.memberCount).toBe(1);
  });

  it("returns 404 for an unknown token", async () => {
    const response = await post("/invites/lookup", { token: "no-such-token" });
    expect(response.status).toBe(404);
  });
});
