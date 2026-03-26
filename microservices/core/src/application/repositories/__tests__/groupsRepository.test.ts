import { describe, expect, it } from "vitest";
import { GroupsRepository } from "../groupsRepository";

describe("GroupsRepository", () => {
  it("list() returns an array", async () => {
    const repo = new GroupsRepository();
    const result = await repo.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("create() returns a group with the given name", async () => {
    const repo = new GroupsRepository();
    const group = await repo.create("Weekend Trip");
    expect(group.name).toBe("Weekend Trip");
    expect(group.id).toBeTruthy();
    expect(group.members).toEqual([]);
  });
});
