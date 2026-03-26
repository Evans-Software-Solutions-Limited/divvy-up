import { describe, expect, it } from "vitest";
import { expensesCreateHandler } from "../expensesCreateHandler";

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
        headers: { "Content-Type": "application/json" },
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
});
