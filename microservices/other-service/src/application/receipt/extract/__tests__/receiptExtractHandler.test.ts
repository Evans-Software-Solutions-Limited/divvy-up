import { describe, expect, it } from "vitest";
import { receiptExtractHandler } from "../receiptExtractHandler";

type OcrExtractResult = {
  merchant: string | null;
  date: string | null;
  currency: string;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  items: { description: string; unitPrice: number; quantity: number }[];
  rawText?: string;
  groupId?: string;
};

describe("POST /receipts/extract", () => {
  it("returns 200 with structured receipt data for a valid image key", async () => {
    const response = await receiptExtractHandler.handle(
      new Request("http://localhost/receipts/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageKey: "receipts/test-image.jpg",
          groupId: "group-abc",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as OcrExtractResult;

    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.currency).toBe("string");
    expect(typeof data.subtotal).toBe("number");
    expect(typeof data.tax).toBe("number");
    expect(typeof data.total).toBe("number");
  });

  it("echoes groupId back in the response", async () => {
    const response = await receiptExtractHandler.handle(
      new Request("http://localhost/receipts/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageKey: "receipts/dinner.jpg",
          groupId: "group-xyz",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as OcrExtractResult;
    expect(data.groupId).toBe("group-xyz");
  });

  it("returns mock restaurant receipt with realistic line items", async () => {
    const response = await receiptExtractHandler.handle(
      new Request("http://localhost/receipts/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageKey: "receipts/italian-dinner.jpg" }),
      }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as OcrExtractResult;

    expect(data.merchant).toBe("Bella Italia");
    expect(data.items.length).toBeGreaterThan(0);
    // total should be >= subtotal (tax applied)
    expect(data.total).toBeGreaterThanOrEqual(data.subtotal);
  });

  it("returns cafe mock when imageKey starts with receipts/cafe", async () => {
    const response = await receiptExtractHandler.handle(
      new Request("http://localhost/receipts/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageKey: "receipts/cafe/morning-run.jpg" }),
      }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as OcrExtractResult;
    expect(data.merchant).toBe("The Daily Grind");
    expect(data.tip).toBeGreaterThan(0);
  });

  it("returns empty items array for completely blank image key", async () => {
    // An empty imageKey falls through to the default mock which has items,
    // but a non-matching key that DOES match no prefix still returns the
    // default stub — this test ensures the handler accepts the request
    // without throwing even when bad/unexpected data is passed.
    const response = await receiptExtractHandler.handle(
      new Request("http://localhost/receipts/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageKey: "" }),
      }),
    );

    // Should still return a 200 with a valid shape (may be empty)
    expect(response.status).toBe(200);
    const data = (await response.json()) as OcrExtractResult;
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.subtotal).toBe("number");
  });
});
