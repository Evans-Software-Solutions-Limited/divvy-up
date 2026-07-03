import Elysia from "elysia";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { receiptExtractHandler } from "../receiptExtractHandler";
import { ReceiptExtractRepository } from "../../../repositories/receiptExtractRepository";
import type {
  AnthropicVisionAdapter,
  RawVisionExtraction,
} from "../../../../adapters/anthropicVision";
import { mapAnthropicError } from "../../../../adapters/anthropicVision";
import type {
  ReceiptImage,
  S3ReceiptImagesAdapter,
} from "../../../../adapters/s3ReceiptImages";
import {
  ImageNotFoundError,
  ImageTooLargeError,
  UnsupportedMediaTypeError,
  UpstreamRateLimitedError,
  UpstreamTimeoutError,
} from "../../../../types/errors";

type ExtractResponseBody = {
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
    confidence?: number;
    flag?: string;
  }[];
  rawText?: string;
  warnings?: string[];
  groupId?: string;
};

type ErrorResponseBody = { code: string; message: string };

/** A key shaped exactly as /receipts/upload-url generates them. */
const VALID_KEY = "receipts/9c858901-8a57-4791-81fe-4c455b099bc9.jpg";

/** A valid raw extraction the fake vision adapter can return as-is or mutate per test. */
function validRawExtraction(
  overrides: Partial<RawVisionExtraction> = {},
): RawVisionExtraction {
  return {
    isReceipt: true,
    failureReason: null,
    merchant: "Corner Cafe",
    date: "2026-03-26",
    currency: "GBP",
    subtotal: 1350,
    tax: 108,
    tip: 0,
    total: 1458,
    items: [
      {
        description: "Flat White",
        unitPrice: 450,
        quantity: 1,
        confidence: 0.95,
        flag: null,
      },
      {
        description: "Avocado Toast",
        unitPrice: 900,
        quantity: 1,
        confidence: 0.9,
        flag: null,
      },
    ],
    rawText: "CORNER CAFE\nFlat White 4.50\nAvocado Toast 9.00\nTotal 14.58",
    ...overrides,
  };
}

/** Fake S3 adapter — returns fixed image bytes/media type, or throws a given error. */
function fakeS3(
  result: ReceiptImage | (() => never) = {
    base64Data: "ZmFrZS1pbWFnZS1ieXRlcw==",
    mediaType: "image/jpeg",
  },
): S3ReceiptImagesAdapter {
  return {
    getImage: async () => {
      if (typeof result === "function") {
        return result();
      }
      return result;
    },
    createUploadUrl: async () => {
      throw new Error("not used in these tests");
    },
  } as unknown as S3ReceiptImagesAdapter;
}

/** Fake vision adapter — returns a fixed raw extraction, or throws a given error. */
function fakeVision(
  result: RawVisionExtraction | (() => never),
): AnthropicVisionAdapter {
  return {
    extract: async () => {
      if (typeof result === "function") {
        return result();
      }
      return result;
    },
  } as unknown as AnthropicVisionAdapter;
}

/** Builds a test Elysia app decorating a real repository wired with fakes,
 * mirroring the production decorate pattern in receiptExtractService.ts. */
function appWithRepository(repository: ReceiptExtractRepository) {
  const service = new Elysia().decorate(
    ReceiptExtractRepository.key,
    repository,
  );
  return new Elysia().use(service).use(receiptExtractHandler as never);
}

