import {
  AnthropicVisionAdapter,
  type RawVisionExtraction,
} from "../../adapters/anthropicVision";
import { S3ReceiptImagesAdapter } from "../../adapters/s3ReceiptImages";
import { InvalidExtractionError, NotAReceiptError } from "../../types/errors";
import type { ExtractedItem, OcrExtractResult } from "../../types/receipt";

/**
 * ADR: single-step vision extraction.
 *
 * Receipt extraction is implemented as ONE Anthropic Messages API call —
 * an image content block plus a JSON-schema-constrained structured output
 * (see AnthropicVisionAdapter) — rather than a separate OCR pass feeding a
 * downstream parser. A single vision-capable model call reads layout,
 * infers per-line semantics (unit price vs. line total, weight-priced
 * items, etc.), and transcribes the raw text in one shot, which is both
 * simpler to operate and more accurate than gluing together a generic OCR
 * engine with hand-written parsing heuristics for receipt formats that
 * vary wildly by merchant and region.
 *
 * Model choice: claude-opus-4-8. Receipts are read once per scan (not a
 * hot path), and misreading a price silently is worse than paying for the
 * most capable available model — Opus is used deliberately over a cheaper
 * tier.
 *
 * Money policy: every monetary field emitted by the model MUST already be
 * an integer in minor currency units. This repository does not attempt to
 * coerce, round, or "fix" values that fail that check (e.g. guessing that
 * a value of 62 meant 6200) — that kind of heuristic can silently corrupt
 * a bill-split amount, which is worse than failing loudly with a 422 and
 * asking the user to retry or enter the amount manually. Reconciliation
 * mismatches (line items vs. subtotal, or subtotal+tax+tip vs. total) are
 * a different case — those are surfaced as non-fatal `warnings`, since a
 * receipt can legitimately have a rounding difference or an unlisted
 * discount, and we don't want to block extraction over it.
 */
export class ReceiptExtractRepository {
  static readonly key = "ReceiptExtractRepository";

  constructor(
    private readonly images: S3ReceiptImagesAdapter = new S3ReceiptImagesAdapter(),
    private readonly vision: AnthropicVisionAdapter = new AnthropicVisionAdapter(),
  ) {}

  async extract(
    imageKey: string,
    groupId?: string,
  ): Promise<OcrExtractResult & { groupId?: string }> {
    const image = await this.images.getImage(imageKey);
    const raw = await this.vision.extract(image.base64Data, image.mediaType);

    if (!raw.isReceipt) {
      throw new NotAReceiptError(raw.failureReason);
    }

    validateMoney(raw);

    const items: ExtractedItem[] = raw.items.map((item) => {
      const confidence = clampConfidence(item.confidence);
      return {
        description: item.description,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        ...(confidence !== undefined ? { confidence } : {}),
        ...(item.flag ? { flag: item.flag } : {}),
      };
    });

    const warnings = reconcile(raw, items);

    return {
      merchant: raw.merchant,
      date: raw.date,
      currency: raw.currency,
      subtotal: raw.subtotal,
      tax: raw.tax,
      tip: raw.tip,
      total: raw.total,
      items,
      rawText: raw.rawText,
      ...(warnings.length > 0 ? { warnings } : {}),
      groupId,
    };
  }
}

/**
 * Every monetary field must be a non-negative integer; total may be zero
 * (edge-case receipts, e.g. fully comped orders, are valid). Quantities
 * must be positive integers. Any failure throws — never rounded, never
 * guessed at.
 */
function validateMoney(raw: RawVisionExtraction): void {
  assertMoney(raw.subtotal, "subtotal");
  assertMoney(raw.tax, "tax");
  assertMoney(raw.tip, "tip");
  assertMoney(raw.total, "total");

  raw.items.forEach((item, index) => {
    assertMoney(
      item.unitPrice,
      `unitPrice for item ${index} (${item.description})`,
    );
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > MAX_MONEY_MINOR_UNITS // quantity is int4 in Postgres too
    ) {
      throw new InvalidExtractionError(
        `quantity for item ${index} (${item.description}) is not a positive integer within range: ${item.quantity}`,
      );
    }
  });
}

// Postgres int4 max — receipt_items.unit_price and friends are `integer`
// columns, so anything above this would fail later at insert time. A
// "price" past £21M is a hallucination anyway; reject it here, loudly.
const MAX_MONEY_MINOR_UNITS = 2_147_483_647;

function assertMoney(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_MONEY_MINOR_UNITS) {
    throw new InvalidExtractionError(
      `${label} (${value}) is not a non-negative integer within range`,
    );
  }
}

function clampConfidence(
  confidence: number | undefined | null,
): number | undefined {
  if (
    confidence === undefined ||
    confidence === null ||
    Number.isNaN(confidence)
  ) {
    return undefined;
  }
  return Math.min(1, Math.max(0, confidence));
}

/**
 * Reconciliation checks are informational only — mismatches never block
 * extraction, they're surfaced as warnings for the caller to display.
 */
function reconcile(raw: RawVisionExtraction, items: ExtractedItem[]): string[] {
  const warnings: string[] = [];

  const itemsSum = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  if (itemsSum !== raw.subtotal) {
    warnings.push(
      `Line items sum to ${itemsSum} but receipt subtotal reads ${raw.subtotal}`,
    );
  }

  const computedTotal = raw.subtotal + raw.tax + raw.tip;
  if (computedTotal !== raw.total) {
    warnings.push(
      `Subtotal + tax + tip is ${computedTotal} but receipt total reads ${raw.total}`,
    );
  }

  return warnings;
}
