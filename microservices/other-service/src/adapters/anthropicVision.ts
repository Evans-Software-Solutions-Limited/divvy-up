import Anthropic from "@anthropic-ai/sdk";
import { Resource } from "sst";

import {
  ExtractionRefusedError,
  ExtractionTruncatedError,
  InvalidExtractionError,
  ReceiptExtractError,
  UpstreamError,
  UpstreamRateLimitedError,
  UpstreamTimeoutError,
} from "../types/errors";

/** Raw shape produced by the model, before app-level money validation. */
export type RawVisionExtraction = {
  isReceipt: boolean;
  failureReason: string | null;
  merchant: string | null;
  date: string | null;
  currency: string;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  items: {
    description: string;
    unitPrice: number;
    quantity: number;
    confidence: number;
    flag: string | null;
  }[];
  rawText: string;
};

// Same accepted set as S3ReceiptImagesAdapter — validated there before an
// image ever reaches this adapter, so this is a type-only alias here.
type AcceptedMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

/**
 * JSON Schema for the structured extraction output. Every object needs
 * `additionalProperties: false` and `required` — the structured-outputs API
 * doesn't support numeric constraints like `minimum`, so range validation
 * (integers, 0..1 confidence, etc.) happens in application code instead
 * (see ReceiptExtractRepository).
 */
const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "isReceipt",
    "failureReason",
    "merchant",
    "date",
    "currency",
    "subtotal",
    "tax",
    "tip",
    "total",
    "items",
    "rawText",
  ],
  properties: {
    isReceipt: {
      type: "boolean",
      description:
        "False when the image is not a receipt, or is unreadable as one.",
    },
    failureReason: {
      type: ["string", "null"],
      description: "Why extraction failed, when isReceipt is false.",
    },
    merchant: { type: ["string", "null"] },
    date: {
      type: ["string", "null"],
      description:
        "ISO YYYY-MM-DD as printed on the receipt; null if absent or unreadable.",
    },
    currency: {
      type: "string",
      description:
        'ISO 4217 currency code inferred from symbol/context; "GBP" if £ or ambiguous UK context.',
    },
    subtotal: { type: "number", description: "Minor currency units." },
    tax: { type: "number", description: "Minor currency units, 0 if absent." },
    tip: { type: "number", description: "Minor currency units, 0 if absent." },
    total: {
      type: "number",
      description: "Minor currency units, 0 if absent.",
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "description",
          "unitPrice",
          "quantity",
          "confidence",
          "flag",
        ],
        properties: {
          description: { type: "string" },
          unitPrice: {
            type: "number",
            description:
              "Per-unit price in minor currency units — not the line total.",
          },
          quantity: {
            type: "number",
            description:
              "Positive integer. Weight-priced items use quantity 1 with the weight in the description.",
          },
          confidence: {
            type: "number",
            description: "0..1 reflecting legibility of this line.",
          },
          flag: {
            type: ["string", "null"],
            description: "Human-readable data-quality note, or null.",
          },
        },
      },
    },
    rawText: {
      type: "string",
      description:
        "Faithful plain-text transcription of the whole receipt, including totals.",
    },
  },
} as const;

const EXTRACTION_PROMPT = `You are extracting structured data from a photo of a retail or restaurant receipt for a bill-splitting app. Follow these rules exactly:

- ALL monetary values (subtotal, tax, tip, total, and each item's unitPrice) MUST be integers in minor currency units (pence/cents) — e.g. "£4.50" becomes 450, never 4.5.
- unitPrice is the PER-UNIT price, not the line total. If a line reads "2 x Coffee £3.00" (line total), unitPrice is 150 and quantity is 2.
- quantity must be a positive integer. For weight-priced items (e.g. produce sold by weight), use quantity 1 and put the weight in the description.
- confidence is a number in [0, 1] reflecting how legible that specific line was to you.
- If the image is not a receipt, or is too unreadable to extract, set isReceipt to false and give a short failureReason. In that case still fill in the other fields with your best-effort or null/0 values.
- Transcribe rawText faithfully as plain text, including the totals section, exactly as printed.
- Do not invent line items. If you cannot read a line at all, omit it rather than guessing. If you can only partially read a line, include it but lower its confidence and set flag to a short human-readable note (e.g. "Price hard to read — best guess").`;

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: Resource.AnthropicApiKey.value,
      timeout: 25_000,
      // The SDK default of 2 retries would blow the API Gateway 30s cap;
      // the mobile client owns retry, not this service.
      maxRetries: 0,
    });
  }
  return client;
}

/**
 * Maps Anthropic SDK transport/API errors to our typed error taxonomy.
 * Order matters: APIConnectionError is a SUBCLASS of APIError in the
 * TypeScript SDK, so it must be checked before the generic APIError branch
 * or the connection-error case is never reached.
 */
export function mapAnthropicError(error: unknown): ReceiptExtractError {
  if (error instanceof Anthropic.RateLimitError) {
    return new UpstreamRateLimitedError();
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new UpstreamTimeoutError();
  }
  if (error instanceof Anthropic.APIError) {
    return new UpstreamError(error.message);
  }
  return new UpstreamError(
    error instanceof Error ? error.message : "Unknown upstream error",
  );
}

export class AnthropicVisionAdapter {
  constructor(private readonly injectedClient?: Anthropic) {}

  private get client(): Anthropic {
    return this.injectedClient ?? getClient();
  }

  async extract(
    base64Data: string,
    mediaType: AcceptedMediaType,
  ): Promise<RawVisionExtraction> {
    let response;
    try {
      response = await this.client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: {
          effort: "low", // simple extraction; keeps latency inside the 30s gateway cap
          format: { type: "json_schema", schema: RECEIPT_SCHEMA },
        },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Data,
                },
              },
              { type: "text", text: EXTRACTION_PROMPT },
            ],
          },
        ],
      });
    } catch (error) {
      throw mapAnthropicError(error);
    }

    if (response.stop_reason === "refusal") {
      throw new ExtractionRefusedError();
    }
    if (response.stop_reason === "max_tokens") {
      throw new ExtractionTruncatedError();
    }

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    if (!textBlock) {
      throw new InvalidExtractionError(
        "Vision response contained no text content block",
      );
    }

    try {
      return JSON.parse(textBlock.text) as RawVisionExtraction;
    } catch {
      throw new InvalidExtractionError("Vision response was not valid JSON");
    }
  }
}
