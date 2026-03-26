/** A single line item extracted from the receipt image */
export type ExtractedItem = {
  description: string;
  /** Unit price in minor currency units (e.g. cents) */
  unitPrice: number;
  quantity: number;
};

/**
 * Full structured result returned by the OCR/vision extraction step.
 * All monetary amounts are in minor currency units (e.g. cents for USD).
 */
export type OcrExtractResult = {
  /** Merchant / restaurant name as read from the receipt */
  merchant: string | null;
  /** ISO date string parsed from the receipt, e.g. "2026-03-26" */
  date: string | null;
  /** ISO 4217 currency code inferred from the receipt symbol */
  currency: string;
  /** Sum of line items before adjustments, in minor units */
  subtotal: number;
  /** Tax amount in minor units (0 if not found) */
  tax: number;
  /** Tip / service charge in minor units (0 if not found) */
  tip: number;
  /** Total as printed on the receipt, in minor units */
  total: number;
  items: ExtractedItem[];
  /** Raw OCR text, forwarded for client-side debugging */
  rawText?: string;
};