function postExtract(
  app: ReturnType<typeof appWithRepository> | typeof receiptExtractHandler,
  body: Record<string, unknown>,
) {
  return app.handle(
    new Request("http://localhost/receipts/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /receipts/extract", () => {
  it("happy path via injected repository: shape, groupId echo, money intact", async () => {
    const repository = new ReceiptExtractRepository(
      fakeS3(),
      fakeVision(validRawExtraction()),
    );
    const app = appWithRepository(repository);

    const response = await postExtract(app, {
      imageKey: VALID_KEY,
      groupId: "group-1",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as ExtractResponseBody;

    expect(data.merchant).toBe("Corner Cafe");
    expect(data.currency).toBe("GBP");
    expect(data.subtotal).toBe(1350);
    expect(data.tax).toBe(108);
    expect(data.tip).toBe(0);
    expect(data.total).toBe(1458);
    expect(data.groupId).toBe("group-1");
    expect(data.items).toHaveLength(2);
    expect(data.items[0]).toMatchObject({
      description: "Flat White",
      unitPrice: 450,
      quantity: 1,
    });
    expect(data.warnings).toBeUndefined();
  });

  it("populates warnings when line items don't reconcile with subtotal", async () => {
    const raw = validRawExtraction({
      subtotal: 6200,
      tax: 558,
      tip: 0,
      total: 6758,
      items: [
        {
          description: "Steak",
          unitPrice: 6100,
          quantity: 1,
          confidence: 0.9,
          flag: null,
        },
      ],
    });
    const repository = new ReceiptExtractRepository(fakeS3(), fakeVision(raw));
    const app = appWithRepository(repository);

    const response = await postExtract(app, { imageKey: VALID_KEY });

    expect(response.status).toBe(200);
    const data = (await response.json()) as ExtractResponseBody;
    expect(data.warnings).toBeDefined();
    expect(
      data.warnings?.some((w) => w.includes("6100") && w.includes("6200")),
    ).toBe(true);
  });

  it("returns 422 invalid_extraction when the model returns non-integer money", async () => {
    const raw = validRawExtraction({
      items: [
        {
          description: "Wine",
          unitPrice: 4.5,
          quantity: 1,
          confidence: 0.8,
          flag: null,
        },
      ],
    });
    const repository = new ReceiptExtractRepository(fakeS3(), fakeVision(raw));
    const app = appWithRepository(repository);

    const response = await postExtract(app, { imageKey: VALID_KEY });

    expect(response.status).toBe(422);
    const data = (await response.json()) as ErrorResponseBody;
    expect(data.code).toBe("invalid_extraction");
  });

  it("returns 422 not_a_receipt when vision reports isReceipt: false", async () => {
    const raw = validRawExtraction({
      isReceipt: false,
      failureReason: "Image is a photo of a cat",
    });
    const repository = new ReceiptExtractRepository(fakeS3(), fakeVision(raw));
    const app = appWithRepository(repository);

    const response = await postExtract(app, { imageKey: VALID_KEY });

    expect(response.status).toBe(422);
    const data = (await response.json()) as ErrorResponseBody;
    expect(data.code).toBe("not_a_receipt");
  });

  it("returns 404 image_not_found when the S3 object is missing", async () => {
    const repository = new ReceiptExtractRepository(
      fakeS3(() => {
        throw new ImageNotFoundError("receipts/missing.jpg");
      }),
      fakeVision(validRawExtraction()),
    );
    const app = appWithRepository(repository);

    const response = await postExtract(app, {
      imageKey: VALID_KEY,
    });

    expect(response.status).toBe(404);
    const data = (await response.json()) as ErrorResponseBody;
    expect(data.code).toBe("image_not_found");
  });

  it("returns 415 unsupported_media_type for a bad image content type", async () => {
    const repository = new ReceiptExtractRepository(
      fakeS3(() => {
        throw new UnsupportedMediaTypeError("application/pdf");
      }),
      fakeVision(validRawExtraction()),
    );
    const app = appWithRepository(repository);

    const response = await postExtract(app, { imageKey: VALID_KEY });

    expect(response.status).toBe(415);
    const data = (await response.json()) as ErrorResponseBody;
    expect(data.code).toBe("unsupported_media_type");
  });

  it("propagates rate-limit errors from the vision adapter as 429", async () => {
    const repository = new ReceiptExtractRepository(
      fakeS3(),
      fakeVision(() => {
        throw new UpstreamRateLimitedError();
      }),
    );
    const app = appWithRepository(repository);

    const response = await postExtract(app, { imageKey: VALID_KEY });

    expect(response.status).toBe(429);
    const data = (await response.json()) as ErrorResponseBody;
    expect(data.code).toBe("upstream_rate_limited");
  });

  it("propagates connection/timeout errors from the vision adapter as 504", async () => {
    const repository = new ReceiptExtractRepository(
      fakeS3(),
      fakeVision(() => {
        throw new UpstreamTimeoutError();
      }),
    );
    const app = appWithRepository(repository);

    const response = await postExtract(app, { imageKey: VALID_KEY });

    expect(response.status).toBe(504);
    const data = (await response.json()) as ErrorResponseBody;
    expect(data.code).toBe("upstream_timeout");
  });

  it("maps a generic/unexpected thrown error to 502 upstream_error (no bare 500 path)", async () => {
    const repository = new ReceiptExtractRepository(
      fakeS3(),
      fakeVision(() => {
        throw new Error("something exploded");
      }),
    );
    const app = appWithRepository(repository);

    const response = await postExtract(app, { imageKey: VALID_KEY });

    expect(response.status).toBe(502);
    const data = (await response.json()) as ErrorResponseBody;
    expect(data.code).toBe("upstream_error");
  });

  it("clamps an out-of-range confidence value (1.4) down to 1", async () => {
    const raw = validRawExtraction({
      items: [
        {
          description: "Burger",
          unitPrice: 1200,
          quantity: 1,
          confidence: 1.4,
          flag: null,
        },
      ],
      subtotal: 1200,
      tax: 0,
      tip: 0,
      total: 1200,
    });
    const repository = new ReceiptExtractRepository(fakeS3(), fakeVision(raw));
    const app = appWithRepository(repository);

    const response = await postExtract(app, { imageKey: VALID_KEY });

    expect(response.status).toBe(200);
    const data = (await response.json()) as ExtractResponseBody;
    expect(data.items[0]?.confidence).toBe(1);
  });

  it("rejects an imageKey that isn't upload-url shaped (no arbitrary key probing)", async () => {
    const repository = new ReceiptExtractRepository(
      fakeS3(),
      fakeVision(validRawExtraction()),
    );
    const app = appWithRepository(repository);

    // Not a receipts/<uuid>.<ext> key — must be rejected by body validation
    // before it ever reaches S3.
    const response = await postExtract(app, {
      imageKey: "some-other-prefix/secret-object",
    });

    expect(response.status).toBe(422);
  });

  it("returns 413 image_too_large for an oversized S3 object", async () => {
    const repository = new ReceiptExtractRepository(
      fakeS3(() => {
        throw new ImageTooLargeError(20 * 1024 * 1024, 8 * 1024 * 1024);
      }),
      fakeVision(validRawExtraction()),
    );
    const app = appWithRepository(repository);

    const response = await postExtract(app, { imageKey: VALID_KEY });

    expect(response.status).toBe(413);
    const data = (await response.json()) as ErrorResponseBody;
    expect(data.code).toBe("image_too_large");
  });

  it("returns 422 invalid_extraction for money above the Postgres int4 max", async () => {
    const raw = validRawExtraction({
      items: [
        {
          description: "Hallucinated yacht",
          unitPrice: 3_000_000_000, // > 2_147_483_647
          quantity: 1,
          confidence: 0.9,
          flag: null,
        },
      ],
    });
    const repository = new ReceiptExtractRepository(fakeS3(), fakeVision(raw));
    const app = appWithRepository(repository);

    const response = await postExtract(app, { imageKey: VALID_KEY });

    expect(response.status).toBe(422);
    const data = (await response.json()) as ErrorResponseBody;
    expect(data.code).toBe("invalid_extraction");
  });
});

describe("mapAnthropicError (adapter instanceof chain)", () => {
  it("maps Anthropic.RateLimitError to upstream_rate_limited", () => {
    const err = Object.create(Anthropic.RateLimitError.prototype);
    const mapped = mapAnthropicError(err);
    expect(mapped.code).toBe("upstream_rate_limited");
    expect(mapped.status).toBe(429);
  });

  it("maps Anthropic.APIConnectionError to upstream_timeout, not the generic APIError branch", () => {
    // Regression test: APIConnectionError is a SUBCLASS of APIError in the
    // TypeScript SDK. If the instanceof chain checked APIError first, this
    // would incorrectly fall into the generic upstream_error / 502 branch.
    const err = Object.create(Anthropic.APIConnectionError.prototype);
    const mapped = mapAnthropicError(err);
    expect(mapped.code).toBe("upstream_timeout");
    expect(mapped.status).toBe(504);
  });

  it("maps a generic Anthropic.APIError to upstream_error", () => {
    const err = Object.create(Anthropic.APIError.prototype);
    const mapped = mapAnthropicError(err);
    expect(mapped.code).toBe("upstream_error");
    expect(mapped.status).toBe(502);
  });

  it("maps a non-Anthropic error to upstream_error", () => {
    const mapped = mapAnthropicError(new Error("boom"));
    expect(mapped.code).toBe("upstream_error");
    expect(mapped.status).toBe(502);
  });
});
