import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { groupMembers, type Db } from "@divvy-up/db";
import {
  createTestDb,
  seedGroup,
  seedMember,
  seedUser,
} from "./support/pgliteDb";

// The setup file mocks this module for the handler tests; get the real class here.
const { GroupsRepository } = await vi.importActual<
  typeof import("../groupsRepository")
>("../groupsRepository");

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

describe("GroupsRepository (PGlite)", () => {
  it("create() returns an ISO createdAt and includes the creator as a member (Req 7.5)", async () => {
    const user = await seedUser(db);
    const repo = new GroupsRepository(db);
    const group = await repo.create(user.id, "Weekend Trip");

    expect(group.name).toBe("Weekend Trip");
    expect(new Date(group.createdAt).toISOString()).toBe(group.createdAt);
    expect(group.members).toHaveLength(1);

    const rows = await db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.groupId, group.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(user.id);
    expect(rows[0].colourIndex).toBe(0);
    expect(rows[0].placeholder).toBe(false);
    expect(rows[0].active).toBe(true);
  });

  it("create() names the creator's member row from displayName, falling back to the email local-part", async () => {
    const named = await seedUser(db, { displayName: "Alex" });
    const repo = new GroupsRepository(db);
    const group = await repo.create(named.id, "Named");
    expect(group.members[0].name).toBe("Alex");

    const noName = await seedUser(db, {
      displayName: null,
      email: "sam.jones@example.com",
    });
    const group2 = await repo.create(noName.id, "No display name");
    expect(group2.members[0].name).toBe("sam.jones");
  });

  it("list() only returns groups the caller is an active member of, hydrated with active members", async () => {
    const user = await seedUser(db);
    const groupA = await seedGroup(db, user.id, { name: "A" });
    await new Promise((r) => setTimeout(r, 5));
    const groupB = await seedGroup(db, user.id, { name: "B" });

    // The caller's own membership row IS the "Alice"/"Cara" row here, so the
    // existing 1-member-per-group assertions stay intact while also proving
    // the scoping join.
    await seedMember(db, groupA.id, "Alice", 0, { userId: user.id });
    await seedMember(db, groupA.id, "Bob", 1, { active: false });
    await seedMember(db, groupB.id, "Cara", 0, { userId: user.id });

    const repo = new GroupsRepository(db);
    const result = await repo.list(user.id);

    expect(result.map((g) => g.name)).toEqual(["A", "B"]);
    expect(result[0].members).toHaveLength(1);
    expect(result[0].members[0].name).toBe("Alice");
    expect(result[1].members).toHaveLength(1);
    expect(result[1].members[0].name).toBe("Cara");
  });

  it("list() excludes groups the caller isn't a member of (scoping, Req 7.2/7.4)", async () => {
    const user = await seedUser(db);
    const outsider = await seedUser(db);
    const group = await seedGroup(db, user.id);
    await seedMember(db, group.id, "Owner", 0, { userId: user.id });

    const repo = new GroupsRepository(db);
    expect(await repo.list(outsider.id)).toEqual([]);
  });

  it("findById() hydrates active members ordered by createdAt asc", async () => {
    const user = await seedUser(db);
    const group = await seedGroup(db, user.id);
    await seedMember(db, group.id, "First", 0, { userId: user.id });
    await new Promise((r) => setTimeout(r, 5));
    await seedMember(db, group.id, "Second", 1);
    await seedMember(db, group.id, "Removed", 2, { active: false });

    const repo = new GroupsRepository(db);
    const found = await repo.findById(user.id, group.id);

    expect(found).not.toBeNull();
    expect(found?.members.map((m) => m.name)).toEqual(["First", "Second"]);
  });

  it("findById() returns null for an unknown UUID", async () => {
    const user = await seedUser(db);
    const repo = new GroupsRepository(db);
    const found = await repo.findById(
      user.id,
      "00000000-0000-0000-0000-000000000099",
    );
    expect(found).toBeNull();
  });

  it("findById() returns null for a non-UUID id", async () => {
    const user = await seedUser(db);
    const repo = new GroupsRepository(db);
    const found = await repo.findById(user.id, "not-a-uuid");
    expect(found).toBeNull();
  });

  it("findById() returns null when the caller isn't an active member (scoping, Req 7.3/7.4)", async () => {
    const user = await seedUser(db);
    const outsider = await seedUser(db);
    const group = await seedGroup(db, user.id);
    await seedMember(db, group.id, "Owner", 0, { userId: user.id });

    const repo = new GroupsRepository(db);
    expect(await repo.findById(outsider.id, group.id)).toBeNull();
  });

  it("addMember() returns null for an unknown UUID group", async () => {
    const user = await seedUser(db);
    const repo = new GroupsRepository(db);
    const member = await repo.addMember(
      user.id,
      "00000000-0000-0000-0000-000000000099",
      "Ghost",
    );
    expect(member).toBeNull();
  });

  it("addMember() returns null for a non-UUID group id", async () => {
    const user = await seedUser(db);
    const repo = new GroupsRepository(db);
    const member = await repo.addMember(user.id, "not-a-uuid", "Ghost");
    expect(member).toBeNull();
  });

  it("addMember() returns null when the caller isn't an active member (scoping, Req 7.3/7.4)", async () => {
    const user = await seedUser(db);
    const outsider = await seedUser(db);
    const group = await seedGroup(db, user.id);
    await seedMember(db, group.id, "Owner", 0, { userId: user.id });

    const repo = new GroupsRepository(db);
    expect(await repo.addMember(outsider.id, group.id, "Ghost")).toBeNull();
  });

  it("addMember() assigns the next colour indexes after the creator and marks members as placeholder", async () => {
    const user = await seedUser(db);
    const repo = new GroupsRepository(db);
    const group = await repo.create(user.id, "Test Group");

    const first = await repo.addMember(user.id, group.id, "One");
    const second = await repo.addMember(user.id, group.id, "Two");
    const third = await repo.addMember(user.id, group.id, "Three");

    const rows = await db
      .select({
        id: groupMembers.id,
        colourIndex: groupMembers.colourIndex,
        placeholder: groupMembers.placeholder,
      })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, group.id));
    const byId = new Map(rows.map((r) => [r.id, r]));

    // Slot 0 is already taken by the creator (repo.create()'s own membership row).
    expect(byId.get(first!.id)?.colourIndex).toBe(1);
    expect(byId.get(second!.id)?.colourIndex).toBe(2);
    expect(byId.get(third!.id)?.colourIndex).toBe(3);
    expect(byId.get(first!.id)?.placeholder).toBe(true);
    expect(byId.get(second!.id)?.placeholder).toBe(true);
    expect(byId.get(third!.id)?.placeholder).toBe(true);
  });
});
