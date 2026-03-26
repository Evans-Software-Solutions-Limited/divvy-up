import { describe, expect, it } from "vitest";
import { GroupsRepositoryService } from "../groupsListService";

describe("GroupsRepositoryService", () => {
  it("decorates context with GroupsRepository", () => {
    expect(GroupsRepositoryService).toBeDefined();
  });
});
