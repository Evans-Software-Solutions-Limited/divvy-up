import { describe, expect, it } from "vitest";
import { receiptExtractHandler } from "../receiptExtractHandler";

describe("receiptExtractHandler", () => {
  it("POST /receipts/extract returns 200 with items array", async () => {
    const response = await receiptExtractHandler.handle(
      new Request("http://localhost/receipts/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageKey: "receipts/test-image.jpg" }),
      }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as { items: unknown[] };
    expect(Array.isArray(data.items)).toBe(true);
  });
});
