import type { OcrExtractResult } from "../../types/receipt";

/**
 * Mock receipt data keyed by image key prefix.
 * Real implementation will call AWS Textract or Claude vision API.
 */
const MOCK_RECEIPTS: Record<string, OcrExtractResult> = {
  default: {
    merchant: "Bella Italia",
    date: "2026-03-26",
    currency: "USD",
    subtotal: 6200,
    tax: 558,
    tip: 0,
    total: 6758,
    items: [
      { description: "Spaghetti Carbonara", unitPrice: 1800, quantity: 1 },
      { description: "Margherita Pizza", unitPrice: 1600, quantity: 1 },
      { description: "Tiramisu", unitPrice: 900, quantity: 2 },
      { description: "House Red Wine", unitPrice: 1000, quantity: 1 },
    ],
    rawText:
      "BELLA ITALIA\n123 Main St\n\nSpaghetti Carbonara  18.00\nMargherita Pizza     16.00\nTimarisu x2          18.00\nHouse Red Wine       10.00\n\nSubtotal             62.00\nTax (9%)              5.58\nTotal                67.58\n\nThank you!",
  },
  "receipts/cafe": {
    merchant: "The Daily Grind",
    date: "2026-03-26",
    currency: "USD",
    subtotal: 1350,
    tax: 108,
    tip: 270,
    total: 1728,
    items: [
      { description: "Flat White", unitPrice: 450, quantity: 1 },
      { description: "Avocado Toast", unitPrice: 900, quantity: 1 },
    ],
    rawText:
      "THE DAILY GRIND\n\nFlat White            4.50\nAvocado Toast         9.00\n\nSubtotal             13.50\nTax (8%)              1.08\nTip (20%)             2.70\nTotal                17.28",
  },
};

export class ReceiptExtractRepository {
  static readonly key = "ReceiptExtractRepository";

  async extract(
    imageKey: string,
    groupId?: string,
  ): Promise<OcrExtractResult & { groupId?: string }> {
    // TODO: call vision/OCR API (e.g. AWS Textract or Claude vision)
    // using the S3 object at imageKey and return structured data.
    void imageKey;

    // Return a mock that matches the imageKey prefix, fallback to default
    const mockKey =
      Object.keys(MOCK_RECEIPTS).find((k) => imageKey.startsWith(k)) ??
      "default";
    const result = MOCK_RECEIPTS[mockKey];
    if (!result) {
      return {
        merchant: null,
        date: null,
        currency: "USD",
        subtotal: 0,
        tax: 0,
        tip: 0,
        total: 0,
        items: [],
        groupId,
      };
    }
    return { ...result, groupId };
  }
}
