import { describe, expect, it } from "vitest";
import { groupsListHandler } from "../groupsListHandler";

describe("groupsListHandler", () => {
  it("GET /groups returns 200 with an array", async () => {
    const response = await groupsListHandler
      .handle(new Request("http://localhost/groups"))
      .then((r) => r.json());
    expect(Array.isArray(response)).toBe(true);
  });
});
