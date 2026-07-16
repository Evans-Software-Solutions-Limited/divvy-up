import { authHeaders, TEST_USER_ID } from "../../../__tests__/support/authMock";
import { beforeEach, describe, expect, it } from "vitest";
import { expensesCreateHandler } from "../expensesCreateHandler";
import { expensesRepo as expensesRepoUntyped } from "../expensesCreateService";
// The vitest.setup.ts module mock swaps the real repo for this in-memory
// double at runtime; typed here so `_addMember`/`_clearStore` (test-only,
// not on the real class) are visible.
import type { InMemoryExpensesRepository } from "../../../repositories/__tests__/support/inMemoryExpensesRepository";

const expensesRepo =
  expensesRepoUntyped as unknown as InMemoryExpensesRepository;

beforeEach(() => {
  expensesRepo._clearStore();
  expensesRepo._addMember("group-1", TEST_USER_ID);
});

describe("expensesCreateHandler", () => {
  it("POST /expenses returns 200 with an expense object", async () => {
    const body = {
      groupId: "group-1",
      payerId: "member-1",
      description: "Dinner",
      date: "2026-03-26",
      items: [
        {
          description: "Pizza",
          unitPrice: 1200,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ],
    };

    const response = await expensesCreateHandler.handle(
      new Request("http://localhost/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(body),
      }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      description: string;
      items: unknown[];
    };
    expect(data.description).toBe("Dinner");
    expect(data.items).toHaveLength(1);
  });

  it("rejects a fractional unitPrice with 422", async () => {
    const body = {
      groupId: "group-1",
      payerId: "member-1",
      description: "Dinner",
      date: "2026-03-26",
      items: [
        {
          description: "Pizza",
          unitPrice: 12.5, // must be integer pence
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ],
    };

    const response = await expensesCreateHandler.handle(
      new Request("http://localhost/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      }),
    );

    expect(response.status).toBe(422);
  });

  it("rejects a fractional adjustment amount with 422", async () => {
    const body = {
      groupId: "group-1",
      payerId: "member-1",
      description: "Dinner",
      date: "2026-03-26",
      items: [
        {
          description: "Pizza",
          unitPrice: 1200,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ],
      adjustments: [{ kind: "tip", amount: 150.5, isPercent: false }],
    };

    const response = await expensesCreateHandler.handle(
      new Request("http://localhost/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      }),
    );

    expect(response.status).toBe(422);
  });

  it("accepts a valid negative (discount) adjustment amount", async () => {
    const body = {
      groupId: "group-1",
      payerId: "member-1",
      description: "Dinner",
      date: "2026-03-26",
      items: [
        {
          description: "Pizza",
          unitPrice: 1200,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ],
      adjustments: [{ kind: "discount", amount: -300, isPercent: false }],
    };

    const response = await expensesCreateHandler.handle(
      new Request("http://localhost/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      }),
    );

    expect(response.status).toBe(200);
  });

  it("returns 500 when the caller is not a member of the group", async () => {
    const body = {
      groupId: "group-1",
      payerId: "member-1",
      description: "Dinner",
      date: "2026-03-26",
      items: [
        {
          description: "Pizza",
          unitPrice: 1200,
          quantity: 1,
          assignment: { type: "everyone" },
        },
      ],
    };

    const response = await expensesCreateHandler.handle(
      new Request("http://localhost/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders("test-2"),
        },
        body: JSON.stringify(body),
      }),
    );

    expect(response.status).toBe(500);
  });
});
