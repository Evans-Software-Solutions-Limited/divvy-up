/**
 * A single line item extracted from the receipt image.
 *
 * `confidence` and `flag` map 1:1 onto `packages/db` `receipt_items.confidence`
 * (real, 0..1, nullable) and `receipt_items.flag` (text, nullable) — see
 * `packages/db/src/schema.ts`.
 */
export type ExtractedItem = {
  description: string;
  /** Unit price in minor currency units (pence for GBP) */
  unitPrice: number;
  quantity: number;
  /** Model's per-item read confidence, 0..1 (clamped; omitted if unknown) */
  confidence?: number;
  /** Human-readable data-quality note, e.g. "Price hard to read — best guess" */
  flag?: string;
};

/**
 * Full structured result returned by the OCR/vision extraction step.
 * All monetary amounts are in minor currency units (pence for GBP).
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
  /**
   * Result-level data-quality notes, e.g. "Line items sum to 6100 but
   * receipt subtotal reads 6200". Never present when empty. These are
   * informational, not errors — extraction still succeeded.
   */
  warnings?: string[];
};
