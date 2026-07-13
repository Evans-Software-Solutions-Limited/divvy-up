import {
  authHeaders,
  TEST_USER_ID,
} from "../../../../__tests__/support/authMock";
import { beforeEach, describe, expect, it } from "vitest";
import { expensesItemAssignmentHandler } from "../expensesItemAssignmentHandler";
import { expensesRepo as expensesRepoUntyped } from "../../../create/expensesCreateService";
// The vitest.setup.ts module mock swaps the real repo for this in-memory
// double at runtime; typed here so `_addMember` (test-only, not on the real
// class) is visible.
import type { InMemoryExpensesRepository } from "../../../../repositories/__tests__/support/inMemoryExpensesRepository";

const expensesRepo =
  expensesRepoUntyped as unknown as InMemoryExpensesRepository;

const baseExpenseInput = {
  groupId: "group-1",
  payerId: "member-1",
  description: "Dinner",
  date: "2026-03-26",
  currency: "USD",
  items: [
    {
      description: "Spaghetti Carbonara",
      unitPrice: 1800,
      quantity: 1,
      assignment: { type: "everyone" as const },
    },
    {
      description: "Tiramisu",
      unitPrice: 900,
      quantity: 2,
      assignment: { type: "everyone" as const },
    },
  ],
};

beforeEach(() => {
  expensesRepo._clearStore();
  expensesRepo._addMember("group-1", TEST_USER_ID);
});

describe("PUT /expenses/:id/items/:itemId/assignment", () => {
  it("assigns an item to one person", async () => {
    const expense = await expensesRepo.create(TEST_USER_ID, baseExpenseInput);
    const itemId = expense.items[0].id;

    const response = await expensesItemAssignmentHandler.handle(
      new Request(
        `http://localhost/expenses/${expense.id}/items/${itemId}/assignment`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            assignment: { type: "one", memberId: "member-2" },
          }),
        },
      ),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      items: { id: string; assignment: { type: string; memberId?: string } }[];
    };
    const updated = data.items.find((i) => i.id === itemId);
    expect(updated?.assignment).toEqual({ type: "one", memberId: "member-2" });
  });

  it("assigns an item as equal split among selected members", async () => {
    const expense = await expensesRepo.create(TEST_USER_ID, baseExpenseInput);
    const itemId = expense.items[1].id;

    const response = await expensesItemAssignmentHandler.handle(
      new Request(
        `http://localhost/expenses/${expense.id}/items/${itemId}/assignment`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            assignment: {
              type: "equal",
              memberIds: ["member-1", "member-2", "member-3"],
            },
          }),
        },
      ),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      items: {
        id: string;
        assignment: { type: string; memberIds?: string[] };
      }[];
    };
    const updated = data.items.find((i) => i.id === itemId);
    expect(updated?.assignment.type).toBe("equal");
    expect(updated?.assignment.memberIds).toHaveLength(3);
  });

  it("assigns an item with custom fractional shares", async () => {
    const expense = await expensesRepo.create(TEST_USER_ID, baseExpenseInput);
    const itemId = expense.items[0].id;

    const response = await expensesItemAssignmentHandler.handle(
      new Request(
        `http://localhost/expenses/${expense.id}/items/${itemId}/assignment`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            assignment: {
              type: "custom",
              shares: [
                { memberId: "member-1", fraction: 0.75 },
                { memberId: "member-2", fraction: 0.25 },
              ],
            },
          }),
        },
      ),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      items: {
        id: string;
        assignment: {
          type: string;
          shares?: { memberId: string; fraction: number }[];
        };
      }[];
    };
    const updated = data.items.find((i) => i.id === itemId);
    expect(updated?.assignment.type).toBe("custom");
    expect(updated?.assignment.shares).toHaveLength(2);
  });

  it("returns 404 when the expense does not exist", async () => {
    const response = await expensesItemAssignmentHandler.handle(
      new Request(
        "http://localhost/expenses/nonexistent/items/item-x/assignment",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            assignment: { type: "one", memberId: "member-1" },
          }),
        },
      ),
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the caller is not a member of the expense's group", async () => {
    const expense = await expensesRepo.create(TEST_USER_ID, baseExpenseInput);
    const itemId = expense.items[0].id;

    const response = await expensesItemAssignmentHandler.handle(
      new Request(
        `http://localhost/expenses/${expense.id}/items/${itemId}/assignment`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders("test-2"),
          },
          body: JSON.stringify({
            assignment: { type: "one", memberId: "member-2" },
          }),
        },
      ),
    );

    expect(response.status).toBe(404);
  });
});
