/**
 * Typed error taxonomy for the receipt extraction pipeline.
 *
 * Every error the handler can surface to the client is one of these —
 * carrying both a stable `code` (for programmatic handling) and the HTTP
 * `status` it maps to. Anything unexpected is normalized to
 * `UpstreamError` (502) at the handler boundary so no unhandled error ever
 * reaches the client as a bare 500.
 */
export abstract class ReceiptExtractError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;
}

/** The uploaded image is not a receipt, or is unreadable as one. */
export class NotAReceiptError extends ReceiptExtractError {
  readonly code = "not_a_receipt";
  readonly status = 422;

  constructor(reason: string | null) {
    super(reason ?? "Image does not appear to be a receipt");
  }
}

/**
 * The model's structured output failed validation (non-integer money,
 * invalid quantity, or malformed JSON) — never corrected or guessed at,
 * always surfaced loudly.
 */
export class InvalidExtractionError extends ReceiptExtractError {
  readonly code = "invalid_extraction";
  readonly status = 422;
}

/** The S3 object referenced by `imageKey` does not exist. */
export class ImageNotFoundError extends ReceiptExtractError {
  readonly code = "image_not_found";
  readonly status = 404;

  constructor(imageKey: string) {
    super(`No image found at key "${imageKey}"`);
  }
}

/** The image (or requested upload) content type isn't one Claude accepts. */
export class UnsupportedMediaTypeError extends ReceiptExtractError {
  readonly code = "unsupported_media_type";
  readonly status = 415;

  constructor(contentType: string) {
    super(`Unsupported media type "${contentType}"`);
  }
}

/** The S3 object is too large to extract (checked before the body is read). */
export class ImageTooLargeError extends ReceiptExtractError {
  readonly code = "image_too_large";
  readonly status = 413;

  constructor(sizeBytes: number, maxBytes: number) {
    super(`Image is ${sizeBytes} bytes; maximum is ${maxBytes} bytes`);
  }
}

/** Anthropic's safety classifiers declined the request (stop_reason: "refusal"). */
export class ExtractionRefusedError extends ReceiptExtractError {
  readonly code = "extraction_refused";
  readonly status = 422;

  constructor() {
    super("Extraction was refused by the vision model");
  }
}

/** The model hit max_tokens before finishing structured output. */
export class ExtractionTruncatedError extends ReceiptExtractError {
  readonly code = "extraction_truncated";
  readonly status = 502;

  constructor() {
    super("Extraction response was truncated (max_tokens)");
  }
}

/** Anthropic API rate limit hit. */
export class UpstreamRateLimitedError extends ReceiptExtractError {
  readonly code = "upstream_rate_limited";
  readonly status = 429;

  constructor() {
    super("Vision API rate limit exceeded");
  }
}

/** Connection-level failure or timeout talking to the vision API. */
export class UpstreamTimeoutError extends ReceiptExtractError {
  readonly code = "upstream_timeout";
  readonly status = 504;

  constructor() {
    super("Timed out waiting for the vision API");
  }
}

/** Any other upstream failure — the catch-all so nothing surfaces as a bare 500. */
export class UpstreamError extends ReceiptExtractError {
  readonly code = "upstream_error";
  readonly status = 502;

  constructor(message = "Upstream error") {
    super(message);
  }
}
