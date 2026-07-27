import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { groupInvites, groupMembers, type Db } from "@divvy-up/db";
import {
  createTestDb,
  seedGroup,
  seedMember,
  seedUser,
} from "./support/pgliteDb";
import { hashInviteToken } from "../inviteToken";

// The setup file mocks this module for the handler tests; get the real class here.
const { GroupInvitesRepository } = await vi.importActual<
  typeof import("../groupInvitesRepository")
>("../groupInvitesRepository");

let db: Db;
let truncateAll: () => Promise<void>;

beforeAll(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  truncateAll = testDb.truncateAll;
});

beforeEach(async () => {
  await truncateAll();
});

/** A group whose creator (the caller) is an active linked member. */
async function seedOwnedGroup() {
  const owner = await seedUser(db);
  const group = await seedGroup(db, owner.id);
  await seedMember(db, group.id, "Owner", 0, { userId: owner.id });
  return { owner, group };
}

async function inviteRowByToken(token: string) {
  const [row] = await db
    .select()
    .from(groupInvites)
    .where(eq(groupInvites.tokenHash, hashInviteToken(token)));
  return row;
}

async function activeMembers(groupId: string) {
  return db
    .select()
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.active, true)),
    );
}

describe("GroupInvitesRepository.create (PGlite, real schema)", () => {
  it("creates an open invite and persists only the token HASH, never the raw token", async () => {
    const repo = new GroupInvitesRepository(db);
    const { owner, group } = await seedOwnedGroup();

    const result = await repo.create(owner.id, { groupId: group.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // base64url, high entropy — and NOT what got stored.
    expect(result.token).toMatch(/^[A-Za-z0-9_-]+$/);
    const row = await inviteRowByToken(result.token);
    expect(row).toBeDefined();
    expect(row.tokenHash).toBe(hashInviteToken(result.token));
    expect(row.tokenHash).not.toBe(result.token);
    expect(row.memberId).toBeNull();
    expect(row.usedAt).toBeNull();
    expect(row.createdBy).toBe(owner.id);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // The view never carries the hash.
    expect(result.invite).not.toHaveProperty("tokenHash");
  });

  it("creates a seat invite bound to an unclaimed placeholder", async () => {
    const repo = new GroupInvitesRepository(db);
    const { owner, group } = await seedOwnedGroup();
    const seat = await seedMember(db, group.id, "Seat", 1, {
      placeholder: true,
    });

    const result = await repo.create(owner.id, {
      groupId: group.id,
      memberId: seat.id,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.invite.memberId).toBe(seat.id);
  });

  it("returns not_member when the caller is not an active member (no existence leak)", async () => {
    const repo = new GroupInvitesRepository(db);
    const { group } = await seedOwnedGroup();
    const outsider = await seedUser(db);

    const result = await repo.create(outsider.id, { groupId: group.id });
    expect(result).toEqual({ ok: false, reason: "not_member" });
    expect(await db.select().from(groupInvites)).toHaveLength(0);
  });

  it("returns not_member for a non-uuid group id", async () => {
    const repo = new GroupInvitesRepository(db);
    const owner = await seedUser(db);
    const result = await repo.create(owner.id, { groupId: "not-a-uuid" });
    expect(result).toEqual({ ok: false, reason: "not_member" });
  });

  it("returns member_not_found for a seat belonging to a different group (wrong-group)", async () => {
    const repo = new GroupInvitesRepository(db);
    const { owner, group } = await seedOwnedGroup();
    const otherOwner = await seedUser(db);
    const otherGroup = await seedGroup(db, otherOwner.id);
    const foreignSeat = await seedMember(db, otherGroup.id, "Foreign", 0, {
      placeholder: true,
    });

    const result = await repo.create(owner.id, {
      groupId: group.id,
      memberId: foreignSeat.id,
    });
    expect(result).toEqual({ ok: false, reason: "member_not_found" });
  });

  it("returns seat_unavailable for a seat that is already a linked (non-placeholder) member", async () => {
    const repo = new GroupInvitesRepository(db);
    const { owner, group } = await seedOwnedGroup();
    const linkedUser = await seedUser(db);
    const linked = await seedMember(db, group.id, "Linked", 2, {
      userId: linkedUser.id,
      placeholder: false,
    });

    const result = await repo.create(owner.id, {
      groupId: group.id,
      memberId: linked.id,
    });
    expect(result).toEqual({ ok: false, reason: "seat_unavailable" });
  });
});

describe("GroupInvitesRepository.accept (PGlite, real schema)", () => {
  it("open invite: creates a new linked member and stays reusable (usedAt null)", async () => {
    const repo = new GroupInvitesRepository(db);
    const { owner, group } = await seedOwnedGroup();
    const created = await repo.create(owner.id, { groupId: group.id });
    if (!created.ok) throw new Error("create failed");

    const alice = await seedUser(db, { displayName: "Alice" });
    const bob = await seedUser(db, { displayName: "Bob" });

    const r1 = await repo.accept(alice.id, created.token);
    const r2 = await repo.accept(bob.id, created.token);

    expect(r1.ok && r1.alreadyMember).toBe(false);
    expect(r2.ok && r2.alreadyMember).toBe(false);
    if (r1.ok) expect(r1.member.name).toBe("Alice");

    const members = await activeMembers(group.id);
    // owner + alice + bob
    expect(members).toHaveLength(3);
    expect(members.map((m) => m.userId).sort()).toEqual(
      [owner.id, alice.id, bob.id].sort(),
    );
    // Reusable: the open invite is never marked used.
    expect((await inviteRowByToken(created.token)).usedAt).toBeNull();
  });

  it("seat invite: claims the placeholder (links user_id, flips placeholder) and marks used", async () => {
    const repo = new GroupInvitesRepository(db);
    const { owner, group } = await seedOwnedGroup();
    const seat = await seedMember(db, group.id, "Reserved", 1, {
      placeholder: true,
    });
    const created = await repo.create(owner.id, {
      groupId: group.id,
      memberId: seat.id,
    });
    if (!created.ok) throw new Error("create failed");
    const claimer = await seedUser(db);

    const result = await repo.accept(claimer.id, created.token);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.member.id).toBe(seat.id); // same seat, not a new row

    const [claimedSeat] = await db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.id, seat.id));
    expect(claimedSeat.userId).toBe(claimer.id);
    expect(claimedSeat.placeholder).toBe(false);
    // No duplicate member was created.
    expect(await activeMembers(group.id)).toHaveLength(2); // owner + claimed seat
    // Single-use: the seat invite is now spent.
    expect((await inviteRowByToken(created.token)).usedAt).not.toBeNull();
  });

  it("seat invite is single-use: a second accept returns used", async () => {
    const repo = new GroupInvitesRepository(db);
    const { owner, group } = await seedOwnedGroup();
    const seat = await seedMember(db, group.id, "Reserved", 1, {
      placeholder: true,
    });
    const created = await repo.create(owner.id, {
      groupId: group.id,
      memberId: seat.id,
    });
    if (!created.ok) throw new Error("create failed");

    const first = await seedUser(db);
    const second = await seedUser(db);
    await repo.accept(first.id, created.token);
    const result = await repo.accept(second.id, created.token);

    expect(result).toEqual({ ok: false, reason: "used" });
  });

  it("returns expired for a token past its expiry", async () => {
    const repo = new GroupInvitesRepository(db);
    const { owner, group } = await seedOwnedGroup();
    const created = await repo.create(owner.id, { groupId: group.id });
    if (!created.ok) throw new Error("create failed");

    await db
      .update(groupInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(groupInvites.tokenHash, hashInviteToken(created.token)));

    const joiner = await seedUser(db);
    const result = await repo.accept(joiner.id, created.token);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("returns invalid for an unknown token", async () => {
    const repo = new GroupInvitesRepository(db);
    const joiner = await seedUser(db);
    const result = await repo.accept(joiner.id, "no-such-token");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("is idempotent for a caller who is already an active member", async () => {
    const repo = new GroupInvitesRepository(db);
    const { owner, group } = await seedOwnedGroup();
    const created = await repo.create(owner.id, { groupId: group.id });
    if (!created.ok) throw new Error("create failed");

    // Owner is already a member — accepting must not create a duplicate.
    const result = await repo.accept(owner.id, created.token);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.alreadyMember).toBe(true);
    expect(await activeMembers(group.id)).toHaveLength(1);
  });

  it("reactivates a soft-deleted member rather than creating a duplicate", async () => {
    const repo = new GroupInvitesRepository(db);
    const { owner, group } = await seedOwnedGroup();
    const returning = await seedUser(db);
    await seedMember(db, group.id, "Returning", 3, {
      userId: returning.id,
      active: false,
    });
    const created = await repo.create(owner.id, { groupId: group.id });
    if (!created.ok) throw new Error("create failed");

    const result = await repo.accept(returning.id, created.token);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.alreadyMember).toBe(false);

    const members = await activeMembers(group.id);
    expect(members).toHaveLength(2); // owner + reactivated
    expect(members.some((m) => m.userId === returning.id)).toBe(true);
  });

  it("returns the same roster shape as GroupsRepository, former members included", async () => {
    // Two independent hydrations build the `Group` payload (this one for the
    // invite-accept response, `GroupsRepository` for the group endpoints). They
    // have to agree, or the same group would look different depending on which
    // endpoint returned it — and a client filtering on `active` would break on
    // whichever one omitted the flag.
    const repo = new GroupInvitesRepository(db);
    const { owner, group } = await seedOwnedGroup();
    await seedMember(db, group.id, "Departed", 4, { active: false });
    const created = await repo.create(owner.id, { groupId: group.id });
    if (!created.ok) throw new Error("create failed");

    const joiner = await seedUser(db);
    const result = await repo.accept(joiner.id, created.token);
    if (!result.ok) throw new Error("accept failed");

    const departed = result.group.members.find((m) => m.name === "Departed");
    expect(departed).toMatchObject({ active: false, colourIndex: 4 });
    expect(
      result.group.members.every(
        (m) =>
          typeof m.active === "boolean" && typeof m.colourIndex === "number",
      ),
    ).toBe(true);
  });

  it("returns seat_unavailable when the seat was claimed by someone else after the invite was made", async () => {
    const repo = new GroupInvitesRepository(db);
    const { owner, group } = await seedOwnedGroup();
    const seat = await seedMember(db, group.id, "Reserved", 1, {
      placeholder: true,
    });
    const created = await repo.create(owner.id, {
      groupId: group.id,
      memberId: seat.id,
    });
    if (!created.ok) throw new Error("create failed");

    // Someone else claims the seat out-of-band before this invite is redeemed.
    const claimer = await seedUser(db);
    await db
      .update(groupMembers)
      .set({ userId: claimer.id, placeholder: false })
      .where(eq(groupMembers.id, seat.id));

    const latecomer = await seedUser(db);
    const result = await repo.accept(latecomer.id, created.token);
    expect(result).toEqual({ ok: false, reason: "seat_unavailable" });
  });
});

describe("GroupInvitesRepository.lookup (PGlite, real schema)", () => {
  it("previews group name and active member count for a valid token", async () => {
    const repo = new GroupInvitesRepository(db);
    const { owner, group } = await seedOwnedGroup();
    await seedMember(db, group.id, "Seat", 1, { placeholder: true });
    const created = await repo.create(owner.id, { groupId: group.id });
    if (!created.ok) throw new Error("create failed");

    const preview = await repo.lookup(created.token);
    expect(preview).toEqual({
      groupId: group.id,
      groupName: "Test Group",
      memberCount: 2, // owner + placeholder seat
    });
  });

  it("returns null for an unknown, expired, or spent-seat token", async () => {
    const repo = new GroupInvitesRepository(db);
    const { owner, group } = await seedOwnedGroup();

    expect(await repo.lookup("no-such-token")).toBeNull();

    const expired = await repo.create(owner.id, { groupId: group.id });
    if (!expired.ok) throw new Error("create failed");
    await db
      .update(groupInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(groupInvites.tokenHash, hashInviteToken(expired.token)));
    expect(await repo.lookup(expired.token)).toBeNull();

    const seat = await seedMember(db, group.id, "Seat", 2, {
      placeholder: true,
    });
    const seatInvite = await repo.create(owner.id, {
      groupId: group.id,
      memberId: seat.id,
    });
    if (!seatInvite.ok) throw new Error("create failed");
    const claimer = await seedUser(db);
    await repo.accept(claimer.id, seatInvite.token); // marks used
    expect(await repo.lookup(seatInvite.token)).toBeNull();
  });
});
