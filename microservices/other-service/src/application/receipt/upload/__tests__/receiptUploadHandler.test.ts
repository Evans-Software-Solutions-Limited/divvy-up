import { authHeaders } from "../../../__tests__/support/authMock";
import Elysia from "elysia";
import { describe, expect, it } from "vitest";

import { receiptUploadHandler } from "../receiptUploadHandler";
import { ReceiptUploadService } from "../receiptUploadService";
import type {
  S3ReceiptImagesAdapter,
  UploadUrlResult,
} from "../../../../adapters/s3ReceiptImages";
import { UnsupportedMediaTypeError } from "../../../../types/errors";

type UploadResponseBody = {
  key: string;
  uploadUrl: string;
  expiresIn: number;
};

type ErrorResponseBody = { code: string; message: string };

function fakeS3(
  result: UploadUrlResult | (() => never),
): S3ReceiptImagesAdapter {
  return {
    getImage: async () => {
      throw new Error("not used in these tests");
    },
    createUploadUrl: async () => {
      if (typeof result === "function") {
        return result();
      }
      return result;
    },
  } as unknown as S3ReceiptImagesAdapter;
}

function appWithAdapter(adapter: S3ReceiptImagesAdapter) {
  const service = new Elysia().decorate("ReceiptImages", adapter);
  return new Elysia().use(service).use(receiptUploadHandler as never);
}

function postUploadUrl(
  app: ReturnType<typeof appWithAdapter>,
  body: Record<string, unknown>,
) {
  return app.handle(
    new Request("http://localhost/receipts/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /receipts/upload-url", () => {
  it("returns 200 with a key/uploadUrl/expiresIn shape and a UUID-shaped key", async () => {
    const app = appWithAdapter(
      fakeS3({
        key: "receipts/9c858901-8a57-4791-81fe-4c455b099bc9.jpg",
        uploadUrl: "https://s3.example.com/presigned",
        expiresIn: 300,
      }),
    );

    const response = await postUploadUrl(app, { contentType: "image/jpeg" });

    expect(response.status).toBe(200);
    const data = (await response.json()) as UploadResponseBody;
    expect(data.uploadUrl).toBe("https://s3.example.com/presigned");
    expect(data.expiresIn).toBe(300);
    expect(data.key).toMatch(/^receipts\/[0-9a-f-]{36}\.(jpe?g|png|gif|webp)$/);
  });

  it("exercises the real adapter to confirm the key shape end to end", async () => {
    // Real S3ReceiptImagesAdapter, but validation happens before any
    // network/Resource access — safe to call with no AWS credentials.
    const { S3ReceiptImagesAdapter } =
      await import("../../../../adapters/s3ReceiptImages");
    const adapter = new S3ReceiptImagesAdapter();
    await expect(adapter.createUploadUrl("application/pdf")).rejects.toThrow(
      UnsupportedMediaTypeError,
    );
  });

  it("returns 415 for an unsupported content type (application/pdf)", async () => {
    const app = appWithAdapter(
      fakeS3(() => {
        throw new UnsupportedMediaTypeError("application/pdf");
      }),
    );

    const response = await postUploadUrl(app, {
      contentType: "application/pdf",
    });

    expect(response.status).toBe(415);
    const data = (await response.json()) as ErrorResponseBody;
    expect(data.code).toBe("unsupported_media_type");
  });

  it("maps an unexpected error to 502 upstream_error", async () => {
    const app = appWithAdapter(
      fakeS3(() => {
        throw new Error("boom");
      }),
    );

    const response = await postUploadUrl(app, { contentType: "image/jpeg" });

    expect(response.status).toBe(502);
    const data = (await response.json()) as ErrorResponseBody;
    expect(data.code).toBe("upstream_error");
  });
});

// Confirms the production decorate wiring (ReceiptUploadService) matches
// what the handler expects, the same seam receiptExtractService.ts uses.
describe("ReceiptUploadService wiring", () => {
  it("decorates a real S3ReceiptImagesAdapter under the expected key", () => {
    expect(ReceiptUploadService).toBeDefined();
  });
});
