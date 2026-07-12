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
  it("create() returns an ISO createdAt and no members", async () => {
    const repo = new GroupsRepository(db);
    const group = await repo.create("Weekend Trip");

    expect(group.name).toBe("Weekend Trip");
    expect(group.members).toEqual([]);
    expect(new Date(group.createdAt).toISOString()).toBe(group.createdAt);
  });

  it("list() hydrates each group with its active members, ordered by createdAt asc", async () => {
    const user = await seedUser(db);
    const groupA = await seedGroup(db, user.id, { name: "A" });
    await new Promise((r) => setTimeout(r, 5));
    const groupB = await seedGroup(db, user.id, { name: "B" });

    await seedMember(db, groupA.id, "Alice", 0);
    await seedMember(db, groupA.id, "Bob", 1, { active: false });
    await seedMember(db, groupB.id, "Cara", 0);

    const repo = new GroupsRepository(db);
    const result = await repo.list();

    expect(result.map((g) => g.name)).toEqual(["A", "B"]);
    expect(result[0].members).toHaveLength(1);
    expect(result[0].members[0].name).toBe("Alice");
    expect(result[1].members).toHaveLength(1);
    expect(result[1].members[0].name).toBe("Cara");
  });

  it("findById() hydrates active members ordered by createdAt asc", async () => {
    const user = await seedUser(db);
    const group = await seedGroup(db, user.id);
    await seedMember(db, group.id, "First", 0);
    await new Promise((r) => setTimeout(r, 5));
    await seedMember(db, group.id, "Second", 1);
    await seedMember(db, group.id, "Removed", 2, { active: false });

    const repo = new GroupsRepository(db);
    const found = await repo.findById(group.id);

    expect(found).not.toBeNull();
    expect(found?.members.map((m) => m.name)).toEqual(["First", "Second"]);
  });

  it("findById() returns null for an unknown UUID", async () => {
    const repo = new GroupsRepository(db);
    const found = await repo.findById("00000000-0000-0000-0000-000000000099");
    expect(found).toBeNull();
  });

  it("findById() returns null for a non-UUID id", async () => {
    const repo = new GroupsRepository(db);
    const found = await repo.findById("not-a-uuid");
    expect(found).toBeNull();
  });

  it("addMember() returns null for an unknown UUID group", async () => {
    const repo = new GroupsRepository(db);
    const member = await repo.addMember(
      "00000000-0000-0000-0000-000000000099",
      "Ghost",
    );
    expect(member).toBeNull();
  });

  it("addMember() returns null for a non-UUID group id", async () => {
    const repo = new GroupsRepository(db);
    const member = await repo.addMember("not-a-uuid", "Ghost");
    expect(member).toBeNull();
  });

  it("addMember() assigns colour indexes 0,1,2… and marks members as placeholder", async () => {
    const user = await seedUser(db);
    const group = await seedGroup(db, user.id);

    const repo = new GroupsRepository(db);
    const first = await repo.addMember(group.id, "One");
    const second = await repo.addMember(group.id, "Two");
    const third = await repo.addMember(group.id, "Three");

    const rows = await db
      .select({
        id: groupMembers.id,
        colourIndex: groupMembers.colourIndex,
        placeholder: groupMembers.placeholder,
      })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, group.id));
    const byId = new Map(rows.map((r) => [r.id, r]));

    expect(byId.get(first!.id)?.colourIndex).toBe(0);
    expect(byId.get(second!.id)?.colourIndex).toBe(1);
    expect(byId.get(third!.id)?.colourIndex).toBe(2);
    expect(rows.every((r) => r.placeholder === true)).toBe(true);
  });
});
